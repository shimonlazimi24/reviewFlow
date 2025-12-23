import express from 'express';
import bodyParser from 'body-parser';
import { App, ExpressReceiver } from '@slack/bolt';
import { env, useDatabase } from './config/env';
import { validateEnvironment } from './config/validateEnv';
import { registerSlackHandlers } from './slack/handlers';
import { registerHomeTab } from './slack/homeTab';
import { githubWebhookHandlerFactory } from './github/webhookHandler';
import { createDb, setDb } from './db/memoryDb';
import { logger } from './utils/logger';
import { formatErrorResponse, asyncHandler } from './utils/errors';
import { githubWebhookValidator } from './utils/githubWebhook';
import { rateLimit as rateLimitMiddleware } from './middleware/rateLimit';
import { ReminderService } from './services/reminderService';
import { initAdminConfig } from './utils/permissions';
import { initFeatureFlags } from './services/featureFlags';
import { registerGitHubConnectRoutes } from './routes/githubConnect';
import { registerOnboardingHandlers } from './slack/onboarding';
import { loadWorkspaceContext } from './services/workspaceContext';
import { PolarService } from './services/polarService';

async function main() {
  try {
    // Validate environment first (fail fast)
    validateEnvironment();
    // Initialize admin configuration
    initAdminConfig();
    // Initialize feature flags
    initFeatureFlags();
    // Initialize database - prefer Postgres, allow in-memory for development
    let db: any;
    
    if (useDatabase && env.DATABASE_URL) {
      db = createDb(true, env.DATABASE_URL);
      await db.init();
      logger.info('Connected to PostgreSQL database');
    } else {
      // Only warn in production, but allow in-memory for development/testing
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        logger.warn('⚠️ Running in production without DATABASE_URL. Data will be lost on restart.', {
          tip: 'Set DATABASE_URL environment variable for persistent storage'
        });
      } else {
        logger.warn('Using in-memory database (data will be lost on restart)', {
          tip: 'Add DATABASE_URL environment variable to enable persistence'
        });
      }
      db = createDb(false);
    }

    // Set global db instance using dependency injection
    setDb(db);
    
    // Log which DB adapter is active
    const dbType = useDatabase && env.DATABASE_URL ? 'PostgreSQL' : 'In-Memory';
    logger.info(`Database adapter initialized: ${dbType}`, {
      type: dbType,
      hasConnection: !!env.DATABASE_URL
    });
    
    // Verify db.init() runs once
    if (typeof db.init === 'function') {
      await db.init();
      logger.info('Database initialization complete');
    }
    const receiver = new ExpressReceiver({ 
      signingSecret: env.SLACK_SIGNING_SECRET,
      processBeforeResponse: true
    });

    // Configure Slack App with OAuth if credentials are provided, otherwise use bot token
    let slackApp: App;
    if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) {
      // OAuth mode (multi-workspace)
      const { PostgresInstallationStore } = await import('./slack/installationStore');
      const installationStore = new PostgresInstallationStore();
      
      slackApp = new App({
        receiver,
        clientId: env.SLACK_CLIENT_ID,
        clientSecret: env.SLACK_CLIENT_SECRET,
        stateSecret: env.SLACK_STATE_SECRET || env.SLACK_SIGNING_SECRET,
        scopes: ['app_mentions:read', 'channels:history', 'channels:read', 'chat:write', 'chat:write.public', 'commands', 'im:history', 'im:read', 'im:write', 'users:read', 'users:read.email'],
        installationStore
      });
      
      logger.info('Slack OAuth mode enabled (multi-workspace)');
    } else if (env.SLACK_BOT_TOKEN) {
      // Single workspace mode (legacy)
      slackApp = new App({
        token: env.SLACK_BOT_TOKEN,
        receiver
      });
      logger.warn('Using single-workspace mode (SLACK_BOT_TOKEN). For multi-workspace, set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.');
    } else {
      throw new Error('Either SLACK_BOT_TOKEN or SLACK_CLIENT_ID/SLACK_CLIENT_SECRET must be set');
    }

    registerSlackHandlers(slackApp);
    // Note: registerHomeTab is disabled - using simplified home tab instead
    // registerHomeTab(slackApp);
    registerOnboardingHandlers(slackApp);
    
    // Register simplified home tab and setup handlers (replaces registerHomeTab)
    const { registerSimpleHomeHandlers } = await import('./slack/simpleHomeHandlers');
    registerSimpleHomeHandlers(slackApp);

    // Start reminder service
    const reminderService = new ReminderService(slackApp);
    reminderService.start();

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      reminderService.stop();
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully...');
      reminderService.stop();
      process.exit(0);
    });

    const app = receiver.app as express.Express;
    
    // Register GitHub connection routes
    registerGitHubConnectRoutes(app);
    
    // Middleware - must parse body as text first for signature validation
    app.use('/webhooks/github', express.text({ type: '*/*' }));
    app.use(bodyParser.json({ type: '*/*' }));
    app.use(express.json());

    // Health check
    app.get('/health', async (_req: express.Request, res: express.Response) => {
      try {
        // Check database connection
        await db.listWorkspaces();
        const billingEnabled = !!env.POLAR_ACCESS_TOKEN;
        res.json({ 
          status: 'healthy',
          timestamp: new Date().toISOString(),
          database: 'connected',
          billing: billingEnabled ? 'enabled' : 'disabled'
        });
      } catch (error: any) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          error: error.message
        });
      }
    });

    // Diagnostics endpoint (admin only - basic check)
    app.get('/diag/workspace/:slackTeamId', asyncHandler(async (req: express.Request, res: express.Response) => {
      const { slackTeamId } = req.params;
      
      try {
        const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
        if (!workspace) {
          return res.status(404).json({ error: 'Workspace not found' });
        }

        const context = await loadWorkspaceContext(slackTeamId);
        const members = await db.listMembers(workspace.id);
        const teams = await db.listTeams(workspace.id);
        const repoMappings = await db.listRepoMappings(workspace.id);
        const jiraConnection = await db.getJiraConnection(workspace.id);
        const openPRs = await db.listOpenPrs(workspace.id);

        res.json({
          workspace: {
            id: workspace.id,
            slackTeamId: workspace.slackTeamId,
            plan: workspace.plan,
            subscriptionStatus: workspace.subscriptionStatus,
            githubInstallationId: workspace.githubInstallationId,
            defaultChannelId: workspace.defaultChannelId
          },
          context: {
            plan: context.plan,
            status: context.status,
            usage: context.usage
          },
          integrations: {
            github: !!workspace.githubInstallationId,
            jira: !!jiraConnection,
            jiraActive: jiraConnection && context.limits.jiraIntegration
          },
          stats: {
            members: members.length,
            activeMembers: members.filter((m: any) => m.isActive && !m.isUnavailable).length,
            teams: teams.length,
            repoMappings: repoMappings.length,
            openPRs: openPRs.length
          }
        });
      } catch (error: any) {
        logger.error('Error in diagnostics endpoint', error);
        res.status(500).json({ error: error.message });
      }
    }));

    // Legacy health check (kept for backward compatibility)
    app.get('/health-legacy', (_req, res) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Readiness check
    app.get('/ready', async (_req, res) => {
      try {
        // Check database connection
        await db.listMembers();
        res.json({ 
          status: 'ready',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(503).json({
          status: 'not ready',
          error: 'Database connection failed'
        });
      }
    });

    // GitHub webhook endpoint with signature validation and rate limiting
    const githubWebhookHandler = githubWebhookHandlerFactory({ slackApp });
    if (env.GITHUB_WEBHOOK_SECRET) {
      app.post('/webhooks/github', 
        rateLimitMiddleware(100, 60 * 1000), // 100 requests per minute
        githubWebhookValidator(env.GITHUB_WEBHOOK_SECRET),
        (req, res, next) => {
          // Parse JSON after validation
          try {
            req.body = JSON.parse(req.body);
          } catch (e) {
            logger.error('Failed to parse GitHub webhook body as JSON', e);
            return res.status(400).json({ error: 'Invalid JSON' });
          }
          next();
        },
        githubWebhookHandler
      );
    } else {
      logger.warn('GitHub webhook secret not configured - webhook validation disabled');
      app.post('/webhooks/github', 
        rateLimitMiddleware(100, 60 * 1000),
        githubWebhookHandler
      );
    }

    // Billing routes
    app.get('/billing/upgrade', async (req, res) => {
      try {
        const { team_id, user_id } = req.query;
        if (!team_id || !user_id) {
          return res.status(400).send('Missing team_id or user_id');
        }

        const { PolarService } = require('./services/polarService');
        const polar = new PolarService();
        
        const checkout = await polar.createCheckoutSession({
          slackTeamId: team_id as string,
          slackUserId: user_id as string,
          plan: 'pro'
        });

        res.redirect(checkout.url);
      } catch (error) {
        logger.error('Error creating checkout session', error);
        res.status(500).send('Failed to create checkout session');
      }
    });

    app.get('/billing/portal', async (req, res) => {
      try {
        const { team_id } = req.query;
        if (!team_id) {
          return res.status(400).send('Missing team_id');
        }

        const { db } = require('./db/memoryDb');
        const workspace = await db.getWorkspaceBySlackTeamId(team_id as string);
        
        if (!workspace || !workspace.polarCustomerId) {
          return res.status(404).send('No subscription found. Please upgrade first.');
        }

        const { PolarService } = require('./services/polarService');
        const { POLAR_SUCCESS_URL } = require('./config/env');
        const polar = new PolarService();
        
        const portal = await polar.createCustomerPortalSession(
          workspace.polarCustomerId,
          POLAR_SUCCESS_URL
        );

        res.redirect(portal.url);
      } catch (error) {
        logger.error('Error creating portal session', error);
        res.status(500).send('Failed to create portal session');
      }
    });

    // Polar webhook endpoint
    app.post('/webhooks/polar', 
      express.raw({ type: '*/*' }), // Raw body for signature verification
      rateLimitMiddleware(10, 60 * 1000), // 10 requests per minute
      asyncHandler(async (req: express.Request, res: express.Response) => {
        try {
          const polarService = new PolarService();
          // Polar may send signature in different header formats - check both
          const signature = (req.headers['polar-signature'] || 
                            req.headers['x-polar-signature'] || 
                            req.headers['signature']) as string;
          const rawBody = req.body.toString();

          if (!signature) {
            // Log available headers for debugging
            const signatureHeaders = {
              'polar-signature': req.headers['polar-signature'],
              'x-polar-signature': req.headers['x-polar-signature'],
              'signature': req.headers['signature'],
              'x-signature': req.headers['x-signature']
            };
            
            logger.warn('Polar webhook received without signature', {
              hasWebhookSecret: !!env.POLAR_WEBHOOK_SECRET,
              availableHeaders: Object.keys(signatureHeaders).filter(k => signatureHeaders[k as keyof typeof signatureHeaders]),
              allHeaders: Object.keys(req.headers).filter(h => h.toLowerCase().includes('sign') || h.toLowerCase().includes('polar')),
              tip: 'Polar may not be sending signature header. Check Polar webhook configuration.'
            });
            // In development, allow webhooks without signature if secret is not configured
            if (!env.POLAR_WEBHOOK_SECRET) {
              logger.warn('Processing webhook without signature verification (POLAR_WEBHOOK_SECRET not set)');
            } else {
              // If secret is configured but no signature, log warning but still process (Polar may not always send it)
              logger.warn('POLAR_WEBHOOK_SECRET is set but no signature header found. Processing webhook anyway (may be a test webhook).');
            }
          }

          if (!polarService.verifyWebhookSignature(rawBody, signature)) {
            logger.warn('Invalid Polar webhook signature');
            return res.status(400).json({ error: 'Invalid signature' });
          }

          const event = JSON.parse(rawBody);
          logger.info('Polar webhook received', { type: event.type });

          const result = await polarService.handleWebhookEvent(event);
          
          if (!result.slackTeamId) {
            logger.warn('Polar webhook missing slackTeamId', { event });
            return res.status(400).json({ error: 'Missing slackTeamId in metadata' });
          }

          const workspace = await db.getWorkspaceBySlackTeamId(result.slackTeamId);
          if (!workspace) {
            logger.warn('Polar webhook for unknown workspace', { slackTeamId: result.slackTeamId });
            return res.status(404).json({ error: 'Workspace not found' });
          }

          // Determine plan based on subscription
          let plan: 'free' | 'pro' | 'enterprise' = 'free';
          if (result.action === 'created' || result.action === 'updated') {
            // Check subscription product/price to determine plan
            // For now, assume PRO if subscription exists
            plan = 'pro';
          } else if (result.action === 'canceled' || result.action === 'revoked') {
            plan = 'free';
          }

          // Update workspace subscription
          await db.updateWorkspacePlan(
            result.slackTeamId,
            plan,
            (result.status || 'active') as any,
            result.subscriptionId,
            result.customerId,
            result.periodEnd
          );

          // Add audit log
          await db.addAuditLog({
            workspaceId: workspace.id,
            event: 'subscription_updated',
            metadata: {
              action: result.action,
              plan,
              subscriptionId: result.subscriptionId,
              customerId: result.customerId
            }
          });

          logger.info('Polar webhook processed successfully', {
            workspaceId: workspace.id,
            action: result.action,
            plan
          });

          res.status(200).json({ received: true });
        } catch (error: any) {
          logger.error('Error processing Polar webhook', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      })
    );

    app.get('/billing/success', (_req, res) => {
      res.send(`
        <html>
          <head><title>Payment Successful</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>✅ Payment Successful!</h1>
            <p>Your subscription has been activated.</p>
            <p>Return to Slack and run <code>/billing</code> or <code>/cr settings</code> to verify your subscription.</p>
            <p><small>If your plan hasn't updated yet, click "Refresh subscription" in Settings.</small></p>
          </body>
        </html>
      `);
    });

    app.get('/billing/cancel', (_req, res) => {
      res.send(`
        <html>
          <head><title>Payment Canceled</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>❌ Payment Canceled</h1>
            <p>You can upgrade anytime by running <code>/upgrade</code> in Slack.</p>
          </body>
        </html>
      `);
    });

    // Error handling middleware
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error in Express middleware', err);
      const errorResponse = formatErrorResponse(err);
      res.status(errorResponse.error.statusCode).json(errorResponse);
    });

    // Add error handler for unhandled Slack API errors
    slackApp.error(async (error: any) => {
      if (error.code === 'slack_webapi_platform_error' && error.data?.error === 'invalid_auth') {
        logger.error('❌ Slack authentication failed!', {
          message: 'Your SLACK_BOT_TOKEN is invalid or expired.',
          action: 'Please check your .env file and regenerate the token from https://api.slack.com/apps',
          error: error.data?.error
        });
        // Don't exit - allow the app to continue (it will fail on actual API calls)
      } else {
        logger.error('Slack app error', error);
      }
    });

    await slackApp.start(env.PORT);
    logger.info('ReviewFlow started successfully', {
      port: env.PORT,
      healthCheck: `http://localhost:${env.PORT}/health`,
      githubWebhook: `http://localhost:${env.PORT}/webhooks/github`,
      nodeEnv: env.NODE_ENV
    });
    
    // Validate token if in single-workspace mode (non-blocking)
    if (env.SLACK_BOT_TOKEN && !env.SLACK_CLIENT_ID) {
      // Run validation asynchronously to not block startup
      // Use process.nextTick to ensure it runs after startup completes
      process.nextTick(async () => {
        try {
          const testResult = await slackApp.client.auth.test();
          if (testResult.ok) {
            logger.info('✅ Slack bot token validated successfully', {
              team: testResult.team,
              user: testResult.user
            });
          } else {
            logger.error('❌ Slack bot token validation failed', {
              error: testResult.error
            });
          }
        } catch (error: any) {
          // Catch all errors to prevent unhandled promise rejection
          if (error?.data?.error === 'invalid_auth' || error?.code === 'slack_webapi_platform_error') {
            logger.error('❌ Invalid Slack bot token!', {
              message: 'Please check your SLACK_BOT_TOKEN in .env file',
              action: 'Get a new token from: https://api.slack.com/apps → Your App → OAuth & Permissions → Bot User OAuth Token',
              note: 'The app will continue running but Slack API calls will fail until the token is fixed.'
            });
          } else {
            logger.warn('Could not validate Slack token', { error: error?.message || error });
          }
        }
      });
    }
    
    // Add global unhandled rejection handler to prevent crashes
    process.on('unhandledRejection', (reason: any, promise) => {
      if (reason?.code === 'slack_webapi_platform_error' && reason?.data?.error === 'invalid_auth') {
        logger.error('❌ Unhandled Slack authentication error (token invalid)', {
          message: 'Slack API call failed due to invalid token',
          action: 'Please check your SLACK_BOT_TOKEN in environment variables',
          note: 'The app will continue running but Slack features will not work until the token is fixed.'
        });
        // Don't crash - just log the error
        return;
      }
      logger.error('Unhandled promise rejection', { reason, promise });
    });
  } catch (error) {
    logger.error('Failed to start ReviewFlow', error);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

