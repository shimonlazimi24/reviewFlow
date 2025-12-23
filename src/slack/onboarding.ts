// Onboarding modals and flows for new teams
import { View } from '@slack/bolt';
import { env } from '../config/env';
import { encrypt } from '../utils/encryption';
import { db } from '../db/memoryDb';
import { logger } from '../utils/logger';

/**
 * Build GitHub App installation modal
 */
export function buildGitHubConnectModal(): View {
  // GitHub App installation URL
  // If GITHUB_APP_ID is set, use the GitHub Apps installation flow
  // Otherwise, use a custom installation page
  const githubAppUrl = env.GITHUB_APP_ID 
    ? `https://github.com/apps/${env.GITHUB_APP_NAME || 'reviewflow'}/installations/new`
    : `${env.APP_BASE_URL || 'http://localhost:3000'}/connect/github`;

  return {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: '🔗 Connect GitHub'
    },
    submit: {
      type: 'plain_text',
      text: 'Continue'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Step 1: Install GitHub App*\n\nClick the button below to install the ReviewFlow GitHub App on your repositories.'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📦 Install GitHub App'
            },
            style: 'primary',
            url: githubAppUrl,
            action_id: 'github_install_link'
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
          text: '*Step 2: Select Repositories*\n\nAfter installation, select which repositories you want ReviewFlow to monitor.'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Step 3: Verify Connection*\n\nOnce installed, the connection will be verified automatically.'
        }
      }
    ]
  };
}

/**
 * Build Jira connection modal
 */
export function buildJiraConnectModal(): View {
  return {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: '🔗 Connect Jira'
    },
    submit: {
      type: 'plain_text',
      text: 'Connect'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    callback_id: 'jira_connect_submit',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Connect your Jira instance*\n\nEnter your Jira credentials to enable automatic ticket creation and updates.\n\n💡 *Note:* Jira integration requires a Pro plan. You can connect now and it will be activated when you upgrade.'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'jira_base_url',
        label: {
          type: 'plain_text',
          text: 'Jira Base URL'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'base_url',
          placeholder: {
            type: 'plain_text',
            text: 'https://yourcompany.atlassian.net'
          }
        },
        hint: {
          type: 'plain_text',
          text: 'Your Jira instance URL (e.g., https://company.atlassian.net)'
        }
      },
      {
        type: 'input',
        block_id: 'jira_email',
        label: {
          type: 'plain_text',
          text: 'Jira Email'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'email',
          placeholder: {
            type: 'plain_text',
            text: 'your-email@company.com'
          }
        }
      },
      {
        type: 'input',
        block_id: 'jira_api_token',
        label: {
          type: 'plain_text',
          text: 'Jira API Token'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'api_token',
          placeholder: {
            type: 'plain_text',
            text: 'Your Jira API token'
          }
        },
        hint: {
          type: 'plain_text',
          text: 'Get your API token from: https://id.atlassian.com/manage-profile/security/api-tokens'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*💡 Need help?*\n\n• <https://id.atlassian.com/manage-profile/security/api-tokens|Create API Token>\n• Make sure your Jira user has permission to create issues'
        }
      }
    ]
  };
}

/**
 * Build bulk member import modal
 */
export function buildBulkMemberImportModal(): View {
  return {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: '👥 Import Team Members'
    },
    submit: {
      type: 'plain_text',
      text: 'Import'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    callback_id: 'bulk_member_import_submit',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Import team members from Slack*\n\nEnter team members in the format:\n`@slack-user github-username role`\n\n*Roles:* `FE` (Frontend), `BE` (Backend), `FS` (Full Stack)'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'members_list',
        label: {
          type: 'plain_text',
          text: 'Team Members (one per line)'
        },
        element: {
          type: 'plain_text_input',
          action_id: 'members',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: '@alice alice-dev FE\n@bob bob-coder BE\n@charlie charlie-fullstack FS'
          }
        },
        hint: {
          type: 'plain_text',
          text: 'Format: @slack-user github-username role (one per line)'
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Example:*\n```\n@alice alice-dev FE\n@bob bob-coder BE\n@charlie charlie-fullstack FS\n```'
        }
      }
    ]
  };
}

