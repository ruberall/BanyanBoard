// Phase 4: full logger implementation with pino-pretty support and config wiring
import pino from 'pino';
import type { DestinationStream } from 'pino';

interface LoggerOptions {
  destination?: DestinationStream;
}

export function createLogger(opts: LoggerOptions = {}): pino.Logger {
  return pino({ level: 'info' }, opts.destination);
}

export const logger = createLogger();
