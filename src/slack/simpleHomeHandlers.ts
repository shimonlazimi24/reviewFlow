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

    try {
      const settings = await db.getWorkspaceSettings(teamId);
      
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
      await client.chat.postEphemeral({
        channel: userId,
        user: userId,
        text: `❌ Failed to send test message: ${error.message}`
      });
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
}

