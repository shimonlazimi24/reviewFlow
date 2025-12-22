// Feature gating middleware
import { Request, Response, NextFunction } from 'express';
import { loadWorkspaceContext, hasFeature, isUsageLimitExceeded } from '../services/workspaceContext';
import { FeatureLimits } from '../types/subscription';
import { logger } from '../utils/logger';

/**
 * Require a specific feature to be available
 */
export function requireFeature(featureName: keyof FeatureLimits) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract workspace ID from request
      // For Slack requests, get from team_id
      // For GitHub webhooks, get from installation
      const slackTeamId = (req.body as any)?.team_id || (req.body as any)?.team?.id;
      
      if (!slackTeamId) {
        return res.status(400).json({
          error: 'Missing workspace identifier',
          message: 'Unable to determine workspace for feature check'
        });
      }

      const context = await loadWorkspaceContext(slackTeamId);

      if (!hasFeature(context, featureName)) {
        logger.warn('Feature access denied', {
          workspaceId: context.workspaceId,
          feature: featureName,
          plan: context.plan
        });

        return res.status(403).json({
          error: 'Feature not available',
          message: `This feature requires a ${getRequiredPlan(featureName)} plan or higher.`,
          currentPlan: context.plan,
          requiredPlan: getRequiredPlan(featureName),
          upgradeUrl: getUpgradeUrl(context.workspaceId)
        });
      }

      // Attach context to request for use in handlers
      (req as any).workspaceContext = context;
      next();
    } catch (error) {
      logger.error('Error in feature gate middleware', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to check feature availability'
      });
    }
  };
}

/**
 * Check usage limits
 */
export async function checkUsageLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const slackTeamId = (req.body as any)?.team_id || (req.body as any)?.team?.id;
    
    if (!slackTeamId) {
      return next(); // Skip if no workspace ID
    }

    const context = await loadWorkspaceContext(slackTeamId);

    if (isUsageLimitExceeded(context)) {
      logger.warn('Usage limit exceeded', {
        workspaceId: context.workspaceId,
        plan: context.plan,
        usage: context.usage
      });

      return res.status(429).json({
        error: 'Usage limit exceeded',
        message: `You've reached your monthly limit of ${context.usage.limit} PRs. Upgrade to continue.`,
        currentUsage: context.usage.prsProcessed,
        limit: context.usage.limit,
        resetAt: context.usage.resetAt,
        upgradeUrl: getUpgradeUrl(context.workspaceId)
      });
    }

    (req as any).workspaceContext = context;
    next();
  } catch (error) {
    logger.error('Error in usage limit check', error);
    next(); // Continue on error
  }
}

/**
 * Get required plan for a feature
 */
function getRequiredPlan(feature: keyof FeatureLimits): string {
  const planFeatures: Record<string, Array<keyof FeatureLimits>> = {
    PRO: ['jiraIntegration', 'autoBalance', 'reminders', 'advancedAnalytics'],
    TEAM: ['apiAccess', 'customWorkflows']
  };

  for (const [plan, features] of Object.entries(planFeatures)) {
    if (features.includes(feature)) {
      return plan;
    }
  }

  return 'PRO';
}

/**
 * Get upgrade URL
 */
function getUpgradeUrl(workspaceId: string): string {
  const polarBaseUrl = process.env.POLAR_BASE_URL || 'https://polar.sh';
  return `${polarBaseUrl}/checkout?workspace=${workspaceId}`;
}

