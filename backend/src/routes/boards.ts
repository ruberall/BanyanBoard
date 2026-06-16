import { Router } from 'express';
import type { Queryable } from '../db/queryable';
import { BoardRepository } from '../repositories/board.repository';
import { BoardService } from '../services/board.service';
import { asyncHandler } from '../lib/asyncHandler';
import { requireFields } from '../middleware/validate';

/**
 * Factory for the /boards router.
 * Receives the shared Queryable so the same db connection/pool flows through
 * the repository — consistent with the app-factory DI pattern.
 */
export function createBoardsRouter(db: Queryable): Router {
  const repo = new BoardRepository(db);
  const service = new BoardService(repo);
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    // Phase 1 shim: hardcoded defaults — replaced with query-param parsing in Phase 2
    const result = await service.getAllBoards(1, 20);
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
