// Upgrade to Pro modal with feature explanation
import { View } from '@slack/bolt';

/**
 * Build upgrade modal that explains Pro features
 */
export function buildUpgradeModal(checkoutUrl: string): View {
  return {
    type: 'modal' as const,
    callback_id: 'upgrade_modal',
    title: {
      type: 'plain_text',
      text: 'Upgrade to Pro' // Max 25 chars for Slack (no emoji to avoid counting issues)
    },
    close: {
      type: 'plain_text',
      text: 'Maybe Later'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Unlock the full power of ReviewFlow*\n\nUpgrade to Pro and get access to advanced features that will streamline your code review process.'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*✨ What You Get with Pro:*'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: '*🎫 Jira Integration*\nSync PRs with Jira tickets automatically'
          },
          {
            type: 'mrkdwn',
            text: '*⚖️ Auto Balance*\nIntelligent workload distribution'
          },
          {
            type: 'mrkdwn',
            text: '*🔔 Smart Reminders*\nAutomated review reminders and escalations'
          },
          {
            type: 'mrkdwn',
            text: '*📊 Advanced Analytics*\nDetailed metrics and insights'
          }
        ]
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: '*👥 Unlimited Teams*\nCreate as many teams as you need'
          },
          {
            type: 'mrkdwn',
            text: '*👤 Unlimited Members*\nAdd unlimited team members'
          },
          {
            type: 'mrkdwn',
            text: '*📦 Unlimited Repos*\nMonitor unlimited repositories'
          },
          {
            type: 'mrkdwn',
            text: '*🚀 Priority Support*\nGet help when you need it'
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
          text: '*💡 Perfect for teams that want to:*\n• Automate their entire review workflow\n• Integrate with existing tools (Jira)\n• Get insights into review performance\n• Scale without limits'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Ready to upgrade? Click the button below to start your Pro subscription.'
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
            url: checkoutUrl,
            action_id: 'upgrade_checkout'
          }
        ]
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💳 Secure payment via Polar. Cancel anytime. Your subscription starts immediately after payment.'
          }
        ]
      }
    ]
  };
}

