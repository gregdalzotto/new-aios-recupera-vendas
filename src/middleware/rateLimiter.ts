import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../config/logger';
import { createError, ErrorType } from '../utils/errors';
import { FastifyRequestWithTrace } from './correlationId';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// Store request timestamps per IP
const requestCounts = new Map<string, number[]>();

/**
 * Cleanup old entries periodically (every 60 seconds)
 */
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const defaultWindow = 60 * 1000;

  for (const [ip, timestamps] of requestCounts.entries()) {
    const recent = timestamps.filter((t) => now - t < defaultWindow);
    if (recent.length === 0) {
      requestCounts.delete(ip);
    } else {
      requestCounts.set(ip, recent);
    }
  }
}, 60 * 1000);

// Allow cleanup interval to not keep process alive in tests
cleanupInterval.unref();

/**
 * Extract client IP from request
 * Considers X-Forwarded-For header (for proxies/load balancers)
 */
function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return request.ip;
}

/**
 * Rate limiting middleware
 * Default: 100 requests per minute per IP
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function rateLimiterMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60 * 1000 }
): Promise<void> {
  const ip = getClientIp(request);
  const traceId = (request as FastifyRequestWithTrace).traceId;
  const now = Date.now();

  // Get timestamps from this IP within the window
  const timestamps = requestCounts.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < config.windowMs);

  // Check if limit exceeded
  if (recent.length >= config.maxRequests) {
    logger.warn('Rate limit exceeded', {
      traceId,
      ip,
      requestCount: recent.length,
      limit: config.maxRequests,
      windowSeconds: config.windowMs / 1000,
    });

    throw createError({
      type: ErrorType.RATE_LIMIT_EXCEEDED,
      message: `Rate limit: ${config.maxRequests} requests per ${config.windowMs / 1000} seconds`,
      statusCode: 429,
      traceId,
    });
  }

  // Add current request timestamp
  recent.push(now);
  requestCounts.set(ip, recent);

  logger.debug('Rate limit check passed', {
    traceId,
    ip,
    requestCount: recent.length,
    limit: config.maxRequests,
  });
}

/**
 * Factory function to create rate limiting middleware with custom config
 */
export function createRateLimiterMiddleware(config?: RateLimitConfig) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await rateLimiterMiddleware(request, reply, config);
  };
}

/**
 * Clear rate limit data (useful for testing)
 */
export function clearRateLimitData(): void {
  requestCounts.clear();
}

/**
 * Get current request count for IP (useful for testing)
 */
export function getRequestCount(ip: string): number {
  const timestamps = requestCounts.get(ip) ?? [];
  const now = Date.now();
  const recent = timestamps.filter((t) => now - t < 60 * 1000);
  return recent.length;
}
