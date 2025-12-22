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

      const issueKey =
        extractJiraIssueKey(String(pr.head?.ref ?? '')) ||
        extractJiraIssueKey(title) ||
        undefined;

      const stack = inferStackFromLabels(pr.labels ?? []);
      const size = calcPrSizeFromGitHub(payload);

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
          slackMessageTs: existing?.slackMessageTs
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
        if (jira && issueKey) {
          try {
            jiraInfo = await jira.getIssueMinimal(issueKey);

            await jira.addComment(issueKey, `Linked PR: ${url} (${repoFullName} #${number})`);
            if (env.JIRA_AUTO_TRANSITION_ON_OPEN) {
              await jira.transitionByName(issueKey, env.JIRA_OPEN_TRANSITION_NAME);
            }
          } catch (e) {
            // לא מפילים את ה-flow על Jira
            console.warn('Jira error:', (e as any)?.message ?? e);
          }
        }

        // Send or update Slack message
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

