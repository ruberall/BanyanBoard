import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { AutomationRepository } from '../repositories/automation.repository';
import { AutomationService } from '../services/automation.service';
import { asyncHandler } from '../lib/asyncHandler';

export function createAutomationRouter(db: Queryable): Router {
  const repo = new AutomationRepository(db);
  const service = new AutomationService(repo);
  const router = Router({ mergeParams: true });

  // POST /boards/:boardId/automation-rules
  router.post('/', asyncHandler(async (req, res) => {
    const { boardId } = req.params;
    const { trigger_type, webhook_url, enabled } = req.body;
    const rule = await service.createRule(boardId, { trigger_type, webhook_url, enabled });
    res.status(201).json(rule);
  }));

  // GET /boards/:boardId/automation-rules
  router.get('/', asyncHandler(async (req, res) => {
    const { boardId } = req.params;
    const rules = await service.listRules(boardId);
    res.json(rules);
  }));

  // PATCH /boards/:boardId/automation-rules/:ruleId
  router.patch('/:ruleId', asyncHandler(async (req, res) => {
    const { ruleId } = req.params;
    const { enabled } = req.body;
    const rule = await service.updateRuleEnabled(ruleId, enabled);
    res.json(rule);
  }));

  // DELETE /boards/:boardId/automation-rules/:ruleId
  router.delete('/:ruleId', asyncHandler(async (req, res) => {
    const { ruleId } = req.params;
    await service.deleteRule(ruleId);
    res.status(204).send();
  }));

  return router;
}

export function createWebhookDeliveriesRouter(db: Queryable): Router {
  const repo = new AutomationRepository(db);
  const service = new AutomationService(repo);
  const router = Router({ mergeParams: true });

  // GET /boards/:boardId/webhook-deliveries
  router.get('/', asyncHandler(async (req, res) => {
    const { boardId } = req.params;
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
    const cursor = req.query.cursor as string | undefined;
    const page = await service.listDeliveries(boardId, limit, cursor);
    res.json(page);
  }));

  return router;
}
