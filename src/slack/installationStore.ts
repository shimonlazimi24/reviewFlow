// Slack InstallationStore for OAuth multi-workspace support
import { Installation, InstallationQuery } from '@slack/bolt';
import { db } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { encrypt, decrypt } from '../utils/encryption';

export class PostgresInstallationStore {
  async storeInstallation(installation: Installation, logger?: any): Promise<void> {
    try {
      const teamId = installation.team?.id;
      if (!teamId) {
        throw new Error('Missing team ID in installation');
      }

      // Encrypt bot token before storage
      const encryptedToken = installation.bot?.token ? encrypt(installation.bot.token) : '';

      await db.upsertSlackInstallation({
        teamId,
        botToken: encryptedToken,
        botId: installation.bot?.id,
        botUserId: installation.bot?.userId,
        installerUserId: installation.user?.id,
        teamName: installation.team?.name,
        installedAt: Date.now(),
        updatedAt: Date.now()
      });

      // Also create/update workspace
      let workspace = await db.getWorkspaceBySlackTeamId(teamId);
      const installerUserId = installation.user?.id;
      if (!workspace) {
        workspace = {
          id: `workspace_${teamId}`,
          slackTeamId: teamId,
          name: installation.team?.name,
          plan: 'free',
          subscriptionStatus: 'active',
          installerUserId: installerUserId, // Store installer as first admin
          setupComplete: false, // Setup wizard not complete
          setupStep: 'channel', // Start with channel selection
          goLiveEnabled: false, // PR processing disabled until Go Live
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await db.addWorkspace(workspace);
        
        // Create default workspace settings
        await db.upsertWorkspaceSettings({
          slackTeamId: teamId,
          requiredReviewers: 2,
          reminderHours: 24,
          reminderEscalationHours: 48,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } else {
        // Update installer if not set
        const updates: any = {
          name: installation.team?.name,
          updatedAt: Date.now()
        };
        if (!workspace.installerUserId && installerUserId) {
          updates.installerUserId = installerUserId;
        }
        await db.updateWorkspace(workspace.id, updates);
      }

      logger?.info('Slack installation stored', { teamId });
    } catch (error) {
      logger?.error('Error storing Slack installation', error);
      throw error;
    }
  }

  async fetchInstallation(query: InstallationQuery<boolean>, logger?: any): Promise<Installation> {
    try {
      const teamId = query.teamId;
      if (!teamId) {
        throw new Error('Missing team ID in query');
      }

      const installationData = await db.getSlackInstallation(teamId);
      if (!installationData) {
        throw new Error(`Installation not found for team: ${teamId}`);
      }

      // Decrypt bot token
      const botToken = installationData.botToken ? decrypt(installationData.botToken) : '';

      const scopes = ['app_mentions:read', 'channels:history', 'channels:read', 'chat:write', 'chat:write.public', 'commands', 'im:history', 'im:read', 'im:write', 'users:read', 'users:read.email'];
      
      const installation = {
        team: {
          id: installationData.teamId,
          name: installationData.teamName || undefined
        },
        bot: {
          id: installationData.botId || '',
          userId: installationData.botUserId || '',
          token: botToken,
          scopes: scopes,
          refreshToken: undefined,
          expiresAt: undefined
        },
        user: installationData.installerUserId ? {
          id: installationData.installerUserId,
          token: undefined,
          scopes: [],
          refreshToken: undefined,
          expiresAt: undefined
        } : undefined,
        isEnterpriseInstall: false,
        enterprise: undefined,
        tokenType: 'bot' as const,
        appId: undefined,
        authVersion: 'v2' as const,
        botToken: botToken,
        userToken: undefined
      } as Installation;

      return installation;
    } catch (error) {
      logger?.error('Error fetching Slack installation', error);
      throw error;
    }
  }

  async deleteInstallation(query: InstallationQuery<boolean>, logger?: any): Promise<void> {
    try {
      const teamId = query.teamId;
      if (!teamId) {
        throw new Error('Missing team ID in query');
      }

      await db.deleteSlackInstallation(teamId);
      logger?.info('Slack installation deleted', { teamId });
    } catch (error) {
      logger?.error('Error deleting Slack installation', error);
      throw error;
    }
  }
}

