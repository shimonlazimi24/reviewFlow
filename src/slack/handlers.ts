import { App, BlockAction, ButtonAction, SlashCommand } from '@slack/bolt';
import { db, Member, Role, PrRecord, Assignment, Team, RepoMapping } from '../db/memoryDb';
import { buildPrMessageBlocks } from './blocks';
import { JiraService } from '../services/jiraService';
import { env, jiraEnabled } from '../config/env';
import { pickReviewers } from '../services/assignmentService';
import { formatWaitingTime, calculateWaitingTime, formatDuration } from '../utils/time';
import { buildSettingsModal, buildAddMemberModal, buildEditMemberModal } from './modals';
import { registerTeamHandlers } from './teamHandlers';
import { registerBillingHandlers } from './billingHandlers';
import { requireAdmin } from '../utils/permissions';
import { logger } from '../utils/logger';
import { AnalyticsService } from '../services/analyticsService';
import { loadWorkspaceContext, hasFeature } from '../services/workspaceContext';
import { PolarService } from '../services/polarService';
import { buildGitHubConnectModal, buildJiraConnectModal, buildBulkMemberImportModal } from './onboarding';
import { encrypt } from '../utils/encryption';
import { 
  buildSetupDestinationModal,
  buildChannelSelectionModal, 
  buildGitHubConnectionModal, 
  buildJiraConnectionModal,
  buildAddMembersModal 
} from './onboardingWizard';
import { requireWorkspaceAdmin } from '../utils/permissions';

