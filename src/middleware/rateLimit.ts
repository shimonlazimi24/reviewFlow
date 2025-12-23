// Basic rate limiting middleware
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit store (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // Max requests per window

/**
 * Basic rate limiting middleware
 */
export function rateLimit(maxRequests: number = RATE_LIMIT_MAX_REQUESTS, windowMs: number = RATE_LIMIT_WINDOW) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    const entry = rateLimitStore.get(key);
    
    if (!entry || now > entry.resetAt) {
      // New window or expired
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      return next();
    }
    
    if (entry.count >= maxRequests) {
      logger.warn('Rate limit exceeded', { ip: key, count: entry.count });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again in ${Math.ceil((entry.resetAt - now) / 1000)} seconds.`,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000)
      });
    }
    
    entry.count++;
    next();
  };
}

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

