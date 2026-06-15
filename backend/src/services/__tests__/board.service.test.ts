/**
 * board.service.test.ts
 *
 * Unit tests for BoardService — the orchestration layer between routes and
 * BoardRepository. All repository methods are mocked; these tests verify that
 * the service calls the right repo methods and propagates results/errors.
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/services/board.service.ts — BoardService class
 */

import { BoardService } from '../board.service';
import { BoardRepository } from '../../repositories/board.repository';
import { NotFoundError } from '../../errors';
import type { Board, BoardWithColumns } from '../../repositories/board.repository';

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
    { id: 'col-1', board_id: fixBoard.id, name: 'To Do',      position: 1 },
    { id: 'col-2', board_id: fixBoard.id, name: 'In Progress', position: 2 },
    { id: 'col-3', board_id: fixBoard.id, name: 'Done',        position: 3 },
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
    it('calls repo.findAllBoards and returns the array', async () => {
      // Arrange
      repo.findAllBoards.mockResolvedValue([fixBoard]);

      // Act
      const result = await service.getAllBoards();

      // Assert
      expect(repo.findAllBoards).toHaveBeenCalled();
      expect(result).toEqual([fixBoard]);
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
