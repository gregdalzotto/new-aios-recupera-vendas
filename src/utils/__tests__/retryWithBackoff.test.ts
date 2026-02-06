import { describe, test, expect } from '@jest/globals';
import {
  retryWithBackoff,
  RETRY_PRESETS,
  isNetworkError,
  isRateLimitError,
  shouldRetryOpenAIError,
} from '../retryWithBackoff';

describe('Retry with Backoff', () => {
  describe('Basic Retry Logic', () => {
    test('should execute function and return result on first try', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delayMs: 100,
        backoffMultiplier: 2,
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure and succeed', async () => {
      let attempts = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('success');
      });

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delayMs: 10,
        backoffMultiplier: 2,
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(attempts).toBe(3);
    });

    test('should throw error after exhausting retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        retryWithBackoff(mockFn, {
          maxAttempts: 3,
          delayMs: 10,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow('Persistent failure');

      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Exponential Backoff', () => {
    test('should wait longer with each retry', async () => {
      const delayHistory: number[] = [];
      const onRetry = jest.fn((_attempt: number, _error: Error, delay: number) => {
        delayHistory.push(delay);
      });

      let attempts = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts <= 3) {
          return Promise.reject(new Error(`Failure ${attempts}`));
        }
        return Promise.resolve('success');
      });

      await retryWithBackoff(mockFn, {
        maxAttempts: 4,
        delayMs: 100,
        backoffMultiplier: 2,
        onRetry,
      });

      // First retry: 100 * 2^0 = 100
      // Second retry: 100 * 2^1 = 200
      // Third retry: 100 * 2^2 = 400
      expect(delayHistory).toEqual([100, 200, 400]);
    });

    test('should calculate correct delays for 3 attempts', async () => {
      const baseDelay = 1000;
      const multiplier = 2;
      const maxAttempts = 3;

      const delays: number[] = [];
      for (let i = 0; i < maxAttempts - 1; i++) {
        delays.push(baseDelay * Math.pow(multiplier, i));
      }

      expect(delays).toEqual([1000, 2000]);
    });
  });

  describe('Conditional Retry', () => {
    test('should not retry if shouldRetry returns false', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Client error 400'));

      await expect(
        retryWithBackoff(mockFn, {
          maxAttempts: 3,
          delayMs: 10,
          backoffMultiplier: 2,
          shouldRetry: (error) => !error.message.includes('400'),
        })
      ).rejects.toThrow('Client error 400');

      // Should only try once since shouldRetry returned false
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should retry if shouldRetry returns true', async () => {
      let attempts = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve('success');
      });

      const result = await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delayMs: 10,
        backoffMultiplier: 2,
        shouldRetry: (error) => error.message.includes('timeout'),
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Callback Hooks', () => {
    test('should call onRetry when retrying', async () => {
      const onRetry = jest.fn();

      let attempts = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Failure'));
        }
        return Promise.resolve('success');
      });

      await retryWithBackoff(mockFn, {
        maxAttempts: 3,
        delayMs: 10,
        backoffMultiplier: 2,
        onRetry,
      });

      // Should be called twice (for retries after 1st and 2nd attempts)
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    test('should pass correct parameters to onRetry', async () => {
      const onRetry = jest.fn();

      let attempts = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error('First failure'));
        }
        return Promise.resolve('success');
      });

      await retryWithBackoff(mockFn, {
        maxAttempts: 2,
        delayMs: 100,
        backoffMultiplier: 2,
        onRetry,
      });

      // Verify onRetry was called with correct parameters
      expect(onRetry).toHaveBeenCalledWith(
        1, // attempt number
        expect.any(Error), // error
        100 // next delay
      );
    });
  });

  describe('Retry Presets', () => {
    test('should have conservative preset', () => {
      expect(RETRY_PRESETS.conservative).toEqual({
        maxAttempts: 2,
        delayMs: 1000,
        backoffMultiplier: 2,
      });
    });

    test('should have standard preset', () => {
      expect(RETRY_PRESETS.standard).toEqual({
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
      });
    });

    test('should have aggressive preset', () => {
      expect(RETRY_PRESETS.aggressive).toEqual({
        maxAttempts: 5,
        delayMs: 500,
        backoffMultiplier: 2,
      });
    });

    test('should have quick preset', () => {
      expect(RETRY_PRESETS.quick).toEqual({
        maxAttempts: 2,
        delayMs: 100,
        backoffMultiplier: 2,
      });
    });
  });

  describe('Error Detection', () => {
    test('should detect network errors', () => {
      expect(isNetworkError(new Error('timeout'))).toBe(true);
      expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isNetworkError(new Error('ENOTFOUND'))).toBe(true);
      expect(isNetworkError(new Error('ECONNRESET'))).toBe(true);
      expect(isNetworkError(new Error('Invalid request'))).toBe(false);
    });

    test('should detect rate limit errors', () => {
      expect(isRateLimitError(new Error('429 Too Many Requests'))).toBe(true);
      expect(isRateLimitError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRateLimitError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRateLimitError(new Error('Invalid request'))).toBe(false);
    });
  });

  describe('OpenAI Error Retry Logic', () => {
    test('should retry network errors', () => {
      expect(shouldRetryOpenAIError(new Error('timeout'), 1)).toBe(true);
      expect(shouldRetryOpenAIError(new Error('ECONNREFUSED'), 1)).toBe(true);
    });

    test('should retry rate limit errors', () => {
      expect(shouldRetryOpenAIError(new Error('429 Too Many Requests'), 1)).toBe(true);
      expect(shouldRetryOpenAIError(new Error('503 Service Unavailable'), 1)).toBe(true);
    });

    test('should retry server errors', () => {
      expect(shouldRetryOpenAIError(new Error('500 Internal Server Error'), 1)).toBe(true);
      expect(shouldRetryOpenAIError(new Error('502 Bad Gateway'), 1)).toBe(true);
      expect(shouldRetryOpenAIError(new Error('504 Gateway Timeout'), 1)).toBe(true);
    });

    test('should not retry client errors', () => {
      expect(shouldRetryOpenAIError(new Error('400 Bad Request'), 1)).toBe(false);
      expect(shouldRetryOpenAIError(new Error('401 Unauthorized'), 1)).toBe(false);
      expect(shouldRetryOpenAIError(new Error('403 Forbidden'), 1)).toBe(false);
    });

    test('should stop retrying unknown errors after first attempt', () => {
      expect(shouldRetryOpenAIError(new Error('Unknown error'), 1)).toBe(true);
      expect(shouldRetryOpenAIError(new Error('Unknown error'), 2)).toBe(false);
    });
  });

  describe('Input Validation', () => {
    test('should throw error if maxAttempts < 1', async () => {
      await expect(
        retryWithBackoff(() => Promise.resolve('success'), {
          maxAttempts: 0,
          delayMs: 100,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow('maxAttempts must be at least 1');
    });

    test('should throw error if backoffMultiplier <= 0', async () => {
      await expect(
        retryWithBackoff(() => Promise.resolve('success'), {
          maxAttempts: 3,
          delayMs: 100,
          backoffMultiplier: 0,
        })
      ).rejects.toThrow('backoffMultiplier must be positive');
    });

    test('should throw error if delayMs < 0', async () => {
      await expect(
        retryWithBackoff(() => Promise.resolve('success'), {
          maxAttempts: 3,
          delayMs: -100,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow('delayMs must be non-negative');
    });
  });
});
