import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { createHealthRouter } from './health';
import { createBoardsRouter } from './boards';

export function createRouter(db: Queryable): Router {
  const router = Router();
  router.use(createHealthRouter(db));
  router.use('/boards', createBoardsRouter(db));
  return router;
}
