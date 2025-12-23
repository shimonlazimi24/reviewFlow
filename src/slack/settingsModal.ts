// Enhanced settings modal with tabs/sections for comprehensive workspace configuration
import { View } from '@slack/bolt';
import { db, Member, Team, RepoMapping } from '../db/memoryDb';
import { loadWorkspaceContext } from '../services/workspaceContext';
import { PolarService } from '../services/polarService';
import { SubscriptionPlan } from '../types/subscription';

/**
 * Build comprehensive settings modal with sections for:
 * - Teams management
 * - Repo mapping
 * - Integrations (GitHub/Jira)
 * - Billing/plan
 */
export async function buildComprehensiveSettingsModal(
  slackTeamId: string,
  workspaceId: string
): Promise<View> {
  const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const context = await loadWorkspaceContext(slackTeamId);
  const members = await db.listMembers(workspaceId);
  const teams = await db.listTeams(workspaceId);
  const repoMappings = await db.listRepoMappings(workspaceId);
  const jiraConnection = await db.getJiraConnection(workspaceId);

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '⚙️ ReviewFlow Settings'
      }
    },
    {
      type: 'divider'
    }
  ];

  // Section 1: Integrations
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*🔗 Integrations*'
    }
  });

  // GitHub status
  const githubStatus = workspace.githubInstallationId ? '✅ Connected' : '❌ Not connected';
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*GitHub:* ${githubStatus}${workspace.githubInstallationId ? `\nInstallation ID: \`${workspace.githubInstallationId}\`` : ''}`
    },
    accessory: {
      type: 'button',
      text: {
        type: 'plain_text',
        text: workspace.githubInstallationId ? '🔧 Manage' : '🔗 Connect'
      },
      action_id: workspace.githubInstallationId ? 'settings_manage_github' : 'settings_connect_github',
      value: workspaceId
    }
  });

  // Jira status
  const jiraStatus = jiraConnection ? '✅ Connected' : '❌ Not connected';
  const jiraActive = jiraConnection && context.limits.jiraIntegration;
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Jira:* ${jiraStatus}${jiraConnection ? `\nBase URL: \`${jiraConnection.baseUrl}\`` : ''}${!jiraActive && jiraConnection ? '\n_Requires Pro plan to use_' : ''}`
    },
    accessory: {
      type: 'button',
      text: {
        type: 'plain_text',
        text: jiraConnection ? '🔧 Manage' : '🔗 Connect'
      },
      action_id: jiraConnection ? 'settings_manage_jira' : 'settings_connect_jira',
      value: workspaceId
    }
  });

  blocks.push({ type: 'divider' });

  // Section 2: Teams Management
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*👥 Teams & Members*'
    }
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Teams:* ${teams.length}\n*Members:* ${members.length} (${members.filter((m: Member) => m.isActive && !m.isUnavailable).length} active)`
    }
  });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '➕ Add Member'
        },
        action_id: 'settings_add_member',
        value: workspaceId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '👥 View Members'
        },
        action_id: 'settings_view_members',
        value: workspaceId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🏢 Manage Teams'
        },
        action_id: 'settings_manage_teams',
        value: workspaceId
      }
    ]
  });

  blocks.push({ type: 'divider' });

  // Section 3: Repository Mapping
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*📦 Repository Mapping*'
    }
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Mapped Repositories:* ${repoMappings.length}\n${repoMappings.length > 0 ? repoMappings.slice(0, 5).map((rm: RepoMapping) => {
        const team = teams.find((t: Team) => t.id === rm.teamId);
        return `• \`${rm.repoFullName}\` → ${team?.name || 'Unknown Team'}`;
      }).join('\n') + (repoMappings.length > 5 ? `\n... and ${repoMappings.length - 5} more` : '') : 'No repositories mapped yet.'}`
    }
  });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🗺️ Map Repository'
        },
        action_id: 'settings_map_repo',
        value: workspaceId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📋 View All Mappings'
        },
        action_id: 'settings_view_repos',
        value: workspaceId
      }
    ]
  });

  blocks.push({ type: 'divider' });

  // Section 4: Billing/Plan
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*💳 Billing & Plan*'
    }
  });

  const planEmoji = context.plan === SubscriptionPlan.FREE ? '🆓' :
                    context.plan === SubscriptionPlan.PRO ? '⭐' :
                    context.plan === SubscriptionPlan.TEAM ? '👥' : '🏢';

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Current Plan:* ${planEmoji} ${context.plan.toUpperCase()}\n*Status:* ${context.status === 'active' ? '✅ Active' : '⚠️ ' + context.status}\n*Usage:* ${context.usage.prsProcessed} / ${context.usage.limit} PRs this month`
    }
  });

  if (context.plan === SubscriptionPlan.FREE) {
    const polar = new PolarService();
    const checkout = await polar.createCheckoutSession({
      slackTeamId: slackTeamId,
      slackUserId: '', // slackUserId not available in modal context
      plan: 'pro'
    });

    blocks.push({
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
          action_id: 'settings_upgrade'
        }
      ]
    });
  } else if (workspace.polarCustomerId) {
    const polar = new PolarService();
    const portal = await polar.createCustomerPortalSession(
      workspace.polarCustomerId,
      `${process.env.APP_BASE_URL || 'http://localhost:3000'}/billing/success?workspace_id=${workspaceId}`
    );

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '💳 Manage Billing'
          },
          url: portal.url,
          action_id: 'settings_billing'
        }
      ]
    });
  }

  if (context.currentPeriodEnd) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Renewal Date:* ${new Date(context.currentPeriodEnd).toLocaleDateString()}`
      }
    });
  }

  blocks.push({ type: 'divider' });

  // Section 5: Features
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*✨ Available Features*'
    }
  });

  blocks.push({
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
  });

  return {
    type: 'modal',
    callback_id: 'comprehensive_settings',
    title: {
      type: 'plain_text',
      text: 'ReviewFlow Settings'
    },
    close: {
      type: 'plain_text',
      text: 'Close'
    },
    blocks
  };
}

