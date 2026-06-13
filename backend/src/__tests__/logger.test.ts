/**
 * logger.test.ts
 *
 * Phase 4 coverage: pino logger singleton + LOG_LEVEL configuration
 *
 * Strategy: use pino's `destination` option to capture log output into an
 * in-memory stream, then parse it as JSON to assert field structure.
 * Each test resets the module registry to get a fresh logger instance with
 * a clean environment.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/logger.ts — pino singleton exported as `logger`
 *                   must honour LOG_LEVEL and LOG_FORMAT env vars
 */

import { Writable } from 'stream';

// ---------------------------------------------------------------------------
// Helper — collects pino output lines from a writable stream
// ---------------------------------------------------------------------------
function makeLogCapture(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, lines: () => chunks };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('logger', () => {
  beforeEach(() => {
    // Ensure each test gets a fresh module load with whatever env we set
    jest.resetModules();
  });

  afterEach(() => {
    // Clean up env vars we may have set
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
  });

  it('writes JSON-structured output with required fields (level, msg)', async () => {
    // Arrange — set env vars before importing logger so the module sees them
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FORMAT = 'json';

    const { stream, lines } = makeLogCapture();

    // Dynamic import AFTER env setup and after resetModules() so logger.ts
    // re-reads the env. The logger module must accept an optional destination
    // stream for testability — e.g., createLogger(destination?) or logger.ts
    // exports createLogger used internally to build the singleton.
    const { createLogger } = await import('../logger');
    const log = createLogger({ destination: stream });

    // Act
    log.info('hello from test');

    // Give the stream a tick to flush
    await new Promise<void>((resolve) => setImmediate(resolve));

    // Assert — at least one line, first line is valid JSON with expected fields
    const outputLines = lines().filter((l) => l.trim().length > 0);
    expect(outputLines.length).toBeGreaterThanOrEqual(1);

    const parsed = JSON.parse(outputLines[0]);
    expect(parsed).toHaveProperty('level');
    expect(parsed).toHaveProperty('msg');
    // pino uses numeric levels internally; ensure msg is our string
    expect(parsed.msg).toBe('hello from test');
  });

  it('respects LOG_LEVEL — debug messages suppressed when LOG_LEVEL=warn', async () => {
    // Arrange
    process.env.LOG_LEVEL = 'warn';
    process.env.LOG_FORMAT = 'json';

    const { stream, lines } = makeLogCapture();

    const { createLogger } = await import('../logger');
    const log = createLogger({ destination: stream });

    // Act — log one debug message (should be suppressed) and one warn (should appear)
    log.debug('this should be dropped');
    log.warn('this should appear');

    await new Promise<void>((resolve) => setImmediate(resolve));

    // Assert
    const outputLines = lines().filter((l) => l.trim().length > 0);

    // Only the warn message should be present
    expect(outputLines).toHaveLength(1);
    const parsed = JSON.parse(outputLines[0]);
    expect(parsed.msg).toBe('this should appear');
  });
});
