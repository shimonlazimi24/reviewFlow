import express from 'express';
import bodyParser from 'body-parser';
import { App, ExpressReceiver } from '@slack/bolt';
import { env } from './config/env';
import { registerSlackHandlers } from './slack/handlers';
import { githubWebhookHandlerFactory } from './github/webhookHandler';

async function main() {
  try {
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
      console.error('Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    await slackApp.start(env.PORT);
    console.log(`⚡ ReviewFlow running on port ${env.PORT}`);
    console.log(`📊 Health check: http://localhost:${env.PORT}/health`);
    console.log(`🔗 GitHub webhook: http://localhost:${env.PORT}/webhooks/github`);
  } catch (error) {
    console.error('Failed to start ReviewFlow:', error);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

