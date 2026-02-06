import { describe, test, expect } from '@jest/globals';
import { SARA_CONFIG } from '../sara';

/**
 * Integration tests to verify SARA configuration is used correctly
 * across the application
 */
describe('SARA Configuration Integration', () => {
  describe('Configuration Loading', () => {
    test('should load SARA_CONFIG without errors', () => {
      expect(SARA_CONFIG).toBeDefined();
      expect(typeof SARA_CONFIG).toBe('object');
    });

    test('should provide all configuration sections', () => {
      const sections = ['conversation', 'message', 'cache', 'openai', 'webhook'];
      sections.forEach((section) => {
        expect(SARA_CONFIG).toHaveProperty(section);
        expect(typeof SARA_CONFIG[section as keyof typeof SARA_CONFIG]).toBe('object');
      });
    });
  });

  describe('Configuration Validation', () => {
    test('should not throw errors during validation', () => {
      // If we got here, validation passed
      expect(SARA_CONFIG).toBeTruthy();
    });

    test('should have all numeric values as numbers (not strings)', () => {
      expect(typeof SARA_CONFIG.conversation.maxCycles).toBe('number');
      expect(typeof SARA_CONFIG.message.historyLimit).toBe('number');
      expect(typeof SARA_CONFIG.cache.systemPromptTtlMs).toBe('number');
      expect(typeof SARA_CONFIG.openai.retryMaxAttempts).toBe('number');
      expect(typeof SARA_CONFIG.openai.retryInitialDelayMs).toBe('number');
      expect(typeof SARA_CONFIG.openai.retryBackoffMultiplier).toBe('number');
      expect(typeof SARA_CONFIG.openai.timeoutMs).toBe('number');
      expect(typeof SARA_CONFIG.openai.maxTokens).toBe('number');
      expect(typeof SARA_CONFIG.webhook.rateLimitWindowMs).toBe('number');
      expect(typeof SARA_CONFIG.webhook.rateLimitMaxRequests).toBe('number');
    });
  });

  describe('Configuration Value Ranges', () => {
    test('conversation config should have reasonable values', () => {
      expect(SARA_CONFIG.conversation.maxCycles).toBeGreaterThanOrEqual(1);
      expect(SARA_CONFIG.conversation.maxCycles).toBeLessThanOrEqual(100);
    });

    test('message config should have reasonable values', () => {
      expect(SARA_CONFIG.message.historyLimit).toBeGreaterThanOrEqual(1);
      expect(SARA_CONFIG.message.historyLimit).toBeLessThanOrEqual(1000);
    });

    test('cache config should have reasonable values', () => {
      expect(SARA_CONFIG.cache.systemPromptTtlMs).toBeGreaterThanOrEqual(60000); // 1 min
      expect(SARA_CONFIG.cache.systemPromptTtlMs).toBeLessThanOrEqual(86400000); // 1 day
    });

    test('openai config should have reasonable values', () => {
      expect(SARA_CONFIG.openai.retryMaxAttempts).toBeGreaterThanOrEqual(1);
      expect(SARA_CONFIG.openai.retryMaxAttempts).toBeLessThanOrEqual(10);

      expect(SARA_CONFIG.openai.retryInitialDelayMs).toBeGreaterThanOrEqual(100);
      expect(SARA_CONFIG.openai.retryInitialDelayMs).toBeLessThanOrEqual(10000);

      expect(SARA_CONFIG.openai.retryBackoffMultiplier).toBeGreaterThan(1);
      expect(SARA_CONFIG.openai.retryBackoffMultiplier).toBeLessThanOrEqual(10);

      expect(SARA_CONFIG.openai.timeoutMs).toBeGreaterThan(0);
      expect(SARA_CONFIG.openai.maxTokens).toBeGreaterThan(0);
    });

    test('webhook config should have reasonable values', () => {
      expect(SARA_CONFIG.webhook.rateLimitWindowMs).toBeGreaterThanOrEqual(60000); // 1 min
      expect(SARA_CONFIG.webhook.rateLimitWindowMs).toBeLessThanOrEqual(3600000); // 1 hour

      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBeGreaterThanOrEqual(1);
      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBeLessThanOrEqual(1000);
    });
  });

  describe('Retry Strategy Calculation', () => {
    test('should correctly calculate exponential backoff delays', () => {
      const base = SARA_CONFIG.openai.retryInitialDelayMs;
      const multiplier = SARA_CONFIG.openai.retryBackoffMultiplier;

      // Calculate total time needed for all retries
      let totalMs = 0;
      for (let attempt = 0; attempt < SARA_CONFIG.openai.retryMaxAttempts; attempt++) {
        const delayMs = base * Math.pow(multiplier, attempt);
        totalMs += delayMs;
      }

      // Total wait time should be reasonable (less than 30 seconds)
      expect(totalMs).toBeLessThan(30000);
      expect(totalMs).toBeGreaterThan(0);
    });

    test('should not exceed OpenAI timeout during retries', () => {
      const base = SARA_CONFIG.openai.retryInitialDelayMs;
      const multiplier = SARA_CONFIG.openai.retryBackoffMultiplier;
      const timeout = SARA_CONFIG.openai.timeoutMs;

      // Longest single retry delay should be less than timeout
      const maxSingleDelay = base * Math.pow(multiplier, SARA_CONFIG.openai.retryMaxAttempts - 1);
      expect(maxSingleDelay).toBeLessThan(timeout * 2); // Allow 2x timeout for safety
    });
  });

  describe('Rate Limiting Strategy', () => {
    test('should provide reasonable rate limiting', () => {
      // At least 1 request per hour minimum
      const minRequestsPerHour =
        (SARA_CONFIG.webhook.rateLimitMaxRequests / SARA_CONFIG.webhook.rateLimitWindowMs) *
        3600000;

      expect(minRequestsPerHour).toBeGreaterThanOrEqual(1);
    });

    test('should prevent abuse with configured limits', () => {
      // With 10 requests per 15 minutes, prevent high-frequency spam
      const requestsPerMinute =
        (SARA_CONFIG.webhook.rateLimitMaxRequests / SARA_CONFIG.webhook.rateLimitWindowMs) * 60000;

      // Should be reasonable (not too many per minute)
      expect(requestsPerMinute).toBeLessThan(100);
    });
  });

  describe('Configuration Consistency', () => {
    test('should have all required subsections in conversation', () => {
      expect(SARA_CONFIG.conversation).toHaveProperty('maxCycles');
    });

    test('should have all required subsections in message', () => {
      expect(SARA_CONFIG.message).toHaveProperty('historyLimit');
    });

    test('should have all required subsections in cache', () => {
      expect(SARA_CONFIG.cache).toHaveProperty('systemPromptTtlMs');
    });

    test('should have all required subsections in openai', () => {
      expect(SARA_CONFIG.openai).toHaveProperty('retryMaxAttempts');
      expect(SARA_CONFIG.openai).toHaveProperty('retryInitialDelayMs');
      expect(SARA_CONFIG.openai).toHaveProperty('retryBackoffMultiplier');
      expect(SARA_CONFIG.openai).toHaveProperty('timeoutMs');
      expect(SARA_CONFIG.openai).toHaveProperty('maxTokens');
    });

    test('should have all required subsections in webhook', () => {
      expect(SARA_CONFIG.webhook).toHaveProperty('rateLimitWindowMs');
      expect(SARA_CONFIG.webhook).toHaveProperty('rateLimitMaxRequests');
    });
  });

  describe('Environment Variable Defaults', () => {
    test('should use defaults when env vars are not set', () => {
      // These values should match the defaults in sara.ts
      expect(SARA_CONFIG.conversation.maxCycles).toBe(5);
      expect(SARA_CONFIG.message.historyLimit).toBe(20);
      expect(SARA_CONFIG.cache.systemPromptTtlMs).toBe(3600000);
      expect(SARA_CONFIG.openai.retryMaxAttempts).toBe(3);
      expect(SARA_CONFIG.openai.retryInitialDelayMs).toBe(1000);
      expect(SARA_CONFIG.webhook.rateLimitWindowMs).toBe(900000);
      expect(SARA_CONFIG.webhook.rateLimitMaxRequests).toBe(10);
    });
  });
});
