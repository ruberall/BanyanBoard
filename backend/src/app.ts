import express, { Express } from 'express';
import session from 'express-session';
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

  // Session middleware mounted after requestContext: requestContext attaches req.log,
  // which session error handling (and the store's own logging) depend on.
  // Mounting it before requestContext would leave req.log undefined.
  const sessionSecret = deps.config.SESSION_SECRET ?? 'dev_only_secret_at_least_32_chars_long';
  if (deps.config.NODE_ENV === 'production' && !deps.config.SESSION_SECRET) {
    deps.logger.error(
      { event: 'config.insecure_session_secret' },
      'SESSION_SECRET is not set in production. Set a random 32+ character secret.',
    );
    process.exit(1);
  }
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: deps.config.SESSION_SECURE ?? false,
      maxAge: deps.config.SESSION_COOKIE_MAX_AGE_MS ?? (7 * 24 * 60 * 60 * 1000),
    },
  }));

  // Feature routes — pool passed as Queryable for repository injection
  app.use(createRouter(deps.pool));

  // Terminal error handler (must be last)
  app.use(errorHandler);

  return app;
}
