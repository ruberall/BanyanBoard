import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors';

export function requireFields(...fields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const body = req.body as Record<string, unknown> | null | undefined;
    for (const field of fields) {
      if (body == null || !(field in body)) {
        return next(new ValidationError(`Missing required field: ${field}`));
      }
    }
    next();
  };
}
