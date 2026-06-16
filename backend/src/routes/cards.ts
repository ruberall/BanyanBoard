import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { CardRepository } from '../repositories/card.repository';
import { CardService } from '../services/card.service';
import { asyncHandler } from '../lib/asyncHandler';
import { ValidationError } from '../errors';

const VALID_PATCH_FIELDS = new Set(['title', 'description', 'due_date', 'labels']);

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

  const labels = body['labels'];
  if (labels !== undefined && labels !== null) {
    if (!Array.isArray(labels)) {
      throw new ValidationError('labels must be an array of strings');
    }
    if ((labels as unknown[]).some((l) => typeof l !== 'string')) {
      throw new ValidationError('labels must be an array of strings');
    }
  }
}

/**
 * Router for column-scoped card endpoints.
 * Mount at /columns to expose:
 *   POST   /columns/:columnId/cards
 *   GET    /columns/:columnId/cards
 */
export function createColumnCardsRouter(db: Queryable): Router {
  const repo = new CardRepository(db);
  const service = new CardService(repo);
  const router = Router();

  router.post('/:columnId/cards', asyncHandler(async (req, res) => {
    validateCardInput(req.body ?? {}, true);
    const card = await service.createCard(req.params.columnId, req.body);
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
export function createCardsRouter(db: Queryable): Router {
  const repo = new CardRepository(db);
  const service = new CardService(repo);
  const router = Router();

  router.get('/:id', asyncHandler(async (req, res) => {
    const card = await service.getCardById(req.params.id);
    res.json(card);
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const body: Record<string, unknown> = req.body ?? {};

    const hasValidField = Object.keys(body).some((k) => VALID_PATCH_FIELDS.has(k));
    if (!hasValidField) {
      throw new ValidationError('No valid fields to update');
    }

    validateCardInput(body, false);

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
