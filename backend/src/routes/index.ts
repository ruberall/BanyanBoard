import { Router } from 'express';
import { createHealthRouter } from './health';

export function createRouter(): Router {
  const router = Router();
  router.use(createHealthRouter());
  return router;
}
