import pino from 'pino';
import type { DestinationStream, Logger } from 'pino';

interface LoggerOptions {
  destination?: DestinationStream;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = (process.env.LOG_LEVEL as pino.LevelWithSilent) ?? 'info';
  const format = process.env.LOG_FORMAT ?? 'json';

  const pinoOpts: pino.LoggerOptions = {
    level,
    base: {
      service: 'banyanboard-api',
      version: process.env.npm_package_version ?? '0.0.1',
      environment: process.env.NODE_ENV ?? 'development',
    },
    redact: {
      paths: (process.env.LOG_REDACT_PATTERNS ?? 'password,secret,token,authorization,cookie').split(','),
      censor: '[REDACTED]',
    },
  };

  if (format === 'pretty' && !opts.destination) {
    return pino({ ...pinoOpts, transport: { target: 'pino-pretty', options: { colorize: true } } });
  }

  return opts.destination ? pino(pinoOpts, opts.destination) : pino(pinoOpts);
}

export const logger = createLogger();
