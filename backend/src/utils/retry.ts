/**
 * Retries an async function with exponential backoff.
 *
 * The function is attempted up to `maxAttempts` times. The first attempt runs
 * immediately. Before each subsequent attempt, execution waits for a delay that
 * grows exponentially: attempt 2 waits `baseDelayMs`, attempt 3 waits
 * `baseDelayMs * 2`, attempt 4 waits `baseDelayMs * 4`, and so on.
 *
 * If every attempt fails, the error from the final attempt is thrown.
 *
 * @param fn - The async operation to attempt.
 * @param maxAttempts - Maximum number of attempts (>= 1).
 * @param baseDelayMs - Base delay in milliseconds used for the first backoff.
 * @returns The resolved value of `fn` on first success.
 * @throws The last error encountered if all attempts fail.
 */
export function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  // Separate the exposed promise from the inner async work so we can attach
  // a no-op rejection handler synchronously. This prevents Node from
  // emitting unhandledRejection / PromiseRejectionHandledWarning when Jest's
  // fake-timer advancement (jest.runAllTimersAsync) completes the retry loop
  // before the caller's `await expect(p).rejects` attaches its handler.
  let resolveOuter!: (value: T) => void;
  let rejectOuter!: (reason: unknown) => void;

  const outerPromise = new Promise<T>((res, rej) => {
    resolveOuter = res;
    rejectOuter = rej;
  });

  // Mark the returned promise as "handled" immediately so Node never
  // considers it unhandled, regardless of when the caller attaches .catch().
  outerPromise.catch(() => {
    // intentionally empty — the real rejection is surfaced to the caller
    // via the promise itself; this handler simply prevents the
    // PromiseRejectionHandledWarning under Node 15+/Jest fake timers.
  });

  // Run the retry logic asynchronously and pipe the result to outerPromise.
  const runRetry = async (): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Use Promise.allSettled so fn()'s own rejection is consumed
      // immediately — it never escapes as an unhandled rejection.
      const [result] = await Promise.allSettled([fn()]);

      if (result.status === 'fulfilled') {
        return result.value;
      }

      lastError = result.reason;

      if (attempt >= maxAttempts) {
        throw lastError;
      }

      // Exponential backoff: attempt 1→ wait baseDelayMs, attempt 2→ wait baseDelayMs*2, etc.
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise<void>(resolve => {
        setTimeout(resolve, delayMs);
      });
    }

    // Unreachable (loop always returns or throws above).
    throw lastError;
  };

  runRetry().then(resolveOuter, rejectOuter);

  return outerPromise;
}
