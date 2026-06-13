import express, { Express } from 'express';
import type { Config } from './config';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { createRouter } from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import { requestContext } from './middleware/requestContext';
import { createHttpLogger } from './logger';

interface AppDeps {
  config: Config;
  logger: Logger;
  pool: Pool;
}

export function createApp(deps: AppDeps): Express {
  const { logger: _logger } = deps;
  const app = express();

  app.use(express.json());
  app.use(requestContext);
  app.use(createHttpLogger());

  // Feature routes
  app.use(createRouter());

  // Terminal error handler (must be last)
  app.use(errorHandler);

  return app;
}
