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

      const ok = db.markAssignmentDoneBySlackUser(prId, userId);

      if (ok) {
        // Update the message to reflect the change
        const pr = db.getPr(prId);
        if (pr && pr.slackMessageTs) {
          const assignments = db.getAssignmentsForPr(prId);
          const reviewers = assignments
            .filter(a => !a.completedAt)
            .map(a => {
              const member = db.getMember(a.memberId);
              return member;
            })
            .filter((m): m is NonNullable<typeof m> => m !== undefined);

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
  app.command('/my-reviews', async ({ ack, command, client }) => {
    await ack();

    try {
      const userId = command.user_id;
      const assignments = db.getAssignmentsBySlackUser(userId);

      if (assignments.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: userId,
          text: '✅ You have no pending reviews!'
        });
        return;
      }

      const prs = assignments
        .map(a => db.getPr(a.prId))
        .filter((pr): pr is NonNullable<typeof pr> => pr !== undefined && pr.status === 'OPEN');

      if (prs.length === 0) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: userId,
          text: '✅ You have no pending reviews!'
        });
        return;
      }

      const text = prs
        .map(pr => `• <${pr.url}|PR #${pr.number}: ${pr.title}> (${pr.repoFullName})`)
        .join('\n');

      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: userId,
        text: `📋 *Your Pending Reviews (${prs.length}):*\n\n${text}`
      });
    } catch (error) {
      console.error('Error in /my-reviews command:', error);
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: '❌ An error occurred. Please try again.'
      });
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

      const pr = db.getPr(prId);
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
      db.updatePr(prId, { jiraIssueKey: issue.key });

      // Add comment to Jira linking back to PR
      await jira.addComment(issue.key, `Linked PR: ${pr.url} (${pr.repoFullName} #${pr.number})`);

      // Update the Slack message
      if (pr.slackMessageTs) {
        const assignments = db.getAssignmentsForPr(prId);
        const reviewers = assignments
          .filter(a => !a.completedAt)
          .map(a => {
            const member = db.getMember(a.memberId);
            return member;
          })
          .filter((m): m is NonNullable<typeof m> => m !== undefined);

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
}

