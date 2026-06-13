import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { createHealthRouter } from './health';

export function createRouter(db: Queryable): Router {
  const router = Router();
  router.use(createHealthRouter(db));
  return router;
}
