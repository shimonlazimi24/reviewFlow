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
    // Define these outside try block for error logging
    const productId = env.POLAR_PRO_PRODUCT_ID;
    const priceId = env.POLAR_PRO_PRICE_ID;
    
    try {
      if (!productId && !priceId) {
        throw new Error('POLAR_PRO_PRODUCT_ID or POLAR_PRO_PRICE_ID must be configured');
      }

      // Polar API: Create checkout link
      // Polar API expects either product_id OR price_id, not both
      // Also need to check if product_id needs to be in a specific format
      const payload: any = {
        success_url: POLAR_SUCCESS_URL,
        cancel_url: POLAR_CANCEL_URL
      };

      // Add metadata if provided
      if (params.slackTeamId || params.slackUserId) {
        payload.metadata = {};
        if (params.slackTeamId) {
          payload.metadata.slack_team_id = params.slackTeamId;
        }
        if (params.slackUserId) {
          payload.metadata.slack_user_id = params.slackUserId;
        }
      }

      // Use price_id if available, otherwise product_id
      // Polar API: product_id should be the UUID from the product
      if (priceId) {
        payload.price_id = priceId;
      } else if (productId) {
        // Product ID should be the UUID (not prefixed with prod_)
        payload.product_id = productId;
      } else {
        throw new Error('Either POLAR_PRO_PRODUCT_ID or POLAR_PRO_PRICE_ID must be configured');
      }

      logger.info('Creating Polar checkout', { 
        hasProductId: !!productId, 
        hasPriceId: !!priceId,
        productId: productId ? (productId.length > 20 ? productId.substring(0, 20) + '...' : productId) : 'none',
        priceId: priceId ? (priceId.length > 20 ? priceId.substring(0, 20) + '...' : priceId) : 'none',
        successUrl: POLAR_SUCCESS_URL,
        cancelUrl: POLAR_CANCEL_URL,
        payloadKeys: Object.keys(payload)
      });

      // Polar API endpoint might be different - try both
      let response;
      try {
        response = await this.client.post('/v1/checkouts', payload);
      } catch (apiError: any) {
        // If v1/checkouts fails, try alternative endpoint
        if (apiError.response?.status === 404 || apiError.response?.status === 422) {
          logger.warn('v1/checkouts failed, trying alternative endpoint', { 
            status: apiError.response?.status,
            error: apiError.response?.data 
          });
          // Try without /v1 prefix or different endpoint
          response = await this.client.post('/checkouts', payload);
        } else {
          throw apiError;
        }
      }

      logger.info('Polar checkout created successfully', { 
        checkoutId: response.data?.id,
        hasUrl: !!response.data?.url 
      });

      return {
        id: response.data.id,
        url: response.data.url || response.data.checkout_url
      };
    } catch (error: any) {
      const errorDetails = error.response?.data || {};
      const errorMessage = errorDetails.detail || errorDetails.message || error.message;
      
      // Reconstruct payload info for logging (payload is in try block scope)
      const payloadInfo = {
        hasProductId: !!productId,
        hasPriceId: !!priceId,
        hasSuccessUrl: !!POLAR_SUCCESS_URL,
        hasCancelUrl: !!POLAR_CANCEL_URL,
        productId: productId ? (productId.length > 20 ? productId.substring(0, 20) + '...' : productId) : 'none',
        priceId: priceId ? (priceId.length > 20 ? priceId.substring(0, 20) + '...' : priceId) : 'none'
      };
      
      logger.error('Failed to create Polar checkout session', {
        error: error.message,
        response: errorDetails,
        status: error.response?.status,
        statusText: error.response?.statusText,
        ...payloadInfo
      });
      
      // Provide more helpful error message
      let userMessage = `Failed to create checkout session: ${errorMessage}`;
      if (error.response?.status === 422 || errorMessage.includes('invalid')) {
        userMessage += '\n\nPossible causes:\n• Product ID format is incorrect\n• Product doesn\'t exist in Polar\n• Missing required fields\n\nCheck your POLAR_PRO_PRODUCT_ID in Polar dashboard.';
      }
      
      throw new Error(userMessage);
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
