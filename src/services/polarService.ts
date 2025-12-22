// Polar.sh billing integration service
import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { SubscriptionPlan, SubscriptionStatus } from '../types/subscription';
import { db } from '../db/memoryDb';

export interface PolarWebhookEvent {
  type: 'subscription.created' | 'subscription.updated' | 'subscription.canceled';
  data: {
    id: string;
    customer_id?: string;
    product_id?: string;
    status: string;
    metadata?: Record<string, string>;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  };
}

export class PolarService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = env.POLAR_API_KEY || '';
    this.client = axios.create({
      baseURL: env.POLAR_BASE_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Handle Polar webhook events
   */
  async handleWebhook(event: PolarWebhookEvent): Promise<void> {
    try {
      const { type, data } = event;
      const workspaceId = data.metadata?.workspace_id;

      if (!workspaceId) {
        logger.warn('Polar webhook missing workspace_id in metadata', { event });
        return;
      }

      logger.info('Processing Polar webhook', { type, workspaceId, subscriptionId: data.id });

      switch (type) {
        case 'subscription.created':
          await this.handleSubscriptionCreated(workspaceId, data);
          break;
        case 'subscription.updated':
          await this.handleSubscriptionUpdated(workspaceId, data);
          break;
        case 'subscription.canceled':
          await this.handleSubscriptionCanceled(workspaceId, data);
          break;
        default:
          logger.warn('Unknown Polar webhook type', { type });
      }
    } catch (error) {
      logger.error('Error handling Polar webhook', error);
      throw error;
    }
  }

  /**
   * Handle subscription created
   */
  private async handleSubscriptionCreated(workspaceId: string, data: any): Promise<void> {
    const plan = this.mapProductIdToPlan(data.product_id);
    const status = this.mapStatus(data.status);

    await db.upsertSubscription({
      workspaceId,
      plan,
      status,
      polarSubscriptionId: data.id,
      currentPeriodStart: data.current_period_start ? new Date(data.current_period_start).getTime() : undefined,
      currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end).getTime() : undefined,
      cancelAtPeriodEnd: data.cancel_at_period_end || false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    logger.info('Subscription created', { workspaceId, plan, status });
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(workspaceId: string, data: any): Promise<void> {
    const plan = this.mapProductIdToPlan(data.product_id);
    const status = this.mapStatus(data.status);

    await db.updateSubscription(workspaceId, {
      plan,
      status,
      polarSubscriptionId: data.id,
      currentPeriodStart: data.current_period_start ? new Date(data.current_period_start).getTime() : undefined,
      currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end).getTime() : undefined,
      cancelAtPeriodEnd: data.cancel_at_period_end || false,
      updatedAt: Date.now()
    });

    logger.info('Subscription updated', { workspaceId, plan, status });
  }

  /**
   * Handle subscription canceled
   */
  private async handleSubscriptionCanceled(workspaceId: string, data: any): Promise<void> {
    await db.updateSubscription(workspaceId, {
      status: SubscriptionStatus.CANCELED,
      cancelAtPeriodEnd: true,
      updatedAt: Date.now()
    });

    logger.info('Subscription canceled', { workspaceId });
  }

  /**
   * Map Polar product ID to subscription plan
   */
  private mapProductIdToPlan(productId: string): SubscriptionPlan {
    // Map your Polar product IDs to plans
    // You'll configure these in Polar.sh
    const productMap: Record<string, SubscriptionPlan> = {
      [process.env.POLAR_PRODUCT_ID_PRO || '']: SubscriptionPlan.PRO,
      [process.env.POLAR_PRODUCT_ID_TEAM || '']: SubscriptionPlan.TEAM,
      [process.env.POLAR_PRODUCT_ID_ENTERPRISE || '']: SubscriptionPlan.ENTERPRISE
    };

    return productMap[productId] || SubscriptionPlan.FREE;
  }

  /**
   * Map Polar status to our status
   */
  private mapStatus(status: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'active': SubscriptionStatus.ACTIVE,
      'canceled': SubscriptionStatus.CANCELED,
      'past_due': SubscriptionStatus.PAST_DUE,
      'trialing': SubscriptionStatus.TRIALING
    };

    return statusMap[status.toLowerCase()] || SubscriptionStatus.ACTIVE;
  }

  /**
   * Generate checkout URL
   */
  generateCheckoutUrl(workspaceId: string, plan: SubscriptionPlan): string {
    const productId = this.getProductIdForPlan(plan);
    if (!productId) {
      throw new Error(`No product ID configured for plan: ${plan}`);
    }

    return `${env.POLAR_BASE_URL}/checkout?product=${productId}&metadata[workspace_id]=${workspaceId}`;
  }

  /**
   * Get product ID for plan
   */
  private getProductIdForPlan(plan: SubscriptionPlan): string | undefined {
    const productMap: Record<SubscriptionPlan, string | undefined> = {
      [SubscriptionPlan.FREE]: undefined,
      [SubscriptionPlan.PRO]: process.env.POLAR_PRODUCT_ID_PRO,
      [SubscriptionPlan.TEAM]: process.env.POLAR_PRODUCT_ID_TEAM,
      [SubscriptionPlan.ENTERPRISE]: process.env.POLAR_PRODUCT_ID_ENTERPRISE
    };

    return productMap[plan];
  }
}

