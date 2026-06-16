import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { BoardRepository } from '../repositories/board.repository';
import { BoardService } from '../services/board.service';
import { asyncHandler } from '../lib/asyncHandler';
import { requireFields } from '../middleware/validate';
import { ValidationError } from '../errors';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query: Record<string, unknown>): { page: number; limit: number } {
  const rawPage = query['page'];
  const rawLimit = query['limit'];

  const page = rawPage === undefined ? DEFAULT_PAGE : Number(rawPage);
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);

  if (!Number.isInteger(page) || page < 1) {
    throw new ValidationError('page must be an integer ≥ 1');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  return { page, limit };
}

/**
 * Factory for the /boards router.
 * Receives the shared Queryable so the same db connection/pool flows through
 * the repository — consistent with the app-factory DI pattern.
 */
export function createBoardsRouter(db: Queryable): Router {
  const repo = new BoardRepository(db);
  const service = new BoardService(repo);
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const result = await service.getAllBoards(page, limit);
    res.json(result);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const board = await service.getBoardById(req.params.id);
    res.json(board);
  }));

  router.post('/', requireFields('name'), asyncHandler(async (req, res) => {
    const board = await service.createBoard(req.body?.name);
    res.status(201).json(board);
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await service.deleteBoard(req.params.id);
    res.status(204).send();
  }));

  return router;
}
