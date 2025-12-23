// Simplified Home Tab for onboarding and configuration
import { View } from '@slack/bolt';
import { db } from '../db/memoryDb';
import { logger } from '../utils/logger';

/**
 * Check if workspace is configured
 */
export async function isWorkspaceConfigured(slackTeamId: string): Promise<boolean> {
  const settings = await db.getWorkspaceSettings(slackTeamId);
  return !!settings?.defaultChannelId;
}

/**
 * Build Home Tab blocks for unconfigured workspace
 */
export function buildUnconfiguredHomeTab(): any[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '👋 Welcome to ReviewFlow!'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Get started with ReviewFlow*\n\nReviewFlow automatically assigns code reviewers to pull requests based on your team configuration.\n\nClick the button below to configure your workspace.'
      }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🚀 Start Setup'
          },
          style: 'primary',
          action_id: 'start_setup'
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '💡 You can configure the notification channel, required reviewers, reminder settings, and stack labels.'
        }
      ]
    }
  ];
}

/**
 * Build Home Tab blocks for configured workspace
 */
export async function buildConfiguredHomeTab(slackTeamId: string): Promise<any[]> {
  const settings = await db.getWorkspaceSettings(slackTeamId);
  const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
  
  if (!settings) {
    return buildUnconfiguredHomeTab();
  }

  // Check Jira connection
  let hasJira = false;
  if (workspace) {
    try {
      const jiraConnection = await db.getJiraConnection(workspace.id);
      hasJira = !!jiraConnection;
    } catch (error) {
      // Ignore errors, just assume no Jira
    }
  }

  const channelText = settings.defaultChannelId 
    ? `<#${settings.defaultChannelId}>` 
    : 'Not set';
  
  const requiredReviewers = settings.requiredReviewers || 2;
  const reminderHours = settings.reminderHours || 6;
  const feLabels = settings.feLabels || 'Not configured';
  const beLabels = settings.beLabels || 'Not configured';

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚙️ ReviewFlow Configuration'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Current Configuration*'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Notification Channel:*\n${channelText}`
        },
        {
          type: 'mrkdwn',
          text: `*Required Reviewers:*\n${requiredReviewers}`
        },
        {
          type: 'mrkdwn',
          text: `*Reminder Hours:*\n${reminderHours}`
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${workspace?.goLiveEnabled ? '✅ Live' : '⏸️ Paused'}`
        },
        {
          type: 'mrkdwn',
          text: `*Setup:*\n${workspace?.setupComplete ? '✅ Complete' : '⏳ In Progress'}`
        }
      ]
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Stack Labels*\n• FE Labels: \`${feLabels}\`\n• BE Labels: \`${beLabels}\``
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔗 Integrations*'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*GitHub:*\n${workspace?.githubInstallationId || settings?.githubInstallationId ? `✅ Connected\n\`${workspace?.githubInstallationId || settings?.githubInstallationId}\`` : '❌ Not connected'}`
        },
        {
          type: 'mrkdwn',
          text: `*Jira:*\n${hasJira ? '✅ Connected' : '❌ Not connected'}`
        }
      ]
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🐙 GitHub'
          },
          action_id: 'home_connect_github',
          value: slackTeamId
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🎫 Jira'
          },
          action_id: 'home_connect_jira',
          value: slackTeamId
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🚀 Upgrade to Pro'
          },
          action_id: 'home_upgrade',
          value: slackTeamId
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '✏️ Edit Settings'
          },
          style: 'primary',
          action_id: 'edit_settings'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📤 Send Test Message'
          },
          action_id: 'send_test_message'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '🔄 Refresh'
          },
          action_id: 'refresh_home_tab'
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '⚙️ Full Settings'
          },
          action_id: 'home_full_settings',
          value: slackTeamId
        }
      ]
    }
  ];
}

/**
 * Build setup/edit settings modal
 */
export function buildSetupModal(slackTeamId: string, existingSettings?: any): View {
  const defaultChannelId = existingSettings?.defaultChannelId || '';
  const requiredReviewers = existingSettings?.requiredReviewers || 2;
  const reminderHours = existingSettings?.reminderHours || 6;
  const feLabels = existingSettings?.feLabels || '';
  const beLabels = existingSettings?.beLabels || '';

  return {
    type: 'modal',
    callback_id: 'setup_submit',
    title: {
      type: 'plain_text',
      text: existingSettings ? 'Edit Settings' : 'ReviewFlow Setup'
    },
    submit: {
      type: 'plain_text',
      text: 'Save Configuration'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    private_metadata: slackTeamId,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: existingSettings 
            ? '*Update your ReviewFlow configuration*'
            : '*Configure ReviewFlow*\n\nSet up your workspace to start automatically assigning code reviewers.'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'channel',
        label: {
          type: 'plain_text',
          text: 'Notification Channel *'
        },
        element: {
          type: 'conversations_select',
          action_id: 'channel_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select a channel'
          },
          default_to_current_conversation: false,
          filter: {
            include: ['public', 'private'],
            exclude_bot_users: true
          },
          ...(defaultChannelId ? { initial_conversation: defaultChannelId } : {})
        },
        hint: {
          type: 'plain_text',
          text: 'PR notifications will be posted to this channel'
        }
      },
      {
        type: 'input',
        block_id: 'required_reviewers',
        label: {
          type: 'plain_text',
          text: 'Required Reviewers *'
        },
        element: {
          type: 'static_select',
          action_id: 'reviewers_select',
          options: [
            {
              text: {
                type: 'plain_text',
                text: '1 Reviewer'
              },
              value: '1'
            },
            {
              text: {
                type: 'plain_text',
                text: '2 Reviewers'
              },
              value: '2'
            }
          ],
          initial_option: {
            text: {
              type: 'plain_text',
              text: `${requiredReviewers} Reviewer${requiredReviewers > 1 ? 's' : ''}`
            },
            value: String(requiredReviewers)
          }
        }
      },
      {
        type: 'input',
        block_id: 'reminder_hours',
        label: {
          type: 'plain_text',
          text: 'Reminder Time (hours) *'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'hours_input',
          placeholder: {
            type: 'plain_text',
            text: '6'
          },
          initial_value: String(reminderHours)
        },
        hint: {
          type: 'plain_text',
          text: 'Send reminder after this many hours if review is not completed'
        }
      },
      {
        type: 'input',
        block_id: 'fe_labels',
        label: {
          type: 'plain_text',
          text: 'Frontend Labels (optional)'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'fe_labels_input',
          placeholder: {
            type: 'plain_text',
            text: 'frontend,fe,ui,client'
          },
          initial_value: feLabels
        },
        optional: true,
        hint: {
          type: 'plain_text',
          text: 'Comma-separated GitHub labels that indicate frontend PRs'
        }
      },
      {
        type: 'input',
        block_id: 'be_labels',
        label: {
          type: 'plain_text',
          text: 'Backend Labels (optional)'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'be_labels_input',
          placeholder: {
            type: 'plain_text',
            text: 'backend,be,api,server'
          },
          initial_value: beLabels
        },
        optional: true,
        hint: {
          type: 'plain_text',
          text: 'Comma-separated GitHub labels that indicate backend PRs'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '💡 Labels are used to automatically detect if a PR is frontend, backend, or mixed. Leave empty to use default detection.'
          }
        ]
      }
    ]
  };
}

