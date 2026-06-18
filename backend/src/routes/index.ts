import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { createHealthRouter } from './health';
import { createAuthRouter } from './auth';
import { requireAuth } from '../middleware/requireAuth';
import { createBoardsRouter } from './boards';
import { createColumnCardsRouter, createCardsRouter } from './cards';
import type { DomainEventBus } from '../events/domain-event-bus';
import { EventService } from '../services/event.service';

export function createRouter(db: Queryable, bus?: DomainEventBus): Router {
  const router = Router();

  const eventService = bus ? new EventService(bus, db) : undefined;

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
  router.use('/cards', createCardsRouter(db, bus, eventService));

  return router;
}
