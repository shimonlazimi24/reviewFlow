import { App, BlockAction, ButtonAction } from '@slack/bolt';
import { db } from '../db/memoryDb';
import { buildPrMessageBlocks } from './blocks';
import { JiraService } from '../services/jiraService';
import { env, jiraEnabled } from '../config/env';

export function registerSlackHandlers(app: App) {
  // Mark assignment as done
  app.action('mark_done', async ({ ack, body, client }) => {
    await ack();

    try {
      const actionBody = body as BlockAction<ButtonAction>;
      const userId = actionBody.user?.id;
      const prId = actionBody.actions?.[0]?.value;
      const channelId = actionBody.channel?.id;

      if (!userId || !prId || !channelId) {
        throw new Error('Missing required fields in action');
      }

      const ok = await db.markAssignmentDoneBySlackUser(prId, userId);

      if (ok) {
        // Update the message to reflect the change
        const pr = await db.getPr(prId);
        if (pr && pr.slackMessageTs) {
          const assignments = await db.getAssignmentsForPr(prId);
          const reviewerPromises = assignments
            .filter(a => !a.completedAt)
            .map(a => db.getMember(a.memberId));
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

      const prsPromises = assignments.map(a => db.getPr(a.prId));
      const prsResults = await Promise.all(prsPromises);
      const prs = prsResults.filter((pr): pr is NonNullable<typeof pr> => pr !== undefined && pr.status === 'OPEN');

      if (prs.length === 0) {
        await sendResponse('✅ You have no pending reviews!');
        return;
      }

      const text = prs
        .map(pr => `• <${pr.url}|PR #${pr.number}: ${pr.title}> (${pr.repoFullName})`)
        .join('\n');

      await sendResponse(`📋 *Your Pending Reviews (${prs.length}):*\n\n${text}`);
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

      // Show "Creating..." message
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: '🔄 Creating Jira ticket...'
      });

      const jira = new JiraService();

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
          .filter(a => !a.completedAt)
          .map(a => db.getMember(a.memberId));
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

      const jira = new JiraService();

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
      const existing = members.find(m => m.slackUserId === slackUserId);
      
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

      const text = members
        .map(m => {
          const roles = m.roles.join(', ');
          const github = m.githubUsernames.join(', ');
          const status = m.isActive ? '✅' : '❌';
          return `${status} <@${m.slackUserId}> - ${github} (${roles})`;
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
      const member = members.find(m => m.slackUserId === slackUserId);
      
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
      const member = members.find(m => m.slackUserId === slackUserId);
      
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
}

