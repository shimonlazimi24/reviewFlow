// GitHub webhook signature validation
import crypto from 'crypto';
import { logger } from './logger';
import { ValidationError } from './errors';

/**
 * Validates GitHub webhook signature
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - GitHub webhook secret
 * @returns true if signature is valid
 */
export function validateGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!secret) {
    logger.warn('GitHub webhook secret not configured, skipping signature validation');
    return true; // Allow if secret not configured (for development)
  }

  if (!signature) {
    logger.error('Missing GitHub webhook signature header');
    return false;
  }

  try {
    // GitHub sends signature as: sha256=<hash>
    const signatureHash = signature.replace('sha256=', '');
    
    // Calculate expected hash
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Compare hashes using constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signatureHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );

    if (!isValid) {
      logger.error('GitHub webhook signature validation failed', {
        received: signatureHash.substring(0, 8) + '...',
        expected: expectedHash.substring(0, 8) + '...'
      });
    }

    return isValid;
  } catch (error) {
    logger.error('Error validating GitHub webhook signature', error);
    return false;
  }
}

/**
 * Middleware to validate GitHub webhook requests
 */
export function githubWebhookValidator(secret: string) {
  return (req: any, res: any, next: any) => {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
    
    // Get raw body (must be string, not parsed JSON)
    const rawBody = typeof req.body === 'string' 
      ? req.body 
      : JSON.stringify(req.body);

    const isValid = validateGitHubSignature(rawBody, signature, secret);

    if (!isValid) {
      logger.warn('Rejected GitHub webhook due to invalid signature', {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}

