import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { CardRepository } from '../repositories/card.repository';
import { CardService } from '../services/card.service';
import type { EventService } from '../services/event.service';
import type { WorkflowService } from '../services/workflow.service';
import type { AutomationService } from '../services/automation.service';
import { asyncHandler } from '../lib/asyncHandler';
import { ValidationError } from '../errors';

const VALID_PATCH_FIELDS = new Set(['title', 'description', 'due_date', 'labels', 'color']);

function validateCardInput(body: Record<string, unknown>, requireTitle: boolean): void {
  const title = body['title'];

  if (requireTitle) {
    if (title === undefined || title === null) {
      throw new ValidationError('title is required');
    }
  }

  if (title !== undefined && title !== null) {
    if (typeof title !== 'string' || (title as string).trim().length === 0) {
      throw new ValidationError('title must be a non-empty string');
    }
    if ((title as string).length > 255) {
      throw new ValidationError('title must be 255 characters or fewer');
    }
  }

  const dueDate = body['due_date'];
  if (dueDate !== undefined && dueDate !== null) {
    if (typeof dueDate !== 'string' || isNaN(Date.parse(dueDate as string))) {
      throw new ValidationError('due_date must be a valid ISO 8601 timestamp');
    }
  }

  const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

  const cardColor = body['color'];
  if (cardColor !== undefined && cardColor !== null) {
    if (typeof cardColor !== 'string' || !HEX_COLOR_RE.test(cardColor as string)) {
      throw new ValidationError('color must be a valid hex color (#rrggbb)');
    }
  }

  const labels = body['labels'];
  if (labels !== undefined && labels !== null) {
    if (!Array.isArray(labels)) {
      throw new ValidationError('labels must be an array');
    }
    for (const l of labels as unknown[]) {
      if (typeof l !== 'object' || l === null || typeof (l as Record<string, unknown>)['name'] !== 'string') {
        throw new ValidationError('labels must be an array of objects with a name string');
      }
      const color = (l as Record<string, unknown>)['color'];
      // null is intentionally rejected here (coerces to "null" which fails regex);
      // omit color entirely to use the default (#95B9C7 applied downstream).
      if (color !== undefined && !HEX_COLOR_RE.test(color as string)) {
        throw new ValidationError('labels[].color must be a valid hex color (#rrggbb)');
      }
    }
  }
}

/**
 * Router for column-scoped card endpoints.
 * Mount at /columns to expose:
 *   POST   /columns/:columnId/cards
 *   GET    /columns/:columnId/cards
 */
export function createColumnCardsRouter(db: Queryable, eventService?: EventService): Router {
  const repo = new CardRepository(db);
  const service = new CardService(repo, db, eventService);
  const router = Router();

  router.post('/:columnId/cards', asyncHandler(async (req, res) => {
    validateCardInput(req.body ?? {}, true);
    const actorId = req.session?.userId ?? null;
    const card = await service.createCard(req.params.columnId, req.body, actorId);
    res.status(201).json(card);
  }));

  router.get('/:columnId/cards', asyncHandler(async (req, res) => {
    const cards = await service.getCardsByColumnId(req.params.columnId);
    res.json(cards);
  }));

  return router;
}

/**
 * Router for card-scoped endpoints.
 * Mount at /cards to expose:
 *   GET    /cards/:id
 *   PATCH  /cards/:id
 *   DELETE /cards/:id
 */
export function createCardsRouter(
  db: Queryable,
  eventService?: EventService,
  workflowService?: WorkflowService,
  automationService?: AutomationService,
): Router {
  const repo = new CardRepository(db);
  const service = new CardService(repo, db, eventService, workflowService, automationService);
  const router = Router();

  router.get('/:id', asyncHandler(async (req, res) => {
    const card = await service.getCardById(req.params.id);
    res.json(card);
  }));

  // MUST be registered before PATCH /:id — prevents Express matching "move" as a card UUID
  router.patch('/:id/move', asyncHandler(async (req, res) => {
    const body: Record<string, unknown> = req.body ?? {};

    const columnId = body['column_id'];
    if (!columnId || typeof columnId !== 'string' || (columnId as string).trim().length === 0) {
      throw new ValidationError('column_id is required');
    }

    const rawAfterCardId = body['after_card_id'];
    let afterCardId: string | null = null;
    if (rawAfterCardId !== undefined && rawAfterCardId !== null) {
      if (typeof rawAfterCardId !== 'string' || (rawAfterCardId as string).trim().length === 0) {
        throw new ValidationError('after_card_id must be a non-empty string');
      }
      afterCardId = rawAfterCardId as string;
    }

    const actorId = req.session?.userId ?? null;
    const card = await service.moveCard(req.params.id, columnId as string, afterCardId, actorId);
    res.json(card);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const body: Record<string, unknown> = req.body ?? {};

    const hasValidField = Object.keys(body).some((k) => VALID_PATCH_FIELDS.has(k));
    if (!hasValidField) {
      throw new ValidationError('No valid fields to update');
    }

    validateCardInput(body, false);

    if ('labels' in body && Array.isArray(body['labels'])) {
      body['labels'] = (body['labels'] as Record<string, unknown>[]).map((l) => ({
        name: l['name'],
        color: l['color'] ?? '#95B9C7',
      }));
    }

    const updates: Record<string, unknown> = {};
    for (const field of VALID_PATCH_FIELDS) {
      if (field in body) updates[field] = body[field];
    }

    const card = await service.updateCard(req.params.id, updates as Parameters<typeof service.updateCard>[1]);
    res.json(card);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await service.deleteCard(req.params.id);
    res.status(204).send();
  }));

  return router;
}
