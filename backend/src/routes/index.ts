import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { createHealthRouter } from './health';
import { createAuthRouter } from './auth';
import { requireAuth } from '../middleware/requireAuth';
import { createBoardsRouter } from './boards';
import { createColumnCardsRouter, createCardsRouter } from './cards';

export function createRouter(db: Queryable): Router {
  const router = Router();

  // Public routes — must be registered before requireAuth.
  // Express matches middleware in registration order; mounting auth routes after
  // requireAuth would block login/register with a 401 before they could respond.
  router.use(createHealthRouter(db));
  router.use('/auth', createAuthRouter(db));

  // Auth gate — all routes registered after this middleware require a valid session.
  router.use(requireAuth);

  // Protected routes
  router.use('/boards', createBoardsRouter(db));
  router.use('/columns', createColumnCardsRouter(db));
  router.use('/cards', createCardsRouter(db));

  return router;
}
