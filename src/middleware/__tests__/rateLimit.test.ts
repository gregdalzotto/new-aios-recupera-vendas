import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import { createWebhookRateLimiter } from '../rateLimiterRedis';
import { clearRateLimitData } from '../rateLimiterRedis';
import { SARA_CONFIG } from '../../config/sara';

describe('Webhook Rate Limiter', () => {
  let app: FastifyInstance;
  const testPhoneNumber = '+16315551181';

  beforeEach(async () => {
    // Clear any previous rate limit data
    await clearRateLimitData();

    // Create a fresh Fastify instance for testing
    app = fastify({
      logger: false,
    });

    // Register the rate limited endpoint
    app.post('/test-webhook', { preHandler: createWebhookRateLimiter() }, async () => {
      return { success: true };
    });

    // Start the server
    await app.ready();
  });

  afterEach(async () => {
    // Clean up
    await clearRateLimitData();
    await app.close();
  });

  describe('Basic Rate Limiting', () => {
    test('should allow requests within the limit', async () => {
      // Create a payload with the test phone number
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: testPhoneNumber,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // Make requests up to the limit
      for (let i = 0; i < SARA_CONFIG.webhook.rateLimitMaxRequests; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/test-webhook',
          payload,
        });

        expect(response.statusCode).toBe(200);
      }
    });

    test('should block requests exceeding the limit', async () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: testPhoneNumber,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // Make requests up to the limit
      for (let i = 0; i < SARA_CONFIG.webhook.rateLimitMaxRequests; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/test-webhook',
          payload,
        });

        expect(response.statusCode).toBe(200);
      }

      // The next request should be blocked
      const blockedResponse = await app.inject({
        method: 'POST',
        url: '/test-webhook',
        payload,
      });

      expect(blockedResponse.statusCode).toBe(429);
      const body = JSON.parse(blockedResponse.body);
      expect(body.error).toBe('Too many requests');
    });
  });

  describe('Phone Number Extraction', () => {
    test('should use phone number as rate limit key', async () => {
      const phone1 = '+16315551181';
      const phone2 = '+16315551182';

      const payload1 = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: phone1,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const payload2 = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: phone2,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // Make max requests from phone 1
      for (let i = 0; i < SARA_CONFIG.webhook.rateLimitMaxRequests; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/test-webhook',
          payload: payload1,
        });
        expect(response.statusCode).toBe(200);
      }

      // Phone 1 should now be rate limited
      const blockedResponse = await app.inject({
        method: 'POST',
        url: '/test-webhook',
        payload: payload1,
      });
      expect(blockedResponse.statusCode).toBe(429);

      // But phone 2 should still have requests available
      const allowedResponse = await app.inject({
        method: 'POST',
        url: '/test-webhook',
        payload: payload2,
      });
      expect(allowedResponse.statusCode).toBe(200);
    });
  });

  describe('Rate Limit Response', () => {
    test('should return 429 status code when limit exceeded', async () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: testPhoneNumber,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // Exhaust the limit
      for (let i = 0; i < SARA_CONFIG.webhook.rateLimitMaxRequests; i++) {
        await app.inject({
          method: 'POST',
          url: '/test-webhook',
          payload,
        });
      }

      const response = await app.inject({
        method: 'POST',
        url: '/test-webhook',
        payload,
      });

      expect(response.statusCode).toBe(429);
    });

    test('should include retry information in response', async () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: testPhoneNumber,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      // Exhaust the limit
      for (let i = 0; i < SARA_CONFIG.webhook.rateLimitMaxRequests; i++) {
        await app.inject({
          method: 'POST',
          url: '/test-webhook',
          payload,
        });
      }

      const response = await app.inject({
        method: 'POST',
        url: '/test-webhook',
        payload,
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('retryAfter');
      expect(body.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Configuration Integration', () => {
    test('should use SARA_CONFIG values', () => {
      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBeGreaterThan(0);
      expect(SARA_CONFIG.webhook.rateLimitWindowMs).toBeGreaterThan(0);
    });

    test('should enforce reasonable rate limits', () => {
      // Should allow at least 1 request
      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBeGreaterThanOrEqual(1);

      // Window should be at least 1 minute
      expect(SARA_CONFIG.webhook.rateLimitWindowMs).toBeGreaterThanOrEqual(60000);

      // Should be no more than 1000 requests (prevent misconfiguration)
      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBeLessThanOrEqual(1000);
    });
  });

  describe('Malformed Payloads', () => {
    test('should handle missing phone number gracefully', async () => {
      const payloadWithoutPhone = {
        entry: [
          {
            changes: [
              {
                value: {
                  // No messages field
                },
              },
            ],
          },
        ],
      };

      // Should not crash, should fall back to IP-based limiting
      const response = await app.inject({
        method: 'POST',
        url: '/test-webhook',
        payload: payloadWithoutPhone,
      });

      // Should allow the request (IP-based limit not exhausted)
      expect(response.statusCode).toBe(200);
    });

    test('should handle invalid payload structure', async () => {
      const invalidPayload = {
        // Completely invalid structure
        random: 'data',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/test-webhook',
        payload: invalidPayload,
      });

      // Should not crash
      expect([200, 429]).toContain(response.statusCode);
    });
  });
});
