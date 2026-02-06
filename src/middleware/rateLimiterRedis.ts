import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '../config/redis';
import { SARA_CONFIG } from '../config/sara';
import logger from '../config/logger';
import { createError, ErrorType } from '../utils/errors';

export interface RateLimiterConfig {
  maxRequests?: number;
  windowMs?: number; // milliseconds
  usePhoneNumber?: boolean; // Use phone number instead of IP for webhook rate limiting
}

const DEFAULT_CONFIG: Required<RateLimiterConfig> = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  usePhoneNumber: false,
};

/**
 * Get client identifier from request
 * Can be either IP address or phone number (for webhook rate limiting)
 * Considers X-Forwarded-For header for proxy scenarios
 */
function getClientIdentifier(req: FastifyRequest, usePhoneNumber: boolean = false): string {
  // Extract phone number from Meta webhook payload if requested
  if (usePhoneNumber) {
    try {
      const phoneNumber = (req.body as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
      if (phoneNumber && typeof phoneNumber === 'string') {
        return `phone:${phoneNumber}`;
      }
    } catch (e) {
      // Silently fall back to IP
      logger.debug('Could not extract phone number from webhook', { error: e });
    }
  }

  // Fall back to IP address
  const forwarded = req.headers['x-forwarded-for'];

  if (forwarded && typeof forwarded === 'string') {
    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2)
    // Take the first (original client)
    const ips = forwarded.split(',');
    return `ip:${ips[0].trim()}`;
  }

  return `ip:${req.ip || '127.0.0.1'}`;
}

/**
 * Rate limiter middleware using Redis
 * Stores request counts in Redis with automatic expiration
 *
 * Usage:
 * - Per-IP rate limiting (100 requests per 60 seconds by default)
 * - Per-phone rate limiting for webhooks (10 requests per 15 minutes)
 * - Distributed across multiple instances
 * - Automatic cleanup via Redis TTL
 */
export async function rateLimiterMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  config?: RateLimiterConfig
): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const clientIdentifier = getClientIdentifier(request, mergedConfig.usePhoneNumber);
  const key = `rate_limit:${clientIdentifier}`;
  const traceId = (request as any).traceId || 'unknown';

  try {
    const redis = await getRedisClient();

    // Get current request count
    const current = await redis.incr(key);

    // Set expiration only on first request (when count = 1)
    if (current === 1) {
      await redis.expire(key, Math.ceil(mergedConfig.windowMs / 1000));
    }

    // Check if limit exceeded
    if (current > mergedConfig.maxRequests) {
      logger.warn('Rate limit exceeded', {
        clientIdentifier,
        current,
        limit: mergedConfig.maxRequests,
        window: mergedConfig.windowMs,
        traceId,
      });

      throw createError({
        type: ErrorType.RATE_LIMIT_EXCEEDED,
        message: `Rate limit exceeded: ${mergedConfig.maxRequests} requests per ${mergedConfig.windowMs}ms`,
        statusCode: 429,
        traceId,
      });
    }

    logger.debug('Rate limit check passed', {
      clientIdentifier,
      current,
      limit: mergedConfig.maxRequests,
      remaining: mergedConfig.maxRequests - current,
      traceId,
    });
  } catch (error) {
    // If it's already an AppError (rate limit exceeded), rethrow
    if (error instanceof Error && error.constructor.name === 'AppError') {
      throw error;
    }

    // For Redis connection errors, log but allow request (degraded mode)
    logger.error('Rate limiter error', {
      clientIdentifier,
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });

    logger.warn('Rate limiter degraded mode - allowing request', { clientIdentifier, traceId });
  }
}

/**
 * Factory function to create rate limiter with custom config
 */
export function createRateLimiterMiddleware(config?: RateLimiterConfig) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    await rateLimiterMiddleware(request, _reply, config);
  };
}

/**
 * Create webhook rate limiter using SARA configuration
 * - Uses phone number from Meta webhook payload as the key
 * - Limits: 10 requests per 15 minutes per phone number
 */
export function createWebhookRateLimiter() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await rateLimiterMiddleware(request, reply, {
      maxRequests: SARA_CONFIG.webhook.rateLimitMaxRequests,
      windowMs: SARA_CONFIG.webhook.rateLimitWindowMs,
      usePhoneNumber: true,
    });
  };
}

/**
 * Get current request count for IP (for testing/debugging)
 */
export async function getRequestCount(clientIp: string): Promise<number> {
  try {
    const redis = await getRedisClient();
    const key = `rate_limit:${clientIp}`;
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    logger.error('Error getting request count', {
      clientIp,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Clear rate limit data for IP (for testing)
 */
export async function clearRateLimitData(clientIp?: string): Promise<void> {
  try {
    const redis = await getRedisClient();

    if (clientIp) {
      // Clear specific IP
      const key = `rate_limit:${clientIp}`;
      await redis.del(key);
      logger.debug('Cleared rate limit for IP', { clientIp });
    } else {
      // Clear all rate limit data
      const keys = await redis.keys('rate_limit:*');
      if (keys.length > 0) {
        await redis.del(keys);
        logger.debug('Cleared all rate limit data', { count: keys.length });
      }
    }
  } catch (error) {
    logger.error('Error clearing rate limit data', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
