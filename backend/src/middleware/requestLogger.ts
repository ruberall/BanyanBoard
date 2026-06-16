import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import { createLogger } from '../logger';

export function createRequestLogger(logger?: Logger) {
  const log = logger ?? createLogger();
  return pinoHttp({ logger: log });
}
