import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '../config/redis';
import logger from '../config/logger';
import { createError, ErrorType } from '../utils/errors';

export interface RateLimiterConfig {
  maxRequests?: number;
  windowMs?: number; // milliseconds
}

const DEFAULT_CONFIG: Required<RateLimiterConfig> = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * Get client IP from request
 * Considers X-Forwarded-For header for proxy scenarios
 */
function getClientIp(req: FastifyRequest): string {
  const forwarded = req.headers['x-forwarded-for'];

  if (forwarded && typeof forwarded === 'string') {
    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2)
    // Take the first (original client)
    const ips = forwarded.split(',');
    return ips[0].trim();
  }

  return req.ip || '127.0.0.1';
}

/**
 * Rate limiter middleware using Redis
 * Stores request counts in Redis with automatic expiration
 *
 * Usage:
 * - Per-IP rate limiting (100 requests per 60 seconds)
 * - Distributed across multiple instances
 * - Automatic cleanup via Redis TTL
 */
export async function rateLimiterMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  config?: RateLimiterConfig
): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const clientIp = getClientIp(request);
  const key = `rate_limit:${clientIp}`;
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
        clientIp,
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
      clientIp,
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
      clientIp,
      error: error instanceof Error ? error.message : String(error),
      traceId,
    });

    logger.warn('Rate limiter degraded mode - allowing request', { clientIp, traceId });
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
