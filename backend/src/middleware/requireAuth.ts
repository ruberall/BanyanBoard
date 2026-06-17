import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors';

// Synchronous by design: session.userId is already in memory after express-session
// hydrates the session from the store. No async I/O happens here, so async is
// unnecessary and would prevent Express from catching thrown errors directly.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    req.log?.warn({ event: 'auth.unauthorized', path: req.path }, 'Unauthenticated request');
    throw new UnauthorizedError('Unauthorized');
  }
  next();
}
