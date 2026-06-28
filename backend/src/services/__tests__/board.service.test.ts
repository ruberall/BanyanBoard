/**
 * board.service.test.ts
 *
 * Unit tests for BoardService — the orchestration layer between routes and
 * BoardRepository. All repository methods are mocked; these tests verify that
 * the service calls the right repo methods and propagates results/errors.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/services/board.service.ts — BoardService class
 *
 * Phase 2 additions (TASK-017):
 *   WorkflowService integration — applyBoardRules called in getBoardById;
 *   warnings[] merged into board response when rules fire.
 *   These tests FAIL until BoardService accepts optional WorkflowService
 *   and calls applyBoardRules in getBoardById.
 */

import { BoardService } from '../board.service';
import { BoardRepository } from '../../repositories/board.repository';
import { NotFoundError } from '../../errors';
import type { Board, BoardWithColumns, PaginatedResult } from '../../repositories/board.repository';

// WorkflowService type is imported lazily in the Phase 2 describe block
// to avoid compile-time resolution of the not-yet-existing source file.
type WorkflowServiceShape = { applyBoardRules: (boardId: string, columns: unknown[]) => Promise<unknown[]> };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixBoard: Board = {
  id: 'board-uuid-1',
  name: 'My Board',
  created_at: new Date('2026-01-01T00:00:00Z'),
};

const fixBoardWithColumns: BoardWithColumns = {
  ...fixBoard,
  columns: [
    { id: 'col-1', board_id: fixBoard.id, name: 'To Do',       position: 1 },
    { id: 'col-2', board_id: fixBoard.id, name: 'In Progress',  position: 2 },
    { id: 'col-3', board_id: fixBoard.id, name: 'Stale',        position: 3 },
    { id: 'col-4', board_id: fixBoard.id, name: 'Done',         position: 4 },
  ],
};

// ---------------------------------------------------------------------------
// Helpers — build a fully-mocked BoardRepository
// ---------------------------------------------------------------------------

