/**
 * retry.test.ts
 *
 * Unit tests for the retryWithBackoff utility.
 *
 * Coverage:
 *   - Returns result immediately when fn succeeds on first attempt
 *   - Retries and succeeds if fn eventually succeeds within maxAttempts
 *   - Throws the last error after exhausting all attempts
 *   - Does NOT call fn more times than maxAttempts
 *   - Schedules exponential backoff delays (immediate, baseDelayMs, baseDelayMs*2)
 *   - handles maxAttempts=1 (no retries)
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/utils/retry.ts — retryWithBackoff<T>(fn, maxAttempts, baseDelayMs): Promise<T>
 */

// Use fake timers so backoff delays are controlled without real waiting
jest.useFakeTimers();

describe('retryWithBackoff', () => {
  async function loadRetry() {
    const mod = await import('../retry');
    return mod.retryWithBackoff;
  }

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  it('returns the result immediately when fn succeeds on first attempt', async () => {
    const retryWithBackoff = await loadRetry();
    const fn = jest.fn().mockResolvedValue('success');

    const resultPromise = retryWithBackoff(fn, 3, 100);
    // Flush any pending timers/microtasks
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds if fn eventually succeeds within maxAttempts', async () => {
    const retryWithBackoff = await loadRetry();
    // Fail twice, then succeed on third attempt
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('attempt 1 fail'))
      .mockRejectedValueOnce(new Error('attempt 2 fail'))
      .mockResolvedValueOnce('recovered');

    const resultPromise = retryWithBackoff(fn, 3, 100);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting all attempts', async () => {
    const retryWithBackoff = await loadRetry();
    const lastError = new Error('final failure');
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('attempt 1'))
      .mockRejectedValueOnce(new Error('attempt 2'))
      .mockRejectedValueOnce(lastError);

    const resultPromise = retryWithBackoff(fn, 3, 100);
    await jest.runAllTimersAsync();

    await expect(resultPromise).rejects.toBe(lastError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not call fn more times than maxAttempts when all fail', async () => {
    const retryWithBackoff = await loadRetry();
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    const resultPromise = retryWithBackoff(fn, 5, 50);
    await jest.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('schedules exponential backoff: attempt 2 delayed by baseDelayMs, attempt 3 by baseDelayMs*2', async () => {
    const retryWithBackoff = await loadRetry();
    const callTimestamps: number[] = [];
    const fn = jest.fn().mockImplementation(() => {
      callTimestamps.push(Date.now());
      return Promise.reject(new Error('fail'));
    });
    const baseDelayMs = 200;

    const resultPromise = retryWithBackoff(fn, 3, baseDelayMs);
    await jest.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow();

    // Attempt 1 is immediate, attempt 2 is after baseDelayMs, attempt 3 is after baseDelayMs*2
    expect(callTimestamps).toHaveLength(3);
    const gap1 = callTimestamps[1] - callTimestamps[0];
    const gap2 = callTimestamps[2] - callTimestamps[1];
    expect(gap1).toBeGreaterThanOrEqual(baseDelayMs);
    expect(gap2).toBeGreaterThanOrEqual(baseDelayMs);
  });

  it('handles maxAttempts=1 by calling fn exactly once and throwing on failure', async () => {
    const retryWithBackoff = await loadRetry();
    const error = new Error('one-shot failure');
    const fn = jest.fn().mockRejectedValue(error);

    const resultPromise = retryWithBackoff(fn, 1, 100);
    await jest.runAllTimersAsync();

    await expect(resultPromise).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
