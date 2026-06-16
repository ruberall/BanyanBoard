import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
  } else if (err instanceof SyntaxError && 'body' in err) {
    // body-parser sets `body` on the SyntaxError it throws for malformed JSON
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Malformed JSON in request body' });
  } else {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
  }
}
