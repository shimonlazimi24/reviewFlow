// Feature flags and billing readiness - per-workspace
import { db } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { SubscriptionPlan, PLAN_LIMITS } from '../types/subscription';

export interface FeatureFlags {
  // Core features
  multiTeam: boolean;
  analytics: boolean;
  reminders: boolean;
  jiraIntegration: boolean;
  
  // Advanced features
  customWorkflows: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  
  // Limits
  maxTeams: number;
  maxMembersPerTeam: number;
  maxReposPerTeam: number;
}

/**
 * Get workspace subscription tier
 */
export async function getWorkspaceTier(slackTeamId: string): Promise<'free' | 'pro' | 'enterprise'> {
  try {
    const workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
    if (!workspace) {
      return 'free';
    }
    
    const subscription = await db.getSubscription(workspace.id);
    if (!subscription) {
      return 'free';
    }
    
    const plan = subscription.plan;
    if (plan === 'PRO') return 'pro';
    if (plan === 'TEAM' || plan === 'ENTERPRISE') return 'enterprise';
    return 'free';
  } catch (error) {
    logger.error('Failed to get workspace tier', error);
    return 'free';
  }
}

/**
 * Get workspace feature flags
 */
export async function getWorkspaceFlags(slackTeamId: string): Promise<FeatureFlags> {
  const tier = await getWorkspaceTier(slackTeamId);
  const limits = PLAN_LIMITS[tier === 'pro' ? 'PRO' : tier === 'enterprise' ? 'ENTERPRISE' : 'FREE'];
  
  return {
    multiTeam: limits.maxTeams > 1,
    analytics: true, // Basic analytics always available
    reminders: limits.reminders,
    jiraIntegration: limits.jiraIntegration,
    customWorkflows: limits.customWorkflows,
    advancedAnalytics: limits.advancedAnalytics,
    apiAccess: limits.apiAccess,
    maxTeams: limits.maxTeams,
    maxMembersPerTeam: limits.maxMembersPerTeam,
    maxReposPerTeam: limits.maxReposPerTeam
  };
}

/**
 * Check workspace limit
 */
export async function checkWorkspaceLimit(
  slackTeamId: string,
  limit: 'maxTeams' | 'maxMembersPerTeam' | 'maxReposPerTeam',
  currentCount: number
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const flags = await getWorkspaceFlags(slackTeamId);
  const maxLimit = flags[limit];
  
  return {
    allowed: currentCount < maxLimit,
    limit: maxLimit,
    current: currentCount
  };
}

/**
 * Assert feature is available (throws if not)
 */
export class UpgradeRequiredError extends Error {
  constructor(public feature: string, public currentPlan: string, public requiredPlan: string) {
    super(`Feature "${feature}" requires ${requiredPlan} plan. Current plan: ${currentPlan}`);
    this.name = 'UpgradeRequiredError';
  }
}

/**
 * Assert feature is available for workspace
 */
export async function assertFeature(slackTeamId: string, featureKey: keyof FeatureFlags): Promise<void> {
  const flags = await getWorkspaceFlags(slackTeamId);
  const tier = await getWorkspaceTier(slackTeamId);
  
  if (!flags[featureKey]) {
    const requiredPlan = featureKey === 'customWorkflows' || featureKey === 'apiAccess' ? 'TEAM' : 'PRO';
    throw new UpgradeRequiredError(featureKey, tier.toUpperCase(), requiredPlan);
  }
}

// Legacy functions for backward compatibility
export function initFeatureFlags(): void {
  logger.info('Feature flags initialized (per-workspace)');
}

export async function checkLimit(
  limit: 'maxTeams' | 'maxMembersPerTeam' | 'maxReposPerTeam',
  currentCount: number
): Promise<{ allowed: boolean; limit: number; current: number }> {
  // Default to free tier limits if no workspace context
  const limits = PLAN_LIMITS['FREE'];
  const maxLimit = limits[limit];
  return {
    allowed: currentCount < maxLimit,
    limit: maxLimit,
    current: currentCount
  };
}

