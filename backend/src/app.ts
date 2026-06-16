import express, { Express } from 'express';
import type { Config } from './config';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { createRouter } from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import { requestContext } from './middleware/requestContext';
import { createRequestLogger } from './middleware/requestLogger';
import { corsMiddleware } from './middleware/cors';

interface AppDeps {
  config: Config;
  logger: Logger;
  pool: Pool;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  app.use(corsMiddleware());
  app.use(express.json());
  app.use(requestContext);
  app.use(createRequestLogger());

  // Feature routes — pool passed as Queryable for repository injection
  app.use(createRouter(deps.pool));

  // Terminal error handler (must be last)
  app.use(errorHandler);

  return app;
}
