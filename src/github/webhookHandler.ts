import { Request, Response } from 'express';
import { App } from '@slack/bolt';
import { db, PrRecord } from '../db/memoryDb';
import { extractJiraIssueKey } from '../utils/jiraKey';
import { calcPrSizeFromGitHub } from '../utils/prSizing';
import { inferStackFromLabels, pickReviewers } from '../services/assignmentService';
import { buildPrMessageBlocks } from '../slack/blocks';
import { JiraService } from '../services/jiraService';
import { env, jiraEnabled } from '../config/env';

interface GitHubWebhookPayload {
  action?: string;
  pull_request?: {
    number?: number;
    title?: string;
    html_url?: string;
    user?: { login?: string };
    head?: { ref?: string };
    labels?: Array<{ name?: string }>;
    merged?: boolean;
    additions?: number;
    deletions?: number;
    changed_files?: number;
  };
  repository?: {
    full_name?: string;
  };
}

function prId(): string {
  return `pr_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function githubWebhookHandlerFactory(args: { slackApp: App }) {
  const jira = jiraEnabled ? new JiraService() : undefined;

  return async function githubWebhookHandler(req: Request, res: Response) {
    try {
      const event = String(req.headers['x-github-event'] ?? '');
      if (event !== 'pull_request') {
        res.status(200).send('ignored');
        return;
      }

      const payload: GitHubWebhookPayload = req.body;
      const action = String(payload?.action ?? '');
      const pr = payload?.pull_request;
      
      if (!pr || !pr.number || !pr.title || !pr.html_url) {
        console.warn('Invalid PR payload:', payload);
        res.status(400).send('bad payload');
        return;
      }

      const repoFullName = String(payload?.repository?.full_name ?? 'unknown/unknown');
      const number = Number(pr.number);
      const title = String(pr.title);
      const url = String(pr.html_url);
            const authorGithub = String(pr.user?.login ?? 'unknown');

            let issueKey =
              extractJiraIssueKey(String(pr.head?.ref ?? '')) ||
              extractJiraIssueKey(title) ||
              undefined;

            const stack = inferStackFromLabels(pr.labels ?? []);
            const prMetadata = calcPrSizeFromGitHub(payload);
            const size = prMetadata.size;

      // opened / ready_for_review / reopened
      if (['opened', 'ready_for_review', 'reopened'].includes(action)) {
        const existing = await db.findPr(repoFullName, number);

        const record = await db.upsertPr({
          id: existing?.id ?? prId(),
          repoFullName,
          number,
          title,
          url,
          authorGithub,
          createdAt: existing?.createdAt ?? Date.now(),
          status: 'OPEN',
          size,
          stack,
          jiraIssueKey: issueKey,
          slackChannelId: existing?.slackChannelId ?? env.SLACK_DEFAULT_CHANNEL_ID,
          slackMessageTs: existing?.slackMessageTs,
          // Enhanced metadata
          additions: prMetadata.additions,
          deletions: prMetadata.deletions,
          changedFiles: prMetadata.changedFiles,
          totalChanges: prMetadata.totalChanges
        });

        // Only create new assignments if this is a new PR
        if (!existing) {
          const reviewers = await pickReviewers({
            stack: record.stack === 'MIXED' ? 'MIXED' : record.stack,
            requiredReviewers: 1,
            authorGithub: record.authorGithub
          });

          if (reviewers.length > 0) {
            await db.createAssignments(record.id, reviewers.map(r => r.id));
          }
        }

        // Get current assignments for display
        const assignments = await db.getAssignmentsForPr(record.id);
        const reviewerPromises = assignments
          .filter((a: any) => !a.completedAt)
          .map((a: any) => db.getMember(a.memberId));
        const reviewerResults = await Promise.all(reviewerPromises);
        const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

        // Jira enrichment + side effects
        let jiraInfo = undefined;
        
        // Auto-create Jira ticket if enabled and no ticket exists
        if (jira && !issueKey && env.JIRA_AUTO_CREATE_ON_PR_OPEN && env.JIRA_PROJECT_KEY) {
          try {
            const metadataParts = [
              `PR: ${url}`,
              `Repository: ${repoFullName}`,
              `Author: ${authorGithub}`,
              `Size: ${size}`,
              `Stack: ${stack}`
            ];
            
            if (prMetadata.additions || prMetadata.deletions || prMetadata.changedFiles) {
              metadataParts.push('');
              metadataParts.push('Changes:');
              if (prMetadata.additions) metadataParts.push(`+${prMetadata.additions} additions`);
              if (prMetadata.deletions) metadataParts.push(`-${prMetadata.deletions} deletions`);
              if (prMetadata.changedFiles) metadataParts.push(`${prMetadata.changedFiles} files changed`);
              if (prMetadata.totalChanges) metadataParts.push(`Total: ${prMetadata.totalChanges} lines`);
            }
            
            if (size === 'LARGE') {
              metadataParts.push('');
              metadataParts.push('⚠️ Large PR - Consider splitting into smaller PRs');
            }
            
            const description = metadataParts.join('\n');
            
            const sprints = await jira.getActiveSprints(env.JIRA_PROJECT_KEY);
            const activeSprint = sprints.length > 0 ? sprints[0] : undefined;
            
            const issue = await jira.createIssue({
              projectKey: env.JIRA_PROJECT_KEY,
              summary: `[PR #${number}] ${title}`,
              description,
              issueType: env.JIRA_ISSUE_TYPE,
              labels: [repoFullName.split('/')[1], stack.toLowerCase(), `pr-size-${size.toLowerCase()}`],
              sprintId: activeSprint?.id
            });
            
            issueKey = issue.key;
            await db.updatePr(record.id, { jiraIssueKey: issue.key });
            jiraInfo = issue;
            
            console.log(`✅ Auto-created Jira ticket ${issue.key} for PR #${number}`);
          } catch (e) {
            console.warn('Failed to auto-create Jira ticket:', (e as any)?.message ?? e);
          }
        }
        
        // If Jira issue key exists (from branch/title or auto-created), enrich it
        if (jira && issueKey) {
          try {
            if (!jiraInfo) {
              jiraInfo = await jira.getIssueMinimal(issueKey);
            }

            await jira.addComment(issueKey, `Linked PR: ${url} (${repoFullName} #${number})`);
            if (env.JIRA_AUTO_TRANSITION_ON_OPEN) {
              await jira.transitionByName(issueKey, env.JIRA_OPEN_TRANSITION_NAME);
            }
          } catch (e) {
            // לא מפילים את ה-flow על Jira
            console.warn('Jira error:', (e as any)?.message ?? e);
          }
        }

        // Send direct messages to assigned reviewers
        for (const reviewer of reviewers) {
          try {
            await args.slackApp.client.chat.postMessage({
              channel: reviewer.slackUserId,
              text: `📋 *New PR Assigned to You*\n\nPR #${number}: ${title}\nRepository: ${repoFullName}\nAuthor: ${authorGithub}\nSize: ${size}\n\n<${url}|View PR on GitHub>`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `📋 *New PR Assigned to You*\n\n*PR #${number}:* ${title}\n*Repository:* ${repoFullName}\n*Author:* ${authorGithub}\n*Size:* ${size} ${size === 'LARGE' ? '⚠️ Consider splitting this PR' : ''}\n*Stack:* ${stack}`
                  }
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `<${url}|View PR on GitHub>`
                  }
                }
              ]
            });
          } catch (dmError) {
            console.warn(`Failed to send DM to reviewer ${reviewer.slackUserId}:`, dmError);
          }
        }

        // Send or update Slack message in channel
        const blocks = buildPrMessageBlocks({ pr: record, reviewers, jira: jiraInfo });

        if (existing && existing.slackMessageTs) {
          // Update existing message
          try {
            await args.slackApp.client.chat.update({
              channel: existing.slackChannelId,
              ts: existing.slackMessageTs,
              text: `PR #${number}: ${title}`,
              blocks
            });
          } catch (updateError) {
            console.warn('Failed to update Slack message, posting new one:', updateError);
            // Fall through to post new message
            const slackRes = await args.slackApp.client.chat.postMessage({
              channel: env.SLACK_DEFAULT_CHANNEL_ID,
              text: `PR #${number}: ${title}`,
              blocks
            });
            if (slackRes.ts) {
              await db.updatePr(record.id, { slackMessageTs: slackRes.ts, slackChannelId: env.SLACK_DEFAULT_CHANNEL_ID });
            }
          }
        } else {
          // Post new message
          const slackRes = await args.slackApp.client.chat.postMessage({
            channel: env.SLACK_DEFAULT_CHANNEL_ID,
            text: `New PR #${number}: ${title}`,
            blocks
          });

          if (slackRes.ts) {
            await db.updatePr(record.id, { slackMessageTs: slackRes.ts, slackChannelId: env.SLACK_DEFAULT_CHANNEL_ID });
          }
        }

        res.status(200).send('ok');
        return;
      }

      // closed (check merged)
      if (action === 'closed') {
        const merged = Boolean(pr.merged);
        const existing = await db.findPr(repoFullName, number);
        if (existing) {
          await db.updatePr(existing.id, { status: merged ? 'MERGED' : 'CLOSED' });

          // Update Slack message if it exists
          if (existing.slackMessageTs) {
            try {
              const assignments = await db.getAssignmentsForPr(existing.id);
              const reviewerPromises = assignments.map((a: any) => db.getMember(a.memberId));
              const reviewerResults = await Promise.all(reviewerPromises);
              const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

              const blocks = buildPrMessageBlocks({ pr: { ...existing, status: merged ? 'MERGED' : 'CLOSED' }, reviewers, jira: undefined });
              
              await args.slackApp.client.chat.update({
                channel: existing.slackChannelId,
                ts: existing.slackMessageTs,
                text: `${merged ? '✅ Merged' : '❌ Closed'} PR #${number}: ${existing.title}`,
                blocks
              });
            } catch (updateError) {
              console.warn('Failed to update Slack message on close:', updateError);
            }
          }
        }

        if (merged && jira && issueKey) {
          try {
            await jira.addComment(issueKey, `PR merged: ${url}`);
            if (env.JIRA_AUTO_TRANSITION_ON_MERGE) {
              await jira.transitionByName(issueKey, env.JIRA_MERGE_TRANSITION_NAME);
            }
          } catch (e) {
            console.warn('Jira merge error:', (e as any)?.message ?? e);
          }
        }

        res.status(200).send('ok');
        return;
      }

      res.status(200).send('ignored action');
    } catch (error) {
      console.error('Error processing GitHub webhook:', error);
      res.status(500).send('Internal server error');
    }
  };
}

