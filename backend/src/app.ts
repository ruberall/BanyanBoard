// Phase 1: Health route wired. Phase 2: add middleware, remaining routes, errorHandler.
import express, { Express } from 'express';
import type { Config } from './config';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { createHealthRouter } from './routes/health';

interface AppDeps {
  config: Config;
  logger: Logger;
  pool: Pool;
}

export function createApp(_deps: AppDeps): Express {
  const app = express();

  app.use(express.json());

  // Health route — wired in Phase 1 so tests pass immediately
  app.use(createHealthRouter());

  // Phase 2: wire requestContext middleware, remaining routes, errorHandler

  return app;
}
