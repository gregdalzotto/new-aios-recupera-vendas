export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
}

/**
 * Check if error is transient (should retry) vs permanent (should fail)
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const code = (error as any).code;

  // Network/connection errors (transient)
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
    return true;
  }

  if (
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound')
  ) {
    return true;
  }

  // PostgreSQL transient errors
  if (message.includes('server closed connection')) {
    return true;
  }

  if (message.includes('too many clients')) {
    return true;
  }

  // Too many connections
  if (message.includes('remaining connection slots are reserved')) {
    return true;
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with automatic retry on transient errors
 * Uses exponential backoff: initialDelayMs, initialDelayMs*2, initialDelayMs*4, ...
 *
 * Example:
 * ```
 * const user = await withRetry(() => UserRepository.findById(id));
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 3, initialDelayMs = 100 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isTransient = isTransientError(error);
      const isLastAttempt = attempt === maxRetries;

      // Don't retry if permanent error or out of retries
      if (!isTransient || isLastAttempt) {
        throw error;
      }

      // Calculate exponential backoff delay
      const delayMs = initialDelayMs * Math.pow(2, attempt - 1);

      // Log retry attempt (lazy-load logger to avoid circular dependency)
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const logger = require('../config/logger').default;
        logger.warn('Database operation failed, retrying', {
          attempt,
          maxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Ignore if logger not available during testing
      }

      await sleep(delayMs);
    }
  }

  // Should never reach here, but satisfy TypeScript
  throw new Error('Retry loop exited unexpectedly');
}
