import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../logger';
import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      id: string;
      traceId: string;
      log: Logger;
    }
  }
}

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  const traceId =
    (req.headers['traceparent'] as string)?.split('-')[1] ?? randomUUID().replace(/-/g, '');

  req.id = requestId;
  req.traceId = traceId;
  req.log = logger.child({ requestId, traceId });
  next();
}
