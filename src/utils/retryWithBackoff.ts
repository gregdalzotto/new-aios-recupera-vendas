/**
 * Retry Logic with Exponential Backoff
 * Implements standard retry pattern for transient failures
 */

import logger from '../config/logger';

export interface RetryOptions {
  /**
   * Maximum number of retry attempts (total attempts including first try)
   * Example: maxAttempts = 3 means: try once, retry twice
   */
  maxAttempts: number;

  /**
   * Initial delay in milliseconds before first retry
   * Subsequent retries use exponential backoff: delay * (multiplier ^ attemptNumber)
   */
  delayMs: number;

  /**
   * Multiplier for exponential backoff calculation
   * Default: 2 (each retry waits 2x longer than previous)
   * Example: delayMs=1000, multiplier=2 → waits 1s, 2s, 4s
   */
  backoffMultiplier: number;

  /**
   * Optional callback when a retry is about to happen
   * Useful for logging, metrics, circuit breakers
   */
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;

  /**
   * Optional callback to determine if an error is retryable
   * If not provided, all errors are retried
   * Useful for: only retry network errors, not 4xx client errors, etc.
   */
  shouldRetry?: (error: Error, attempt: number) => boolean;

  /**
   * Trace ID for logging purposes
   * Helps correlate retries with original request
   */
  traceId?: string;
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of successful function execution
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => openai.chat.completions.create({ ... }),
 *   {
 *     maxAttempts: 3,
 *     delayMs: 1000,
 *     backoffMultiplier: 2,
 *     onRetry: (attempt, error, nextDelay) => {
 *       logger.warn(`Retry attempt ${attempt}`, { error: error.message, nextDelay });
 *     }
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: Error;
  const { maxAttempts, delayMs, backoffMultiplier, onRetry, shouldRetry, traceId } = options;

  // Validate configuration
  if (maxAttempts < 1) {
    throw new Error('maxAttempts must be at least 1');
  }

  if (delayMs < 0) {
    throw new Error('delayMs must be non-negative');
  }

  if (backoffMultiplier <= 0) {
    throw new Error('backoffMultiplier must be positive');
  }

  // Attempt the function with retries
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(err, attempt)) {
        logger.debug('Error not retryable, giving up', {
          traceId,
          attempt,
          error: err.message,
        });
        throw err;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxAttempts) {
        logger.error('All retry attempts exhausted', {
          traceId,
          maxAttempts,
          lastError: err.message,
        });
        throw err;
      }

      // Calculate delay for next retry with exponential backoff
      const nextDelayMs = delayMs * Math.pow(backoffMultiplier, attempt - 1);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt, err, nextDelayMs);
      } else {
        // Default logging
        logger.warn('Retrying after error', {
          traceId,
          attempt,
          maxAttempts,
          error: err.message,
          nextDelayMs,
        });
      }

      // Wait before retrying
      await sleep(nextDelayMs);
    }
  }

  // Should never reach here, but satisfy TypeScript
  throw lastError!;
}

/**
 * Sleep for specified milliseconds
 * @param ms - Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Predefined retry configurations for common scenarios
 */
export const RETRY_PRESETS = {
  /**
   * Conservative: 2 attempts, 1 second initial delay
   * Use for: Quick operations, real-time APIs
   */
  conservative: {
    maxAttempts: 2,
    delayMs: 1000,
    backoffMultiplier: 2,
  },

  /**
   * Standard: 3 attempts, 1 second initial delay
   * Use for: Most APIs, balanced retry/latency
   */
  standard: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffMultiplier: 2,
  },

  /**
   * Aggressive: 5 attempts, 500ms initial delay
   * Use for: Critical operations, can tolerate longer latency
   */
  aggressive: {
    maxAttempts: 5,
    delayMs: 500,
    backoffMultiplier: 2,
  },

  /**
   * Quick: 2 attempts, 100ms initial delay
   * Use for: Fast operations where latency matters
   */
  quick: {
    maxAttempts: 2,
    delayMs: 100,
    backoffMultiplier: 2,
  },
} as const;

/**
 * Detect if an error is network-related (and thus retryable)
 */
export function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const timeoutErrors = ['timeout', 'econnrefused', 'enotfound', 'econnreset', 'etimedout'];
  return timeoutErrors.some((msg) => message.includes(msg));
}

/**
 * Detect if an error is a rate limiting error (429, 503, etc.)
 */
export function isRateLimitError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('429') || // Too Many Requests
    message.includes('503') || // Service Unavailable
    message.includes('rate limit') || // Rate limit related errors
    message.includes('too many requests') // Common rate limit message
  );
}

/**
 * Should retry predicate for OpenAI-specific errors
 * Returns true if the error should be retried, false if it's permanent
 */
export function shouldRetryOpenAIError(error: Error, attempt: number): boolean {
  const message = error.message.toLowerCase();

  // Network errors: always retry
  if (isNetworkError(error)) {
    return true;
  }

  // Rate limiting: always retry
  if (isRateLimitError(error)) {
    return true;
  }

  // Timeout: retry (could be transient)
  if (message.includes('timeout')) {
    return true;
  }

  // 5xx errors: retry (server errors)
  if (message.includes('500') || message.includes('502') || message.includes('504')) {
    return true;
  }

  // 4xx errors (except 429): don't retry (client error)
  if (message.includes('400') || message.includes('401') || message.includes('403')) {
    return false;
  }

  // Unknown errors: retry once, then give up
  if (attempt >= 2) {
    return false;
  }

  return true;
}
