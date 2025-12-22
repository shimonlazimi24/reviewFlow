import express from 'express';
import bodyParser from 'body-parser';
import { App, ExpressReceiver } from '@slack/bolt';
import { env, useDatabase } from './config/env';
import { validateEnvironment } from './config/validateEnv';
import { registerSlackHandlers } from './slack/handlers';
import { githubWebhookHandlerFactory } from './github/webhookHandler';
import { createDb } from './db/memoryDb';
import { logger } from './utils/logger';
import { formatErrorResponse, asyncHandler } from './utils/errors';

async function main() {
  try {
    // Validate environment first (fail fast)
    validateEnvironment();
    // Initialize database
    let db: any;
    if (useDatabase && env.DATABASE_URL) {
      db = createDb(true, env.DATABASE_URL);
      await db.init();
      logger.info('Connected to PostgreSQL database');
    } else {
      db = createDb(false);
      logger.warn('Using in-memory database (data will be lost on restart)', {
        tip: 'Add DATABASE_URL environment variable to enable persistence'
      });
    }

    // Set global db instance
    const memoryDbModule = require('./db/memoryDb');
    memoryDbModule.db = db;
    const receiver = new ExpressReceiver({ 
      signingSecret: env.SLACK_SIGNING_SECRET,
      processBeforeResponse: true
    });

    const slackApp = new App({
      token: env.SLACK_BOT_TOKEN,
      receiver
    });

    registerSlackHandlers(slackApp);

    const app = receiver.app as express.Express;
    
    // Middleware
    app.use(bodyParser.json({ type: '*/*' }));
    app.use(express.json());

    // Health check
    app.get('/health', (_req, res) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // GitHub webhook endpoint
    app.post('/webhooks/github', githubWebhookHandlerFactory({ slackApp }));

    // Error handling middleware
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error in Express middleware', err);
      const errorResponse = formatErrorResponse(err);
      res.status(errorResponse.error.statusCode).json(errorResponse);
    });

    await slackApp.start(env.PORT);
    logger.info('ReviewFlow started successfully', {
      port: env.PORT,
      healthCheck: `http://localhost:${env.PORT}/health`,
      githubWebhook: `http://localhost:${env.PORT}/webhooks/github`,
      nodeEnv: env.NODE_ENV
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

