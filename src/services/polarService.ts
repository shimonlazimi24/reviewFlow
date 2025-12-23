// Polar.sh billing integration service
import axios, { AxiosInstance } from 'axios';
import { env, POLAR_SUCCESS_URL, POLAR_CANCEL_URL } from '../config/env';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface PolarCheckoutSession {
  id: string;
  url: string;
}

export interface PolarCustomerPortalSession {
  url: string;
}

export interface PolarWebhookEvent {
  type: string;
  data: any;
}

export class PolarService {
  private client: AxiosInstance;
  private accessToken: string;

  constructor() {
    this.accessToken = env.POLAR_ACCESS_TOKEN || '';
    this.client = axios.create({
      baseURL: env.POLAR_BASE_URL,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Create checkout session for Pro plan
   */
  async createCheckoutSession(params: {
    slackTeamId: string;
    slackUserId: string;
    plan?: 'pro';
  }): Promise<PolarCheckoutSession> {
    try {
      if (!env.POLAR_PRO_PRODUCT_ID && !env.POLAR_PRO_PRICE_ID) {
        throw new Error('POLAR_PRO_PRODUCT_ID or POLAR_PRO_PRICE_ID must be configured');
      }

      const productId = env.POLAR_PRO_PRODUCT_ID;
      const priceId = env.POLAR_PRO_PRICE_ID;

      // Polar API: Create checkout link
      // Using product_id or price_id depending on what's configured
      const payload: any = {
        product_id: productId,
        success_url: POLAR_SUCCESS_URL,
        metadata: {
          slack_team_id: params.slackTeamId,
          slack_user_id: params.slackUserId
        }
      };

      if (priceId) {
        payload.price_id = priceId;
      }

      const response = await this.client.post('/v1/checkouts', payload);

      return {
        id: response.data.id,
        url: response.data.url || response.data.checkout_url
      };
    } catch (error: any) {
      logger.error('Failed to create Polar checkout session', error);
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  /**
   * Create customer portal session
   */
  async createCustomerPortalSession(
    polarCustomerId: string,
    returnUrl: string
  ): Promise<PolarCustomerPortalSession> {
    try {
      const response = await this.client.post('/v1/customers/portal', {
        customer_id: polarCustomerId,
        return_url: returnUrl
      });

      return {
        url: response.data.url || response.data.portal_url
      };
    } catch (error: any) {
      logger.error('Failed to create Polar customer portal session', error);
      throw new Error(`Failed to create portal session: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!env.POLAR_WEBHOOK_SECRET) {
      logger.warn('POLAR_WEBHOOK_SECRET not configured, skipping signature verification');
      return true; // Allow if not configured (development)
    }

    try {
      const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
      const hmac = crypto.createHmac('sha256', env.POLAR_WEBHOOK_SECRET);
      const digest = hmac.update(body).digest('hex');
      const expectedSignature = `sha256=${digest}`;

      // Use timing-safe comparison
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Error verifying Polar webhook signature', error);
      return false;
    }
  }

  /**
   * Extract Slack team ID from webhook metadata
   */
  extractSlackTeamId(event: PolarWebhookEvent): string | undefined {
    const metadata = event.data?.metadata || event.data?.subscription?.metadata;
    return metadata?.slack_team_id || metadata?.external_id;
  }

  /**
   * Handle webhook event (returns processed result)
   */
  async handleWebhookEvent(event: PolarWebhookEvent): Promise<{
    slackTeamId?: string;
    action: 'created' | 'updated' | 'canceled' | 'revoked' | 'unknown';
    subscriptionId?: string;
    customerId?: string;
    status?: string;
    periodEnd?: number;
  }> {
    const slackTeamId = this.extractSlackTeamId(event);
    const type = event.type;

    let action: 'created' | 'updated' | 'canceled' | 'revoked' | 'unknown' = 'unknown';
    let subscriptionId: string | undefined;
    let customerId: string | undefined;
    let status: string | undefined;
    let periodEnd: number | undefined;

    if (type === 'subscription.created') {
      action = 'created';
      subscriptionId = event.data?.id;
      customerId = event.data?.customer_id;
      status = event.data?.status;
      if (event.data?.current_period_end) {
        periodEnd = new Date(event.data.current_period_end).getTime();
      }
    } else if (type === 'subscription.updated') {
      action = 'updated';
      subscriptionId = event.data?.id;
      customerId = event.data?.customer_id;
      status = event.data?.status;
      if (event.data?.current_period_end) {
        periodEnd = new Date(event.data.current_period_end).getTime();
      }
    } else if (type === 'subscription.canceled') {
      action = 'canceled';
      subscriptionId = event.data?.id;
      customerId = event.data?.customer_id;
      status = 'canceled';
    } else if (type === 'subscription.revoked') {
      action = 'revoked';
      subscriptionId = event.data?.id;
      customerId = event.data?.customer_id;
      status = 'revoked';
    }

    return {
      slackTeamId,
      action,
      subscriptionId,
      customerId,
      status,
      periodEnd
    };
  }
}
