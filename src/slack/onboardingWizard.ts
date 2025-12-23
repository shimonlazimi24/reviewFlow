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

  // Step A: Setup Destination (DM or private channel)
  const hasSetupChannel = !!workspace.setupChannelId;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: hasSetupChannel
        ? `✅ *Step A: Setup Destination*\nSetup messages will go to: <#${workspace.setupChannelId}>\n\n_By default, setup messages go to your DM. You can optionally select a private channel for setup notifications._`
        : `⏳ *Step A: Setup Destination*\nChoose where setup notifications will be sent (DM by default, or select a private channel).`
    }
  });
  if (!hasSetupChannel) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '📢 Configure Setup Channel' },
        style: 'primary',
        action_id: 'wizard_step_setup_destination',
        value: workspace.id
      }]
    });
  }

  blocks.push({ type: 'divider' });

  // Step A2: Notification Channel
  const hasChannel = !!workspace.defaultChannelId;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: hasChannel
        ? `✅ *Step A2: Notification Channel*\nChannel: <#${workspace.defaultChannelId}>`
        : `⏳ *Step A2: Notification Channel*\nSelect the channel where PR notifications will be posted.`
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

  // Step D: Create Teams
  const teams = await db.listTeams(workspace.id);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: teams.length > 0
        ? `✅ *Step D: Create Teams*\n${teams.length} team${teams.length > 1 ? 's' : ''} created`
        : `⏳ *Step D: Create Teams*\nCreate teams to organize your repositories and members.`
    }
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: teams.length > 0 ? '➕ Create Team' : '🏢 Create Team' },
        style: teams.length === 0 ? 'primary' : undefined,
        action_id: 'wizard_step_teams',
        value: workspace.id
      },
      ...(teams.length > 0 ? [{
        type: 'button',
        text: { type: 'plain_text', text: '👀 View Teams' },
        action_id: 'wizard_view_teams',
        value: workspace.id
      }] : [])
    ]
  });

  blocks.push({ type: 'divider' });

  // Step E: Map Repos to Teams
  const repoMappings = await db.listRepoMappings(workspace.id);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: repoMappings.length > 0
        ? `✅ *Step E: Map Repositories*\n${repoMappings.length} repositor${repoMappings.length > 1 ? 'ies' : 'y'} mapped`
        : `⏳ *Step E: Map Repositories*\nMap your GitHub repositories to teams for better organization.`
    }
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: repoMappings.length > 0 ? '🗺️ Map Repository' : '🗺️ Map Repository' },
        style: repoMappings.length === 0 ? 'primary' : undefined,
        action_id: 'wizard_step_repos',
        value: workspace.id
      },
      ...(repoMappings.length > 0 ? [{
        type: 'button',
        text: { type: 'plain_text', text: '👀 View Mappings' },
        action_id: 'wizard_view_repos',
        value: workspace.id
      }] : [])
    ]
  });

  blocks.push({ type: 'divider' });

  // Step F: Add Team Members
  const members = await db.listMembers(workspace.id);
  const activeMembers = members.filter((m: any) => m.isActive && !m.isUnavailable);
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: activeMembers.length > 0
        ? `✅ *Step F: Add Team Members*\n${activeMembers.length} member${activeMembers.length > 1 ? 's' : ''} configured`
        : `⏳ *Step F: Add Team Members*\nAdd your team members so ReviewFlow can assign code reviewers.`
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

  // Step G: Go Live
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: workspace.goLiveEnabled
        ? `✅ *Step G: Go Live*\nPR processing is enabled! ReviewFlow will automatically assign reviewers when PRs are opened.`
        : `⏳ *Step G: Go Live*\nEnable PR processing to start automatically assigning reviewers.`
    }
  });
  if (!workspace.goLiveEnabled) {
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '🚀 Go Live' },
        style: 'primary',
        action_id: 'wizard_step_go_live',
        value: workspace.id
      }]
    });
  }

  blocks.push({ type: 'divider' });

  // Setup completion status
  const requiredStepsComplete = hasChannel && hasGitHub && teams.length > 0 && activeMembers.length > 0;
  const setupComplete = workspace.setupComplete || requiredStepsComplete;
  
  if (setupComplete && !workspace.setupComplete) {
    // Mark setup as complete (but not Go Live yet)
    await db.updateWorkspace(workspace.id, {
      setupComplete: true,
      setupStep: 'complete',
      updatedAt: Date.now()
    });
  }
  
  if (setupComplete && workspace.goLiveEnabled) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '🎉 *ReviewFlow is Live!*\n\nPR processing is enabled. When PRs are opened, reviewers will be automatically assigned based on your team configuration.'
      }
    });
  } else if (setupComplete) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '✅ *Setup Complete!*\n\nAll setup steps are complete. Enable "Go Live" to start processing PRs automatically.'
      }
    });
  } else {
    const completedSteps = [hasChannel, hasGitHub, teams.length > 0, activeMembers.length > 0].filter(Boolean).length;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Progress:* ${completedSteps}/4 required steps complete\n\nComplete all steps (A-G) to enable PR processing.`
      }
    });
  }

  return blocks;
}

/**
 * Build Step A: Setup Destination Modal
 */
export function buildSetupDestinationModal(workspaceId: string): View {
  return {
    type: 'modal',
    callback_id: 'wizard_setup_destination_submit',
    title: {
      type: 'plain_text',
      text: 'Step A: Setup Destination'
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
          text: '*Choose where setup notifications will be sent.*\n\nBy default, setup messages go to your DM. You can optionally select a private channel for setup notifications.'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'setup_destination',
        label: {
          type: 'plain_text',
          text: 'Setup Destination (Optional)'
        },
        element: {
          type: 'channels_select',
          action_id: 'setup_channel',
          placeholder: {
            type: 'plain_text',
            text: 'Select a private channel (or leave empty for DM)'
          }
        },
        optional: true
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '💡 If no channel is selected, setup messages will be sent to your DM. PR notifications will be configured in the next step.'
        }]
      }
    ]
  };
}

/**
 * Build Step A2: Channel Selection Modal
 */
export function buildChannelSelectionModal(workspaceId: string): View {
  return {
    type: 'modal',
    callback_id: 'wizard_channel_submit',
    title: {
      type: 'plain_text',
      text: 'Step A2: Select Notification Channel'
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
          text: '*Select the channel where PR notifications will be posted.*\n\nThis is where your team will see PR review assignments and updates.'
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
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '💡 PR notifications will be posted to this channel. Make sure the ReviewFlow bot is added to this channel.'
        }]
      }
    ]
  };
}

/**
 * Build Step B: GitHub Connection Modal
 */
export function buildGitHubConnectionModal(workspaceId: string): View {
  // Always use the /connect/github route which handles workspace creation
  const githubAppUrl = env.GITHUB_APP_ID
    ? `https://github.com/apps/${env.GITHUB_APP_NAME || 'reviewflow'}/installations/new?state=${workspaceId}`
    : `${env.APP_BASE_URL || 'http://localhost:3000'}/connect/github?workspace_id=${workspaceId}`;

  logger.info('Building GitHub connection modal', { workspaceId, githubAppUrl: githubAppUrl.substring(0, 100) + '...' });

  return {
    type: 'modal',
    callback_id: 'wizard_github_submit',
    title: {
      type: 'plain_text',
      text: 'Connect GitHub'
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
          text: '*Option 1: Install GitHub App (Recommended)*\n\n1. Click the button below to install the ReviewFlow GitHub App\n2. Select the repositories you want to monitor\n3. After installation, the connection will be detected automatically'
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
          text: '*Option 2: Manual Connection*\n\nIf you\'ve already installed the GitHub App, enter the Installation ID below.\n\n*How to find your Installation ID:*\n1. Go to: https://github.com/settings/installations\n2. Click on your ReviewFlow installation\n3. The Installation ID is in the URL (e.g., `/installations/100951978`)'
        }
      },
      {
        type: 'input',
        block_id: 'installation_id_input',
        label: {
          type: 'plain_text',
          text: 'GitHub Installation ID'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'installation_id',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., 100951978'
          }
        },
        optional: true,
        hint: {
          type: 'plain_text',
          text: 'Only needed if automatic connection didn\'t work'
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
export function buildAddMembersModal(workspaceId: string, teams?: any[]): View {
  const teamList = teams || [];
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
        block_id: 'member_slack_user',
        label: { type: 'plain_text', text: 'Slack User *' },
        element: {
          type: 'users_select',
          action_id: 'slack_user',
          placeholder: { type: 'plain_text', text: 'Select Slack user' }
        }
      },
      {
        type: 'input',
        block_id: 'member_github',
        label: { type: 'plain_text', text: 'GitHub Username(s) *' },
        element: {
          type: 'plain_text_input',
          action_id: 'github_username',
          placeholder: { type: 'plain_text', text: 'e.g., johndoe or johndoe,github-alt' }
        },
        hint: {
          type: 'plain_text',
          text: 'Enter one or more GitHub usernames (comma-separated)'
        }
      },
      {
        type: 'input',
        block_id: 'member_role',
        label: { type: 'plain_text', text: 'Role *' },
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
        block_id: 'member_team',
        label: { type: 'plain_text', text: 'Team (Optional)' },
        element: {
          type: 'static_select',
          action_id: 'team',
          options: teamList.map((team: any) => ({
            text: { type: 'plain_text', text: team.name },
            value: team.id
          })),
          placeholder: { type: 'plain_text', text: 'Select a team (optional)' }
        },
        optional: true
      },
      {
        type: 'input',
        block_id: 'member_weight',
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