/**
 * Build onboarding checklist for Home Tab
 * Available to ALL users (free and paid plans)
 * Button-friendly design with prominent action buttons
 */
export async function buildOnboardingChecklist(
  hasGitHub: boolean,
  hasJira: boolean,
  memberCount: number,
  workspaceId: string
): Promise<any[]> {
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚀 Welcome to ReviewFlow!'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Get started in 3 simple steps*\n_Complete setup to start automatically assigning code reviewers!_'
      }
    },
    {
      type: 'divider'
    }
  ];

  // Step 1: GitHub - More button-friendly
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: hasGitHub 
        ? '✅ *Step 1: Connect GitHub*\nYour GitHub repositories are connected!'
        : '⏳ *Step 1: Connect GitHub*\nConnect your GitHub repositories to start receiving PR notifications.'
    }
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: hasGitHub ? '🔧 Manage GitHub' : '🔗 Connect GitHub'
        },
        style: hasGitHub ? undefined : 'primary',
        action_id: hasGitHub ? 'manage_github' : 'onboarding_connect_github',
        value: workspaceId
      }
    ]
  });

  blocks.push({ type: 'divider' });

  // Step 2: Jira - More button-friendly
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: hasJira
        ? '✅ *Step 2: Connect Jira* (Optional)\nYour Jira instance is connected!'
        : '⏳ *Step 2: Connect Jira* (Optional)\nConnect Jira to automatically create tickets and update issue statuses.\n_Requires Pro plan to use_'
    }
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: hasJira ? '🔧 Manage Jira' : '🔗 Connect Jira'
        },
        style: hasJira ? undefined : 'default',
        action_id: hasJira ? 'manage_jira' : 'onboarding_connect_jira',
        value: workspaceId
      }
    ]
  });

  blocks.push({ type: 'divider' });

  // Step 3: Add Team Members - More button-friendly
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: memberCount > 0
        ? `✅ *Step 3: Add Team Members*\nYou have ${memberCount} team member${memberCount > 1 ? 's' : ''} registered!`
        : '⏳ *Step 3: Add Team Members*\nAdd your team members so ReviewFlow can assign code reviewers.'
    }
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: memberCount > 0 ? '➕ Add More Members' : '👥 Import Members'
        },
        style: memberCount === 0 ? 'primary' : 'default',
        action_id: 'onboarding_import_members',
        value: workspaceId
      },
      ...(memberCount > 0 ? [{
        type: 'button',
        text: {
          type: 'plain_text',
          text: '👀 View Members'
        },
        action_id: 'view_members',
        value: workspaceId
      }] : [])
    ]
  });

  blocks.push({ type: 'divider' });

  // Step 4: Map Repositories (optional but recommended)
  const { db } = await import('../db/memoryDb');
  const repoMappings = await db.listRepoMappings(workspaceId);
  const repoCount = repoMappings.length;
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: repoCount > 0
        ? `✅ *Step 4: Map Repositories* (Optional)\nYou have ${repoCount} repository${repoCount > 1 ? 'ies' : ''} mapped to teams!`
        : '⏳ *Step 4: Map Repositories* (Optional)\nMap your repositories to teams for better organization and team-specific assignments.'
    }
  });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: repoCount > 0 ? '🗺️ Manage Mappings' : '🗺️ Map Repository'
        },
        style: repoCount === 0 ? 'default' : undefined,
        action_id: 'onboarding_map_repo',
        value: workspaceId
      },
      ...(repoCount > 0 ? [{
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📋 View Mappings'
        },
        action_id: 'onboarding_view_repos',
        value: workspaceId
      }] : [])
    ]
  });

  blocks.push({ type: 'divider' });

  // Progress indicator and next steps
  const completedSteps = [hasGitHub, memberCount > 0].filter(Boolean).length;
  const totalSteps = 2; // GitHub and Members are required
  const progressEmoji = completedSteps === totalSteps ? '🎉' : completedSteps === 0 ? '🚀' : '⚡';
  
  if (hasGitHub && memberCount > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${progressEmoji} *Setup Complete!*\n\nReviewFlow is ready to use. When PRs are opened, reviewers will be automatically assigned based on your team configuration.`
      }
    });
    
    const actionButtons: any[] = [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '⚙️ Settings'
        },
        action_id: 'open_settings',
        value: workspaceId
      }
    ];

    // Add upgrade button if on free plan
    try {
      const workspace = await db.getWorkspace(workspaceId);
      if (workspace) {
        const { loadWorkspaceContext } = await import('../services/workspaceContext');
        const context = await loadWorkspaceContext(workspace.slackTeamId);
        if (context.plan === 'FREE') {
          const { PolarService } = await import('../services/polarService');
          const polar = new PolarService();
          const checkout = await polar.createCheckoutSession({
            slackTeamId: workspace.slackTeamId,
            slackUserId: '',
            plan: 'pro'
          });
          actionButtons.unshift({
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🚀 Upgrade to Pro'
            },
            style: 'primary',
            url: checkout.url,
            action_id: 'onboarding_upgrade'
          });
        }
      }
    } catch (error) {
      // Silently fail if upgrade button can't be added
    }

    blocks.push({
      type: 'actions',
      elements: actionButtons
    });
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Progress: ${completedSteps}/${totalSteps} steps complete*\n\n💡 *Next:* ${!hasGitHub ? 'Connect GitHub' : memberCount === 0 ? 'Add team members' : 'You\'re all set!'}`
      }
    });
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '❓ Need Help?'
          },
          url: 'https://github.com/your-repo/docs',
          action_id: 'get_help'
        }
      ]
    });
  }

  return blocks;
}

