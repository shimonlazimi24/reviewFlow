// GitHub App installation routes
import express from 'express';
import { db, Workspace } from '../db/memoryDb';
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

      // Get or create workspace
      logger.info('GitHub connect route called', { workspace_id });
      let workspace = await db.getWorkspace(workspace_id as string);
      logger.info('Workspace lookup by ID', { workspace_id, found: !!workspace });
      
      // If workspace doesn't exist, try to find it by slackTeamId (extracted from workspace_id format)
      if (!workspace) {
        // workspace_id format is usually "workspace_T0A4D4NF3RD"
        const slackTeamId = (workspace_id as string).replace(/^workspace_/, '');
        logger.info('Workspace not found by ID, trying slackTeamId', { slackTeamId });
        if (slackTeamId && slackTeamId !== workspace_id) {
          workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
          logger.info('Workspace lookup by slackTeamId', { slackTeamId, found: !!workspace });
        }
      }
      
      // If still not found, create a default workspace
      if (!workspace) {
        const slackTeamId = (workspace_id as string).replace(/^workspace_/, '') || 'unknown';
        const workspaceId = `workspace_${slackTeamId}`;
        logger.info('Creating new workspace for GitHub connection', { workspaceId, slackTeamId });
        try {
          workspace = {
            id: workspaceId,
            slackTeamId: slackTeamId,
            plan: 'free' as const,
            subscriptionStatus: 'active' as const,
            setupComplete: false,
            setupStep: 'channel',
            goLiveEnabled: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          await db.addWorkspace(workspace);
          logger.info('Successfully created workspace for GitHub connection', { workspaceId, slackTeamId });
        } catch (error: any) {
          logger.error('Failed to create workspace', error, { workspaceId, slackTeamId });
          return res.status(500).send(`
            <html>
              <head><title>Error</title></head>
              <body>
                <h1>Error Creating Workspace</h1>
                <p>Failed to create workspace: ${error.message}</p>
                <p>Please try again from Slack.</p>
              </body>
            </html>
          `);
        }
      }
      
      if (!workspace) {
        logger.error('Workspace still not found after creation attempt', { workspace_id });
        return res.status(500).send(`
          <html>
            <head><title>Error</title></head>
            <body>
              <h1>Workspace Error</h1>
              <p>Unable to create or find workspace. Please try again from Slack.</p>
            </body>
          </html>
        `);
      }
      
      logger.info('Workspace found/created, proceeding with GitHub connection', { workspaceId: workspace.id, slackTeamId: workspace.slackTeamId });

      // If GitHub App ID is configured, redirect to GitHub App installation
      // Pass workspace_id as state parameter so we can link it after installation
      if (env.GITHUB_APP_ID) {
        const installUrl = `https://github.com/apps/${env.GITHUB_APP_NAME || 'reviewflow'}/installations/new?state=${workspace.id}`;
        logger.info('Redirecting to GitHub App installation', { installUrl: installUrl.substring(0, 100) + '...', workspaceId: workspace.id });
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
      
      logger.info('GitHub installation callback received', { 
        installation_id, 
        setup_action, 
        state,
        hasState: !!state,
        allQueryParams: Object.keys(req.query),
        queryString: req.url
      });
      
      if (!installation_id) {
        logger.warn('GitHub callback missing installation_id', { query: req.query });
        return res.status(400).send(`
          <html>
            <head><title>Error</title></head>
            <body>
              <h1>❌ Missing Installation ID</h1>
              <p>The GitHub installation callback is missing the installation_id parameter.</p>
              <p>Please try installing the GitHub App again from the ReviewFlow Home Tab.</p>
              <p><a href="slack://open">Return to Slack</a></p>
            </body>
          </html>
        `);
      }

      const installationId = String(installation_id);
      let workspace: Workspace | undefined;

      // Try to find workspace by state (workspace_id)
      if (state) {
        workspace = await db.getWorkspace(state as string);
        // If not found by ID, try by slackTeamId
        if (!workspace) {
          const slackTeamId = (state as string).replace(/^workspace_/, '');
          if (slackTeamId && slackTeamId !== state) {
            workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
          }
        }
      }

      // If still not found, try to find any workspace without GitHub connection
      // (for cases where state wasn't passed)
      if (!workspace) {
        logger.warn('Workspace not found from state, searching for workspace without GitHub', { 
          state,
          installationId 
        });
        const allWorkspaces = await db.listWorkspaces();
        logger.info('Searching workspaces', { 
          totalWorkspaces: allWorkspaces.length,
          workspacesWithoutGitHub: allWorkspaces.filter((w: any) => !w.githubInstallationId).length
        });
        // Find workspace that doesn't have GitHub connected yet (most recent one)
        workspace = allWorkspaces
          .filter((w: any) => !w.githubInstallationId)
          .sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
        
        if (workspace) {
          logger.info('Found workspace without GitHub to link', {
            workspaceId: workspace.id,
            slackTeamId: workspace.slackTeamId,
            createdAt: workspace.createdAt
          });
        } else {
          logger.warn('No workspace found without GitHub connection', {
            totalWorkspaces: allWorkspaces.length,
            allHaveGitHub: allWorkspaces.every((w: any) => w.githubInstallationId)
          });
        }
      }

      if (workspace) {
        // Update workspace with GitHub installation ID
        await db.updateWorkspace(workspace.id, {
          githubInstallationId: installationId,
          githubAccount: req.query.account?.toString() || undefined,
          updatedAt: Date.now()
        });

        // Also update workspace settings
        const settings = await db.getWorkspaceSettings(workspace.slackTeamId);
        if (settings) {
          await db.upsertWorkspaceSettings({
            ...settings,
            githubInstallationId: installationId,
            updatedAt: Date.now()
          });
        }

        logger.info('GitHub installation connected to workspace', { 
          workspaceId: workspace.id, 
          slackTeamId: workspace.slackTeamId,
          installationId 
        });

        // Try to refresh Home Tab for all users in the workspace (if Slack App is available)
        // Note: This requires Slack App instance, which we don't have here
        // Users will need to manually refresh the Home Tab
      } else {
        logger.warn('Could not find workspace to link GitHub installation', { installationId, state });
      }

      const successMessage = workspace
        ? `<div class="success">
            <h1>✅ GitHub Connected Successfully!</h1>
            <p>ReviewFlow is now connected to your GitHub repositories.</p>
            <p><strong>Installation ID:</strong> ${installationId}</p>
            <p>Return to Slack and refresh the Home Tab to see the updated status.</p>
          </div>`
        : `<div class="warning">
            <h1>⚠️ Installation Received</h1>
            <p>GitHub App was installed, but we couldn't automatically link it to your workspace.</p>
            <p>Please return to Slack and try connecting again, or contact support.</p>
          </div>`;

      res.send(`
        <html>
          <head>
            <title>GitHub Connected - ReviewFlow</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              h1 { color: #4CAF50; }
              .success { background: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; }
              .warning { background: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; }
              .warning h1 { color: #856404; }
            </style>
          </head>
          <body>
            ${successMessage}
            <p><a href="slack://open">Return to Slack</a></p>
            <p><small>💡 Tip: Refresh the ReviewFlow Home Tab to see the updated connection status.</small></p>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error('Error in GitHub callback', error);
      res.status(500).send('An error occurred. Please try again.');
    }
  });
}

