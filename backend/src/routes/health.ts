import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { HealthRepository } from '../repositories/health.repository';
import { HealthService } from '../services/health.service';
import { asyncHandler } from '../lib/asyncHandler';

export function createHealthRouter(db: Queryable): Router {
  const repo = new HealthRepository(db);
  const service = new HealthService(repo);
  const router = Router();

  router.get('/health', asyncHandler(async (_req, res) => {
    const result = await service.check();
    res.json(result);
  }));

  return router;
}
