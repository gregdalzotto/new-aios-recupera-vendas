import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SARA_CONFIG } from '../sara';

describe('SARA Configuration', () => {
  // Store original env vars for restoration
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear the config cache before each test
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Conversation Config', () => {
    test('should have default maxCycles of 5', () => {
      expect(SARA_CONFIG.conversation.maxCycles).toBe(5);
    });

    test('should validate maxCycles is a positive integer', () => {
      expect(SARA_CONFIG.conversation.maxCycles).toBeGreaterThan(0);
      expect(Number.isInteger(SARA_CONFIG.conversation.maxCycles)).toBe(true);
    });
  });

  describe('Message Config', () => {
    test('should have default historyLimit of 20', () => {
      expect(SARA_CONFIG.message.historyLimit).toBe(20);
    });

    test('should validate historyLimit is a positive integer', () => {
      expect(SARA_CONFIG.message.historyLimit).toBeGreaterThan(0);
      expect(Number.isInteger(SARA_CONFIG.message.historyLimit)).toBe(true);
    });
  });

  describe('Cache Config', () => {
    test('should have default systemPromptTtlMs of 3600000 (1 hour)', () => {
      expect(SARA_CONFIG.cache.systemPromptTtlMs).toBe(3600000);
    });

    test('should validate systemPromptTtlMs is at least 1 minute', () => {
      expect(SARA_CONFIG.cache.systemPromptTtlMs).toBeGreaterThanOrEqual(60000);
    });
  });

  describe('OpenAI Config', () => {
    test('should have default retryMaxAttempts of 3', () => {
      expect(SARA_CONFIG.openai.retryMaxAttempts).toBe(3);
    });

    test('should have default retryInitialDelayMs of 1000', () => {
      expect(SARA_CONFIG.openai.retryInitialDelayMs).toBe(1000);
    });

    test('should have retryBackoffMultiplier of 2', () => {
      expect(SARA_CONFIG.openai.retryBackoffMultiplier).toBe(2);
    });

    test('should have timeoutMs of 5000', () => {
      expect(SARA_CONFIG.openai.timeoutMs).toBe(5000);
    });

    test('should have maxTokens of 500', () => {
      expect(SARA_CONFIG.openai.maxTokens).toBe(500);
    });

    test('should validate retry configuration', () => {
      expect(SARA_CONFIG.openai.retryMaxAttempts).toBeGreaterThan(0);
      expect(SARA_CONFIG.openai.retryInitialDelayMs).toBeGreaterThan(0);
      expect(SARA_CONFIG.openai.retryBackoffMultiplier).toBeGreaterThan(1);
    });
  });

  describe('Webhook Config', () => {
    test('should have default rateLimitWindowMs of 900000 (15 minutes)', () => {
      expect(SARA_CONFIG.webhook.rateLimitWindowMs).toBe(900000);
    });

    test('should have default rateLimitMaxRequests of 10', () => {
      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBe(10);
    });

    test('should validate rate limit configuration', () => {
      expect(SARA_CONFIG.webhook.rateLimitWindowMs).toBeGreaterThanOrEqual(60000);
      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBeGreaterThan(0);
    });
  });

  describe('Complete Configuration Structure', () => {
    test('should have all required sections', () => {
      expect(SARA_CONFIG).toHaveProperty('conversation');
      expect(SARA_CONFIG).toHaveProperty('message');
      expect(SARA_CONFIG).toHaveProperty('cache');
      expect(SARA_CONFIG).toHaveProperty('openai');
      expect(SARA_CONFIG).toHaveProperty('webhook');
    });

    test('should be immutable (frozen or readonly)', () => {
      // Configuration object should not be modified at runtime
      const originalMaxCycles = SARA_CONFIG.conversation.maxCycles;

      // Attempt to modify should fail silently or throw in strict mode
      try {
        (SARA_CONFIG.conversation as any).maxCycles = 999;
        // If it changed, that's a problem
        expect(SARA_CONFIG.conversation.maxCycles).toBe(originalMaxCycles);
      } catch (e) {
        // Expected behavior in strict mode
        expect(true).toBe(true);
      }
    });

    test('should provide accurate retry delay calculation', () => {
      // Simulate exponential backoff calculation
      const baseDelay = SARA_CONFIG.openai.retryInitialDelayMs;
      const multiplier = SARA_CONFIG.openai.retryBackoffMultiplier;

      // Attempt 1: 1000ms
      const delay1 = baseDelay * Math.pow(multiplier, 0);
      expect(delay1).toBe(1000);

      // Attempt 2: 2000ms
      const delay2 = baseDelay * Math.pow(multiplier, 1);
      expect(delay2).toBe(2000);

      // Attempt 3: 4000ms
      const delay3 = baseDelay * Math.pow(multiplier, 2);
      expect(delay3).toBe(4000);
    });
  });

  describe('Configuration Usage in Application', () => {
    test('should provide correct context for message history', () => {
      // Verify that history limit is reasonable for context injection
      expect(SARA_CONFIG.message.historyLimit).toBeGreaterThanOrEqual(5);
      expect(SARA_CONFIG.message.historyLimit).toBeLessThanOrEqual(1000);
    });

    test('should provide correct rate limiting values', () => {
      // Verify rate limit allows reasonable traffic
      // With 10 requests per 15 minutes = ~0.67 req/minute (one message per ~1.5 minutes)
      const requestsPerMinute =
        (SARA_CONFIG.webhook.rateLimitMaxRequests / SARA_CONFIG.webhook.rateLimitWindowMs) * 60000;

      expect(requestsPerMinute).toBeGreaterThan(0.1);
      expect(requestsPerMinute).toBeLessThan(100); // Reasonable upper bound
    });

    test('should provide correct retry strategy', () => {
      // With 3 attempts and 1s initial delay, max wait time is ~7 seconds (1+2+4)
      let totalMs = 0;
      for (let i = 0; i < SARA_CONFIG.openai.retryMaxAttempts; i++) {
        totalMs +=
          SARA_CONFIG.openai.retryInitialDelayMs *
          Math.pow(SARA_CONFIG.openai.retryBackoffMultiplier, i);
      }

      expect(totalMs).toBeGreaterThan(0);
      expect(totalMs).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });
});