function makeMockRepo(): jest.Mocked<BoardRepository> {
  return {
    createBoard:    jest.fn(),
    findAllBoards:  jest.fn(),
    findBoardById:  jest.fn(),
    deleteBoard:    jest.fn(),
  } as unknown as jest.Mocked<BoardRepository>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BoardService', () => {
  let repo: jest.Mocked<BoardRepository>;
  let service: BoardService;

  beforeEach(() => {
    repo = makeMockRepo();
    service = new BoardService(repo);
  });

  // ── createBoard ────────────────────────────────────────────────────────────

  describe('createBoard', () => {
    it('calls repo.createBoard with the given name and returns the board', async () => {
      // Arrange
      repo.createBoard.mockResolvedValue(fixBoard);

      // Act
      const result = await service.createBoard('My Board');

      // Assert
      expect(repo.createBoard).toHaveBeenCalledWith('My Board');
      expect(result).toEqual(fixBoard);
    });
  });

  // ── getAllBoards ───────────────────────────────────────────────────────────

  describe('getAllBoards', () => {
    it('AC-HAPPY-1: calls repo.findAllBoards with page/limit and returns PaginatedResult', async () => {
      // Arrange
      const paginated: PaginatedResult<Board> = {
        data: [fixBoard],
        total: 1,
        page: 1,
        limit: 20,
      };
      repo.findAllBoards.mockResolvedValue(paginated);

      // Act
      const result = await service.getAllBoards(1, 20);

      // Assert
      expect(repo.findAllBoards).toHaveBeenCalledWith(1, 20);
      expect(result).toEqual(paginated);
    });

    it('forwards page and limit arguments to the repository', async () => {
      // Arrange
      const paginated: PaginatedResult<Board> = {
        data: [],
        total: 50,
        page: 3,
        limit: 5,
      };
      repo.findAllBoards.mockResolvedValue(paginated);

      // Act
      const result = await service.getAllBoards(3, 5);

      // Assert
      expect(repo.findAllBoards).toHaveBeenCalledWith(3, 5);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(5);
      expect(result.total).toBe(50);
    });
  });

  // ── getBoardById ───────────────────────────────────────────────────────────

  describe('getBoardById', () => {
    it('calls repo.findBoardById with the given id and returns the board with columns', async () => {
      // Arrange
      repo.findBoardById.mockResolvedValue(fixBoardWithColumns);

      // Act
      const result = await service.getBoardById(fixBoard.id);

      // Assert
      expect(repo.findBoardById).toHaveBeenCalledWith(fixBoard.id);
      expect(result).toEqual(fixBoardWithColumns);
    });

    it('propagates NotFoundError when board does not exist', async () => {
      // Arrange
      repo.findBoardById.mockRejectedValue(new NotFoundError('Board not found'));

      // Act / Assert
      await expect(service.getBoardById('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  // ── deleteBoard ────────────────────────────────────────────────────────────

  describe('deleteBoard', () => {
    it('calls repo.deleteBoard with the given id', async () => {
      // Arrange
      repo.deleteBoard.mockResolvedValue(undefined);

      // Act
      await service.deleteBoard(fixBoard.id);

      // Assert
      expect(repo.deleteBoard).toHaveBeenCalledWith(fixBoard.id);
    });

    it('propagates NotFoundError when board does not exist', async () => {
      // Arrange
      repo.deleteBoard.mockRejectedValue(new NotFoundError('Board not found'));

      // Act / Assert
      await expect(service.deleteBoard('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 2 (TASK-017): BoardService + WorkflowService integration
//
// Tests below FAIL until:
//   1. BoardService constructor accepts optional WorkflowService
//   2. getBoardById calls workflowService.applyBoardRules and merges warnings
// ---------------------------------------------------------------------------

describe('BoardService with WorkflowService (Phase 2)', () => {
  let repo: jest.Mocked<BoardRepository>;

  function makeMockWorkflowService(
    warnings: Array<{ code: string; message: string }> = [],
  ): jest.Mocked<WorkflowServiceShape> {
    return {
      applyBoardRules: jest.fn().mockResolvedValue(warnings),
    } as unknown as jest.Mocked<WorkflowServiceShape>;
  }

  beforeEach(() => {
    repo = {
      createBoard:    jest.fn(),
      findAllBoards:  jest.fn(),
      findBoardById:  jest.fn(),
      deleteBoard:    jest.fn(),
    } as unknown as jest.Mocked<BoardRepository>;

    repo.findBoardById.mockResolvedValue(fixBoardWithColumns);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('getBoardById calls applyBoardRules with board id and columns when WorkflowService is provided', async () => {
    // Arrange
    const mockWorkflow = makeMockWorkflowService([]);
    // Cast constructor to any so TypeScript doesn't reject the extra arg before
    // BoardService is updated to accept an optional WorkflowService parameter.
    const service = new (BoardService as any)(repo, mockWorkflow);

    // Act
    await service.getBoardById(fixBoard.id);

    // Assert — workflow rules applied with the fetched board's data
    expect(mockWorkflow.applyBoardRules).toHaveBeenCalledTimes(1);
    expect(mockWorkflow.applyBoardRules).toHaveBeenCalledWith(
      fixBoard.id,
      fixBoardWithColumns.columns,
    );
  });

  it('getBoardById returns warnings array in response when WorkflowService returns warnings', async () => {
    // Arrange
    const warning = {
      code:    'WORKFLOW_ACTION_FAILED',
      message: 'Stale rule failed for card card-uuid-1',
    };
    const mockWorkflow = makeMockWorkflowService([warning]);
    // Cast constructor to any so TypeScript doesn't reject the extra arg before
    // BoardService is updated to accept an optional WorkflowService parameter.
    const service = new (BoardService as any)(repo, mockWorkflow);

    // Act
    const result = await service.getBoardById(fixBoard.id);

    // Assert — warnings[] present in response
    expect((result as any).warnings).toHaveLength(1);
    expect((result as any).warnings[0]).toMatchObject(warning);
  });

  it('getBoardById omits warnings (or returns empty) when WorkflowService returns no warnings', async () => {
    // Arrange
    const mockWorkflow = makeMockWorkflowService([]);
    // Cast constructor to any so TypeScript doesn't reject the extra arg before
    // BoardService is updated to accept an optional WorkflowService parameter.
    const service = new (BoardService as any)(repo, mockWorkflow);

    // Act
    const result = await service.getBoardById(fixBoard.id);

    // Assert — no warnings in response (either absent or empty array)
    const warnings = (result as any).warnings;
    expect(!warnings || warnings.length === 0).toBe(true);
  });

  it('getBoardById does NOT call applyBoardRules when WorkflowService is not provided', async () => {
    // Arrange — no WorkflowService injected (backward-compat)
    const service = new BoardService(repo);

    // Act
    const result = await service.getBoardById(fixBoard.id);

    // Assert — board returned normally, no workflow call
    expect(result).toMatchObject({ id: fixBoard.id });
    // No warnings field OR it's undefined
    expect((result as any).warnings).toBeUndefined();
  });
});
