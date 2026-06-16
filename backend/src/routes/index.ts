import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { createHealthRouter } from './health';
import { createBoardsRouter } from './boards';
import { createColumnCardsRouter, createCardsRouter } from './cards';

export function createRouter(db: Queryable): Router {
  const router = Router();
  router.use(createHealthRouter(db));
  router.use('/boards', createBoardsRouter(db));
  router.use('/columns', createColumnCardsRouter(db));
  router.use('/cards', createCardsRouter(db));
  return router;
}
