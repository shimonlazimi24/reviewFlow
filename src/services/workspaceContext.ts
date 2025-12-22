// Workspace context service - loads workspace, subscription, and limits per request
import { db } from '../db/memoryDb';
import { SubscriptionPlan, SubscriptionStatus, PLAN_LIMITS, FeatureLimits } from '../types/subscription';
import { logger } from '../utils/logger';

export interface WorkspaceContext {
  workspaceId: string;
  slackTeamId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  limits: FeatureLimits;
  usage: {
    prsProcessed: number;
    limit: number;
    resetAt: number;
  };
  githubInstallationId?: string;
  currentPeriodEnd?: number;
}

/**
 * Load workspace context for a Slack team
 */
export async function loadWorkspaceContext(slackTeamId: string): Promise<WorkspaceContext> {
  try {
    // Get or create workspace
    let workspace = await db.getWorkspaceBySlackTeamId(slackTeamId);
    
    if (!workspace) {
      // Create default workspace
      const workspaceId = `workspace_${slackTeamId}`;
      workspace = {
        id: workspaceId,
        slackTeamId,
        plan: 'free',
        subscriptionStatus: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await db.addWorkspace(workspace);
      
      // Create default FREE subscription (legacy)
      await db.upsertSubscription({
        workspaceId,
        plan: SubscriptionPlan.FREE,
        status: SubscriptionStatus.ACTIVE,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // Get subscription (use workspace plan if available, otherwise legacy subscription)
    let subscription = await db.getSubscription(workspace.id);
    if (!subscription) {
      // Create default FREE subscription (legacy)
      subscription = {
        workspaceId: workspace.id,
        plan: workspace.plan === 'pro' ? SubscriptionPlan.PRO : workspace.plan === 'enterprise' ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE,
        status: workspace.subscriptionStatus === 'active' ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELED,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await db.upsertSubscription(subscription);
    }
    
    // Use workspace plan if available (new billing model)
    const plan = workspace.plan === 'pro' ? SubscriptionPlan.PRO : 
                 workspace.plan === 'enterprise' ? SubscriptionPlan.ENTERPRISE : 
                 SubscriptionPlan.FREE;
    const status = workspace.subscriptionStatus === 'active' ? SubscriptionStatus.ACTIVE :
                   workspace.subscriptionStatus === 'canceled' ? SubscriptionStatus.CANCELED :
                   workspace.subscriptionStatus === 'past_due' ? SubscriptionStatus.PAST_DUE :
                   SubscriptionStatus.ACTIVE;

    // Get current month usage
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let usage = await db.getUsage(workspace.id, month);
    
    if (!usage) {
      const subscriptionPlan = subscription.plan as SubscriptionPlan;
      usage = {
        workspaceId: workspace.id,
        month,
        prsProcessed: 0,
        limit: PLAN_LIMITS[subscriptionPlan].maxPRsPerMonth,
        resetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
      };
    }

    const limits = PLAN_LIMITS[plan];

    return {
      workspaceId: workspace.id,
      slackTeamId: workspace.slackTeamId,
      plan,
      status,
      limits,
      usage: {
        prsProcessed: usage.prsProcessed,
        limit: usage.limit,
        resetAt: usage.resetAt
      },
      githubInstallationId: workspace.githubInstallationId,
      currentPeriodEnd: workspace.currentPeriodEnd || subscription.currentPeriodEnd
    };
  } catch (error) {
    logger.error('Failed to load workspace context', error);
    // Return default FREE context on error
    return {
      workspaceId: `workspace_${slackTeamId}`,
      slackTeamId,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      limits: PLAN_LIMITS[SubscriptionPlan.FREE],
      usage: {
        prsProcessed: 0,
        limit: 50,
        resetAt: Date.now() + 30 * 24 * 60 * 60 * 1000
      }
    };
  }
}

/**
 * Check if feature is available for plan
 */
export function hasFeature(context: WorkspaceContext, feature: keyof FeatureLimits): boolean {
  if (context.status !== SubscriptionStatus.ACTIVE && context.status !== SubscriptionStatus.TRIALING) {
    return false;
  }
  return context.limits[feature] === true || (typeof context.limits[feature] === 'number' && context.limits[feature] > 0);
}

/**
 * Check if usage limit is exceeded
 */
export function isUsageLimitExceeded(context: WorkspaceContext): boolean {
  return context.usage.prsProcessed >= context.usage.limit;
}

