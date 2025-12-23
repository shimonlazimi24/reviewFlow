// Admin-only onboarding wizard for ReviewFlow
import { View } from '@slack/bolt';
import { db } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { isWorkspaceAdmin } from '../utils/permissions';
import { encrypt } from '../utils/encryption';
import { env } from '../config/env';

/**
 * Build onboarding wizard Home Tab for admins
 */
export async function buildOnboardingWizardHomeTab(
  slackTeamId: string,
  userId: string,
  client: any
): Promise<any[]> {
  const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
  if (!workspace) {
    return [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '❌ Workspace not found. Please contact support.'
      }
    }];
  }

  const isAdmin = await isWorkspaceAdmin(userId, slackTeamId, client);
  if (!isAdmin) {
    return [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⚠️ *ReviewFlow is not configured yet.*\n\nAsk your workspace admin to complete the setup.'
      }
    }];
  }

  // Admin view - show onboarding wizard
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚀 ReviewFlow Setup Wizard'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Welcome to ReviewFlow!*\n\nComplete the setup steps below to start automatically assigning code reviewers.'
      }
    },
    { type: 'divider' }
  ];

  // Step A: Channel Selection
  const hasChannel = !!workspace.defaultChannelId;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: hasChannel
        ? `✅ *Step A: Notification Channel*\nChannel: <#${workspace.defaultChannelId}>`
        : `⏳ *Step A: Notification Channel*\nSelect the channel where PR notifications will be posted.`
    }
  });
  if (!hasChannel) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '📢 Select Channel' },
        style: 'primary',
        action_id: 'wizard_step_channel',
        value: workspace.id
      }]
    });
  }

  blocks.push({ type: 'divider' });

  // Step B: GitHub Connection
  const hasGitHub = !!workspace.githubInstallationId;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: hasGitHub
        ? `✅ *Step B: Connect GitHub*\nConnected to: \`${workspace.githubAccount || 'GitHub App'}\``
        : `⏳ *Step B: Connect GitHub*\nConnect your GitHub repositories to start receiving PR notifications.`
    }
  });
  if (!hasGitHub) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '🔗 Connect GitHub' },
        style: 'primary',
        action_id: 'wizard_step_github',
        value: workspace.id
      }]
    });
  }

  blocks.push({ type: 'divider' });

  // Step C: Jira Connection (Optional)
  const jiraConnection = await db.getJiraConnection(workspace.id);
  const hasJira = !!jiraConnection;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: hasJira
        ? `✅ *Step C: Connect Jira* (Optional)\nConnected to: \`${jiraConnection.baseUrl}\``
        : `⏳ *Step C: Connect Jira* (Optional)\nConnect Jira to automatically create tickets and update issue statuses.`
    }
  });
  if (!hasJira) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '🔗 Connect Jira' },
        action_id: 'wizard_step_jira',
        value: workspace.id
      }]
    });
  }

  blocks.push({ type: 'divider' });

  // Step D: Add Team Members
  const members = await db.listMembers(workspace.id);
  const activeMembers = members.filter((m: any) => m.isActive && !m.isUnavailable);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: activeMembers.length > 0
        ? `✅ *Step D: Add Team Members*\n${activeMembers.length} member${activeMembers.length > 1 ? 's' : ''} configured`
        : `⏳ *Step D: Add Team Members*\nAdd your team members so ReviewFlow can assign code reviewers.`
    }
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: activeMembers.length > 0 ? '➕ Add More Members' : '👥 Add Members' },
        style: activeMembers.length === 0 ? 'primary' : undefined,
        action_id: 'wizard_step_members',
        value: workspace.id
      },
      ...(activeMembers.length > 0 ? [{
        type: 'button',
        text: { type: 'plain_text', text: '👀 View Members' },
        action_id: 'wizard_view_members',
        value: workspace.id
      }] : [])
    ]
  });

  blocks.push({ type: 'divider' });

  // Setup completion status
  const setupComplete = workspace.setupComplete || (hasChannel && hasGitHub && activeMembers.length > 0);
  if (setupComplete) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🎉 *Setup Complete!*\n\nReviewFlow is ready to use. When PRs are opened, reviewers will be automatically assigned based on your team configuration.'
      }
    });
    if (!workspace.setupComplete) {
      // Mark setup as complete
      await db.updateWorkspace(workspace.id, {
        setupComplete: true,
        setupStep: 'complete',
        updatedAt: Date.now()
      });
    }
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Progress:* ${[hasChannel, hasGitHub, activeMembers.length > 0].filter(Boolean).length}/3 required steps complete\n\nComplete all steps to start using ReviewFlow.`
      }
    });
  }

  return blocks;
}

/**
 * Build Step A: Channel Selection Modal
 */
export function buildChannelSelectionModal(workspaceId: string): View {
  return {
    type: 'modal',
    callback_id: 'wizard_channel_submit',
    title: {
      type: 'plain_text',
      text: 'Step A: Select Notification Channel'
    },
    submit: {
      type: 'plain_text',
      text: 'Continue'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    private_metadata: workspaceId,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Select the channel where PR notifications will be posted.*\n\nYou can also set up a private setup channel for admin messages (optional).'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'notification_channel',
        label: {
          type: 'plain_text',
          text: 'Notification Channel *'
        },
        element: {
          type: 'channels_select',
          action_id: 'channel',
          placeholder: {
            type: 'plain_text',
            text: 'Select a channel'
          }
        }
      },
      {
        type: 'input',
        block_id: 'setup_channel',
        label: {
          type: 'plain_text',
          text: 'Setup Channel (Optional)'
        },
        element: {
          type: 'channels_select',
          action_id: 'setup_channel',
          placeholder: {
            type: 'plain_text',
            text: 'Select a private channel for setup messages (or leave empty for DM)'
          }
        },
        optional: true
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '💡 Setup messages will be sent to the setup channel (or DM if not set). PR notifications will go to the notification channel.'
        }]
      }
    ]
  };
}

/**
 * Build Step B: GitHub Connection Modal
 */
export function buildGitHubConnectionModal(workspaceId: string): View {
  const githubAppUrl = env.GITHUB_APP_ID
    ? `https://github.com/apps/${env.GITHUB_APP_NAME || 'reviewflow'}/installations/new`
    : `${env.APP_BASE_URL || 'http://localhost:3000'}/connect/github?workspace_id=${workspaceId}`;

  return {
    type: 'modal',
    callback_id: 'wizard_github_info',
    title: {
      type: 'plain_text',
      text: 'Step B: Connect GitHub'
    },
    close: {
      type: 'plain_text',
      text: 'Close'
    },
    private_metadata: workspaceId,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Connect your GitHub repositories*\n\n1. Click the button below to install the ReviewFlow GitHub App\n2. Select the repositories you want to monitor\n3. After installation, you\'ll be able to select which repos to enable'
        }
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: '📦 Install GitHub App' },
          style: 'primary',
          url: githubAppUrl,
          action_id: 'github_install_link'
        }]
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*After installation:*\n\n• The app will automatically detect your installation\n• You can then select which repositories to enable for PR notifications'
        }
      }
    ]
  };
}

