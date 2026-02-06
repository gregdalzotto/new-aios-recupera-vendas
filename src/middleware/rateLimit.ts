/**
 * Rate Limiting Middleware
 * Protects webhook endpoints from spam and abuse
 */

import rateLimit from 'express-rate-limit';
import { SARA_CONFIG } from '../config/sara';
import logger from '../config/logger';

/**
 * Extract phone number from Meta webhook payload
 * Meta sends the phone number in: entry[0].changes[0].value.messages[0].from
 */
function extractPhoneFromWebhook(req: any): string {
  try {
    const phoneNumber = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
    if (phoneNumber && typeof phoneNumber === 'string') {
      return phoneNumber;
    }
  } catch (e) {
    // Silently fall back to IP
  }

  // Fallback to IP address if phone number not found
  return (req.ip || req.connection.remoteAddress || 'unknown') as string;
}

/**
 * Webhook Rate Limiter
 * Limits requests per phone number to prevent abuse
 *
 * Configuration (from SARA_CONFIG):
 * - Window: 15 minutes (900,000 ms)
 * - Max Requests: 10 per window per phone number
 *
 * This allows ~1 message per 1.5 minutes per user, which is reasonable for
 * legitimate customer interactions while preventing spam/brute force attacks.
 */
export const webhookRateLimiter = rateLimit({
  windowMs: SARA_CONFIG.webhook.rateLimitWindowMs,
  max: SARA_CONFIG.webhook.rateLimitMaxRequests,
  message: 'Too many webhook requests from this phone number. Please try again later.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Use phone number from Meta webhook as the rate limit key
    return extractPhoneFromWebhook(req);
  },
  skip: (req) => {
    // Skip rate limiting for test endpoints (dev/test environments)
    const isTestEndpoint = req.path?.includes('/webhook/test');
    if (isTestEndpoint) {
      logger.debug('Skipping rate limit for test endpoint', { path: req.path });
    }
    return isTestEndpoint;
  },
  handler: (req, res) => {
    // Custom error response when rate limit exceeded
    const phoneNumber = extractPhoneFromWebhook(req);
    logger.warn('Rate limit exceeded for webhook', {
      phoneNumber: phoneNumber.substring(0, 10) + '...', // Log partial number for privacy
      path: req.path,
      ip: req.ip,
    });

    res.status(429).json({
      error: 'Too many requests',
      message: 'Too many webhook requests from this phone number. Please try again later.',
      retryAfter: Math.ceil(SARA_CONFIG.webhook.rateLimitWindowMs / 1000),
    });
  },
  onLimitReached: (req) => {
    const phoneNumber = extractPhoneFromWebhook(req);
    logger.error('Rate limit threshold reached for webhook', {
      phoneNumber: phoneNumber.substring(0, 10) + '...',
      limit: SARA_CONFIG.webhook.rateLimitMaxRequests,
      window: `${SARA_CONFIG.webhook.rateLimitWindowMs / 1000 / 60} minutes`,
    });
  },
});

/**
 * Express Integration Helper
 * Returns middleware function for use in route handlers
 */
export function createWebhookRateLimiter() {
  logger.info('Rate limiter initialized', {
    maxRequests: SARA_CONFIG.webhook.rateLimitMaxRequests,
    windowMs: SARA_CONFIG.webhook.rateLimitWindowMs,
    windowMinutes: SARA_CONFIG.webhook.rateLimitWindowMs / 1000 / 60,
  });

  return webhookRateLimiter;
}

export default webhookRateLimiter;
