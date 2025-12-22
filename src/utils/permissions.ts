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
 * Check if a user is an admin
 */
export async function isAdmin(slackUserId: string, client?: any): Promise<boolean> {
  // Check explicit admin list
  if (adminConfig.adminSlackUserIds.includes(slackUserId)) {
    return true;
  }

  // Check if workspace admins are allowed
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
 * Require admin access - throws error if not admin
 */
export async function requireAdmin(slackUserId: string, client?: any): Promise<void> {
  const isUserAdmin = await isAdmin(slackUserId, client);
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

