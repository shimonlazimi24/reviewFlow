// GitHub App installation routes
import express from 'express';
import { db } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function registerGitHubConnectRoutes(app: express.Express) {
  // GitHub App installation page
  app.get('/connect/github', async (req, res) => {
    try {
      const { workspace_id } = req.query;
      
      if (!workspace_id) {
        return res.status(400).send(`
          <html>
            <head><title>GitHub Connection</title></head>
            <body>
              <h1>Missing Workspace ID</h1>
              <p>Please access this page from the ReviewFlow Home Tab in Slack.</p>
            </body>
          </html>
        `);
      }

      // Get workspace
      const workspace = await db.getWorkspace(workspace_id as string);
      if (!workspace) {
        return res.status(404).send(`
          <html>
            <head><title>Workspace Not Found</title></head>
            <body>
              <h1>Workspace Not Found</h1>
              <p>The workspace could not be found. Please try again from Slack.</p>
            </body>
          </html>
        `);
      }

      // If GitHub App ID is configured, redirect to GitHub App installation
      if (env.GITHUB_APP_ID) {
        const installUrl = `https://github.com/apps/${env.GITHUB_APP_NAME || 'reviewflow'}/installations/new`;
        return res.redirect(installUrl);
      }

      // Otherwise, show installation instructions
      res.send(`
        <html>
          <head>
            <title>Connect GitHub - ReviewFlow</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              h1 { color: #333; }
              .step { background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px; }
              .button { display: inline-block; background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px; }
            </style>
          </head>
          <body>
            <h1>🔗 Connect GitHub to ReviewFlow</h1>
            <div class="step">
              <h2>Step 1: Install GitHub App</h2>
              <p>Click the button below to install the ReviewFlow GitHub App on your repositories.</p>
              <a href="https://github.com/apps/reviewflow/installations/new" class="button">Install GitHub App</a>
            </div>
            <div class="step">
              <h2>Step 2: Select Repositories</h2>
              <p>After clicking install, select which repositories you want ReviewFlow to monitor.</p>
            </div>
            <div class="step">
              <h2>Step 3: Return to Slack</h2>
              <p>Once installed, return to Slack and the connection will be verified automatically.</p>
            </div>
            <p><a href="slack://open">Return to Slack</a></p>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error('Error in GitHub connect route', error);
      res.status(500).send('An error occurred. Please try again.');
    }
  });

  // GitHub App installation callback
  app.get('/connect/github/callback', async (req, res) => {
    try {
      const { installation_id, setup_action, state } = req.query;
      
      if (!installation_id) {
        return res.status(400).send('Missing installation_id');
      }

      // Extract workspace_id from state (if provided)
      const workspaceId = state as string | undefined;

      if (workspaceId) {
        // Update workspace with GitHub installation ID
        const workspace = await db.getWorkspace(workspaceId);
        if (workspace) {
          await db.updateWorkspace(workspace.id, {
            githubInstallationId: String(installation_id),
            updatedAt: Date.now()
          });
          logger.info('GitHub installation connected', { workspaceId, installationId: installation_id });
        }
      }

      res.send(`
        <html>
          <head>
            <title>GitHub Connected - ReviewFlow</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              h1 { color: #4CAF50; }
              .success { background: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="success">
              <h1>✅ GitHub Connected Successfully!</h1>
              <p>ReviewFlow is now connected to your GitHub repositories.</p>
              <p>Return to Slack to continue setup.</p>
            </div>
            <p><a href="slack://open">Return to Slack</a></p>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error('Error in GitHub callback', error);
      res.status(500).send('An error occurred. Please try again.');
    }
  });
}

