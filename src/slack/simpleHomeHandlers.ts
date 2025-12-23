// Handlers for simplified home tab and setup flow
import { App } from '@slack/bolt';
import { db } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { 
  buildUnconfiguredHomeTab, 
  buildConfiguredHomeTab, 
  buildSetupModal,
  isWorkspaceConfigured 
} from './simpleHomeTab';

/**
 * Register simplified home tab and setup handlers
 */
export function registerSimpleHomeHandlers(app: App) {
  // Handle app_home_opened event
  app.event('app_home_opened', async ({ event, client }) => {
    const userId = event.user;
    
    // Try to get team ID from event first (works in OAuth mode)
    let teamId = (event as any).team;
    
    // If not in event, get it from auth.test() (single-workspace mode)
    if (!teamId) {
      try {
        const authResult = await client.auth.test();
        if (authResult.ok && authResult.team_id) {
          teamId = authResult.team_id;
          logger.debug('Got team ID from auth.test()', { teamId });
        }
      } catch (error: any) {
        logger.error('Failed to get team ID from auth.test()', error);
      }
    }

    if (!teamId) {
      logger.warn('Home tab opened without team ID - cannot publish home tab', { userId });
      return;
    }

    try {
      const configured = await isWorkspaceConfigured(teamId);
      const blocks = configured 
        ? await buildConfiguredHomeTab(teamId)
        : buildUnconfiguredHomeTab();

      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks
        }
      });

      logger.info('Simple home tab published', { userId, teamId, configured });
    } catch (error: any) {
      logger.error('Error publishing simple home tab', error);
      // Don't crash on invalid_auth - just log it
      if (error?.data?.error === 'invalid_auth') {
        logger.error('❌ Slack authentication failed. Please check your SLACK_BOT_TOKEN is valid and the app is installed.', {
          action: 'Get a new token from: https://api.slack.com/apps → Your App → OAuth & Permissions → Bot User OAuth Token',
          note: 'The Home tab will not work until the token is fixed.'
        });
      }
      // Event is automatically acknowledged by Bolt, but we log the error
    }
  });

  // Handle "Start Setup" and "Edit Settings" button clicks
  app.action('start_setup', async ({ ack, body, client }) => {
    await ack();
    
    const actionBody = body as any;
    logger.info('Start setup button clicked', { 
      hasTeam: !!actionBody.team?.id,
      hasTriggerId: !!actionBody.trigger_id,
      bodyKeys: Object.keys(actionBody)
    });
    
    let teamId = actionBody.team?.id;
    const triggerId = actionBody.trigger_id;

    // Get team ID from auth.test() if not in body (single-workspace mode)
    if (!teamId) {
      try {
        const authResult = await client.auth.test();
        if (authResult.ok && authResult.team_id) {
          teamId = authResult.team_id;
        }
      } catch (error: any) {
        logger.error('Failed to get team ID from auth.test()', error);
      }
    }

    if (!teamId) {
      logger.warn('Missing team ID for setup modal');
      return;
    }

    if (!triggerId) {
      logger.warn('Missing trigger ID for setup modal - cannot open modal');
      // Try to send an ephemeral message instead
      try {
        await client.chat.postEphemeral({
          channel: actionBody.user?.id || '',
          user: actionBody.user?.id || '',
          text: '⚠️ Unable to open setup modal. Please try clicking the button again or use `/cr settings` command.'
        });
      } catch (err: any) {
        logger.error('Failed to send ephemeral message', err);
      }
      return;
    }

    try {
      const settings = await db.getWorkspaceSettings(teamId);
      const modal = buildSetupModal(teamId, settings);

      await client.views.open({
        trigger_id: triggerId,
        view: modal
      });
      
      logger.info('Setup modal opened', { teamId, userId: actionBody.user?.id });
    } catch (error: any) {
      logger.error('Error opening setup modal', error);
      // Try to send an error message
      try {
        await client.chat.postEphemeral({
          channel: actionBody.user?.id || '',
          user: actionBody.user?.id || '',
          text: `❌ Failed to open setup modal: ${error.message || 'Unknown error'}`
        });
      } catch (err: any) {
        logger.error('Failed to send error message', err);
      }
    }
  });

  app.action('edit_settings', async ({ ack, body, client }) => {
    await ack();
    
    const actionBody = body as any;
    let teamId = actionBody.team?.id;
    const triggerId = actionBody.trigger_id;

    // Get team ID from auth.test() if not in body (single-workspace mode)
    if (!teamId) {
      try {
        const authResult = await client.auth.test();
        if (authResult.ok && authResult.team_id) {
          teamId = authResult.team_id;
        }
      } catch (error: any) {
        logger.error('Failed to get team ID from auth.test()', error);
      }
    }

    if (!teamId) {
      logger.warn('Missing team ID for edit modal');
      return;
    }

    if (!triggerId) {
      logger.warn('Missing trigger ID for edit modal - cannot open modal');
      return;
    }

    try {
      const settings = await db.getWorkspaceSettings(teamId);
      const modal = buildSetupModal(teamId, settings);

      await client.views.open({
        trigger_id: triggerId,
        view: modal
      });
      
      logger.info('Edit settings modal opened', { teamId, userId: actionBody.user?.id });
    } catch (error: any) {
      logger.error('Error opening edit modal', error);
    }
  });

  // Handle "Send Test Message" button
  app.action('send_test_message', async ({ ack, body, client }) => {
    await ack();
    
    const actionBody = body as any;
    const teamId = actionBody.team?.id;
    const userId = actionBody.user?.id;

    if (!teamId || !userId) {
      logger.warn('Missing team ID or user ID for test message');
      return;
    }

    let settings: any = null;
    try {
      settings = await db.getWorkspaceSettings(teamId);
      
      if (!settings?.defaultChannelId) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '❌ No channel configured. Please set up ReviewFlow first.'
        });
        return;
      }

      await client.chat.postMessage({
        channel: settings.defaultChannelId,
        text: '🧪 *Test Message from ReviewFlow*\n\nThis is a test message to verify your ReviewFlow configuration is working correctly.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🧪 *Test Message from ReviewFlow*\n\nThis is a test message to verify your ReviewFlow configuration is working correctly.\n\n✅ Configuration is active!'
            }
          }
        ]
      });

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Test message sent to <#${settings.defaultChannelId}>`
      });
    } catch (error: any) {
      logger.error('Error sending test message', error);
      
      // Handle specific error cases
      const channelId = settings?.defaultChannelId || 'the configured channel';
      let errorMessage = `❌ Failed to send test message: ${error.message}`;
      
      if (error?.data?.error === 'not_in_channel') {
        errorMessage = `❌ Bot is not a member of <#${channelId}>\n\n` +
          `*To fix this:*\n` +
          `1. Go to the channel <#${channelId}>\n` +
          `2. Type: \`/invite @reviewFlow\` (or your bot's name)\n` +
          `3. Or click the channel name → "Integrations" → "Add apps" → Find ReviewFlow\n` +
          `4. Try sending the test message again`;
      } else if (error?.data?.error === 'channel_not_found') {
        errorMessage = `❌ Channel <#${channelId}> not found.\n\n` +
          `The channel may have been deleted or the bot doesn't have access. Please update your configuration.`;
      } else if (error?.data?.error === 'is_archived') {
        errorMessage = `❌ Channel <#${channelId}> is archived.\n\n` +
          `Please select an active channel in your configuration.`;
      }
      
      try {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: errorMessage
        });
      } catch (ephemeralError: any) {
        // If we can't send ephemeral, just log it
        logger.error('Failed to send error message to user', ephemeralError);
      }
    }
  });

  // Handle setup modal submission
  app.view('setup_submit', async ({ ack, body, view, client }) => {
    const userId = body.user.id;
    const teamId = body.team?.id || view.private_metadata;

    if (!teamId) {
      await ack({
        response_action: 'errors',
        errors: {
          channel: 'Missing workspace information'
        }
      });
      return;
    }

    try {
      // Extract form values
      const channelId = view.state.values.channel?.channel_select?.selected_conversation;
      const requiredReviewersStr = view.state.values.required_reviewers?.reviewers_select?.selected_option?.value || '2';
      const reminderHoursStr = view.state.values.reminder_hours?.hours_input?.value || '6';
      const feLabels = view.state.values.fe_labels?.fe_labels_input?.value || '';
      const beLabels = view.state.values.be_labels?.be_labels_input?.value || '';

      // Validation
      if (!channelId) {
        await ack({
          response_action: 'errors',
          errors: {
            channel: 'Please select a notification channel'
          }
        });
        return;
      }

      const requiredReviewers = parseInt(requiredReviewersStr, 10);
      const reminderHours = parseInt(reminderHoursStr, 10);

      if (isNaN(requiredReviewers) || requiredReviewers < 1 || requiredReviewers > 2) {
        await ack({
          response_action: 'errors',
          errors: {
            required_reviewers: 'Required reviewers must be 1 or 2'
          }
        });
        return;
      }

      if (isNaN(reminderHours) || reminderHours < 1) {
        await ack({
          response_action: 'errors',
          errors: {
            reminder_hours: 'Reminder hours must be a positive number'
          }
        });
        return;
      }

      // Get or create workspace settings
      const existingSettings = await db.getWorkspaceSettings(teamId);
      const now = Date.now();

      const settings = {
        slackTeamId: teamId,
        defaultChannelId: channelId,
        requiredReviewers,
        reminderHours,
        feLabels: feLabels.trim() || undefined,
        beLabels: beLabels.trim() || undefined,
        createdAt: existingSettings?.createdAt || now,
        updatedAt: now
      };

      await db.upsertWorkspaceSettings(settings);

      // Also update workspace defaultChannelId if it exists
      const workspace = await db.getWorkspaceBySlackTeamId(teamId);
      if (workspace) {
        await db.updateWorkspace(workspace.id, {
          defaultChannelId: channelId,
          updatedAt: now
        });
      }

      await ack();

      // Update home tab
      const blocks = await buildConfiguredHomeTab(teamId);
      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks
        }
      });

      // Send confirmation
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `✅ Configuration saved! Your ReviewFlow settings have been updated.`
      });

      logger.info('Workspace settings saved', { teamId, channelId, requiredReviewers, reminderHours });
    } catch (error: any) {
      logger.error('Error saving workspace settings', error);
      await ack({
        response_action: 'errors',
        errors: {
          channel: error.message || 'Failed to save configuration'
        }
      });
    }
  });

  // Handle "GitHub" button from Home Tab
  app.action('home_connect_github', async ({ ack, body, client }) => {
    // Acknowledge immediately to prevent timeout
    await ack();
    
    const actionBody = body as any;
    
    logger.info('GitHub button clicked from Home Tab', {
      hasTeam: !!actionBody.team?.id,
      hasTriggerId: !!actionBody.trigger_id,
      hasUserId: !!actionBody.user?.id,
      actionValue: actionBody.actions?.[0]?.value,
      bodyKeys: Object.keys(actionBody)
    });
    
    let teamId = actionBody.team?.id || actionBody.actions?.[0]?.value;
    const userId = actionBody.user?.id;
    const triggerId = actionBody.trigger_id;

    // Get team ID from auth.test() if not in body (single-workspace mode)
    if (!teamId) {
      try {
        const authResult = await client.auth.test();
        if (authResult.ok && authResult.team_id) {
          teamId = authResult.team_id;
          logger.debug('Got team ID from auth.test()', { teamId });
        }
      } catch (error: any) {
        logger.error('Failed to get team ID from auth.test()', error);
      }
    }

    if (!teamId || !userId) {
      logger.warn('Missing required fields for GitHub connection', { teamId, userId });
      try {
        await client.chat.postEphemeral({
          channel: userId || '',
          user: userId || '',
          text: '❌ Unable to connect GitHub. Please try using `/cr settings` command instead.'
        });
      } catch (err: any) {
        logger.error('Failed to send error message', err);
      }
      return;
    }

    if (!triggerId) {
      logger.warn('Missing trigger ID for GitHub connection - cannot open modal');
      // Try to send ephemeral message with link instead
      try {
        const workspace = await db.getWorkspaceBySlackTeamId(teamId);
        if (workspace) {
          const githubAppUrl = process.env.GITHUB_APP_ID
            ? `https://github.com/apps/${process.env.GITHUB_APP_NAME || 'reviewflow'}/installations/new`
            : `${process.env.APP_BASE_URL || 'http://localhost:3000'}/connect/github?workspace_id=${workspace.id}`;
          
          await client.chat.postEphemeral({
            channel: userId,
            user: userId,
            text: '🔗 *Connect GitHub*\n\nClick the link below to install the GitHub App:',
            blocks: [
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
              }
            ]
          });
        } else {
          await client.chat.postEphemeral({
            channel: userId,
            user: userId,
            text: '❌ Workspace not found. Please try using `/cr settings` command.'
          });
        }
      } catch (err: any) {
        logger.error('Failed to send GitHub connection message', err);
      }
      return;
    }

    try {
      // Get or create workspace (do this quickly)
      let workspace = await db.getWorkspaceBySlackTeamId(teamId);
      
      if (!workspace) {
        // Create workspace if it doesn't exist
        const workspaceId = `workspace_${teamId}`;
        workspace = {
          id: workspaceId,
          slackTeamId: teamId,
          plan: 'free',
          subscriptionStatus: 'active',
          setupComplete: false,
          setupStep: 'channel',
          goLiveEnabled: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await db.addWorkspace(workspace);
        logger.info('Created workspace for GitHub connection', { workspaceId, teamId });
      }

      // Import and build modal (do this quickly to avoid timeout)
      const { buildGitHubConnectionModal } = await import('./onboardingWizard');
      const modal = buildGitHubConnectionModal(workspace.id);
      
      // Open modal immediately
      await client.views.open({
        trigger_id: triggerId,
        view: modal
      });
      
      logger.info('GitHub connection modal opened successfully', { workspaceId: workspace.id });
    } catch (error: any) {
      logger.error('Error opening GitHub connection modal', error, {
        teamId,
        userId,
        hasTriggerId: !!triggerId,
        errorMessage: error.message,
        errorStack: error.stack
      });
      try {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ Failed to open GitHub connection: ${error.message || 'Unknown error'}`
        });
      } catch (err: any) {
        logger.error('Failed to send error message to user', err);
      }
    }
  });

  // Handle "Jira" button from Home Tab
  app.action('home_connect_jira', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    
    logger.info('Jira button clicked from Home Tab', {
      hasTeam: !!actionBody.team?.id,
      hasTriggerId: !!actionBody.trigger_id,
      hasUserId: !!actionBody.user?.id,
      actionValue: actionBody.actions?.[0]?.value
    });
    
    let teamId = actionBody.team?.id || actionBody.actions?.[0]?.value;
    const userId = actionBody.user?.id;
    const triggerId = actionBody.trigger_id;

    // Get team ID from auth.test() if not in body (single-workspace mode)
    if (!teamId) {
      try {
        const authResult = await client.auth.test();
        if (authResult.ok && authResult.team_id) {
          teamId = authResult.team_id;
        }
      } catch (error: any) {
        logger.error('Failed to get team ID from auth.test()', error);
      }
    }

    if (!teamId || !userId) {
      logger.warn('Missing required fields for Jira connection', { teamId, userId });
      try {
        await client.chat.postEphemeral({
          channel: userId || '',
          user: userId || '',
          text: '❌ Unable to connect Jira. Please try using `/cr settings` command instead.'
        });
      } catch (err: any) {
        logger.error('Failed to send error message', err);
      }
      return;
    }

    if (!triggerId) {
      logger.warn('Missing trigger ID for Jira connection - cannot open modal');
      try {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '⚠️ Unable to open Jira connection modal. Please try using `/cr settings` command or click the button again.'
        });
      } catch (err: any) {
        logger.error('Failed to send error message', err);
      }
      return;
    }

    try {
      // Get or create workspace
      let workspace = await db.getWorkspaceBySlackTeamId(teamId);
      logger.info('Workspace lookup for Jira', { teamId, found: !!workspace });
      
      if (!workspace) {
        // Create workspace if it doesn't exist
        const workspaceId = `workspace_${teamId}`;
        workspace = {
          id: workspaceId,
          slackTeamId: teamId,
          plan: 'free',
          subscriptionStatus: 'active',
          setupComplete: false,
          setupStep: 'channel',
          goLiveEnabled: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await db.addWorkspace(workspace);
        logger.info('Created workspace for Jira connection', { workspaceId, teamId });
      }

      // Check if Pro plan is required
      logger.info('Loading workspace context for Jira', { teamId });
      const { loadWorkspaceContext, hasFeature } = await import('../services/workspaceContext');
      const context = await loadWorkspaceContext(teamId);
      const isProRequired = !hasFeature(context, 'jiraIntegration');
      logger.info('Jira Pro requirement check', { isProRequired, plan: context.plan });

      // Import and use existing Jira connection modal
      logger.info('Building Jira connection modal', { workspaceId: workspace.id, isProRequired });
      const { buildJiraConnectionModal } = await import('./onboardingWizard');
      const modal = buildJiraConnectionModal(workspace.id, isProRequired);
      
      logger.info('Opening Jira connection modal', { triggerId: triggerId?.substring(0, 10) + '...' });
      await client.views.open({
        trigger_id: triggerId,
        view: modal
      });
      
      logger.info('Jira connection modal opened successfully');
    } catch (error: any) {
      logger.error('Error opening Jira connection modal', error, {
        teamId,
        userId,
        hasTriggerId: !!triggerId,
        errorMessage: error.message,
        errorStack: error.stack
      });
      try {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ Failed to open Jira connection: ${error.message || 'Unknown error'}`
        });
      } catch (err: any) {
        logger.error('Failed to send error message to user', err);
      }
    }
  });

  // Handle "Upgrade to Pro" button from Home Tab
  app.action('home_upgrade', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    
    logger.info('Upgrade to Pro button clicked from Home Tab', {
      hasTeam: !!actionBody.team?.id,
      hasUserId: !!actionBody.user?.id,
      actionValue: actionBody.actions?.[0]?.value
    });
    
    let teamId = actionBody.team?.id || actionBody.actions?.[0]?.value;
    const userId = actionBody.user?.id;

    // Get team ID from auth.test() if not in body (single-workspace mode)
    if (!teamId) {
      try {
        const authResult = await client.auth.test();
        if (authResult.ok && authResult.team_id) {
          teamId = authResult.team_id;
        }
      } catch (error: any) {
        logger.error('Failed to get team ID from auth.test()', error);
      }
    }

    if (!teamId || !userId) {
      logger.warn('Missing required fields for upgrade', { teamId, userId });
      try {
        await client.chat.postEphemeral({
          channel: userId || '',
          user: userId || '',
          text: '❌ Unable to create upgrade link. Please try using `/upgrade` command instead.'
        });
      } catch (err: any) {
        logger.error('Failed to send error message', err);
      }
      return;
    }

    try {
      // Get or create workspace
      let workspace = await db.getWorkspaceBySlackTeamId(teamId);
      
      if (!workspace) {
        const workspaceId = `workspace_${teamId}`;
        workspace = {
          id: workspaceId,
          slackTeamId: teamId,
          plan: 'free',
          subscriptionStatus: 'active',
          setupComplete: false,
          setupStep: 'channel',
          goLiveEnabled: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await db.addWorkspace(workspace);
      }

      // Check if already on Pro plan
      if (workspace.plan === 'pro' && workspace.polarCustomerId) {
        const { PolarService } = await import('../services/polarService');
        const polar = new PolarService();
        try {
          const portal = await polar.createCustomerPortalSession(
            workspace.polarCustomerId,
            `${process.env.APP_BASE_URL || 'http://localhost:3000'}/billing/success?workspace_id=${workspace.id}`
          );
          await client.chat.postEphemeral({
            channel: userId,
            user: userId,
            text: '✅ *You already have Pro!*\n\nManage your subscription:',
            blocks: [
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: '💳 Manage Subscription'
                    },
                    url: portal.url,
                    action_id: 'manage_subscription'
                  }
                ]
              }
            ]
          });
          return;
        } catch (error: any) {
          logger.error('Failed to create customer portal', error);
        }
      }

      // Check if Polar is configured
      const { env } = await import('../config/env');
      if (!env.POLAR_ACCESS_TOKEN || (!env.POLAR_PRO_PRODUCT_ID && !env.POLAR_PRO_PRICE_ID)) {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: '💳 *Billing Not Configured*\n\nPolar billing is not set up yet. All features are available in free mode.'
        });
        return;
      }

      // Create upgrade checkout (same as working upgrade button)
      const { PolarService } = await import('../services/polarService');
      const polar = new PolarService();
      const checkout = await polar.createCheckoutSession({
        slackTeamId: teamId,
        slackUserId: userId,
        plan: 'pro'
      });

      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: '🚀 *Upgrade to ReviewFlow Pro*\n\nUnlock all features:\n• Unlimited teams, members, and repos\n• Jira Integration\n• Auto Balance\n• Reminders\n• Advanced Analytics',
        blocks: [
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
      });
    } catch (error: any) {
      logger.error('Error creating upgrade link', error, {
        teamId,
        userId,
        errorMessage: error.message
      });
      try {
        await client.chat.postEphemeral({
          channel: userId,
          user: userId,
          text: `❌ Failed to create upgrade link: ${error.message || 'Unknown error'}\n\nPlease try using \`/upgrade\` command.`
        });
      } catch (err: any) {
        logger.error('Failed to send error message', err);
      }
    }
  });

  // Handle "Full Settings" button from Home Tab
  app.action('home_full_settings', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as any;
    const teamId = actionBody.team?.id || actionBody.actions?.[0]?.value;
    const userId = actionBody.user?.id;
    const triggerId = actionBody.trigger_id;

    if (!teamId || !userId || !triggerId) {
      logger.warn('Missing required fields for full settings');
      return;
    }

    try {
      // Get or create workspace
      let workspace = await db.getWorkspaceBySlackTeamId(teamId);
      if (!workspace) {
        // Create workspace if it doesn't exist
        const workspaceId = `workspace_${teamId}`;
        workspace = {
          id: workspaceId,
          slackTeamId: teamId,
          plan: 'free',
          subscriptionStatus: 'active',
          setupComplete: false,
          setupStep: 'channel',
          goLiveEnabled: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await db.addWorkspace(workspace);
        logger.info('Created workspace for full settings', { workspaceId, teamId });
      }

      // Import and use comprehensive settings modal
      const { buildComprehensiveSettingsModal } = await import('./settingsModal');
      const modal = await buildComprehensiveSettingsModal(teamId, workspace.id);
      
      await client.views.open({
        trigger_id: triggerId,
        view: modal
      });
    } catch (error: any) {
      logger.error('Error opening full settings modal', error);
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to open settings: ${error.message}\n\nTry using: \`/cr settings\``
      });
    }
  });
}

