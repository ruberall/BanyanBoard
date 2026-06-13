import migrate from 'node-pg-migrate';
import path from 'path';
import type { Pool } from 'pg';
import type { Config } from '../config';
import { logger } from '../logger';

export async function runMigrations(_pool: Pool, config: Config): Promise<void> {
  const migrationsDir = config.MIGRATIONS_DIR ?? 'migrations';

  logger.info({ migrationsDir }, 'Running database migrations');

  try {
    await migrate({
      databaseUrl: config.DATABASE_URL,
      migrationsTable: 'pgmigrations',
      dir: path.resolve(process.cwd(), migrationsDir),
      direction: 'up',
      count: Infinity,
      verbose: false,
    });
    logger.info('Database migrations completed');
  } catch (err) {
    logger.error({ err }, 'Database migration failed');
    throw err;
  }
}
