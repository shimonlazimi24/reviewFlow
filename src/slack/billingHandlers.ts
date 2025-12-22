// Billing and upgrade handlers
import { App } from '@slack/bolt';
import { db } from '../db/memoryDb';
import { requireAdmin } from '../utils/permissions';
import { logger } from '../utils/logger';
import { PolarService } from '../services/polarService';
import { env, POLAR_SUCCESS_URL } from '../config/env';

export function registerBillingHandlers(app: App) {
  const polar = new PolarService();

  // Helper to send response
  const sendResponse = async (client: any, channelId: string, userId: string, text: string, respond: any, blocks?: any[]) => {
    try {
      if (channelId && channelId.startsWith('C')) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text,
          blocks
        });
      } else {
        await respond({
          text,
          blocks,
          response_type: 'ephemeral'
        });
      }
    } catch (err: any) {
      if (err.data?.error === 'not_in_channel' || err.code === 'slack_webapi_platform_error') {
        await respond({
          text,
          blocks,
          response_type: 'ephemeral'
        });
      } else {
        logger.error('Failed to send Slack response', err);
        throw err;
      }
    }
  };

  // Upgrade command
  app.command('/upgrade', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const teamId = command.team_id;

    try {
      await requireAdmin(userId, client);

      const workspace = await db.getWorkspaceBySlackTeamId(teamId);
      if (workspace && workspace.plan === 'pro') {
        await sendResponse(
          client,
          channelId,
          userId,
          '✅ You already have a Pro subscription!',
          respond
        );
        return;
      }

      // Create checkout session
      const checkout = await polar.createCheckoutSession({
        slackTeamId: teamId,
        slackUserId: userId,
        plan: 'pro'
      });

      await sendResponse(
        client,
        channelId,
        userId,
        '🚀 Upgrade to Pro',
        respond,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Upgrade to ReviewFlow Pro*\n\nUnlock all features:\n• Unlimited teams, members, and repos\n• Jira Integration\n• Auto Balance\n• Reminders\n• Advanced Analytics\n• API Access\n• Custom Workflows'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '🚀 Upgrade to Pro'
                },
                style: 'primary',
                url: checkout.url,
                action_id: 'upgrade_to_pro'
              }
            ]
          }
        ]
      );
    } catch (error) {
      logger.error('Error in /upgrade command', error);
      await sendResponse(
        client,
        channelId,
        userId,
        `❌ Failed to create upgrade link: ${(error as Error).message}`,
        respond
      );
    }
  });

  // Billing management command
  app.command('/billing', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const teamId = command.team_id;

    try {
      await requireAdmin(userId, client);

      const workspace = await db.getWorkspaceBySlackTeamId(teamId);
      
      if (!workspace || !workspace.polarCustomerId || workspace.plan === 'free') {
        // No subscription, show upgrade
        const checkout = await polar.createCheckoutSession({
          slackTeamId: teamId,
          slackUserId: userId,
          plan: 'pro'
        });

        await sendResponse(
          client,
          channelId,
          userId,
          '📊 Billing Management',
          respond,
          [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Current Plan: Free*\n\nUpgrade to Pro to unlock all features and manage your subscription.'
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '🚀 Upgrade to Pro'
                  },
                  style: 'primary',
                  url: checkout.url,
                  action_id: 'upgrade_to_pro'
                }
              ]
            }
          ]
        );
        return;
      }

      // Has subscription, show portal link
      const portal = await polar.createCustomerPortalSession(
        workspace.polarCustomerId,
        POLAR_SUCCESS_URL
      );

      const statusEmoji = workspace.subscriptionStatus === 'active' ? '✅' : '⚠️';
      const periodEnd = workspace.currentPeriodEnd
        ? new Date(workspace.currentPeriodEnd).toLocaleDateString()
        : 'N/A';

      await sendResponse(
        client,
        channelId,
        userId,
        '📊 Billing Management',
        respond,
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Current Plan: ${workspace.plan.toUpperCase()}*\n${statusEmoji} Status: ${workspace.subscriptionStatus}\n📅 Renewal: ${periodEnd}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '⚙️ Manage Subscription'
                },
                style: 'primary',
                url: portal.url,
                action_id: 'manage_billing'
              }
            ]
          }
        ]
      );
    } catch (error) {
      logger.error('Error in /billing command', error);
      await sendResponse(
        client,
        channelId,
        userId,
        `❌ Failed to load billing info: ${(error as Error).message}`,
        respond
      );
    }
  });
}

