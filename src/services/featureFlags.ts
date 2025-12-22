// Feature flags and billing readiness
import { env } from '../config/env';
import { logger } from '../utils/logger';

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

// Default feature flags (free tier)
const defaultFlags: FeatureFlags = {
  multiTeam: true,
  analytics: true,
  reminders: true,
  jiraIntegration: true,
  customWorkflows: false,
  advancedAnalytics: false,
  apiAccess: false,
  maxTeams: 3,
  maxMembersPerTeam: 10,
  maxReposPerTeam: 10
};

// Premium feature flags
const premiumFlags: FeatureFlags = {
  ...defaultFlags,
  customWorkflows: true,
  advancedAnalytics: true,
  apiAccess: true,
  maxTeams: 999,
  maxMembersPerTeam: 999,
  maxReposPerTeam: 999
};

let currentFlags: FeatureFlags = defaultFlags;

/**
 * Initialize feature flags based on subscription tier
 */
export function initFeatureFlags(): void {
  const tier = process.env.SUBSCRIPTION_TIER || 'free';
  
  switch (tier.toLowerCase()) {
    case 'premium':
    case 'pro':
      currentFlags = premiumFlags;
      logger.info('Premium features enabled');
      break;
    case 'enterprise':
      currentFlags = { ...premiumFlags, maxTeams: 9999, maxMembersPerTeam: 9999, maxReposPerTeam: 9999 };
      logger.info('Enterprise features enabled');
      break;
    default:
      currentFlags = defaultFlags;
      logger.info('Free tier features enabled');
  }
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  if (feature === 'maxTeams' || feature === 'maxMembersPerTeam' || feature === 'maxReposPerTeam') {
    return true; // Limits are always "enabled", just checked differently
  }
  return currentFlags[feature] === true;
}

/**
 * Get feature limits
 */
export function getFeatureLimit(limit: 'maxTeams' | 'maxMembersPerTeam' | 'maxReposPerTeam'): number {
  return currentFlags[limit];
}

/**
 * Check if limit is exceeded
 */
export async function checkLimit(
  limit: 'maxTeams' | 'maxMembersPerTeam' | 'maxReposPerTeam',
  currentCount: number
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const maxLimit = getFeatureLimit(limit);
  return {
    allowed: currentCount < maxLimit,
    limit: maxLimit,
    current: currentCount
  };
}

/**
 * Get all feature flags (for display)
 */
export function getFeatureFlags(): FeatureFlags {
  return { ...currentFlags };
}

/**
 * Get subscription tier
 */
export function getSubscriptionTier(): string {
  return process.env.SUBSCRIPTION_TIER || 'free';
}

