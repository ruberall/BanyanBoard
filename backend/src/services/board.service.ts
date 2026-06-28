import type { BoardRepository, Board, BoardWithColumns, PaginatedResult } from '../repositories/board.repository';
import { ValidationError } from '../errors';
import { logger } from '../logger';
import type { WorkflowService, WorkflowWarning } from './workflow.service';

export type BoardWithColumnsAndWarnings = BoardWithColumns & { warnings?: WorkflowWarning[] };

export class BoardService {
  constructor(
    private readonly repo: BoardRepository,
    private readonly workflowService?: WorkflowService,
  ) {}

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

  async getBoardById(id: string): Promise<BoardWithColumnsAndWarnings> {
    const board = await this.repo.findBoardById(id);

    if (this.workflowService) {
      try {
        const warnings = await this.workflowService.applyBoardRules(board.id, board.columns);
        if (warnings.length > 0) {
          return { ...board, warnings };
        }
      } catch (err) {
        logger.warn({ err, boardId: id }, 'workflow.applyBoardRules.failed');
      }
    }

    return board;
  }

  async deleteBoard(id: string): Promise<void> {
    await this.repo.deleteBoard(id);
    logger.info({ boardId: id }, 'Board deleted');
  }
}