/**
 * Build Step C: Jira Connection Modal
 */
export function buildJiraConnectionModal(workspaceId: string, isProRequired: boolean): View {
  return {
    type: 'modal',
    callback_id: 'wizard_jira_submit',
    title: {
      type: 'plain_text',
      text: 'Step C: Connect Jira'
    },
    submit: {
      type: 'plain_text',
      text: 'Connect'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    private_metadata: workspaceId,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Connect your Jira instance*\n\nEnter your Jira credentials to enable automatic ticket creation and updates.${isProRequired ? '\n\n⚠️ *Jira integration requires a Pro plan.* You can connect now and it will be activated when you upgrade.' : ''}`
        }
      },
      { type: 'divider' },
      {
        type: 'input',
        block_id: 'jira_base_url',
        label: { type: 'plain_text', text: 'Jira Base URL *' },
        element: {
          type: 'plain_text_input',
          action_id: 'base_url',
          placeholder: { type: 'plain_text', text: 'https://yourcompany.atlassian.net' }
        }
      },
      {
        type: 'input',
        block_id: 'jira_email',
        label: { type: 'plain_text', text: 'Jira Email *' },
        element: {
          type: 'plain_text_input',
          action_id: 'email',
          placeholder: { type: 'plain_text', text: 'your-email@company.com' }
        }
      },
      {
        type: 'input',
        block_id: 'jira_api_token',
        label: { type: 'plain_text', text: 'Jira API Token *' },
        element: {
          type: 'plain_text_input',
          action_id: 'api_token',
          placeholder: { type: 'plain_text', text: 'Your Jira API token' }
        },
        hint: {
          type: 'plain_text',
          text: 'Get your API token from: https://id.atlassian.com/manage-profile/security/api-tokens'
        }
      },
      { type: 'divider' },
      {
        type: 'input',
        block_id: 'pr_opened_transition',
        label: { type: 'plain_text', text: 'PR Opened Transition (Optional)' },
        element: {
          type: 'plain_text_input',
          action_id: 'pr_opened',
          placeholder: { type: 'plain_text', text: 'e.g., "In Review"' }
        },
        optional: true,
        hint: {
          type: 'plain_text',
          text: 'Jira transition name to execute when PR is opened'
        }
      },
      {
        type: 'input',
        block_id: 'pr_merged_transition',
        label: { type: 'plain_text', text: 'PR Merged Transition (Optional)' },
        element: {
          type: 'plain_text_input',
          action_id: 'pr_merged',
          placeholder: { type: 'plain_text', text: 'e.g., "Done"' }
        },
        optional: true,
        hint: {
          type: 'plain_text',
          text: 'Jira transition name to execute when PR is merged'
        }
      }
    ]
  };
}

/**
 * Build Step D: Add Members Modal
 */
export function buildAddMembersModal(workspaceId: string): View {
  return {
    type: 'modal',
    callback_id: 'wizard_members_submit',
    title: {
      type: 'plain_text',
      text: 'Step D: Add Team Members'
    },
    submit: {
      type: 'plain_text',
      text: 'Add Members'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    private_metadata: workspaceId,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Add team members for code review assignments*\n\nFor each member, select their Slack user and set their role and GitHub username.'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'member_1',
        label: { type: 'plain_text', text: 'Member 1' },
        element: {
          type: 'users_select',
          action_id: 'slack_user',
          placeholder: { type: 'plain_text', text: 'Select Slack user' }
        }
      },
      {
        type: 'input',
        block_id: 'member_1_github',
        label: { type: 'plain_text', text: 'GitHub Username' },
        element: {
          type: 'plain_text_input',
          action_id: 'github_username',
          placeholder: { type: 'plain_text', text: 'e.g., johndoe' }
        }
      },
      {
        type: 'input',
        block_id: 'member_1_role',
        label: { type: 'plain_text', text: 'Role' },
        element: {
          type: 'static_select',
          action_id: 'role',
          options: [
            { text: { type: 'plain_text', text: 'Frontend (FE)' }, value: 'FE' },
            { text: { type: 'plain_text', text: 'Backend (BE)' }, value: 'BE' },
            { text: { type: 'plain_text', text: 'Full Stack (FS)' }, value: 'FS' }
          ],
          initial_option: { text: { type: 'plain_text', text: 'Full Stack (FS)' }, value: 'FS' }
        }
      },
      {
        type: 'input',
        block_id: 'member_1_weight',
        label: { type: 'plain_text', text: 'Weight (Optional)' },
        element: {
          type: 'plain_text_input',
          action_id: 'weight',
          placeholder: { type: 'plain_text', text: '1.0' },
          initial_value: '1.0'
        },
        optional: true,
        hint: {
          type: 'plain_text',
          text: 'Review assignment weight (default: 1.0)'
        }
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '💡 You can add more members after completing this step using `/cr settings`'
        }]
      }
    ]
  };
}

