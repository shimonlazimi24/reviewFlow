import { Request, Response } from 'express';
import { App } from '@slack/bolt';
import { db, PrRecord } from '../db/memoryDb';
import { extractJiraIssueKey } from '../utils/jiraKey';
import { calcPrSizeFromGitHub } from '../utils/prSizing';
import { inferStackFromLabels, pickReviewers } from '../services/assignmentService';
import { buildPrMessageBlocks } from '../slack/blocks';
import { JiraService } from '../services/jiraService';
import { env, jiraEnabled } from '../config/env';
import { loadWorkspaceContext, hasFeature, isUsageLimitExceeded } from '../services/workspaceContext';
import { checkUsageLimit } from '../middleware/featureGate';
import { logger } from '../utils/logger';

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

/**
 * Handle GitHub installation webhook (for GitHub App installation)
 */
async function handleInstallationWebhook(req: Request, res: Response, slackApp: App): Promise<void> {
  try {
    const payload: any = req.body;
    const action = payload?.action;
    const installation = payload?.installation;
    
    if (!installation?.id) {
      logger.warn('GitHub installation webhook missing installation ID');
      res.status(400).json({ error: 'Missing installation ID' });
      return;
    }

    const installationId = String(installation.id);
    const accountLogin = installation.account?.login;

    // For now, we'll need to match installation to workspace
    // Option 1: Check if workspace already has this installation ID
    let workspace = await db.getWorkspaceByGitHubInstallation(installationId);
    
    if (!workspace && action === 'created') {
      // New installation - we need to find workspace by connect token
      // For now, log and require manual mapping
      logger.info('New GitHub installation detected', {
        installationId,
        accountLogin,
        action
      });
      
      // TODO: Implement connect token flow
      // For now, workspace will be linked when user connects via /connect/github
      res.status(200).json({ message: 'Installation received, awaiting workspace link' });
      return;
    }

    if (workspace) {
      // Update workspace with installation info
      await db.updateWorkspace(workspace.id, {
        githubInstallationId: installationId,
        githubAccount: accountLogin,
        updatedAt: Date.now()
      });

      // Update workspace settings
      const settings = await db.getWorkspaceSettings(workspace.slackTeamId);
      if (settings) {
        await db.upsertWorkspaceSettings({
          ...settings,
          githubInstallationId: installationId,
          updatedAt: Date.now()
        });
      }

      logger.info('GitHub installation linked to workspace', {
        workspaceId: workspace.id,
        installationId,
        accountLogin
      });

      await db.addAuditLog({
        workspaceId: workspace.id,
        event: 'github_installation_updated',
        metadata: {
          installationId,
          accountLogin,
          action
        }
      });
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error('Error handling GitHub installation webhook', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function githubWebhookHandlerFactory(args: { slackApp: App }) {
  return async function githubWebhookHandler(req: Request, res: Response) {
    try {
      // Check idempotency (prevent duplicate processing)
      const deliveryId = String(req.headers['x-github-delivery'] ?? '');
      if (deliveryId) {
        const existing = await db.getWebhookDelivery(deliveryId);
        if (existing) {
          logger.info('Duplicate webhook delivery ignored', { deliveryId, event: existing.event });
          return res.status(200).json({ message: 'Already processed' });
        }
      }

      const event = String(req.headers['x-github-event'] ?? '');
      
      // Handle installation webhook (for GitHub App installation)
      if (event === 'installation' || event === 'installation_repositories') {
        await handleInstallationWebhook(req, res, args.slackApp);
        return;
      }
      
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

      // Extract installation ID from webhook (if using GitHub App)
      const installationId = (req.body as any)?.installation?.id;
      
      if (!installationId) {
        logger.warn('GitHub webhook received without installation ID');
        return res.status(400).json({
          error: 'Missing installation ID',
          message: 'GitHub App installation ID is required'
        });
      }

      // Resolve workspace by GitHub installation ID
      const workspace = await db.getWorkspaceByGitHubInstallation(String(installationId));
      
      if (!workspace) {
        logger.warn('GitHub webhook received for unknown installation', { installationId });
        return res.status(403).json({
          error: 'Unknown installation',
          message: 'This GitHub installation is not connected to any workspace.'
        });
      }

      // Check if setup is complete and Go Live is enabled - gate PR notifications
      if (!workspace.setupComplete) {
        logger.info('PR webhook received but setup not complete', {
          workspaceId: workspace.id,
          repoFullName,
          prNumber: number
        });
        
        // Send DM to installer/admin if available (use setup channel if configured)
        const notificationChannel = workspace.setupChannelId || workspace.installerUserId;
        if (notificationChannel) {
          try {
            await args.slackApp.client.chat.postMessage({
              channel: notificationChannel,
              text: `⚠️ *ReviewFlow Setup Required*\n\nA PR was opened in \`${repoFullName}\` (#${number}), but ReviewFlow setup is not complete.\n\nPlease complete the setup wizard in the Home Tab to start receiving PR notifications.`
            });
          } catch (e) {
            logger.error('Failed to send setup notification', e);
          }
        }
        
        return res.status(200).json({ 
          message: 'PR received, but setup not complete. Admin has been notified.' 
        });
      }
      
      // Check if Go Live is enabled
      if (!workspace.goLiveEnabled) {
        logger.info('PR webhook received but Go Live not enabled', {
          workspaceId: workspace.id,
          repoFullName,
          prNumber: number
        });
        
        // Send DM to installer/admin (use setup channel if configured)
        const notificationChannel = workspace.setupChannelId || workspace.installerUserId;
        if (notificationChannel) {
          try {
            await args.slackApp.client.chat.postMessage({
              channel: notificationChannel,
              text: `⚠️ *ReviewFlow Not Live Yet*\n\nA PR was opened in \`${repoFullName}\` (#${number}), but PR processing is not enabled.\n\nPlease enable "Go Live" in the Home Tab setup wizard to start processing PRs.`
            });
          } catch (e) {
            logger.error('Failed to send Go Live notification', e);
          }
        }
        
        return res.status(200).json({ 
          message: 'PR received, but Go Live not enabled. Admin has been notified.' 
        });
      }

      // Load workspace context
      const context = await loadWorkspaceContext(workspace.slackTeamId);
      
      // Check usage limits
      if (isUsageLimitExceeded(context)) {
        logger.warn('Usage limit exceeded for workspace', {
          workspaceId: context.workspaceId,
          usage: context.usage
        });
        return res.status(429).json({
          error: 'Usage limit exceeded',
          message: 'Monthly PR limit reached. Please upgrade your plan.'
        });
      }

      // Find team for this repo (workspace-scoped)
      const repoMapping = await db.getRepoMapping(workspace.id, repoFullName);
      const teamId = repoMapping?.teamId;

            let issueKey =
              extractJiraIssueKey(String(pr.head?.ref ?? '')) ||
              extractJiraIssueKey(title) ||
              undefined;

            const stack = inferStackFromLabels(pr.labels ?? []);
            const prMetadata = calcPrSizeFromGitHub(payload);
            const size = prMetadata.size;

      // opened / ready_for_review / reopened
      if (['opened', 'ready_for_review', 'reopened'].includes(action)) {
        const existing = await db.findPr(workspace.id, repoFullName, number);

      // Determine channel - use team channel if available, otherwise workspace default
      // Load workspace settings for default channel
      const settings = await db.getWorkspaceSettings(workspace.slackTeamId);
      let slackChannelId = settings?.defaultChannelId || workspace.defaultChannelId || '';
      
      if (teamId) {
        const team = await db.getTeam(teamId);
        if (team?.slackChannelId) {
          slackChannelId = team.slackChannelId;
        }
      }
      
      // If still no channel, post ephemeral message to admin
      if (!slackChannelId) {
        logger.warn('No channel configured for PR notification', {
          workspaceId: workspace.id,
          repoFullName
        });
        // Try to find an admin user to notify
        const members = await db.listMembers(workspace.id);
        const adminMember = members.find((m: any) => m.roles?.includes('ADMIN' as any));
        if (adminMember) {
          try {
            await args.slackApp.client.chat.postEphemeral({
              channel: workspace.slackTeamId, // Use team ID as fallback
              user: adminMember.slackUserId,
              text: `⚠️ *ReviewFlow Setup Required*\n\nA PR was opened in \`${repoFullName}\` but no default channel is configured.\n\nPlease run \`/cr settings\` to set your default channel.`
            });
          } catch (e) {
            logger.error('Failed to send setup notification', e);
          }
        }
        return res.status(200).json({ message: 'PR received, but no channel configured' });
      }

        const record = await db.upsertPr({
          id: existing?.id ?? prId(),
          workspaceId: workspace.id,
          repoFullName,
          number,
          title,
          url,
          authorGithub,
          teamId,
          createdAt: existing?.createdAt ?? Date.now(),
          status: 'OPEN',
          size,
          stack,
          jiraIssueKey: issueKey,
          slackChannelId: existing?.slackChannelId ?? slackChannelId,
          slackMessageTs: existing?.slackMessageTs,
          // Enhanced metadata
          additions: prMetadata.additions,
          deletions: prMetadata.deletions,
          changedFiles: prMetadata.changedFiles,
          totalChanges: prMetadata.totalChanges
        });

        // Only create new assignments if this is a new PR
        if (!existing) {
          // Increment usage counter
          const now = new Date();
          const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          await db.incrementUsage(context.workspaceId, month);

          // Check if usage limit exceeded after increment
          const updatedUsage = await db.getUsage(context.workspaceId, month);
          if (updatedUsage && updatedUsage.prsProcessed > updatedUsage.limit) {
            logger.warn('Usage limit exceeded after PR processing', {
              workspaceId: context.workspaceId,
              usage: updatedUsage
            });
          }
          
          // Add audit log
          await db.addAuditLog({
            workspaceId: context.workspaceId,
            event: 'pr_opened',
            metadata: {
              prId: record.id,
              prNumber: record.number,
              repoFullName: record.repoFullName,
              authorGithub: record.authorGithub
            }
          });

          const reviewers = await pickReviewers({
            workspaceId: workspace.id,
            stack: record.stack === 'MIXED' ? 'MIXED' : record.stack,
            requiredReviewers: 1,
            authorGithub: record.authorGithub,
            teamId: record.teamId
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
        const jiraConnection = await db.getJiraConnection(workspace.id);
        const jiraEnabled = jiraConnection && hasFeature(context, 'jiraIntegration');
        const jira = jiraEnabled ? new JiraService(jiraConnection) : undefined;
        
        // Use Jira connection's transition settings if available
        const prOpenedTransition = jiraConnection?.prOpenedTransition || env.JIRA_OPEN_TRANSITION_NAME;
        const prMergedTransition = jiraConnection?.prMergedTransition || env.JIRA_MERGE_TRANSITION_NAME;
        
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
            if (env.JIRA_AUTO_TRANSITION_ON_OPEN && prOpenedTransition) {
              await jira.transitionByName(issueKey, prOpenedTransition);
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
              channel: slackChannelId,
              text: `PR #${number}: ${title}`,
              blocks
            });
            if (slackRes.ts) {
              await db.updatePr(record.id, { slackMessageTs: slackRes.ts, slackChannelId });
            }
          }
        } else {
          // Post new message
          const slackRes = await args.slackApp.client.chat.postMessage({
            channel: slackChannelId,
            text: `New PR #${number}: ${title}`,
            blocks
          });

          if (slackRes.ts) {
            await db.updatePr(record.id, { slackMessageTs: slackRes.ts, slackChannelId });
          }
        }

        res.status(200).send('ok');
        return;
      }

      // closed (check merged)
      if (action === 'closed') {
        const merged = Boolean(pr.merged);
        const existing = await db.findPr(workspace.id, repoFullName, number);
        if (existing) {
          await db.updatePr(existing.id, { status: merged ? 'MERGED' : 'CLOSED' });

          // Get Jira connection for merge actions
          const jiraConnection = await db.getJiraConnection(workspace.id);
          const jiraEnabledForWorkspace = jiraConnection && hasFeature(context, 'jiraIntegration');
          const jiraForMerge = jiraEnabledForWorkspace ? new JiraService(jiraConnection) : undefined;

          // Update Slack message if it exists
          if (existing.slackMessageTs) {
            try {
              const assignments = await db.getAssignmentsForPr(existing.id);
              const reviewerPromises = assignments.map((a: any) => db.getMember(a.memberId));
              const reviewerResults = await Promise.all(reviewerPromises);
              const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

              let jiraInfoForClose = undefined;
              if (existing.jiraIssueKey && jiraForMerge) {
                try {
                  jiraInfoForClose = await jiraForMerge.getIssueMinimal(existing.jiraIssueKey);
                } catch (e) {
                  logger.warn('Failed to fetch Jira info on close', e);
                }
              }

              const blocks = buildPrMessageBlocks({ pr: { ...existing, status: merged ? 'MERGED' : 'CLOSED' }, reviewers, jira: jiraInfoForClose });
              
              await args.slackApp.client.chat.update({
                channel: existing.slackChannelId,
                ts: existing.slackMessageTs,
                text: `${merged ? '✅ Merged' : '❌ Closed'} PR #${number}: ${existing.title}`,
                blocks
              });
            } catch (updateError) {
              logger.warn('Failed to update Slack message on close', updateError);
            }
          }

          if (merged && jiraForMerge && existing.jiraIssueKey) {
            try {
              await jiraForMerge.addComment(existing.jiraIssueKey, `PR merged: ${url}`);
              if (env.JIRA_AUTO_TRANSITION_ON_MERGE) {
                await jiraForMerge.transitionByName(existing.jiraIssueKey, env.JIRA_MERGE_TRANSITION_NAME);
              }
            } catch (e) {
              logger.warn('Jira merge error', e);
            }
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

