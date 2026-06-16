import type { BoardRepository, Board, BoardWithColumns, PaginatedResult } from '../repositories/board.repository';
import { ValidationError } from '../errors';
import { logger } from '../logger';

export class BoardService {
  constructor(private readonly repo: BoardRepository) {}

  async createBoard(name: string): Promise<Board> {
    // Normalise before validation so callers don't need to pre-trim,
    // and so the DB never stores leading/trailing whitespace.
    const trimmed = (name ?? '').trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Board name is required');
    }
    if (trimmed.length > 255) {
      throw new ValidationError('Board name must be 255 characters or fewer');
    }
    const board = await this.repo.createBoard(trimmed);
    logger.info({ boardId: board.id }, 'Board created');
    return board;
  }

  async getAllBoards(page: number, limit: number): Promise<PaginatedResult<Board>> {
    return this.repo.findAllBoards(page, limit);
  }

  async getBoardById(id: string): Promise<BoardWithColumns> {
    return this.repo.findBoardById(id);
  }

  async deleteBoard(id: string): Promise<void> {
    await this.repo.deleteBoard(id);
    logger.info({ boardId: id }, 'Board deleted');
  }
}
