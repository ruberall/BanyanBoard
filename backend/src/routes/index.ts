import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { createHealthRouter } from './health';
import { createAuthRouter } from './auth';
import { requireAuth } from '../middleware/requireAuth';
import { createBoardsRouter } from './boards';
import { createColumnCardsRouter, createCardsRouter } from './cards';
import { createFeedRouter } from './feed';
import type { DomainEventBus } from '../events/domain-event-bus';
import { EventService } from '../services/event.service';
import { UserRepository } from '../repositories/user.repository';
import type { Config } from '../config';
import { WorkflowService } from '../services/workflow.service';
import { WorkflowRepository } from '../repositories/workflow.repository';

export function createRouter(db: Queryable, bus?: DomainEventBus, config?: Config): Router {
  const router = Router();

  const userRepo = new UserRepository(db);
  const eventService = bus ? new EventService(bus, db, userRepo) : undefined;

  // Workflow service — always wired; uses env-configured stale age (default 2 days).
  const workflowRepo = new WorkflowRepository(db);
  const workflowService = new WorkflowService(workflowRepo, {
    workflowStaleAgeDays:     config?.WORKFLOW_STALE_AGE_DAYS     ?? 2,
    workflowRule2BaseDelayMs: config?.WORKFLOW_RULE2_BASE_DELAY_MS ?? 200,
    workflowRule2MaxAttempts: config?.WORKFLOW_RULE2_MAX_ATTEMPTS  ?? 3,
  });

  // Public routes — must be registered before requireAuth.
  // Express matches middleware in registration order; mounting auth routes after
  // requireAuth would block login/register with a 401 before they could respond.
  router.use(createHealthRouter(db));
  router.use('/auth', createAuthRouter(db));

  // Auth gate — all routes registered after this middleware require a valid session.
  router.use(requireAuth);

  // Protected routes
  router.use('/boards', createBoardsRouter(db, workflowService));
  router.use('/columns', createColumnCardsRouter(db, eventService));
  router.use('/cards', createCardsRouter(db, eventService, workflowService));

  // SSE activity feed — only mounted when a bus is provided
  if (bus) {
    router.use('/boards/:boardId/events', createFeedRouter(db, bus, config));
  }

  return router;
}
