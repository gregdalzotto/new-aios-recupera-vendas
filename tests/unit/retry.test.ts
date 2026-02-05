import { withRetry } from '../../src/utils/retry';

describe('Retry Logic', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient error (ECONNREFUSED)', async () => {
    const error = new Error('ECONNREFUSED');
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const result = await withRetry(fn, { initialDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on transient error (ETIMEDOUT)', async () => {
    const error = new Error('ETIMEDOUT');
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const result = await withRetry(fn, { initialDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on transient error (server closed connection)', async () => {
    const error = new Error('server closed connection unexpectedly');
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const result = await withRetry(fn, { initialDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on permanent error (duplicate key)', async () => {
    const error = new Error('duplicate key value violates unique constraint');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn)).rejects.toThrow('duplicate key');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not retry on permanent error (syntax error)', async () => {
    const error = new Error('syntax error in SQL');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn)).rejects.toThrow('syntax error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect maxRetries option', async () => {
    const error = new Error('ECONNREFUSED');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 10 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should give up after maxRetries exceeded', async () => {
    const error = new Error('ECONNREFUSED');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxRetries: 3, initialDelayMs: 10 })).rejects.toThrow(
      'ECONNREFUSED'
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should handle "too many clients" error (transient)', async () => {
    const error = new Error('sorry, too many clients already');
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const result = await withRetry(fn, { initialDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-Error types', async () => {
    const fn = jest.fn().mockRejectedValue('string error');

    await expect(withRetry(fn)).rejects.toBe('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should support custom initialDelayMs', async () => {
    const error = new Error('ECONNREFUSED');
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const result = await withRetry(fn, { initialDelayMs: 5, maxRetries: 2 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle code property for transient error', async () => {
    const error = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
    const fn = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success');

    const result = await withRetry(fn, { initialDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should correctly calculate exponential backoff times', async () => {
    // Verify the logic mathematically without using fake timers
    const error = new Error('ECONNREFUSED');
    let callCount = 0;
    const startTime = Date.now();

    const fn = jest.fn(async () => {
      callCount++;
      if (callCount < 3) {
        throw error;
      }
      return 'success';
    });

    const result = await withRetry(fn, { initialDelayMs: 20, maxRetries: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);

    // Verify timing: roughly 20ms + 40ms = 60ms total
    const totalTime = Date.now() - startTime;
    expect(totalTime).toBeGreaterThanOrEqual(50); // Some tolerance for system timing
  });
});
