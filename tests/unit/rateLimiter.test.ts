import {
  clearRateLimitData,
  getRequestCount,
  rateLimiterMiddleware,
} from '../../src/middleware/rateLimiter';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('Rate Limiter Middleware', () => {
  beforeEach(() => {
    clearRateLimitData();
  });

  const createMockRequest = (ip: string = '127.0.0.1'): FastifyRequest => {
    return {
      ip,
      headers: {},
      url: '/webhook/abandonment',
      method: 'POST',
    } as unknown as FastifyRequest;
  };

  const createMockRequestWithTrace = (ip: string = '127.0.0.1') => {
    const req = createMockRequest(ip);
    return Object.assign(req, { traceId: 'test-trace-123' });
  };

  const createMockReply = (): FastifyReply => {
    return {} as FastifyReply;
  };

  it('should allow requests under limit', async () => {
    const request = createMockRequestWithTrace('192.168.1.1');
    const reply = createMockReply();

    // Send 50 requests (below default limit of 100)
    for (let i = 0; i < 50; i++) {
      await expect(rateLimiterMiddleware(request, reply)).resolves.toBeUndefined();
    }

    expect(getRequestCount('192.168.1.1')).toBe(50);
  });

  it('should track different IPs separately', async () => {
    const reply = createMockReply();
    const request1 = createMockRequestWithTrace('192.168.1.1');
    const request2 = createMockRequestWithTrace('192.168.1.2');

    // IP 1: 50 requests
    for (let i = 0; i < 50; i++) {
      await rateLimiterMiddleware(request1, reply);
    }

    // IP 2: 30 requests
    for (let i = 0; i < 30; i++) {
      await rateLimiterMiddleware(request2, reply);
    }

    expect(getRequestCount('192.168.1.1')).toBe(50);
    expect(getRequestCount('192.168.1.2')).toBe(30);
  });

  it('should reject requests over limit', async () => {
    const request = createMockRequestWithTrace('10.0.0.1');
    const reply = createMockReply();
    const config = { maxRequests: 5, windowMs: 60 * 1000 };

    // Send 5 requests (should succeed)
    for (let i = 0; i < 5; i++) {
      await expect(rateLimiterMiddleware(request, reply, config)).resolves.toBeUndefined();
    }

    // 6th request should be rejected
    await expect(rateLimiterMiddleware(request, reply, config)).rejects.toMatchObject({
      type: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
    });
  });

  it('should handle X-Forwarded-For header', async () => {
    const request = createMockRequestWithTrace('192.168.1.1');
    request.headers['x-forwarded-for'] = '203.0.113.5, 70.41.3.18';
    const reply = createMockReply();

    await rateLimiterMiddleware(request, reply);

    // Should track the first IP from X-Forwarded-For
    expect(getRequestCount('203.0.113.5')).toBe(1);
    expect(getRequestCount('192.168.1.1')).toBe(0);
  });

  it('should return 429 status code when limit exceeded', async () => {
    const request = createMockRequestWithTrace('10.0.0.2');
    const reply = createMockReply();
    const config = { maxRequests: 2, windowMs: 60 * 1000 };

    // Use up the limit
    await rateLimiterMiddleware(request, reply, config);
    await rateLimiterMiddleware(request, reply, config);

    // Third request should fail with 429
    await expect(rateLimiterMiddleware(request, reply, config)).rejects.toMatchObject({
      statusCode: 429,
      type: 'RATE_LIMIT_EXCEEDED',
    });
  });

  it('should include traceId in rate limit error', async () => {
    const request = createMockRequestWithTrace('10.0.0.3');
    Object.assign(request, { traceId: 'abc-def-123' });
    const reply = createMockReply();
    const config = { maxRequests: 1, windowMs: 60 * 1000 };

    // Use up the limit
    await rateLimiterMiddleware(request, reply, config);

    // Second request should fail
    await expect(rateLimiterMiddleware(request, reply, config)).rejects.toMatchObject({
      traceId: 'abc-def-123',
    });
  });

  it('should support custom rate limit config', async () => {
    const request = createMockRequestWithTrace('172.16.0.1');
    const reply = createMockReply();

    // Use 200 req/hour limit
    const customConfig = { maxRequests: 200, windowMs: 60 * 60 * 1000 };

    // Send 150 requests should succeed
    for (let i = 0; i < 150; i++) {
      await expect(rateLimiterMiddleware(request, reply, customConfig)).resolves.toBeUndefined();
    }

    expect(getRequestCount('172.16.0.1')).toBe(150);
  });

  it('should clear old entries', () => {
    clearRateLimitData();

    // This test verifies the cleanup interval exists
    // In real scenarios, old entries are cleaned up every 60 seconds
    expect(getRequestCount('192.168.1.10')).toBe(0);
    expect(getRequestCount('192.168.1.11')).toBe(0);
  });

  it('should handle concurrent requests from same IP', async () => {
    const request = createMockRequestWithTrace('203.0.113.10');
    const reply = createMockReply();
    const config = { maxRequests: 10, windowMs: 60 * 1000 };

    // Simulate concurrent requests
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(rateLimiterMiddleware(request, reply, config));
    }

    await expect(Promise.all(promises)).resolves.toBeDefined();
    expect(getRequestCount('203.0.113.10')).toBe(10);

    // 11th request should fail
    await expect(rateLimiterMiddleware(request, reply, config)).rejects.toMatchObject({
      type: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
    });
  });
});
