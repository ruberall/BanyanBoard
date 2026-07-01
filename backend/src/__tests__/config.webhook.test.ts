/**
 * config.webhook.test.ts
 *
 * Tests that the 4 new WEBHOOK_* config fields added in TASK-019 Phase 1 have
 * the correct defaults when the environment variables are absent.
 *
 * These tests mock process.env before importing the config module to avoid
 * triggering the real dotenv + process.exit at module load.
 *
 * Tests will FAIL until the Coding Agent adds to src/config.ts:
 *   WEBHOOK_MAX_ATTEMPTS         (default: 3)
 *   WEBHOOK_BACKOFF_MS           (default: 30000)
 *   WEBHOOK_REQUEST_TIMEOUT_MS   (default: 5000)
 *   WEBHOOK_BLOCK_PRIVATE_RANGES (default: true)
 */

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Config — WEBHOOK_* fields', () => {
  const REQUIRED_ENV = {
    NODE_ENV:     'test',
    DATABASE_URL: 'postgres://test:test@localhost:5432/testdb',
    LOG_LEVEL:    'silent',
    LOG_FORMAT:   'json',
  };

  beforeEach(() => {
    jest.resetModules();
  });

  it('WEBHOOK_MAX_ATTEMPTS defaults to 3 when not set', async () => {
    // Arrange
    const saved = process.env;
    process.env = { ...REQUIRED_ENV };

    try {
      // Act — dynamic import to get a fresh module with the mocked env
      const { config } = await import('../config');

      // Assert
      expect(config.WEBHOOK_MAX_ATTEMPTS).toBe(3);
    } finally {
      process.env = saved;
    }
  });

  it('WEBHOOK_BACKOFF_MS defaults to 30000 when not set', async () => {
    // Arrange
    const saved = process.env;
    process.env = { ...REQUIRED_ENV };

    try {
      const { config } = await import('../config');

      // Assert
      expect(config.WEBHOOK_BACKOFF_MS).toBe(30000);
    } finally {
      process.env = saved;
    }
  });

  it('WEBHOOK_REQUEST_TIMEOUT_MS defaults to 5000 when not set', async () => {
    // Arrange
    const saved = process.env;
    process.env = { ...REQUIRED_ENV };

    try {
      const { config } = await import('../config');

      // Assert
      expect(config.WEBHOOK_REQUEST_TIMEOUT_MS).toBe(5000);
    } finally {
      process.env = saved;
    }
  });

  it('WEBHOOK_BLOCK_PRIVATE_RANGES defaults to true when not set', async () => {
    // Arrange
    const saved = process.env;
    process.env = { ...REQUIRED_ENV };

    try {
      const { config } = await import('../config');

      // Assert
      expect(config.WEBHOOK_BLOCK_PRIVATE_RANGES).toBe(true);
    } finally {
      process.env = saved;
    }
  });

  it('WEBHOOK_* fields can be overridden via environment variables', async () => {
    // Arrange
    const saved = process.env;
    process.env = {
      ...REQUIRED_ENV,
      WEBHOOK_MAX_ATTEMPTS:          '5',
      WEBHOOK_BACKOFF_MS:            '60000',
      WEBHOOK_REQUEST_TIMEOUT_MS:    '10000',
      WEBHOOK_BLOCK_PRIVATE_RANGES:  'false',
    };

    try {
      const { config } = await import('../config');

      // Assert — env overrides take precedence
      expect(config.WEBHOOK_MAX_ATTEMPTS).toBe(5);
      expect(config.WEBHOOK_BACKOFF_MS).toBe(60000);
      expect(config.WEBHOOK_REQUEST_TIMEOUT_MS).toBe(10000);
      expect(config.WEBHOOK_BLOCK_PRIVATE_RANGES).toBe(false);
    } finally {
      process.env = saved;
    }
  });
});