/**
 * Register onboarding action handlers
 */
export function registerOnboardingHandlers(app: any) {
  // Connect GitHub button
  app.action('onboarding_connect_github', async ({ ack, body, client }: any) => {
    await ack();
    
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      
      if (!slackTeamId) {
        return;
      }
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Workspace not found. Please try again.'
        });
        return;
      }
      
      // Open GitHub connect modal or redirect
      const modal = buildGitHubConnectModal();
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening GitHub connect modal', error);
    }
  });

  // Manage GitHub button (for already connected)
  app.action('manage_github', async ({ ack, body, client }: any) => {
    await ack();
    
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      
      if (!slackTeamId) {
        return;
      }
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        return;
      }
      
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ GitHub is connected!\n\nInstallation ID: ${workspace.githubInstallationId || 'Not set'}\n\nTo reconnect, visit: ${env.APP_BASE_URL}/connect/github?workspace_id=${workspace.id}`
      });
    } catch (error: any) {
      logger.error('Error managing GitHub', error);
    }
  });
  
  // Connect Jira button
  app.action('onboarding_connect_jira', async ({ ack, body, client }: any) => {
    await ack();
    
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      
      if (!slackTeamId) {
        return;
      }
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Workspace not found. Please try again.'
        });
        return;
      }
      
      // Check if user is on free plan - show info but still allow connection
      const { loadWorkspaceContext, hasFeature } = await import('../services/workspaceContext');
      const context = await loadWorkspaceContext(slackTeamId);
      
      if (!hasFeature(context, 'jiraIntegration')) {
        // Still allow them to connect, but show a message that it requires Pro
        // They can connect now and it will work when they upgrade
      }
      
      // Open Jira connect modal
      const modal = buildJiraConnectModal();
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening Jira connect modal', error);
    }
  });

  // Manage Jira button (for already connected)
  app.action('manage_jira', async ({ ack, body, client }: any) => {
    await ack();
    
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      
      if (!slackTeamId) {
        return;
      }
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        return;
      }
      
      const jiraConnection = await db.getJiraConnection(workspace.id);
      if (!jiraConnection) {
        return;
      }
      
      const { loadWorkspaceContext, hasFeature } = await import('../services/workspaceContext');
      const context = await loadWorkspaceContext(slackTeamId);
      const isActive = hasFeature(context, 'jiraIntegration');
      
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Jira is connected!\n\nBase URL: ${jiraConnection.baseUrl}\nEmail: ${jiraConnection.email}\nStatus: ${isActive ? '✅ Active' : '⏳ Waiting for Pro upgrade'}\n\nTo reconnect, use the "Connect Jira" button.`
      });
    } catch (error: any) {
      logger.error('Error managing Jira', error);
    }
  });
  
  // Import members button
  app.action('onboarding_import_members', async ({ ack, body, client }: any) => {
    await ack();
    
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      
      if (!slackTeamId) {
        return;
      }
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Workspace not found. Please try again.'
        });
        return;
      }
      
      // Open bulk member import modal
      const modal = buildBulkMemberImportModal();
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening member import modal', error);
    }
  });
  
  // Jira connection modal submission
  app.view('jira_connect_submit', async ({ ack, body, client, view }: any) => {
    await ack();
    
    try {
      const userId = body.user.id;
      const slackTeamId = body.team.id;
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Workspace not found. Please try again.'
        });
        return;
      }

      // If workspace doesn't have installerUserId, set it to current user
      if (!workspace.installerUserId) {
        await db.updateWorkspace(workspace.id, {
          installerUserId: userId,
          updatedAt: Date.now()
        });
        logger.info('Set installerUserId for workspace', { workspaceId: workspace.id, userId });
      }
      
      // Extract form values
      const baseUrl = view.state.values.jira_base_url?.base_url?.value;
      const email = view.state.values.jira_email?.email?.value;
      const apiToken = view.state.values.jira_api_token?.api_token?.value;
      
      if (!baseUrl || !email || !apiToken) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Please fill in all fields: Base URL, Email, and API Token.'
        });
        return;
      }
      
      // Check if user is on free plan
      const { loadWorkspaceContext, hasFeature } = await import('../services/workspaceContext');
      const context = await loadWorkspaceContext(slackTeamId);
      const isProPlan = hasFeature(context, 'jiraIntegration');
      
      // Encrypt API token
      const encryptedToken = encrypt(apiToken);
      
      // Save Jira connection (allow free users to connect, it will work when they upgrade)
      await db.upsertJiraConnection({
        workspaceId: workspace.id,
        baseUrl: baseUrl.trim(),
        email: email.trim(),
        apiToken: encryptedToken,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      let successMessage = '✅ Jira connected successfully! ReviewFlow can now create tickets and update issue statuses.';
      if (!isProPlan) {
        successMessage += '\n\n💡 Note: Jira integration requires a Pro plan. Your connection is saved and will be activated when you upgrade.';
      }
      
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: successMessage
      });
      
      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks: []
        }
      });
    } catch (error: any) {
      logger.error('Error saving Jira connection', error);
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: '❌ Failed to connect Jira. Please check your credentials and try again.'
      });
    }
  });
  
  // Bulk member import modal submission
  app.view('bulk_member_import_submit', async ({ ack, body, client, view }: any) => {
    await ack();
    
    try {
      const userId = body.user.id;
      const slackTeamId = body.team.id;
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Workspace not found. Please try again.'
        });
        return;
      }
      
      // Extract members list
      const membersText = view.state.values.members_list?.members?.value;
      if (!membersText) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ Please enter at least one team member.'
        });
        return;
      }
      
      // Parse members (format: @slack-user github-username role)
      const lines = membersText.split('\n').filter((line: string) => line.trim());
      const members: Array<{ slackUserId: string; githubUsername: string; role: string }> = [];
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const slackUser = parts[0].replace('@', '');
          const githubUsername = parts[1];
          const role = parts[2].toUpperCase();
          
          if (['FE', 'BE', 'FS'].includes(role)) {
            members.push({
              slackUserId: slackUser,
              githubUsername,
              role
            });
          }
        }
      }
      
      if (members.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ No valid members found. Format: `@slack-user github-username FE|BE|FS`'
        });
        return;
      }
      
      // Add members to database
      let added = 0;
      let skipped = 0;
      
      for (const member of members) {
        // Check if member already exists
        const existing = await db.listMembers(workspace.id);
        const exists = existing.some((m: any) => 
          m.slackUserId === member.slackUserId || 
          m.githubUsernames.includes(member.githubUsername)
        );
        
        if (exists) {
          skipped++;
          continue;
        }
        
        // Add new member
        await db.addMember({
          id: `member_${Date.now()}_${Math.random()}`,
          workspaceId: workspace.id,
          slackUserId: member.slackUserId,
          githubUsernames: [member.githubUsername],
          roles: [member.role as any],
          weight: 1.0,
          isActive: true,
          isUnavailable: false
        });
        added++;
      }
      
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Added ${added} member${added !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped - already exists)` : ''}. ReviewFlow is ready to assign reviewers!`
      });
      
      // Refresh home tab
      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks: []
        }
      });
    } catch (error: any) {
      logger.error('Error importing members', error);
      await client.chat.postEphemeral({
        channel: body.user.id,
        user: body.user.id,
        text: '❌ Failed to import members. Please check the format and try again.'
      });
    }
  });

  // View members button
  app.action('view_members', async ({ ack, body, client }: any) => {
    await ack();
    
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      
      if (!slackTeamId) {
        return;
      }
      
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        return;
      }
      
      const members = await db.listMembers(workspace.id);
      const activeMembers = members.filter((m: any) => m.isActive && !m.isUnavailable);
      
      if (activeMembers.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '📋 No active members found. Use "Import Members" to add your team.'
        });
        return;
      }
      
      const membersList = activeMembers.map((m: any, idx: number) => {
        const roles = m.roles.join(', ') || 'No role';
        const github = m.githubUsernames.join(', ') || 'No GitHub';
        return `${idx + 1}. <@${m.slackUserId}> - GitHub: ${github} - Roles: ${roles}`;
      }).join('\n');
      
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `👥 *Team Members (${activeMembers.length})*\n\n${membersList}\n\nUse "Add More Members" to add more team members.`
      });
    } catch (error: any) {
      logger.error('Error viewing members', error);
    }
  });

  // Open settings button
  app.action('open_settings', async ({ ack, body, client }: any) => {
    await ack();
    
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const slackTeamId = actionBody.team?.id;
      
      if (!slackTeamId) {
        return;
      }
      
      // Import comprehensive settings modal builder
      const { buildComprehensiveSettingsModal } = await import('./settingsModal');
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        return;
      }
      
      const modal = await buildComprehensiveSettingsModal(slackTeamId, workspace.id);
      
      await client.views.open({
        trigger_id: actionBody.trigger_id,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening settings', error);
    }
  });

  // Onboarding repo mapping actions
  app.action('onboarding_map_repo', async ({ ack, body, client, respond }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const channelId = actionBody.channel?.id || userId;
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: '🗺️ *Map Repository*\n\nUse: `/map-repo <repo-full-name> <team-id>`\n\nExample: `/map-repo org/frontend-repo team_1234567890`\n\nUse `/list-teams` to find team IDs.\n\n💡 *Tip:* Mapping repositories to teams helps ReviewFlow assign reviewers from the right team.'
      });
    } catch (error: any) {
      logger.error('Error in onboarding_map_repo', error);
    }
  });

  app.action('onboarding_view_repos', async ({ ack, body, client }: any) => {
    await ack();
    try {
      const actionBody = body as any;
      const userId = actionBody.user?.id;
      const workspaceId = actionBody.actions?.[0]?.value;
      const workspace = await db.getWorkspace(workspaceId);
      if (!workspace) return;
      
      const repoMappings = await db.listRepoMappings(workspaceId);
      const teams = await db.listTeams(workspaceId);
      
      if (repoMappings.length === 0) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '📋 No repositories mapped yet. Use `/map-repo` to map repositories to teams.'
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
        text: `📦 *Repository Mappings (${repoMappings.length})*\n\n${mappingsList}`
      });
    } catch (error: any) {
      logger.error('Error viewing repos from onboarding', error);
    }
  });
}

