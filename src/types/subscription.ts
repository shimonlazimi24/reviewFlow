// Subscription and billing types
export enum SubscriptionPlan {
  FREE = 'FREE',
  PRO = 'PRO',
  TEAM = 'TEAM',
  ENTERPRISE = 'ENTERPRISE'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing'
}

export interface WorkspaceSubscription {
  workspaceId: string; // Slack workspace ID
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  polarSubscriptionId?: string; // Polar.sh subscription ID
  currentPeriodStart?: number; // Unix timestamp
  currentPeriodEnd?: number; // Unix timestamp
  cancelAtPeriodEnd?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceUsage {
  workspaceId: string;
  month: string; // Format: "2024-01"
  prsProcessed: number;
  limit: number;
  resetAt: number; // Unix timestamp
}

export interface FeatureLimits {
  maxTeams: number;
  maxMembersPerTeam: number;
  maxReposPerTeam: number;
  maxPRsPerMonth: number;
  jiraIntegration: boolean;
  autoBalance: boolean;
  reminders: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  customWorkflows: boolean;
}

// Plan limits configuration
export const PLAN_LIMITS: Record<SubscriptionPlan, FeatureLimits> = {
  [SubscriptionPlan.FREE]: {
    maxTeams: 1,
    maxMembersPerTeam: 5,
    maxReposPerTeam: 3,
    maxPRsPerMonth: 50,
    jiraIntegration: false,
    autoBalance: false,
    reminders: false,
    advancedAnalytics: false,
    apiAccess: false,
    customWorkflows: false
  },
  [SubscriptionPlan.PRO]: {
    maxTeams: 5,
    maxMembersPerTeam: 20,
    maxReposPerTeam: 20,
    maxPRsPerMonth: 500,
    jiraIntegration: true,
    autoBalance: true,
    reminders: true,
    advancedAnalytics: true,
    apiAccess: false,
    customWorkflows: false
  },
  [SubscriptionPlan.TEAM]: {
    maxTeams: 20,
    maxMembersPerTeam: 100,
    maxReposPerTeam: 100,
    maxPRsPerMonth: 2000,
    jiraIntegration: true,
    autoBalance: true,
    reminders: true,
    advancedAnalytics: true,
    apiAccess: true,
    customWorkflows: true
  },
  [SubscriptionPlan.ENTERPRISE]: {
    maxTeams: 9999,
    maxMembersPerTeam: 9999,
    maxReposPerTeam: 9999,
    maxPRsPerMonth: 99999,
    jiraIntegration: true,
    autoBalance: true,
    reminders: true,
    advancedAnalytics: true,
    apiAccess: true,
    customWorkflows: true
  }
};

