import { config } from './config';
import { logger } from './logger';
import { createPool } from './db/pool';
import { runMigrations } from './db/migrate';
import { createApp } from './app';

async function main(): Promise<void> {
  const pool = createPool(config);

  if (config.RUN_MIGRATIONS_ON_START !== false) {
    logger.info('Running database migrations...');
    await runMigrations(pool, config);
    logger.info('Migrations complete');
  }

  const app = createApp({ config, logger, pool });

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'API server listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(async () => {
      await pool.end();
      logger.info('Server and pool closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
