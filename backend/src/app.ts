import express, { Express } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Config } from './config';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { createRouter } from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import { requestContext } from './middleware/requestContext';
import { createRequestLogger } from './middleware/requestLogger';
import { corsMiddleware } from './middleware/cors';
import type { DomainEventBus } from './events/domain-event-bus';

interface AppDeps {
  config: Config;
  logger: Logger;
  pool: Pool;
  bus?: DomainEventBus;
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

  // Use PostgreSQL-backed session store in non-test environments.
  // Route tests inject stub pools — using PgSession there would intercept
  // pool.query calls before domain queries, breaking the mock chain.
  const sessionStore = deps.config.NODE_ENV !== 'test'
    ? new (connectPgSimple(session))({ pool: deps.pool, createTableIfMissing: true })
    : undefined;

  app.use(session({
    store: sessionStore,
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
  app.use(createRouter(deps.pool, deps.bus, deps.config));

  // Terminal error handler (must be last)
  app.use(errorHandler);

  return app;
}