export function registerSlackHandlers(app: App) {
  // Register team management handlers
  registerTeamHandlers(app);
  
  // Register billing handlers
  registerBillingHandlers(app);
  // Helper to send response (works in DMs and channels)
  const sendResponse = async (client: any, channelId: string, userId: string, text: string, respond: any) => {
    try {
      // Try ephemeral first (works in channels)
      if (channelId && channelId.startsWith('C')) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text
        });
      } else {
        // Use respond for DMs or if ephemeral fails
        await respond({
          text,
          response_type: 'ephemeral'
        });
      }
    } catch (err: any) {
      // Fallback to respond if ephemeral fails
      if (err.data?.error === 'not_in_channel' || err.code === 'slack_webapi_platform_error') {
        await respond({
          text,
          response_type: 'ephemeral'
        });
      } else {
        throw err;
      }
    }
  };

  // Take review (update status to IN_PROGRESS)
  app.action('take_review', async ({ ack, body, client, respond }) => {
    await ack();

    try {
      const actionBody = body as BlockAction<ButtonAction>;
      const userId = actionBody.user?.id;
      const value = actionBody.actions?.[0]?.value;
      const channelId = actionBody.channel?.id;

      if (!userId || !value || !channelId) {
        throw new Error('Missing required fields in action');
      }

      const [prId, memberId] = value.split('|');
      if (!prId) {
        throw new Error('Invalid PR ID in action value');
      }

      // Get assignments for this PR
      const assignments = await db.getAssignmentsForPr(prId);
      const assignment = assignments.find(
        (a: Assignment) => a.slackUserId === userId && a.status !== 'DONE'
      );

      if (!assignment) {
        await sendResponse(client, channelId, userId, '❌ You are not assigned to this PR or review is already completed.', respond);
        return;
      }

      if (assignment.status === 'IN_PROGRESS') {
        await sendResponse(client, channelId, userId, 'ℹ️ You have already started reviewing this PR.', respond);
        return;
      }

      // Update status to IN_PROGRESS
      const updated = await db.updateAssignmentStatus(assignment.id, 'IN_PROGRESS');

      if (updated) {
        // Update Slack message
        const pr = await db.getPr(prId);
        if (pr && pr.slackMessageTs) {
          const updatedAssignments = await db.getAssignmentsForPr(prId);
          const reviewerPromises = updatedAssignments
            .filter((a: Assignment) => !a.completedAt)
            .map((a: Assignment) => db.getMember(a.memberId));
          const reviewerResults = await Promise.all(reviewerPromises);
          const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

          let jiraInfo = undefined;
          if (pr.jiraIssueKey) {
            try {
              const actionBody = body as BlockAction<ButtonAction>;
              const slackTeamId = actionBody.team?.id;
              if (slackTeamId) {
                const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
                if (workspace) {
                  const context = await loadWorkspaceContext(slackTeamId);
                  const jiraConnection = await db.getJiraConnection(workspace.id);
                  if (jiraConnection && hasFeature(context, 'jiraIntegration')) {
                    const jira = new JiraService(jiraConnection);
                    jiraInfo = await jira.getIssueMinimal(pr.jiraIssueKey);
                  }
                }
              }
            } catch (e) {
              logger.warn('Failed to fetch Jira info for take review', e);
            }
          }

          const blocks = buildPrMessageBlocks({ pr, reviewers, jira: jiraInfo });

          try {
            await client.chat.update({
              channel: pr.slackChannelId,
              ts: pr.slackMessageTs,
              text: `PR #${pr.number}: ${pr.title}`,
              blocks
            });
          } catch (updateError) {
            console.warn('Failed to update Slack message:', updateError);
          }
        }

        await sendResponse(client, channelId, userId, '🔄 Review started! Status updated to IN_PROGRESS.', respond);
      } else {
        await sendResponse(client, channelId, userId, '❌ Failed to start review. Please try again.', respond);
      }
    } catch (error) {
      console.error('Error in take_review handler:', error);
      const actionBody = body as BlockAction;
      if (actionBody.user?.id && actionBody.channel?.id) {
        await sendResponse(client, actionBody.channel.id, actionBody.user.id, '❌ An error occurred. Please try again.', respond);
      }
    }
  });

  // Mark assignment as done
  app.action('mark_done', async ({ ack, body, client, respond }) => {
    await ack();

    try {
      const actionBody = body as BlockAction<ButtonAction>;
      const userId = actionBody.user?.id;
      const value = actionBody.actions?.[0]?.value;
      const channelId = actionBody.channel?.id;

      if (!userId || !value || !channelId) {
        throw new Error('Missing required fields in action');
      }

      // Support both old format (just prId) and new format (prId|memberId)
      const [prId] = value.split('|');
      if (!prId) {
        throw new Error('Invalid PR ID in action value');
      }

      const ok = await db.markAssignmentDoneBySlackUser(prId, userId);

      if (ok) {
        // Update the message to reflect the change
        const pr = await db.getPr(prId);
        if (pr && pr.slackMessageTs) {
          const assignments = await db.getAssignmentsForPr(prId);
          const reviewerPromises = assignments
            .filter((a: any) => !a.completedAt)
            .map((a: any) => db.getMember(a.memberId));
          const reviewerResults = await Promise.all(reviewerPromises);
          const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

          const blocks = buildPrMessageBlocks({ pr, reviewers, jira: undefined });
          
          try {
            await client.chat.update({
              channel: pr.slackChannelId,
              ts: pr.slackMessageTs,
              text: `PR #${pr.number}: ${pr.title}`,
              blocks
            });
          } catch (updateError) {
            console.warn('Failed to update Slack message:', updateError);
          }
        }

        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: '✅ Review marked as done!'
        });
      } else {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: '⚠️ Could not mark as done. You may not be assigned to this PR.'
        });
      }
    } catch (error) {
      console.error('Error in mark_done handler:', error);
      const actionBody = body as BlockAction;
      if (actionBody.user?.id && actionBody.channel?.id) {
        await client.chat.postEphemeral({
          channel: actionBody.channel.id,
          user: actionBody.user.id,
          text: '❌ An error occurred. Please try again.'
        });
      }
    }
  });

  // List my assignments
  app.command('/my-reviews', async ({ ack, command, client, respond }) => {
    await ack();

    try {
      const userId = command.user_id;
      const channelId = command.channel_id;
      const assignments = await db.getAssignmentsBySlackUser(userId);

      // Helper to send response (works in DMs and channels)
      const sendResponse = async (text: string) => {
        try {
          // Try ephemeral first (works in channels)
          if (channelId && channelId.startsWith('C')) {
            await client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text
            });
          } else {
            // Use respond for DMs or if ephemeral fails
            await respond({
              text,
              response_type: 'ephemeral'
            });
          }
        } catch (err: any) {
          // Fallback to respond if ephemeral fails
          if (err.data?.error === 'not_in_channel' || err.code === 'slack_webapi_platform_error') {
            await respond({
              text,
              response_type: 'ephemeral'
            });
          } else {
            throw err;
          }
        }
      };

      if (assignments.length === 0) {
        await sendResponse('✅ You have no pending reviews!');
        return;
      }

      // Get PRs and calculate waiting times
      const assignmentsWithPrs = await Promise.all(
        assignments.map(async (a: Assignment) => {
          const pr = await db.getPr(a.prId);
          if (!pr || pr.status !== 'OPEN') return null;
          
          const waitingTime = calculateWaitingTime(a.createdAt);
          return {
            assignment: a,
            pr,
            waitingTime
          };
        })
      );

      const validAssignments = assignmentsWithPrs.filter((item): item is NonNullable<typeof item> => item !== null);

      if (validAssignments.length === 0) {
        await sendResponse('✅ You have no pending reviews!');
        return;
      }

      // Sort by waiting time (oldest first)
      validAssignments.sort((a, b) => b.waitingTime - a.waitingTime);

      const text = validAssignments
        .map(({ pr, assignment, waitingTime }) => {
          const statusEmoji = assignment.status === 'IN_PROGRESS' ? '🔄' : '📋';
          const waitingStr = formatWaitingTime(waitingTime);
          return `${statusEmoji} <${pr.url}|PR #${pr.number}: ${pr.title}>\n   ${pr.repoFullName} | ${waitingStr} | Status: ${assignment.status}`;
        })
        .join('\n\n');

      const totalWaiting = validAssignments.reduce((sum, item) => sum + item.waitingTime, 0);
      const avgWaiting = formatWaitingTime(totalWaiting / validAssignments.length);

      await sendResponse(`📋 *Your Pending Reviews (${validAssignments.length}):*\n\n${text}\n\n*Average waiting time:* ${avgWaiting}`);
    } catch (error) {
      console.error('Error in /my-reviews command:', error);
      try {
        await respond({
          text: '❌ An error occurred. Please try again.',
          response_type: 'ephemeral'
        });
      } catch (respondError) {
        console.error('Failed to send error response:', respondError);
      }
    }
  });

  // Create Jira ticket from PR
  app.action('create_jira_ticket', async ({ ack, body, client }) => {
    await ack();

    if (!jiraEnabled) {
      const actionBody = body as BlockAction;
      if (actionBody.user?.id && actionBody.channel?.id) {
        await client.chat.postEphemeral({
          channel: actionBody.channel.id,
          user: actionBody.user.id,
          text: '❌ Jira is not configured. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in your environment.'
        });
      }
      return;
    }

    try {
      const actionBody = body as BlockAction<ButtonAction>;
      const userId = actionBody.user?.id;
      const prId = actionBody.actions?.[0]?.value;
      const channelId = actionBody.channel?.id;

      if (!userId || !prId || !channelId) {
        throw new Error('Missing required fields in action');
      }

      const pr = await db.getPr(prId);
      if (!pr) {
        throw new Error('PR not found');
      }

      if (pr.jiraIssueKey) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `⚠️ This PR already has a Jira ticket: ${pr.jiraIssueKey}`
        });
        return;
      }

      if (!env.JIRA_PROJECT_KEY) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: '❌ JIRA_PROJECT_KEY is not configured. Please set it in your environment variables.'
        });
        return;
      }

      const slackTeamId = actionBody.team?.id;
      if (!slackTeamId) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: '❌ Missing Slack Team ID'
        });
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: '❌ Workspace not found'
        });
        return;
      }
      const context = await loadWorkspaceContext(slackTeamId);
      const jiraConnection = await db.getJiraConnection(workspace.id);
      if (!jiraConnection || !hasFeature(context, 'jiraIntegration')) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: '❌ Jira is not configured for this workspace.'
        });
        return;
      }

      // Show "Creating..." message
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: '🔄 Creating Jira ticket...'
      });

      const jira = new JiraService(jiraConnection);

      // Get active sprint if available
      const sprints = await jira.getActiveSprints(env.JIRA_PROJECT_KEY);
      const activeSprint = sprints.length > 0 ? sprints[0] : undefined;

      // Create the issue
      const description = `PR: ${pr.url}\nRepository: ${pr.repoFullName}\nAuthor: ${pr.authorGithub}\nSize: ${pr.size}\nStack: ${pr.stack}`;

      const issue = await jira.createIssue({
        projectKey: env.JIRA_PROJECT_KEY,
        summary: `[PR #${pr.number}] ${pr.title}`,
        description,
        issueType: env.JIRA_ISSUE_TYPE,
        labels: [pr.repoFullName.split('/')[1], pr.stack.toLowerCase()],
        sprintId: activeSprint?.id
      });

      // Link the issue to the PR
      await db.updatePr(prId, { jiraIssueKey: issue.key });

      // Add comment to Jira linking back to PR
      await jira.addComment(issue.key, `Linked PR: ${pr.url} (${pr.repoFullName} #${pr.number})`);

      // Update the Slack message
      if (pr.slackMessageTs) {
        const assignments = await db.getAssignmentsForPr(prId);
        const reviewerPromises = assignments
          .filter((a: any) => !a.completedAt)
          .map((a: any) => db.getMember(a.memberId));
        const reviewerResults = await Promise.all(reviewerPromises);
        const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

        const blocks = buildPrMessageBlocks({ pr: { ...pr, jiraIssueKey: issue.key }, reviewers, jira: issue });

        try {
          await client.chat.update({
            channel: pr.slackChannelId,
            ts: pr.slackMessageTs,
            text: `PR #${pr.number}: ${pr.title}`,
            blocks
          });
        } catch (updateError) {
          console.warn('Failed to update Slack message:', updateError);
        }
      }

      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `✅ Created Jira ticket: <${issue.url}|${issue.key}>${activeSprint ? ` (added to sprint: ${activeSprint.name})` : ''}`
      });
    } catch (error) {
      console.error('Error creating Jira ticket:', error);
      const actionBody = body as BlockAction;
      if (actionBody.user?.id && actionBody.channel?.id) {
        await client.chat.postEphemeral({
          channel: actionBody.channel.id,
          user: actionBody.user.id,
          text: `❌ Failed to create Jira ticket: ${(error as Error).message}`
        });
      }
    }
  });

  // Create Jira ticket via command
  app.command('/create-jira', async ({ ack, command, client, respond }) => {
    await ack();

    if (!jiraEnabled) {
      await respond({
        text: '❌ Jira is not configured. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN in your environment.',
        response_type: 'ephemeral'
      });
      return;
    }

    try {
      const text = command.text?.trim() || '';
      const [summary, ...descriptionParts] = text.split('\n');
      
      if (!summary) {
        await respond({
          text: 'Usage: `/create-jira <summary>\n<description (optional)>`\n\nExample: `/create-jira Fix login bug\nUsers cannot log in with email`',
          response_type: 'ephemeral'
        });
        return;
      }

      if (!env.JIRA_PROJECT_KEY) {
        await respond({
          text: '❌ JIRA_PROJECT_KEY is not configured.',
          response_type: 'ephemeral'
        });
        return;
      }

      const description = descriptionParts.join('\n') || undefined;

      await respond({
        text: '🔄 Creating Jira ticket...',
        response_type: 'ephemeral'
      });

      const slackTeamId = command.team_id;
      if (!slackTeamId) {
        await respond({
          text: '❌ Missing Slack Team ID',
          response_type: 'ephemeral'
        });
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await respond({
          text: '❌ Workspace not found',
          response_type: 'ephemeral'
        });
        return;
      }
      const context = await loadWorkspaceContext(slackTeamId);
      const jiraConnection = await db.getJiraConnection(workspace.id);
      if (!jiraConnection || !hasFeature(context, 'jiraIntegration')) {
        await respond({
          text: '❌ Jira is not configured for this workspace.',
          response_type: 'ephemeral'
        });
        return;
      }
      const jira = new JiraService(jiraConnection);

      // Get active sprint if available
      const sprints = await jira.getActiveSprints(env.JIRA_PROJECT_KEY);
      const activeSprint = sprints.length > 0 ? sprints[0] : undefined;

      const issue = await jira.createIssue({
        projectKey: env.JIRA_PROJECT_KEY,
        summary,
        description,
        issueType: env.JIRA_ISSUE_TYPE,
        sprintId: activeSprint?.id
      });

      await respond({
        text: `✅ Created Jira ticket: <${issue.url}|${issue.key}>${activeSprint ? ` (added to sprint: ${activeSprint.name})` : ''}`,
        response_type: 'ephemeral'
      });
    } catch (error) {
      console.error('Error in /create-jira command:', error);
      await respond({
        text: `❌ Failed to create Jira ticket: ${(error as Error).message}`,
        response_type: 'ephemeral'
      });
    }
  });

  // Admin: Add team member
  app.command('/add-reviewer', async ({ ack, command, client, respond }) => {
    await ack();

    try {
      const text = command.text?.trim() || '';
      const parts = text.split(' ');
      
      if (parts.length < 3) {
        await respond({
          text: 'Usage: `/add-reviewer <slack-user-id> <github-username> <role>`\n\nRoles: FE (Frontend), BE (Backend), FS (Full Stack)\n\nExample: `/add-reviewer U01234567 alice FE`',
          response_type: 'ephemeral'
        });
        return;
      }

      const [slackUserId, githubUsername, role] = parts;
      const validRoles: Array<'FE' | 'BE' | 'FS'> = ['FE', 'BE', 'FS'];
      
      if (!validRoles.includes(role as any)) {
        await respond({
          text: `❌ Invalid role. Must be one of: ${validRoles.join(', ')}`,
          response_type: 'ephemeral'
        });
        return;
      }

      // Check if member already exists
      const members = await db.listMembers();
      const existing = members.find((m: any) => m.slackUserId === slackUserId);
      
      if (existing) {
        // Update existing member
        await db.updateMember(existing.id, {
          githubUsernames: [...new Set([...existing.githubUsernames, githubUsername])],
          roles: existing.roles.includes(role as any) ? existing.roles : [...existing.roles, role as any]
        });
        await respond({
          text: `✅ Updated reviewer: <@${slackUserId}> (${githubUsername}) - ${role}`,
          response_type: 'ephemeral'
        });
      } else {
        // Create new member
        const memberId = `member_${slackUserId}`;
        await db.addMember({
          id: memberId,
          slackUserId,
          githubUsernames: [githubUsername],
          roles: [role as 'FE' | 'BE' | 'FS'],
          weight: 1.0,
          isActive: true
        });
        await respond({
          text: `✅ Added reviewer: <@${slackUserId}> (${githubUsername}) - ${role}`,
          response_type: 'ephemeral'
        });
      }
    } catch (error) {
      console.error('Error in /add-reviewer command:', error);
      await respond({
        text: `❌ Failed to add reviewer: ${(error as Error).message}`,
        response_type: 'ephemeral'
      });
    }
  });

  // Admin: List all team members
  app.command('/list-reviewers', async ({ ack, command, respond }) => {
    await ack();

    try {
      const members = await db.listMembers();
      
      if (members.length === 0) {
        await respond({
          text: '📋 No reviewers configured yet.\n\nUse `/add-reviewer` to add team members.',
          response_type: 'ephemeral'
        });
        return;
      }

      // Get workload for each member
      const membersWithWorkload = await Promise.all(
        members.map(async (m: any) => {
          const openReviews = await db.getOpenAssignmentsCount(m.id);
          return { ...m, openReviews };
        })
      );

      const text = membersWithWorkload
        .map((m: any) => {
          const roles = m.roles.join(', ');
          const github = m.githubUsernames.join(', ');
          const status = m.isActive ? (m.isUnavailable ? '🏖️' : '✅') : '❌';
          const workload = m.openReviews > 0 ? ` (${m.openReviews} open review${m.openReviews > 1 ? 's' : ''})` : '';
          return `${status} <@${m.slackUserId}> - ${github} (${roles})${workload}`;
        })
        .join('\n');

      await respond({
        text: `📋 *Team Reviewers (${members.length}):*\n\n${text}`,
        response_type: 'ephemeral'
      });
    } catch (error) {
      console.error('Error in /list-reviewers command:', error);
      await respond({
        text: '❌ An error occurred.',
        response_type: 'ephemeral'
      });
    }
  });

  // Admin: Remove team member
  app.command('/remove-reviewer', async ({ ack, command, respond }) => {
    await ack();

    try {
      const text = command.text?.trim() || '';
      const slackUserId = text.trim();
      
      if (!slackUserId) {
        await respond({
          text: 'Usage: `/remove-reviewer <slack-user-id>`\n\nExample: `/remove-reviewer U01234567`',
          response_type: 'ephemeral'
        });
        return;
      }

      const members = await db.listMembers();
      const member = members.find((m: any) => m.slackUserId === slackUserId);
      
      if (!member) {
        await respond({
          text: `❌ Reviewer not found: <@${slackUserId}>`,
          response_type: 'ephemeral'
        });
        return;
      }

      // Deactivate instead of deleting (preserve history)
      await db.updateMember(member.id, { isActive: false });
      
      await respond({
        text: `✅ Removed reviewer: <@${slackUserId}>`,
        response_type: 'ephemeral'
      });
    } catch (error) {
      console.error('Error in /remove-reviewer command:', error);
      await respond({
        text: `❌ Failed to remove reviewer: ${(error as Error).message}`,
        response_type: 'ephemeral'
      });
    }
  });

  // Admin: Set reviewer weight (for load balancing)
  app.command('/set-weight', async ({ ack, command, respond }) => {
    await ack();

    try {
      const text = command.text?.trim() || '';
      const parts = text.split(' ');
      
      if (parts.length < 2) {
        await respond({
          text: 'Usage: `/set-weight <slack-user-id> <weight>`\n\nWeight: 0.5-2.0 (lower = more assignments)\n\nExample: `/set-weight U01234567 0.8`',
          response_type: 'ephemeral'
        });
        return;
      }

      const [slackUserId, weightStr] = parts;
      const weight = parseFloat(weightStr);
      
      if (isNaN(weight) || weight < 0.1 || weight > 2.0) {
        await respond({
          text: '❌ Weight must be a number between 0.1 and 2.0',
          response_type: 'ephemeral'
        });
        return;
      }

      const members = await db.listMembers();
      const member = members.find((m: any) => m.slackUserId === slackUserId);
      
      if (!member) {
        await respond({
          text: `❌ Reviewer not found: <@${slackUserId}>`,
          response_type: 'ephemeral'
        });
        return;
      }

      await db.updateMember(member.id, { weight });
      
      await respond({
        text: `✅ Set weight for <@${slackUserId}> to ${weight}`,
        response_type: 'ephemeral'
      });
    } catch (error) {
      console.error('Error in /set-weight command:', error);
      await respond({
        text: `❌ Failed to set weight: ${(error as Error).message}`,
        response_type: 'ephemeral'
      });
    }
  });

  // Set unavailable (sick/vacation)
  app.command('/set-unavailable', async ({ ack, command, respond }) => {
    await ack();
    const userId = command.user_id;

    try {
      const members = await db.listMembers();
      const member = members.find((m: any) => m.slackUserId === userId);

      if (!member) {
        await respond({
          text: '❌ You are not registered as a reviewer. Use `/add-reviewer` to add yourself first.',
          response_type: 'ephemeral'
        });
        return;
      }

      await db.updateMember(member.id, { isUnavailable: true });

      await respond({
        text: '🏖️ You are now marked as unavailable (sick/vacation). You won\'t receive new PR assignments until you set yourself as available again with `/set-available`.',
        response_type: 'ephemeral'
      });
    } catch (error) {
      console.error('Error in /set-unavailable command:', error);
      await respond({
        text: `❌ Failed to set unavailable: ${(error as Error).message}`,
        response_type: 'ephemeral'
      });
    }
  });

  // Set available (back from vacation)
  app.command('/set-available', async ({ ack, command, respond }) => {
    await ack();
    const userId = command.user_id;

    try {
      const members = await db.listMembers();
      const member = members.find((m: any) => m.slackUserId === userId);

      if (!member) {
        await respond({
          text: '❌ You are not registered as a reviewer.',
          response_type: 'ephemeral'
        });
        return;
      }

      await db.updateMember(member.id, { isUnavailable: false });

      await respond({
        text: '✅ You are now marked as available. You will receive new PR assignments.',
        response_type: 'ephemeral'
      });
    } catch (error) {
      console.error('Error in /set-available command:', error);
      await respond({
        text: `❌ Failed to set available: ${(error as Error).message}`,
        response_type: 'ephemeral'
      });
    }
  });

  // Reassign PR to another reviewer
  app.command('/reassign-pr', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;

    try {
      const args = command.text?.trim().split(' ') || [];
      if (args.length < 1) {
        await sendResponse(client, channelId, userId, 'Usage: `/reassign-pr <pr-id>`\n\nTo find PR ID, check the PR message in channel or use `/my-reviews`.', respond);
        return;
      }

      const prId = args[0];
      const pr = await db.getPr(prId);

      if (!pr) {
        await sendResponse(client, channelId, userId, '❌ PR not found. Make sure you use the correct PR ID.', respond);
        return;
      }

      // Get current assignments
      const assignments = await db.getAssignmentsForPr(prId);
      const currentAssignment = assignments.find((a: any) => !a.completedAt);

      if (!currentAssignment) {
        await sendResponse(client, channelId, userId, '❌ No active assignment found for this PR.', respond);
        return;
      }

      // Find new reviewer (excluding current one and unavailable members)
      const currentMember = await db.getMember(currentAssignment.memberId);
      const slackTeamId = command.team_id;
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }
      const newReviewers = await pickReviewers({
        workspaceId: workspace.id,
        stack: pr.stack === 'MIXED' ? 'MIXED' : pr.stack,
        requiredReviewers: 2, // Get 2 candidates in case first is current reviewer
        authorGithub: pr.authorGithub,
        excludeMemberIds: [currentAssignment.memberId] // Exclude current reviewer
      });

      // Filter out current reviewer (extra safety check)
      const availableReviewers = newReviewers.filter((r: any) => r.id !== currentAssignment.memberId);

      if (availableReviewers.length === 0) {
        await sendResponse(client, channelId, userId, '❌ No available reviewers found. All team members might be unavailable or already assigned.', respond);
        return;
      }

      const newReviewer = availableReviewers[0];

      // Mark old assignment as done
      await db.markAssignmentDone(currentAssignment.id);

      // Create new assignment
      await db.createAssignments(prId, [newReviewer.id]);

      // Update Slack message
      if (pr.slackMessageTs) {
        const updatedAssignments = await db.getAssignmentsForPr(prId);
        const reviewerPromises = updatedAssignments
          .filter((a: any) => !a.completedAt)
          .map((a: any) => db.getMember(a.memberId));
        const reviewerResults = await Promise.all(reviewerPromises);
        const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

        let jiraInfo = undefined;
        if (pr.jiraIssueKey) {
          try {
            const slackTeamId = command.team_id;
            if (slackTeamId) {
              const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
              if (workspace) {
                const context = await loadWorkspaceContext(slackTeamId);
                const jiraConnection = await db.getJiraConnection(workspace.id);
                if (jiraConnection && hasFeature(context, 'jiraIntegration')) {
                  const jira = new JiraService(jiraConnection);
                  jiraInfo = await jira.getIssueMinimal(pr.jiraIssueKey);
                }
              }
            }
          } catch (e) {
            logger.warn('Failed to fetch Jira info for reassign', e);
          }
        }

        const blocks = buildPrMessageBlocks({ pr, reviewers, jira: jiraInfo });

        try {
          await client.chat.update({
            channel: pr.slackChannelId,
            ts: pr.slackMessageTs,
            text: `PR #${pr.number}: ${pr.title}`,
            blocks
          });
        } catch (updateError) {
          logger.warn('Failed to update Slack message on reassign', updateError);
        }
      }

      // Notify new reviewer
      try {
        await client.chat.postMessage({
          channel: newReviewer.slackUserId,
          text: `📋 *PR Reassigned to You*\n\nPR #${pr.number}: ${pr.title}\nRepository: ${pr.repoFullName}\nAuthor: ${pr.authorGithub}\n\n<${pr.url}|View PR on GitHub>`
        });
      } catch (dmError) {
        logger.warn(`Failed to send DM to new reviewer ${newReviewer.slackUserId}`, dmError);
      }

      await sendResponse(client, channelId, userId, `✅ PR reassigned from <@${currentMember?.slackUserId}> to <@${newReviewer.slackUserId}>.`, respond);
    } catch (error) {
      console.error('Error in /reassign-pr command:', error);
      await sendResponse(client, channelId, userId, `❌ Failed to reassign PR: ${(error as Error).message}`, respond);
    }
  });

  // Reassign PR action (button click)
  app.action('reassign_pr', async ({ ack, body, client, respond }) => {
    await ack();

    try {
      const actionBody = body as BlockAction<ButtonAction>;
      const userId = actionBody.user?.id;
      const prId = actionBody.actions?.[0]?.value;
      const channelId = actionBody.channel?.id;

      if (!userId || !prId || !channelId) {
        throw new Error('Missing required fields in action');
      }

      const pr = await db.getPr(prId);
      if (!pr) {
        await sendResponse(client, channelId, userId, '❌ PR not found.', respond);
        return;
      }

      // Get current assignments
      const assignments = await db.getAssignmentsForPr(prId);
      const currentAssignment = assignments.find((a: any) => !a.completedAt);

      if (!currentAssignment) {
        await sendResponse(client, channelId, userId, '❌ No active assignment found for this PR.', respond);
        return;
      }

      // Check if user is the assigned reviewer
      const currentMember = await db.getMember(currentAssignment.memberId);
      if (currentMember?.slackUserId !== userId) {
        await sendResponse(client, channelId, userId, '❌ Only the assigned reviewer can request reassignment. Use `/reassign-pr <pr-id>` for manual reassignment.', respond);
        return;
      }

      // Find new reviewer (excluding current one)
      const slackTeamId = actionBody.team?.id;
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }
      const newReviewers = await pickReviewers({
        workspaceId: workspace.id,
        stack: pr.stack === 'MIXED' ? 'MIXED' : pr.stack,
        requiredReviewers: 2, // Get 2 candidates in case first is current reviewer
        authorGithub: pr.authorGithub,
        excludeMemberIds: [currentAssignment.memberId] // Exclude current reviewer
      });

      // Filter out current reviewer (extra safety check)
      const availableReviewers = newReviewers.filter((r: any) => r.id !== currentAssignment.memberId);

      if (availableReviewers.length === 0) {
        await sendResponse(client, channelId, userId, '❌ No available reviewers found. All team members might be unavailable.', respond);
        return;
      }

      const newReviewer = availableReviewers[0];

      // Mark old assignment as done
      await db.markAssignmentDone(currentAssignment.id);

      // Create new assignment
      await db.createAssignments(prId, [newReviewer.id]);

      // Update Slack message
      if (pr.slackMessageTs) {
        const updatedAssignments = await db.getAssignmentsForPr(prId);
        const reviewerPromises = updatedAssignments
          .filter((a: any) => !a.completedAt)
          .map((a: any) => db.getMember(a.memberId));
        const reviewerResults = await Promise.all(reviewerPromises);
        const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

        let jiraInfo = undefined;
        if (pr.jiraIssueKey) {
          try {
            if (slackTeamId) {
              const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
              if (workspace) {
                const context = await loadWorkspaceContext(slackTeamId);
                const jiraConnection = await db.getJiraConnection(workspace.id);
                if (jiraConnection && hasFeature(context, 'jiraIntegration')) {
                  const jira = new JiraService(jiraConnection);
                  jiraInfo = await jira.getIssueMinimal(pr.jiraIssueKey);
                }
              }
            }
          } catch (e) {
            logger.warn('Failed to fetch Jira info for reassign', e);
          }
        }

        const blocks = buildPrMessageBlocks({ pr, reviewers, jira: jiraInfo });

        try {
          await client.chat.update({
            channel: pr.slackChannelId,
            ts: pr.slackMessageTs,
            text: `PR #${pr.number}: ${pr.title}`,
            blocks
          });
        } catch (updateError) {
          logger.warn('Failed to update Slack message on reassign', updateError);
        }
      }

      // Notify new reviewer
      try {
        await client.chat.postMessage({
          channel: newReviewer.slackUserId,
          text: `📋 *PR Reassigned to You*\n\nPR #${pr.number}: ${pr.title}\nRepository: ${pr.repoFullName}\nAuthor: ${pr.authorGithub}\n\n<${pr.url}|View PR on GitHub>`
        });
      } catch (dmError) {
        logger.warn(`Failed to send DM to new reviewer ${newReviewer.slackUserId}`, dmError);
      }

      await sendResponse(client, channelId, userId, `✅ PR reassigned to <@${newReviewer.slackUserId}>.`, respond);
    } catch (error) {
      console.error('Error in reassign_pr action:', error);
      const actionBody = body as BlockAction;
      if (actionBody.user?.id && actionBody.channel?.id) {
        await sendResponse(client, actionBody.channel.id, actionBody.user.id, `❌ Failed to reassign PR: ${(error as Error).message}`, respond);
      }
    }
  });

  // Enhanced /cr command (my reviews, team queue, settings, debug)
  app.command('/cr', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const args = command.text?.trim().toLowerCase() || '';

    // Route to appropriate handler
    if (args === 'debug') {
      try {
        await requireAdmin(userId, command.team_id);
        
        const workspace = await db.getWorkspaceBySlackTeamId(command.team_id);
        if (!workspace) {
          await sendResponse(client, channelId, userId, '❌ Workspace not found.', respond);
          return;
        }

        const context = await loadWorkspaceContext(command.team_id);
        const settings = await db.getWorkspaceSettings(command.team_id);
        const jiraConnection = await db.getJiraConnection(workspace.id);
        const members = await db.listMembers(workspace.id);
        const teams = await db.listTeams(workspace.id);
        const repoMappings = await db.listRepoMappings(workspace.id);
        const openPRs = await db.listOpenPrs(workspace.id);
        const auditLogs = await db.listAuditLogs(workspace.id, 10);

        let text = `🔍 *ReviewFlow Debug Info*\n\n`;
        text += `*Workspace:*\n`;
        text += `• ID: \`${workspace.id}\`\n`;
        text += `• Slack Team ID: \`${workspace.slackTeamId}\`\n`;
        text += `• Plan: ${context.plan}\n`;
        text += `• Status: ${context.status}\n\n`;
        
        text += `*Settings:*\n`;
        text += `• Default Channel: ${settings?.defaultChannelId || 'Not set'}\n`;
        text += `• GitHub Installation: ${settings?.githubInstallationId || workspace.githubInstallationId || 'Not connected'}\n`;
        text += `• Jira: ${jiraConnection ? 'Connected' : 'Not connected'}\n`;
        text += `• Required Reviewers: ${settings?.requiredReviewers || 2}\n`;
        text += `• Reminder Hours: ${settings?.reminderHours || 24}\n\n`;
        
        text += `*Stats:*\n`;
        text += `• Members: ${members.length}\n`;
        text += `• Teams: ${teams.length}\n`;
        text += `• Repo Mappings: ${repoMappings.length}\n`;
        text += `• Open PRs: ${openPRs.length}\n`;
        text += `• Usage: ${context.usage.prsProcessed}/${context.usage.limit} PRs this month\n\n`;
        
        text += `*Recent Audit Logs (last 10):*\n`;
        if (auditLogs.length > 0) {
          auditLogs.forEach((log: any, idx: number) => {
            text += `${idx + 1}. ${log.event} - ${new Date(log.timestamp).toLocaleString()}\n`;
          });
        } else {
          text += `No audit logs yet.\n`;
        }

        await sendResponse(client, channelId, userId, text, respond);
      } catch (error: any) {
        if (error.message?.includes('admin')) {
          await sendResponse(client, channelId, userId, '❌ This command requires admin permissions.', respond);
        } else {
          logger.error('Error in /cr debug command', error);
          await sendResponse(client, channelId, userId, `❌ Failed to get debug info: ${error.message}`, respond);
        }
      }
      return;
    } else if (args === 'settings') {
      // Settings modal (admin only)
      try {
        await requireAdmin(userId, command.team_id);
        
        const workspace = await db.getWorkspaceBySlackTeamId(command.team_id);
        if (!workspace) {
          await sendResponse(client, channelId, userId, '❌ Workspace not found.', respond);
          return;
        }

        const { buildComprehensiveSettingsModal } = await import('./settingsModal');
        const modal = await buildComprehensiveSettingsModal(command.team_id, workspace.id);

        await client.views.open({
          trigger_id: (command as any).trigger_id,
          view: modal
        });
      } catch (error: any) {
        if (error.message?.includes('admin')) {
          await sendResponse(client, channelId, userId, '❌ This command requires admin permissions.', respond);
        } else {
          logger.error('Error opening settings modal', error);
          await sendResponse(client, channelId, userId, `❌ Failed to open settings: ${error.message}`, respond);
        }
      }
      return;
    } else if (args === 'my' || args === '') {
      // Your reviews
      try {
        const assignments = await db.getAssignmentsBySlackUser(userId);

        if (assignments.length === 0) {
          await sendResponse(client, channelId, userId, '✅ You have no pending reviews!', respond);
          return;
        }

        const assignmentsWithPrs = await Promise.all(
          assignments.map(async (a: Assignment) => {
            const pr = await db.getPr(a.prId);
            if (!pr || pr.status !== 'OPEN') return null;
            
            const waitingTime = calculateWaitingTime(a.createdAt);
            return {
              assignment: a,
              pr,
              waitingTime
            };
          })
        );

        const validAssignments = assignmentsWithPrs.filter((item): item is NonNullable<typeof item> => item !== null);

        if (validAssignments.length === 0) {
          await sendResponse(client, channelId, userId, '✅ You have no pending reviews!', respond);
          return;
        }

        validAssignments.sort((a, b) => b.waitingTime - a.waitingTime);

        const text = validAssignments
          .map(({ pr, assignment, waitingTime }) => {
            const statusEmoji = assignment.status === 'IN_PROGRESS' ? '🔄' : '📋';
            const waitingStr = formatWaitingTime(waitingTime);
            return `${statusEmoji} <${pr.url}|PR #${pr.number}: ${pr.title}>\n   ${pr.repoFullName} | ${waitingStr} | Status: ${assignment.status}`;
          })
          .join('\n\n');

        const totalWaiting = validAssignments.reduce((sum, item) => sum + item.waitingTime, 0);
        const avgWaiting = formatWaitingTime(totalWaiting / validAssignments.length);

        await sendResponse(
          client,
          channelId,
          userId,
          `📋 *Your Pending Reviews (${validAssignments.length}):*\n\n${text}\n\n*Average waiting time:* ${avgWaiting}`,
          respond
        );
      } catch (error) {
        console.error('Error in /cr my command:', error);
        await sendResponse(client, channelId, userId, `❌ Failed to get reviews: ${(error as Error).message}`, respond);
      }
    } else if (args === 'team') {
      // Team-wide review queue
      try {
        const members = await db.listMembers();
        const activeMembers = members.filter((m: Member) => m.isActive && !m.isUnavailable);

        if (activeMembers.length === 0) {
          await sendResponse(client, channelId, userId, '❌ No active team members found.', respond);
          return;
        }

        // Get all open assignments with PRs
        const allAssignments: Array<{
          assignment: Assignment;
          pr: PrRecord;
          member: Member;
          waitingTime: number;
        }> = [];

        for (const member of activeMembers) {
          const assignments = await db.getOpenAssignmentsForMember(member.id);
          
          for (const assignment of assignments) {
            const pr = await db.getPr(assignment.prId);
            if (pr && pr.status === 'OPEN') {
              const waitingTime = calculateWaitingTime(assignment.createdAt);
              allAssignments.push({
                assignment,
                pr,
                member,
                waitingTime
              });
            }
          }
        }

        if (allAssignments.length === 0) {
          await sendResponse(client, channelId, userId, '✅ No pending reviews in the team!', respond);
          return;
        }

        // Sort by waiting time (oldest first)
        allAssignments.sort((a, b) => b.waitingTime - a.waitingTime);

        // Group by reviewer
        const byReviewer = new Map<string, typeof allAssignments>();
        for (const item of allAssignments) {
          const key = item.member.slackUserId;
          if (!byReviewer.has(key)) {
            byReviewer.set(key, []);
          }
          byReviewer.get(key)!.push(item);
        }

        // Build team queue message
        let text = `📊 *Team Review Queue (${allAssignments.length} total):*\n\n`;

        for (const [slackUserId, items] of byReviewer.entries()) {
          const member = items[0].member;
          const github = member.githubUsernames[0] || 'N/A';
          text += `*<@${slackUserId}> (${github}) - ${items.length} review${items.length > 1 ? 's' : ''}:*\n`;

          for (const { pr, assignment, waitingTime } of items) {
            const statusEmoji = assignment.status === 'IN_PROGRESS' ? '🔄' : '📋';
            const waitingStr = formatWaitingTime(waitingTime);
            text += `  ${statusEmoji} <${pr.url}|PR #${pr.number}: ${pr.title}>\n`;
            text += `     ${pr.repoFullName} | ${waitingStr} | ${assignment.status}\n`;
          }
          text += '\n';
        }

        // Add summary
        const totalWaiting = allAssignments.reduce((sum, item) => sum + item.waitingTime, 0);
        const avgWaiting = formatWaitingTime(totalWaiting / allAssignments.length);
        const oldest = allAssignments[0];
        const oldestWaiting = formatWaitingTime(oldest.waitingTime);

        text += `*Summary:*\n`;
        text += `• Total reviews: ${allAssignments.length}\n`;
        text += `• Average waiting: ${avgWaiting}\n`;
        text += `• Oldest review: ${oldestWaiting} (<${oldest.pr.url}|PR #${oldest.pr.number}>)`;

        await sendResponse(client, channelId, userId, text, respond);
      } catch (error) {
        console.error('Error in /cr team command:', error);
        await sendResponse(client, channelId, userId, `❌ Failed to get team queue: ${(error as Error).message}`, respond);
      }
    } else {
      await sendResponse(
        client,
        channelId,
        userId,
        'Usage: `/cr my` - Your reviews\n`/cr team` - Team review queue\n`/cr settings` - Workspace settings (admin only)',
        respond
      );
    }
  });

  // Analytics command
  app.command('/metrics', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;

    try {
      // Get workspace ID from team
      const workspace = await db.getWorkspaceBySlackTeamId(command.team_id);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }

      const analytics = new AnalyticsService();
      const metrics = await analytics.getReviewMetrics(workspace.id);
      const formatted = analytics.formatMetricsForSlack(metrics);

      await sendResponse(client, channelId, userId, formatted, respond);
    } catch (error) {
      logger.error('Error in /metrics command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to get metrics: ${(error as Error).message}`, respond);
    }
  });

  // Team metrics command
  app.command('/team-metrics', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;

    try {
      // Get workspace ID from team
      const workspace = await db.getWorkspaceBySlackTeamId(command.team_id);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }

      const args = command.text?.trim();
      const teamId = args || undefined;

      const analytics = new AnalyticsService();
      const teamMetrics = await analytics.getTeamMetrics(workspace.id, teamId);

      let text = `📊 *Team Metrics${teamMetrics.teamName ? `: ${teamMetrics.teamName}` : ''}*\n\n`;
      text += `*Members:*\n`;
      text += `• Total: ${teamMetrics.memberCount}\n`;
      text += `• Active: ${teamMetrics.activeMemberCount}\n\n`;
      text += `*PRs:*\n`;
      text += `• Total: ${teamMetrics.totalPRs}\n`;
      text += `• Open: ${teamMetrics.openPRs}\n\n`;
      text += `*Timing:*\n`;
      text += `• Average Review Time: ${formatDuration(teamMetrics.averageReviewTime)}\n`;
      text += `• Average Waiting Time: ${formatDuration(teamMetrics.averageWaitingTime)}\n\n`;
      text += `*Workload Distribution:*\n`;

      for (const workload of teamMetrics.workloadDistribution) {
        const member = await db.getMember(workload.memberId);
        const github = member?.githubUsernames[0] || 'N/A';
        text += `• <@${workload.slackUserId}> (${github}): ${workload.openReviews} open, ${workload.completedReviews} completed\n`;
      }

      await sendResponse(client, channelId, userId, text, respond);
    } catch (error) {
      logger.error('Error in /team-metrics command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to get team metrics: ${(error as Error).message}`, respond);
    }
  });

  // Status command
  app.command('/reviewflow', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const teamId = command.team_id;

    try {
      const context = await loadWorkspaceContext(teamId);
      const polar = new PolarService();

      let text = `📊 *ReviewFlow Status*\n\n`;
      text += `*Plan:* ${context.plan}\n`;
      text += `*Status:* ${context.status === 'active' ? '✅ Active' : '⚠️ ' + context.status}\n\n`;
      text += `*Usage This Month:*\n`;
      text += `• PRs Processed: ${context.usage.prsProcessed} / ${context.usage.limit}\n`;
      text += `• Reset: ${new Date(context.usage.resetAt).toLocaleDateString()}\n\n`;
      text += `*Features:*\n`;
      text += `• Jira: ${context.limits.jiraIntegration ? '✅' : '❌'}\n`;
      text += `• Auto Balance: ${context.limits.autoBalance ? '✅' : '❌'}\n`;
      text += `• Reminders: ${context.limits.reminders ? '✅' : '❌'}\n`;
      text += `• Advanced Analytics: ${context.limits.advancedAnalytics ? '✅' : '❌'}\n`;

      if (context.currentPeriodEnd) {
        text += `\n*Renewal Date:* ${new Date(context.currentPeriodEnd).toLocaleDateString()}`;
      }

      if (context.plan === 'FREE') {
        const checkout = await polar.createCheckoutSession({
          slackTeamId: teamId,
          slackUserId: userId,
          plan: 'pro'
        });
        text += `\n\n<${checkout.url}|🚀 Upgrade to Pro>`;
      }

      await sendResponse(client, channelId, userId, text, respond);
    } catch (error) {
      logger.error('Error in /reviewflow command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to get status: ${(error as Error).message}`, respond);
    }
  });

  // Settings modal action handlers
  app.action('settings_connect_github', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const workspaceId = actionBody.actions?.[0]?.value;
      const { buildGitHubConnectModal } = await import('./onboarding');
      const modal = buildGitHubConnectModal();
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening GitHub connect from settings', error);
    }
  });

  app.action('settings_manage_github', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (workspace?.githubInstallationId) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `✅ GitHub Connected\n\nInstallation ID: \`${workspace.githubInstallationId}\`\n\nTo reconnect: ${env.APP_BASE_URL}/connect/github?workspace_id=${workspace.id}`
        });
      }
    } catch (error: any) {
      logger.error('Error managing GitHub from settings', error);
    }
  });

  app.action('settings_connect_jira', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const { buildJiraConnectModal } = await import('./onboarding');
      const modal = buildJiraConnectModal();
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening Jira connect from settings', error);
    }
  });

  app.action('settings_manage_jira', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) return;
      
      const jiraConnection = await db.getJiraConnection(workspace.id);
      const context = await loadWorkspaceContext(slackTeamId);
      const isActive = jiraConnection && hasFeature(context, 'jiraIntegration');
      
      if (jiraConnection) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `✅ Jira Connected\n\nBase URL: \`${jiraConnection.baseUrl}\`\nEmail: \`${jiraConnection.email}\`\nStatus: ${isActive ? '✅ Active' : '⏳ Waiting for Pro upgrade'}\n\nTo reconnect, use the "Connect Jira" button.`
        });
      }
    } catch (error: any) {
      logger.error('Error managing Jira from settings', error);
    }
  });

  app.action('settings_add_member', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const { buildAddMemberModal } = await import('./modals');
      const modal = buildAddMemberModal();
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening add member modal from settings', error);
    }
  });

  app.action('settings_view_members', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) return;
      
      const members = await db.listMembers(workspace.id);
      const activeMembers = members.filter((m: Member) => m.isActive && !m.isUnavailable);
      
      if (activeMembers.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '📋 No active members found. Use "Add Member" to add your team.'
        });
        return;
      }
      
      const membersList = activeMembers.map((m: Member, idx: number) => {
        const roles = m.roles.join(', ') || 'No role';
        const github = m.githubUsernames.join(', ') || 'No GitHub';
        return `${idx + 1}. <@${m.slackUserId}> - GitHub: ${github} - Roles: ${roles}`;
      }).join('\n');
      
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `👥 *Team Members (${activeMembers.length})*\n\n${membersList}`
      });
    } catch (error: any) {
      logger.error('Error viewing members from settings', error);
    }
  });

  app.action('settings_manage_teams', async ({ ack, body, client, respond }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const channelId = actionBody.channel?.id || userId;
      await sendResponse(client, channelId, userId, '🏢 *Manage Teams*\n\nUse these commands:\n• `/create-team <name> <channel-id>` - Create a team\n• `/list-teams` - List all teams\n• `/map-repo <repo> <team-id>` - Map repository to team', respond);
    } catch (error: any) {
      logger.error('Error in settings_manage_teams', error);
    }
  });

  app.action('settings_map_repo', async ({ ack, body, client, respond }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const channelId = actionBody.channel?.id || userId;
      await sendResponse(client, channelId, userId, '🗺️ *Map Repository*\n\nUse: `/map-repo <repo-full-name> <team-id>`\n\nExample: `/map-repo org/frontend-repo team_1234567890`\n\nUse `/list-teams` to find team IDs.', respond);
    } catch (error: any) {
      logger.error('Error in settings_map_repo', error);
    }
  });

  app.action('settings_view_repos', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) return;
      
      const repoMappings = await db.listRepoMappings(workspace.id);
      const teams = await db.listTeams(workspace.id);
      
      if (repoMappings.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '📋 No repositories mapped yet. Use `/map-repo` to map repositories to teams.'
        });
        return;
      }
      
      const mappingsList = repoMappings.map((rm: RepoMapping) => {
        const team = teams.find((t: Team) => t.id === rm.teamId);
        return `• \`${rm.repoFullName}\` → ${team?.name || 'Unknown Team'} (${rm.teamId})`;
      }).join('\n');
      
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `📦 *Repository Mappings (${repoMappings.length})*\n\n${mappingsList}`
      });
    } catch (error: any) {
      logger.error('Error viewing repos from settings', error);
    }
  });

  app.action('settings_upgrade', async ({ ack }: any) => {
    await ack(); // Button opens URL, no action needed
  });

  app.action('settings_billing', async ({ ack }: any) => {
    await ack(); // Button opens URL, no action needed
  });

  // Debug command (admin only)
  app.command('/cr', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const args = command.text?.trim().toLowerCase() || '';

    if (args === 'debug') {
      try {
        await requireAdmin(userId, command.team_id);
        
        const workspace = await db.getWorkspaceBySlackTeamId(command.team_id);
        if (!workspace) {
          await sendResponse(client, channelId, userId, '❌ Workspace not found.', respond);
          return;
        }

        const context = await loadWorkspaceContext(command.team_id);
        const settings = await db.getWorkspaceSettings(command.team_id);
        const jiraConnection = await db.getJiraConnection(workspace.id);
        const members = await db.listMembers(workspace.id);
        const teams = await db.listTeams(workspace.id);
        const repoMappings = await db.listRepoMappings(workspace.id);
        const openPRs = await db.listOpenPrs(workspace.id);
        const auditLogs = await db.listAuditLogs(workspace.id, 10);

        let text = `🔍 *ReviewFlow Debug Info*\n\n`;
        text += `*Workspace:*\n`;
        text += `• ID: \`${workspace.id}\`\n`;
        text += `• Slack Team ID: \`${workspace.slackTeamId}\`\n`;
        text += `• Plan: ${context.plan}\n`;
        text += `• Status: ${context.status}\n\n`;
        
        text += `*Settings:*\n`;
        text += `• Default Channel: ${settings?.defaultChannelId || 'Not set'}\n`;
        text += `• GitHub Installation: ${settings?.githubInstallationId || workspace.githubInstallationId || 'Not connected'}\n`;
        text += `• Jira: ${jiraConnection ? 'Connected' : 'Not connected'}\n`;
        text += `• Required Reviewers: ${settings?.requiredReviewers || 2}\n`;
        text += `• Reminder Hours: ${settings?.reminderHours || 24}\n\n`;
        
        text += `*Stats:*\n`;
        text += `• Members: ${members.length}\n`;
        text += `• Teams: ${teams.length}\n`;
        text += `• Repo Mappings: ${repoMappings.length}\n`;
        text += `• Open PRs: ${openPRs.length}\n`;
        text += `• Usage: ${context.usage.prsProcessed}/${context.usage.limit} PRs this month\n\n`;
        
        text += `*Recent Audit Logs (last 10):*\n`;
        if (auditLogs.length > 0) {
          auditLogs.forEach((log: any, idx: number) => {
            text += `${idx + 1}. ${log.event} - ${new Date(log.timestamp).toLocaleString()}\n`;
          });
        } else {
          text += `No audit logs yet.\n`;
        }

        await sendResponse(client, channelId, userId, text, respond);
      } catch (error: any) {
        if (error.message?.includes('admin')) {
          await sendResponse(client, channelId, userId, '❌ This command requires admin permissions.', respond);
        } else {
          logger.error('Error in /cr debug command', error);
          await sendResponse(client, channelId, userId, `❌ Failed to get debug info: ${error.message}`, respond);
        }
      }
      return;
    }
    // ... existing /cr command handlers ...
  });

  // Onboarding Wizard Action Handlers

  // Step A: Setup Destination
  app.action('wizard_step_setup_destination', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const modal = buildSetupDestinationModal(workspaceId);
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening setup destination modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // Setup Destination Modal Submit
  app.view('wizard_setup_destination_submit', async ({ ack, body, client, view }) => {
    await ack();
    const userId = body.user.id;
    const slackTeamId = body.team?.id || '';
    const workspaceId = view.private_metadata;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      const setupChannel = view.state.values.setup_destination?.setup_channel?.selected_channel;

      const workspace = await db.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Update workspace
      await db.updateWorkspace(workspaceId, {
        setupChannelId: setupChannel || undefined,
        setupStep: 'channel',
        updatedAt: Date.now()
      });

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Setup destination configured${setupChannel ? `: <#${setupChannel}>` : ' (DM)'}. Continue with Step A2: Select Notification Channel.`
      });

      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: { type: 'home', blocks: [] }
      });
    } catch (error: any) {
      logger.error('Error saving setup destination', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to save setup destination: ${error.message}`
      });
    }
  });

  // Helper function to validate wizard step prerequisites
  async function validateWizardStepPrerequisites(
    workspaceId: string,
    step: 'channel' | 'github' | 'jira' | 'teams' | 'repos' | 'members'
  ): Promise<{ valid: boolean; missingSteps: string[] }> {
    const workspace = await db.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const missingSteps: string[] = [];

    // Step order: Setup Destination -> Channel -> GitHub -> (Jira optional) -> Teams -> Repos -> Members
    if (step === 'channel') {
      // Channel requires nothing (first step after setup destination)
      return { valid: true, missingSteps: [] };
    }

    if (step === 'github') {
      // GitHub requires channel
      const settings = await db.getWorkspaceSettings(workspace.slackTeamId);
      if (!settings?.defaultChannelId && !workspace.defaultChannelId) {
        missingSteps.push('Notification Channel (Step A2)');
      }
    }

    if (step === 'jira') {
      // Jira requires GitHub (optional step, but should come after GitHub)
      if (!workspace.githubInstallationId) {
        missingSteps.push('GitHub Connection (Step B)');
      }
    }

    if (step === 'teams') {
      // Teams requires GitHub
      if (!workspace.githubInstallationId) {
        missingSteps.push('GitHub Connection (Step B)');
      }
    }

    if (step === 'repos') {
      // Repos requires Teams and GitHub
      if (!workspace.githubInstallationId) {
        missingSteps.push('GitHub Connection (Step B)');
      }
      const teams = await db.listTeams(workspaceId);
      if (teams.length === 0) {
        missingSteps.push('Create Teams (Step D)');
      }
    }

    if (step === 'members') {
      // Members requires Teams
      const teams = await db.listTeams(workspaceId);
      if (teams.length === 0) {
        missingSteps.push('Create Teams (Step D)');
      }
    }

    return { valid: missingSteps.length === 0, missingSteps };
  }

  // Step A2: Channel Selection
  app.action('wizard_step_channel', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const validation = await validateWizardStepPrerequisites(workspaceId, 'channel');
      if (!validation.valid) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ *Cannot proceed*\n\nPlease complete these steps first:\n${validation.missingSteps.map(s => `• ${s}`).join('\n')}`
        });
        return;
      }
      const modal = buildChannelSelectionModal(workspaceId);
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening channel selection modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // Channel Selection Modal Submit
  app.view('wizard_channel_submit', async ({ ack, body, client, view }) => {
    await ack();
    const userId = body.user.id;
    const slackTeamId = body.team?.id || '';
    const workspaceId = view.private_metadata;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      const notificationChannel = view.state.values.notification_channel?.channel?.selected_channel;
      const setupChannel = view.state.values.setup_channel?.setup_channel?.selected_channel;

      if (!notificationChannel) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Please select a notification channel.'
        });
        return;
      }

      const workspace = await db.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Update workspace
      await db.updateWorkspace(workspaceId, {
        defaultChannelId: notificationChannel,
        setupStep: 'github',
        updatedAt: Date.now()
      });

      // Update workspace settings
      const settings = await db.getWorkspaceSettings(slackTeamId);
      if (settings) {
        await db.upsertWorkspaceSettings({
          ...settings,
          defaultChannelId: notificationChannel,
          updatedAt: Date.now()
        });
      }

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Notification channel set to <#${notificationChannel}>. Continue with Step B: Connect GitHub.`
      });

      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: { type: 'home', blocks: [] }
      });
    } catch (error: any) {
      logger.error('Error saving channel selection', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to save channel: ${error.message}`
      });
    }
  });

  // Step B: GitHub Connection
  app.action('wizard_step_github', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id;
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const validation = await validateWizardStepPrerequisites(workspaceId, 'github');
      if (!validation.valid) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ *Cannot proceed*\n\nPlease complete these steps first:\n${validation.missingSteps.map(s => `• ${s}`).join('\n')}`
        });
        return;
      }
      const modal = buildGitHubConnectionModal(workspaceId);
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening GitHub connection modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // Step C: Jira Connection
  app.action('wizard_step_jira', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const validation = await validateWizardStepPrerequisites(workspaceId, 'jira');
      if (!validation.valid) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ *Cannot proceed*\n\nPlease complete these steps first:\n${validation.missingSteps.map(s => `• ${s}`).join('\n')}`
        });
        return;
      }
      const context = await loadWorkspaceContext(slackTeamId);
      const isProRequired = !hasFeature(context, 'jiraIntegration');
      const modal = buildJiraConnectionModal(workspaceId, isProRequired);
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening Jira connection modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // GitHub Connection Modal Submit (with manual installation ID option)
  app.view('wizard_github_submit', async ({ ack, body, client, view }) => {
    await ack();
    const userId = body.user.id;
    const slackTeamId = body.team?.id || '';
    const workspaceId = view.private_metadata;

    try {
      // Get workspace first to check if installerUserId needs to be set
      const workspace = await db.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // If workspace doesn't have installerUserId, set it to current user
      if (!workspace.installerUserId) {
        await db.updateWorkspace(workspace.id, {
          installerUserId: userId,
          updatedAt: Date.now()
        });
        logger.info('Set installerUserId for workspace', { workspaceId, userId });
      }

      // Now check admin privileges (this will pass if user is installer)
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      // Just acknowledge - the connection happens automatically via webhook/callback
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: '✅ *GitHub Connection Started*\n\n1. Click the "Install GitHub App" button above\n2. Select your repositories on GitHub\n3. The connection will be detected automatically\n\n💡 *Tip:* After installation, refresh the Home Tab to see the connection status.'
      });
    } catch (error: any) {
      logger.error('Error saving GitHub connection', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to connect GitHub: ${error.message}`
      });
    }
  });

  // Jira Connection Modal Submit
  app.view('wizard_jira_submit', async ({ ack, body, client, view }) => {
    await ack();
    const userId = body.user.id;
    const slackTeamId = body.team?.id || '';
    const workspaceId = view.private_metadata;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      const baseUrl = view.state.values.jira_base_url?.base_url?.value;
      const email = view.state.values.jira_email?.email?.value;
      const apiToken = view.state.values.jira_api_token?.api_token?.value;
      const prOpenedTransition = view.state.values.pr_opened_transition?.pr_opened?.value;
      const prMergedTransition = view.state.values.pr_merged_transition?.pr_merged?.value;

      if (!baseUrl || !email || !apiToken) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Please fill in all required fields: Base URL, Email, and API Token.'
        });
        return;
      }

      const workspace = await db.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Encrypt API token
      const encryptedToken = encrypt(apiToken);

      // Save Jira connection
      await db.upsertJiraConnection({
        id: `jira_${workspaceId}`,
        workspaceId,
        baseUrl: baseUrl.trim(),
        email: email.trim(),
        authType: 'basic',
        tokenEncrypted: encryptedToken,
        prOpenedTransition: prOpenedTransition?.trim() || undefined,
        prMergedTransition: prMergedTransition?.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Jira connected successfully! Continue with Step D: Add Team Members.`
      });

      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: { type: 'home', blocks: [] }
      });
    } catch (error: any) {
      logger.error('Error saving Jira connection', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to connect Jira: ${error.message}`
      });
    }
  });

  // Step D: Add Members
  app.action('wizard_step_members', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const validation = await validateWizardStepPrerequisites(workspaceId, 'members');
      if (!validation.valid) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ *Cannot proceed*\n\nPlease complete these steps first:\n${validation.missingSteps.map(s => `• ${s}`).join('\n')}`
        });
        return;
      }
      const teams = await db.listTeams(workspaceId);
      const modal = buildAddMembersModal(workspaceId, teams);
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening add members modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // Add Members Modal Submit
  app.view('wizard_member_submit', async ({ ack, body, client, view }) => {
    await ack();
    const userId = body.user.id;
    const slackTeamId = body.team?.id || '';
    const workspaceId = view.private_metadata;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      const slackUser = view.state.values.member_slack_user?.slack_user?.selected_user;
      const githubUsername = view.state.values.member_github?.github_username?.value;
      const role = view.state.values.member_role?.role?.selected_option?.value;
      const weightStr = view.state.values.member_weight?.weight?.value || '1.0';
      const memberTeamId = view.state.values.member_team?.team?.selected_option?.value;

      if (!slackUser || !githubUsername || !role) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Please fill in all required fields: Slack user, GitHub username, and role.'
        });
        return;
      }

      const workspace = await db.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const weight = parseFloat(weightStr) || 1.0;

      // Parse GitHub usernames (comma-separated)
      const githubUsernames = githubUsername.split(',').map(u => u.trim()).filter(Boolean);

      // Add member
      const memberId = `member_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      await db.addMember({
        id: memberId,
        workspaceId,
        slackUserId: slackUser,
        githubUsernames,
        roles: [role as any],
        weight,
        isActive: true,
        isUnavailable: false,
        teamId: memberTeamId || undefined
      });

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Member added successfully! You can add more members using \`/cr settings\`.`
      });

      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: { type: 'home', blocks: [] }
      });
    } catch (error: any) {
      logger.error('Error adding member', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to add member: ${error.message}`
      });
    }
  });

  // Step D: Create Teams
  app.action('wizard_step_teams', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const validation = await validateWizardStepPrerequisites(workspaceId, 'teams');
      if (!validation.valid) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ *Cannot proceed*\n\nPlease complete these steps first:\n${validation.missingSteps.map(s => `• ${s}`).join('\n')}`
        });
        return;
      }
      // Use simple team creation via command or modal
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: '💡 Use `/create-team <team-name> <channel-id>` to create a team, or use `/cr settings` to manage teams via the settings modal.'
      });
    } catch (error: any) {
      logger.error('Error in wizard_step_teams', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // Step E: Map Repositories
  app.action('wizard_step_repos', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const validation = await validateWizardStepPrerequisites(workspaceId, 'repos');
      if (!validation.valid) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ *Cannot proceed*\n\nPlease complete these steps first:\n${validation.missingSteps.map(s => `• ${s}`).join('\n')}`
        });
        return;
      }
      const teams = await db.listTeams(workspaceId);
      if (teams.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Please create a team first (Step D). Use `/create-team <team-name> <channel-id>`.'
        });
        return;
      }
      // Use settings modal for repo mapping
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: '💡 Use `/cr settings` to map repositories to teams via the settings modal.'
      });
    } catch (error: any) {
      logger.error('Error in wizard_step_repos', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // View Teams
  app.action('wizard_view_teams', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const teams = await db.listTeams(workspaceId);
      if (teams.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: 'No teams created yet. Use `/create-team` to create your first team.'
        });
        return;
      }
      const teamsList = teams.map((t: any) => `• ${t.name} (ID: ${t.id})${t.slackChannelId ? ` - Channel: <#${t.slackChannelId}>` : ''}`).join('\n');
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `*Teams:*\n${teamsList}\n\nUse \`/cr settings\` to manage teams.`
      });
    } catch (error: any) {
      logger.error('Error in wizard_view_teams', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // View Repos
  app.action('wizard_view_repos', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const repoMappings = await db.listRepoMappings(workspaceId);
      const teams = await db.listTeams(workspaceId);
      if (repoMappings.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: 'No repository mappings yet. Use `/cr settings` to map repositories to teams.'
        });
        return;
      }
      const mappingsList = repoMappings.map((rm: any) => {
        const team = teams.find((t: any) => t.id === rm.teamId);
        return `• \`${rm.repoFullName}\` → ${team?.name || 'Unknown Team'}`;
      }).join('\n');
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `*Repository Mappings:*\n${mappingsList}\n\nUse \`/cr settings\` to manage mappings.`
      });
    } catch (error: any) {
      logger.error('Error in wizard_view_repos', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // View Members
  app.action('wizard_view_members', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      const members = await db.listMembers(workspaceId);
      if (members.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: 'No members added yet. Use the "Add Members" button in the onboarding wizard or `/cr settings`.'
        });
        return;
      }
      const membersList = members.map((m: any) => {
        const roles = m.roles.join(', ');
        const github = m.githubUsernames.join(', ');
        return `• <@${m.slackUserId}> - GitHub: \`${github}\` - Roles: ${roles}${m.teamId ? ` - Team: ${m.teamId}` : ''}`;
      }).join('\n');
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `*Team Members:*\n${membersList}\n\nUse \`/cr settings\` to manage members.`
      });
    } catch (error: any) {
      logger.error('Error in wizard_view_members', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // Step G: Go Live - with validation
  app.action('wizard_step_go_live', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const workspaceId = actionBody.actions?.[0]?.value;

    if (!userId || !slackTeamId || !workspaceId) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      const workspace = await db.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Validate prerequisites for Go Live
      const settings = await db.getWorkspaceSettings(slackTeamId);
      const hasChannel = !!(settings?.defaultChannelId || workspace.defaultChannelId);
      const hasGitHub = !!workspace.githubInstallationId;
      const teams = await db.listTeams(workspaceId);
      const hasTeams = teams.length > 0;
      const repoMappings = await db.listRepoMappings(workspaceId);
      const hasRepoMappings = repoMappings.length > 0;
      const members = await db.listMembers(workspaceId);
      const activeMembers = members.filter((m: any) => m.isActive && !m.isUnavailable);
      const hasMembers = activeMembers.length > 0;
      
      // Check if members are assigned to teams used by repo mappings
      let hasValidMemberTeamMapping = false;
      if (hasRepoMappings && hasMembers) {
        const teamIdsInMappings = new Set(repoMappings.map((rm: any) => rm.teamId).filter(Boolean));
        if (teamIdsInMappings.size === 0) {
          // If no team mappings, any member is valid
          hasValidMemberTeamMapping = true;
        } else {
          // Check if at least one member is in a team that's used by a repo mapping
          hasValidMemberTeamMapping = activeMembers.some((m: any) => 
            m.teamId && teamIdsInMappings.has(m.teamId)
          );
        }
      } else if (hasMembers && !hasRepoMappings) {
        // If no repo mappings, any member is valid
        hasValidMemberTeamMapping = true;
      }

      const validationErrors: string[] = [];
      if (!hasChannel) {
        validationErrors.push('• Notification channel not selected');
      }
      if (!hasGitHub) {
        validationErrors.push('• GitHub not connected');
      }
      if (!hasTeams) {
        validationErrors.push('• No teams created');
      }
      if (!hasRepoMappings) {
        validationErrors.push('• No repository mappings configured');
      }
      if (!hasMembers) {
        validationErrors.push('• No active team members added');
      }
      if (!hasValidMemberTeamMapping && hasRepoMappings) {
        validationErrors.push('• No team members assigned to teams used by repository mappings');
      }

      if (validationErrors.length > 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ *Cannot enable Go Live*\n\nThe following requirements are missing:\n\n${validationErrors.join('\n')}\n\nPlease complete all setup steps before enabling PR processing.`
        });
        return;
      }

      // All validations passed - enable Go Live
      await db.updateWorkspace(workspaceId, {
        goLiveEnabled: true,
        setupComplete: true,
        setupStep: 'complete',
        updatedAt: Date.now()
      });

      // Add audit log
      await db.addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        workspaceId,
        event: 'go_live_enabled',
        metadata: {
          enabledBy: userId,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });

      // Notify in setup channel or DM
      const notificationChannel = workspace.setupChannelId || workspace.installerUserId || userId;
      try {
        await client.chat.postMessage({
          channel: notificationChannel,
          text: `🎉 *ReviewFlow is now Live!*\n\nPR processing has been enabled. When PRs are opened in your configured repositories, reviewers will be automatically assigned based on your team configuration.\n\n• GitHub: ✅ Connected\n• Teams: ${teams.length} configured\n• Repositories: ${repoMappings.length} mapped\n• Members: ${activeMembers.length} active\n\nPR notifications will be posted to <#${settings?.defaultChannelId || workspace.defaultChannelId}>.`
        });
      } catch (e) {
        logger.warn('Failed to send Go Live notification', e);
      }

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ *Go Live Enabled!*\n\nReviewFlow is now processing PRs. When PRs are opened, reviewers will be automatically assigned.`
      });

      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: { type: 'home', blocks: [] }
      });
    } catch (error: any) {
      logger.error('Error enabling Go Live', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to enable Go Live: ${error.message}`
      });
    }
  });

  // Reassign reviewer with modal selection
  app.action('reassign_pr_modal', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const prId = actionBody.actions?.[0]?.value;
    const slackTeamId = actionBody.team?.id;

    if (!userId || !prId || !slackTeamId) return;

    try {
      const pr = await db.getPr(prId);
      if (!pr) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ PR not found.'
        });
        return;
      }

      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Get current assignments
      const assignments = await db.getAssignmentsForPr(prId);
      const currentAssignmentIds = assignments.filter((a: any) => !a.completedAt).map((a: any) => a.memberId);

      // Get available members (excluding current reviewers and commit authors)
      const members = await db.listMembers(workspace.id, pr.teamId);
      const availableMembers = members.filter((m: any) => 
        m.isActive && 
        !m.isUnavailable && 
        !currentAssignmentIds.includes(m.id) &&
        !m.githubUsernames.includes(pr.authorGithub)
      );

      if (availableMembers.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ No available reviewers found. All team members might be unavailable or already assigned.'
        });
        return;
      }

      // Build modal with member selection
      const modal: any = {
        type: 'modal' as const,
        callback_id: 'reassign_pr_submit',
        title: { type: 'plain_text' as const, text: 'Reassign Reviewer' },
        submit: { type: 'plain_text' as const, text: 'Reassign' },
        close: { type: 'plain_text' as const, text: 'Cancel' },
        private_metadata: JSON.stringify({ prId, currentAssignmentIds }),
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Reassign reviewer for PR #${pr.number}*\n${pr.title}\n\nSelect a new reviewer from your team.`
            }
          },
          {
            type: 'input',
            block_id: 'new_reviewer',
            label: { type: 'plain_text', text: 'New Reviewer' },
            element: {
              type: 'static_select',
              action_id: 'reviewer',
              options: availableMembers.map((m: any) => ({
                text: { type: 'plain_text', text: `${m.githubUsernames.join(', ')} (${m.roles.join(', ')})` },
                value: m.id
              })),
              placeholder: { type: 'plain_text', text: 'Select a reviewer' }
            }
          }
        ]
      };

      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening reassign modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to open reassign modal: ${error.message}`
      });
    }
  });

  // Reassign PR modal submit
  app.view('reassign_pr_submit', async ({ ack, body, client, view }) => {
    await ack();
    const userId = body.user.id;
    const slackTeamId = body.team?.id || '';
    const metadata = JSON.parse(view.private_metadata);
    const { prId, currentAssignmentIds } = metadata;
    const newReviewerId = view.state.values.new_reviewer?.reviewer?.selected_option?.value;

    if (!newReviewerId) {
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: '❌ Please select a reviewer.'
      });
      return;
    }

    try {
      const pr = await db.getPr(prId);
      if (!pr) {
        throw new Error('PR not found');
      }

      // Mark old assignments as done
      const assignments = await db.getAssignmentsForPr(prId);
      for (const assignment of assignments) {
        if (!assignment.completedAt && currentAssignmentIds.includes(assignment.memberId)) {
          await db.updateAssignmentStatus(assignment.id, 'DONE');
        }
      }

      // Create new assignment
      await db.createAssignments(prId, [newReviewerId]);

      // Add audit log
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (workspace) {
        await db.addAuditLog({
          id: `audit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          workspaceId: workspace.id,
          event: 'reviewer_reassigned',
          metadata: {
            prId,
            prNumber: pr.number,
            oldReviewerIds: currentAssignmentIds,
            newReviewerId,
            reassignedBy: userId
          },
          timestamp: Date.now()
        });
      }

      // Update Slack message
      if (pr.slackMessageTs) {
        const updatedAssignments = await db.getAssignmentsForPr(prId);
        const reviewerPromises = updatedAssignments
          .filter((a: any) => !a.completedAt)
          .map((a: any) => db.getMember(a.memberId));
        const reviewerResults = await Promise.all(reviewerPromises);
        const reviewers = reviewerResults.filter((m): m is NonNullable<typeof m> => m !== undefined);

        let jiraInfo = undefined;
        if (pr.jiraIssueKey && workspace) {
          try {
            const context = await loadWorkspaceContext(slackTeamId);
            const jiraConnection = await db.getJiraConnection(workspace.id);
            if (jiraConnection && hasFeature(context, 'jiraIntegration')) {
              const jira = new JiraService(jiraConnection);
              jiraInfo = await jira.getIssueMinimal(pr.jiraIssueKey);
            }
          } catch (e) {
            logger.warn('Failed to fetch Jira info for reassign', e);
          }
        }

        const blocks = buildPrMessageBlocks({ pr, reviewers, jira: jiraInfo });

        try {
          await client.chat.update({
            channel: pr.slackChannelId,
            ts: pr.slackMessageTs,
            text: `PR #${pr.number}: ${pr.title}`,
            blocks
          });
        } catch (updateError) {
          logger.warn('Failed to update Slack message on reassign', updateError);
        }
      }

      const newReviewer = await db.getMember(newReviewerId);
      if (newReviewer) {
        // Notify new reviewer
        try {
          await client.chat.postMessage({
            channel: newReviewer.slackUserId,
            text: `📋 *PR Reassigned to You*\n\nPR #${pr.number}: ${pr.title}\nRepository: ${pr.repoFullName}\nAuthor: ${pr.authorGithub}\n\n<${pr.url}|View PR on GitHub>`
          });
        } catch (dmError) {
          logger.warn(`Failed to send DM to new reviewer ${newReviewer.slackUserId}`, dmError);
        }

        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `✅ PR reassigned to <@${newReviewer.slackUserId}>.`
        });
      }
    } catch (error: any) {
      logger.error('Error reassigning PR', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to reassign PR: ${error.message}`
      });
    }
  });

  // Repository configuration action
  app.action('configure_repo', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const userId = actionBody.user?.id;
    const slackTeamId = actionBody.team?.id || '';
    const metadata = actionBody.actions?.[0]?.value;
    const { workspaceId, repoFullName } = JSON.parse(metadata || '{}');

    if (!userId || !slackTeamId || !workspaceId || !repoFullName) return;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      const repoMapping = await db.getRepoMapping(workspaceId, repoFullName);
      const existingRules = repoMapping?.stackRules || [];
      const requiredReviewers = repoMapping?.requiredReviewers || 2;

      const { buildRepoConfigModal } = await import('./repoConfigModal');
      const modal = buildRepoConfigModal(workspaceId, repoFullName, existingRules, requiredReviewers);
      
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening repo config modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ ${error.message}`
      });
    }
  });

  // Repository configuration modal submit
  app.view('repo_config_submit', async ({ ack, body, client, view }) => {
    await ack();
    const userId = body.user.id;
    const slackTeamId = body.team?.id || '';
    const metadata = JSON.parse(view.private_metadata);
    const { workspaceId, repoFullName } = metadata;

    try {
      await requireWorkspaceAdmin(userId, slackTeamId, client);
      
      const requiredReviewersStr = view.state.values.required_reviewers?.required_reviewers?.value || '2';
      const requiredReviewers = parseInt(requiredReviewersStr, 10) || 2;
      const stackRulesText = view.state.values.stack_rules?.stack_rules?.value || '';

      const { parseStackRules } = await import('./repoConfigModal');
      const stackRules = parseStackRules(stackRulesText);

      // Get or create repo mapping
      let repoMapping = await db.getRepoMapping(workspaceId, repoFullName);
      if (!repoMapping) {
        // Create new mapping (team will need to be set separately)
        const mappingId = `repo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        repoMapping = {
          id: mappingId,
          workspaceId,
          teamId: '', // Will need to be set via /map-repo
          repoFullName,
          requiredReviewers,
          stackRules,
          createdAt: Date.now()
        };
        await db.addRepoMapping(repoMapping);
      } else {
        // Update existing mapping
        await db.removeRepoMapping(repoMapping.id);
        await db.addRepoMapping({
          ...repoMapping,
          requiredReviewers,
          stackRules,
          createdAt: repoMapping.createdAt
        });
      }

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Repository configuration saved!\n\n• Required reviewers: ${requiredReviewers}\n• Stack rules: ${stackRules.length} configured\n\nThese settings will be used for PRs in \`${repoFullName}\`.`
      });

      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: { type: 'home', blocks: [] }
      });
    } catch (error: any) {
      logger.error('Error saving repo config', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to save configuration: ${error.message}`
      });
    }
  });
}

