// Team and repository management handlers
import { App } from '@slack/bolt';
import { db, Team, RepoMapping } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { requireAdmin } from '../utils/permissions';
import { checkWorkspaceLimit } from '../services/featureFlags';

export function registerTeamHandlers(app: App) {
  // Helper to send response
  const sendResponse = async (client: any, channelId: string, userId: string, text: string, respond: any) => {
    try {
      if (channelId && channelId.startsWith('C')) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text
        });
      } else {
        await respond({
          text,
          response_type: 'ephemeral'
        });
      }
    } catch (err: any) {
      if (err.data?.error === 'not_in_channel' || err.code === 'slack_webapi_platform_error') {
        await respond({
          text,
          response_type: 'ephemeral'
        });
      } else {
        logger.error('Failed to send Slack response', err);
        throw err;
      }
    }
  };

  // Create team
  app.command('/create-team', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;

    try {
      // Require admin access
      await requireAdmin(userId, client);
      const args = command.text?.trim().split(' ') || [];
      if (args.length < 2) {
        await sendResponse(client, channelId, userId, 'Usage: /create-team <team-name> <slack-channel-id>\n\nExample: /create-team "Frontend Team" C0123456789', respond);
        return;
      }

      const [teamName, ...channelParts] = args;
      const slackChannelId = channelParts.join(' ');

      // Check team limit
      const slackTeamId = command.team_id;
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }
      const teams = await db.listTeams(workspace.id);
      const limitCheck = await checkWorkspaceLimit(slackTeamId, 'maxTeams', teams.length);
      if (!limitCheck.allowed) {
        await sendResponse(client, channelId, userId, `❌ Team limit exceeded. You have ${limitCheck.current} teams, maximum allowed: ${limitCheck.limit}.\n\nUpgrade to premium for unlimited teams.`, respond);
        return;
      }

      const newTeamId = `team_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const team: Team = {
        id: newTeamId,
        workspaceId: workspace.id,
        name: teamName,
        slackChannelId,
        createdAt: Date.now(),
        isActive: true
      };

      await db.addTeam(team);

      await sendResponse(client, channelId, userId, `✅ Created team "${teamName}" (ID: ${newTeamId})\nChannel: <#${slackChannelId}>`, respond);
    } catch (error) {
      logger.error('Error in /create-team command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to create team: ${(error as Error).message}`, respond);
    }
  });

  // List teams
  app.command('/list-teams', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const slackTeamId = command.team_id;

    try {
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }
      const teams = await db.listTeams(workspace.id);

      if (teams.length === 0) {
        await sendResponse(client, channelId, userId, '📋 No teams configured yet.\n\nUse `/create-team` to create a team.', respond);
        return;
      }

      const teamDetails = await Promise.all(teams.map(async (team: Team) => {
        const members = await db.listMembers(workspace.id, team.id);
        const repos = await db.listRepoMappings(workspace.id, team.id);
        const status = team.isActive ? '✅ Active' : '❌ Inactive';
        return `${status} *${team.name}* (ID: ${team.id})\n  Channel: <#${team.slackChannelId}>\n  Members: ${members.length}\n  Repositories: ${repos.length}`;
      }));

      await sendResponse(client, channelId, userId, `*👥 Teams (${teams.length}):*\n\n${teamDetails.join('\n\n')}`, respond);
    } catch (error) {
      logger.error('Error in /list-teams command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to list teams: ${(error as Error).message}`, respond);
    }
  });

  // Map repository to team
  app.command('/map-repo', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;

    try {
      // Require admin access
      await requireAdmin(userId, client);
      const args = command.text?.trim().split(' ') || [];
      if (args.length < 2) {
        await sendResponse(client, channelId, userId, 'Usage: `/map-repo <repo-full-name> <team-id>`\n\nExample: `/map-repo org/frontend-repo team_1234567890`\n\nUse `/list-teams` to find team IDs.', respond);
        return;
      }

      const [repoFullName, teamId] = args;

      const slackTeamId = command.team_id;
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }

      // Verify team exists
      const team = await db.getTeam(teamId);
      if (!team || team.workspaceId !== workspace.id) {
        await sendResponse(client, channelId, userId, `❌ Team not found: ${teamId}\n\nUse /list-teams to see available teams.`, respond);
        return;
      }

      // Check if repo is already mapped
      const existing = await db.getRepoMapping(workspace.id, repoFullName);
      if (existing) {
        await sendResponse(client, channelId, userId, `⚠️ Repository "${repoFullName}" is already mapped to team "${existing.teamId}".\n\nUse /unmap-repo ${repoFullName} to remove the mapping first.`, respond);
        return;
      }

      const mappingId = `repo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const mapping: RepoMapping = {
        id: mappingId,
        workspaceId: workspace.id,
        teamId,
        repoFullName,
        createdAt: Date.now()
      };

      await db.addRepoMapping(mapping);

      await sendResponse(client, channelId, userId, `✅ Mapped repository "${repoFullName}" to team "${team.name}"`, respond);
    } catch (error) {
      logger.error('Error in /map-repo command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to map repository: ${(error as Error).message}`, respond);
    }
  });

  // List repository mappings
  app.command('/list-repos', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;
    const slackTeamId = command.team_id;

    try {
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }

      const args = command.text?.trim();
      const filterTeamId = args || undefined;

      const repos = await db.listRepoMappings(workspace.id, filterTeamId);

      if (repos.length === 0) {
        const message = filterTeamId
          ? `📋 No repositories mapped to team "${filterTeamId}".\n\nUse /map-repo to map repositories.`
          : '📋 No repositories mapped yet.\n\nUse /map-repo to map repositories to teams.';
        await sendResponse(client, channelId, userId, message, respond);
        return;
      }

      const repoDetails = await Promise.all(repos.map(async (mapping: RepoMapping) => {
        const team = await db.getTeam(mapping.teamId);
        return `*${mapping.repoFullName}* → Team: ${team?.name || mapping.teamId} (${mapping.teamId})`;
      }));

      const header = filterTeamId
        ? `*📦 Repositories for Team (${repos.length}):*`
        : `*📦 All Repository Mappings (${repos.length}):*`;

      await sendResponse(client, channelId, userId, `${header}\n\n${repoDetails.join('\n')}`, respond);
    } catch (error) {
      logger.error('Error in /list-repos command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to list repositories: ${(error as Error).message}`, respond);
    }
  });

  // Unmap repository
  app.command('/unmap-repo', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;

    try {
      // Require admin access
      await requireAdmin(userId, client);
      const args = command.text?.trim();
      if (!args) {
        await sendResponse(client, channelId, userId, 'Usage: `/unmap-repo <repo-full-name>`\n\nExample: `/unmap-repo org/frontend-repo`', respond);
        return;
      }

      const slackTeamId = command.team_id;
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }

      const mapping = await db.getRepoMapping(workspace.id, args);
      if (!mapping) {
        await sendResponse(client, channelId, userId, `❌ Repository mapping not found: ${args}`, respond);
        return;
      }

      await db.removeRepoMapping(mapping.id);

      await sendResponse(client, channelId, userId, `✅ Removed mapping for repository "${args}"`, respond);
    } catch (error) {
      logger.error('Error in /unmap-repo command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to unmap repository: ${(error as Error).message}`, respond);
    }
  });

  // Assign member to team
  app.command('/assign-to-team', async ({ ack, command, client, respond }) => {
    await ack();
    const userId = command.user_id;
    const channelId = command.channel_id;

    try {
      // Require admin access
      await requireAdmin(userId, client);
      const args = command.text?.trim().split(' ') || [];
      if (args.length < 2) {
        await sendResponse(client, channelId, userId, 'Usage: /assign-to-team <slack-user-id> <team-id>\n\nExample: /assign-to-team U01234567 team_1234567890\n\nUse /list-teams to find team IDs.', respond);
        return;
      }

      const [slackUserId, teamId] = args;

      // Verify team exists
      const team = await db.getTeam(teamId);
      if (!team) {
        await sendResponse(client, channelId, userId, `❌ Team not found: ${teamId}`, respond);
        return;
      }

      const slackTeamId = command.team_id;
      if (!slackTeamId) {
        await sendResponse(client, channelId, userId, '❌ Missing Slack Team ID', respond);
        return;
      }
      const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
      if (!workspace) {
        await sendResponse(client, channelId, userId, '❌ Workspace not found', respond);
        return;
      }

      // Find member
      const members = await db.listMembers(workspace.id);
      const member = members.find((m: any) => m.slackUserId === slackUserId);

      if (!member) {
        await sendResponse(client, channelId, userId, `❌ Member not found: <@${slackUserId}>\n\nUse /add-reviewer to add them first.`, respond);
        return;
      }

      await db.updateMember(member.id, { teamId });

      await sendResponse(client, channelId, userId, `✅ Assigned <@${slackUserId}> to team "${team.name}"`, respond);
    } catch (error) {
      logger.error('Error in /assign-to-team command', error);
      await sendResponse(client, channelId, userId, `❌ Failed to assign member: ${(error as Error).message}`, respond);
    }
  });
}

