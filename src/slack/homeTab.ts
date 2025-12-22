// Slack Home Tab implementation
import { App } from '@slack/bolt';
import { db } from '../db/memoryDb';
import { loadWorkspaceContext } from '../services/workspaceContext';
import { SubscriptionPlan } from '../types/subscription';
import { PolarService } from '../services/polarService';
import { logger } from '../utils/logger';

export function registerHomeTab(app: App) {
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      const userId = event.user;
      const teamId = (event as any).team;

      if (!teamId) {
        logger.warn('Home tab opened without team ID');
        return;
      }

      // Load workspace context
      const context = await loadWorkspaceContext(teamId);

      // Get current open PRs
      const openPRs = await db.listOpenPrs();
      const workspacePRs = openPRs.filter((pr: any) => {
        // Filter by workspace if needed
        return true; // For now, show all
      });

      // Get team members
      const members = await db.listMembers();
      const activeMembers = members.filter((m: any) => m.isActive && !m.isUnavailable);

      // Build home tab view
      const blocks = await buildHomeTabBlocks(context, workspacePRs.length, activeMembers.length);

      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks
        }
      });

      logger.info('Home tab published', { userId, teamId });
    } catch (error) {
      logger.error('Error publishing home tab', error);
    }
  });
}

async function buildHomeTabBlocks(context: any, openPRCount: number, memberCount: number): Promise<any[]> {
  const planEmoji = getPlanEmoji(context.plan);
  const usagePercent = Math.round((context.usage.prsProcessed / context.usage.limit) * 100);
  const usageBar = '█'.repeat(Math.min(20, Math.floor(usagePercent / 5))) + '░'.repeat(20 - Math.min(20, Math.floor(usagePercent / 5)));

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${planEmoji} ReviewFlow Dashboard`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Current Plan:*\n${context.plan}`
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${context.status === 'active' ? '✅ Active' : '⚠️ ' + context.status}`
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📊 Usage This Month*\n\`${usageBar}\` ${usagePercent}%\n${context.usage.prsProcessed} / ${context.usage.limit} PRs processed`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Open PRs:*\n${openPRCount}`
        },
        {
          type: 'mrkdwn',
          text: `*Team Members:*\n${memberCount}`
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*✨ Features*'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `Jira Integration: ${context.limits.jiraIntegration ? '✅' : '❌'}`
        },
        {
          type: 'mrkdwn',
          text: `Auto Balance: ${context.limits.autoBalance ? '✅' : '❌'}`
        },
        {
          type: 'mrkdwn',
          text: `Reminders: ${context.limits.reminders ? '✅' : '❌'}`
        },
        {
          type: 'mrkdwn',
          text: `Advanced Analytics: ${context.limits.advancedAnalytics ? '✅' : '❌'}`
        }
      ]
    }
  ];

  // Add upgrade CTA if on free plan
  if (context.plan === SubscriptionPlan.FREE) {
    const polar = new PolarService();
    const checkout = await polar.createCheckoutSession({
      slackTeamId: context.slackTeamId,
      slackUserId: '', // Not available in home tab context
      plan: 'pro'
    });
    const upgradeUrl = checkout.url;

    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🚀 Upgrade to Pro*\n\nUnlock all features:\n• Jira Integration\n• Auto Balance\n• Reminders\n• Advanced Analytics\n• 500 PRs/month'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Upgrade to Pro'
            },
            style: 'primary',
            url: upgradeUrl,
            action_id: 'upgrade_to_pro'
          }
        ]
      }
    );
  } else if (context.currentPeriodEnd) {
    const renewalDate = new Date(context.currentPeriodEnd).toLocaleDateString();
    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Renewal Date:* ${renewalDate}`
        }
      }
    );
  }

  return blocks;
}

function getPlanEmoji(plan: SubscriptionPlan): string {
  const emojiMap: Record<SubscriptionPlan, string> = {
    [SubscriptionPlan.FREE]: '🆓',
    [SubscriptionPlan.PRO]: '⭐',
    [SubscriptionPlan.TEAM]: '👥',
    [SubscriptionPlan.ENTERPRISE]: '🏢'
  };
  return emojiMap[plan] || '🆓';
}

