// Permission and security utilities
import { db } from '../db/memoryDb';
import { logger } from './logger';

export interface AdminConfig {
  adminSlackUserIds: string[]; // List of Slack user IDs who are admins
  allowAllAdmins: boolean; // If true, all workspace admins are considered admins
}

// Default admin configuration
let adminConfig: AdminConfig = {
  adminSlackUserIds: [],
  allowAllAdmins: false
};

/**
 * Initialize admin configuration from environment variables
 */
export function initAdminConfig(): void {
  const adminIds = process.env.ADMIN_SLACK_USER_IDS?.split(',').filter(Boolean) || [];
  const allowAll = process.env.ALLOW_ALL_WORKSPACE_ADMINS === 'true';

  adminConfig = {
    adminSlackUserIds: adminIds,
    allowAllAdmins: allowAll
  };

  if (adminConfig.adminSlackUserIds.length > 0) {
    logger.info('Admin configuration loaded', {
      adminCount: adminConfig.adminSlackUserIds.length,
      allowAllAdmins: allowAll
    });
  }
}

/**
 * Check if a user is a workspace admin (installer or Slack workspace admin/owner)
 */
export async function isWorkspaceAdmin(slackUserId: string, slackTeamId: string, client?: any): Promise<boolean> {
  // Check explicit admin list (global admins)
  if (adminConfig.adminSlackUserIds.includes(slackUserId)) {
    return true;
  }

  // Check if user is the installer for this workspace
  const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
  if (workspace?.installerUserId === slackUserId) {
    return true;
  }

  // Check if workspace admins are allowed and user is workspace admin/owner
  if (adminConfig.allowAllAdmins && client) {
    try {
      const userInfo = await client.users.info({ user: slackUserId });
      if (userInfo.user?.is_admin || userInfo.user?.is_owner) {
        return true;
      }
    } catch (error) {
      logger.warn('Failed to check user admin status', error);
    }
  }

  return false;
}

/**
 * Check if a user is an admin (legacy function, now uses workspace admin check)
 */
export async function isAdmin(slackUserId: string, client?: any, slackTeamId?: string): Promise<boolean> {
  // If slackTeamId provided, use workspace admin check
  if (slackTeamId) {
    return isWorkspaceAdmin(slackUserId, slackTeamId, client);
  }

  // Fallback to original logic for backward compatibility
  if (adminConfig.adminSlackUserIds.includes(slackUserId)) {
    return true;
  }

  if (adminConfig.allowAllAdmins && client) {
    try {
      const userInfo = await client.users.info({ user: slackUserId });
      if (userInfo.user?.is_admin || userInfo.user?.is_owner) {
        return true;
      }
    } catch (error) {
      logger.warn('Failed to check user admin status', error);
    }
  }

  return false;
}

/**
 * Require workspace admin access - throws error if not admin
 */
export async function requireWorkspaceAdmin(slackUserId: string, slackTeamId: string, client?: any): Promise<void> {
  const isUserAdmin = await isWorkspaceAdmin(slackUserId, slackTeamId, client);
  if (!isUserAdmin) {
    throw new Error('This action requires workspace admin privileges. Only the installer or workspace admins can perform setup.');
  }
}

/**
 * Require admin access - throws error if not admin (legacy)
 */
export async function requireAdmin(slackUserId: string, client?: any, slackTeamId?: string): Promise<void> {
  const isUserAdmin = slackTeamId 
    ? await isWorkspaceAdmin(slackUserId, slackTeamId, client)
    : await isAdmin(slackUserId, client);
  if (!isUserAdmin) {
    throw new Error('This command requires admin privileges. Contact your workspace administrator.');
  }
}

/**
 * Get admin configuration (for display purposes)
 */
export function getAdminConfig(): AdminConfig {
  return { ...adminConfig };
}

