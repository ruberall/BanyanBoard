import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  const traceId = (req.headers['traceparent'] as string)?.split('-')[1] ?? randomUUID().replace(/-/g, '');
  (req as Request & { id: string; traceId: string }).id = requestId;
  (req as Request & { id: string; traceId: string }).traceId = traceId;
  next();
}
