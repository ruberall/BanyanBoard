/**
 * board.repository.test.ts
 *
 * Phase 1 coverage: BoardRepository (unit tests — mock Queryable only)
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/repositories/board.repository.ts — BoardRepository class
 *
 * Acceptance Criteria covered:
 *   AC-ENTRY-1 — createBoard inserts a row and returns it (repo layer)
 *   AC-HAPPY-1 — createBoard seeds exactly 3 columns: "To Do", "In Progress", "Done"
 *   AC-HAPPY-2 — findAllBoards returns array (including empty array when no rows)
 *   AC-HAPPY-3 — findBoardById returns board with nested columns array
 *   AC-HAPPY-4 — deleteBoard removes the board (columns cascade at DB level)
 *   AC-ERROR-2 — findBoardById throws NotFoundError for unknown id
 */

import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Guard — skip integration block when no DATABASE_URL is present
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Queryable stub — each test overrides `query` as needed */
function makeMockDb(responses: Array<{ rows: unknown[] }>) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(response);
    }),
  };
}

// ---------------------------------------------------------------------------
// Unit tests — no real database required
// ---------------------------------------------------------------------------

describe('BoardRepository', () => {
  describe('unit (mock Queryable)', () => {
    // -----------------------------------------------------------------------
    // createBoard
    // -----------------------------------------------------------------------
    describe('createBoard(name)', () => {
      it('AC-ENTRY-1: inserts a board row and returns the created board with id, name, created_at', async () => {
        // Arrange
        const createdAt = new Date('2026-06-15T00:00:00Z');
        const mockDb = makeMockDb([
          // First query: INSERT INTO boards → returns new board
          { rows: [{ id: 'board-uuid-1', name: 'My Board', created_at: createdAt }] },
          // Subsequent queries: INSERT INTO columns (called 3 times) → each returns one column row
          { rows: [{ id: 'col-1', board_id: 'board-uuid-1', name: 'To Do', position: 1 }] },
          { rows: [{ id: 'col-2', board_id: 'board-uuid-1', name: 'In Progress', position: 2 }] },
          { rows: [{ id: 'col-3', board_id: 'board-uuid-1', name: 'Done', position: 3 }] },
        ]);

        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act
        const board = await repo.createBoard('My Board');

        // Assert — returned board has expected shape
        expect(board.id).toBe('board-uuid-1');
        expect(board.name).toBe('My Board');
        expect(board.created_at).toEqual(createdAt);
      });

      it('AC-HAPPY-1: seeds exactly 3 columns with correct names in order: "To Do", "In Progress", "Done"', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [{ id: 'board-uuid-2', name: 'Sprint Board', created_at: new Date() }] },
          { rows: [{ id: 'col-1', board_id: 'board-uuid-2', name: 'To Do', position: 1 }] },
          { rows: [{ id: 'col-2', board_id: 'board-uuid-2', name: 'In Progress', position: 2 }] },
          { rows: [{ id: 'col-3', board_id: 'board-uuid-2', name: 'Done', position: 3 }] },
        ]);

        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act
        await repo.createBoard('Sprint Board');

        // Assert — 4 total DB calls: 1 board insert + 3 column inserts
        expect(mockDb.query).toHaveBeenCalledTimes(4);

        // The 2nd, 3rd, and 4th calls must each INSERT a column with the right name
        const columnInsertCalls = mockDb.query.mock.calls.slice(1);
        const insertedNames = columnInsertCalls.map((call: unknown[]) => {
          // values array contains the column name; find it among the call arguments
          const values = call[1] as unknown[];
          return values.find((v) => typeof v === 'string' && ['To Do', 'In Progress', 'Done'].includes(v as string));
        });

        expect(insertedNames).toEqual(['To Do', 'In Progress', 'Done']);
      });
    });

    // -----------------------------------------------------------------------
    // findAllBoards (paginated)
    // -----------------------------------------------------------------------
    describe('findAllBoards(page, limit)', () => {
      it('AC-HAPPY-1: returns PaginatedResult with data, total, page, limit', async () => {
        // Arrange — two queries: COUNT then SELECT with LIMIT/OFFSET
        const mockDb = makeMockDb([
          { rows: [{ count: '2' }] },
          {
            rows: [
              { id: 'board-1', name: 'Alpha', created_at: new Date('2026-01-01') },
              { id: 'board-2', name: 'Beta', created_at: new Date('2026-01-02') },
            ],
          },
        ]);
        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act
        const result = await repo.findAllBoards(1, 20);

        // Assert shape
        expect(result.data).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
        expect(result.data[0]).toMatchObject({ id: 'board-1', name: 'Alpha' });
        expect(result.data[1]).toMatchObject({ id: 'board-2', name: 'Beta' });
      });

      it('returns empty data array and total=0 when no boards exist', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [{ count: '0' }] },
          { rows: [] },
        ]);
        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act
        const result = await repo.findAllBoards(1, 20);

        // Assert
        expect(result.data).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
      });

      it('AC-HAPPY-2: uses correct LIMIT and OFFSET for page=2, limit=5 (OFFSET=5)', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [{ count: '10' }] },
          { rows: [] },
        ]);
        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act
        await repo.findAllBoards(2, 5);

        // Assert — find the query that carries LIMIT/OFFSET params
        const dataCall = mockDb.query.mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === 'string' &&
            (call[0] as string).toUpperCase().includes('LIMIT'),
        );
        expect(dataCall).toBeDefined();
        const values = dataCall![1] as number[];
        expect(values[0]).toBe(5);  // LIMIT
        expect(values[1]).toBe(5);  // OFFSET = (2-1)*5
      });

      it('total reflects full count even when the requested page has no results', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [{ count: '100' }] },
          { rows: [] },
        ]);
        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act
        const result = await repo.findAllBoards(10, 20);

        // Assert
        expect(result.total).toBe(100);
        expect(result.data).toHaveLength(0);
      });
    });

    // -----------------------------------------------------------------------
    // findBoardById
    // -----------------------------------------------------------------------
    describe('findBoardById(id)', () => {
      it('AC-HAPPY-3: returns a board object with a nested columns array when board exists', async () => {
        // Arrange — the repository may issue 1 or 2 queries (board + columns, or a JOIN).
        // We model two separate queries to stay implementation-agnostic and flexible.
        const boardRow = { id: 'board-1', name: 'My Board', created_at: new Date('2026-01-01') };
        const columnRows = [
          { id: 'col-1', board_id: 'board-1', name: 'To Do', position: 1 },
          { id: 'col-2', board_id: 'board-1', name: 'In Progress', position: 2 },
          { id: 'col-3', board_id: 'board-1', name: 'Done', position: 3 },
        ];
        const mockDb = makeMockDb([
          { rows: [boardRow] },
          { rows: columnRows },
        ]);
        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act
        const result = await repo.findBoardById('board-1');

        // Assert
        expect(result).toMatchObject({ id: 'board-1', name: 'My Board' });
        expect(Array.isArray(result?.columns)).toBe(true);
        expect(result?.columns).toHaveLength(3);
        expect(result?.columns?.[0]).toMatchObject({ name: 'To Do' });
        expect(result?.columns?.[1]).toMatchObject({ name: 'In Progress' });
        expect(result?.columns?.[2]).toMatchObject({ name: 'Done' });
      });

      it('AC-ERROR-2: throws NotFoundError when board id does not exist', async () => {
        // Arrange — DB returns no rows for board query
        const mockDb = makeMockDb([{ rows: [] }]);
        const { BoardRepository } = await import('../board.repository');
        const { NotFoundError } = await import('../../errors');
        const repo = new BoardRepository(mockDb);

        // Act & Assert
        await expect(repo.findBoardById('nonexistent-id')).rejects.toThrow(NotFoundError);
      });
    });

    // -----------------------------------------------------------------------
    // deleteBoard
    // -----------------------------------------------------------------------
    describe('deleteBoard(id)', () => {
      it('AC-HAPPY-4: executes a DELETE query for the given board id without error', async () => {
        // Arrange — DELETE returns rowCount: 1 (one board deleted)
        const mockDb = {
          query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
        };
        const { BoardRepository } = await import('../board.repository');
        const repo = new BoardRepository(mockDb);

        // Act & Assert — should resolve without throwing
        await expect(repo.deleteBoard('board-1')).resolves.toBeUndefined();
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        // SQL should target the correct board id
        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toContain('DELETE');
        expect(values).toContain('board-1');
      });

      it('AC-ERROR-2 (delete): throws NotFoundError when the board to delete does not exist', async () => {
        // Arrange — DELETE returns rowCount: 0 (nothing deleted)
        const mockDb = {
          query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        };
        const { BoardRepository } = await import('../board.repository');
        const { NotFoundError } = await import('../../errors');
        const repo = new BoardRepository(mockDb);

        // Act & Assert
        await expect(repo.deleteBoard('ghost-id')).rejects.toThrow(NotFoundError);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Integration tests — require live Postgres
  // ---------------------------------------------------------------------------
  describeIfDb('integration (requires live Postgres)', () => {
    let pool: Pool;

    beforeAll(() => {
      pool = new Pool({ connectionString: DATABASE_URL });
    });

    afterAll(async () => {
      await pool.end();
    });

    it('createBoard inserts a board and seeds 3 columns in the real database', async () => {
      const { BoardRepository } = await import('../board.repository');
      const repo = new BoardRepository(pool);

      // Act
      const board = await repo.createBoard('Integration Test Board');

      // Assert — board created
      expect(board.id).toBeDefined();
      expect(board.name).toBe('Integration Test Board');

      // Verify columns exist via findBoardById
      const fetched = await repo.findBoardById(board.id);
      expect(fetched?.columns).toHaveLength(3);
      const names = fetched?.columns?.map((c) => c.name);
      expect(names).toEqual(['To Do', 'In Progress', 'Done']);

      // Cleanup
      await repo.deleteBoard(board.id);
    });

    it('findAllBoards returns the board after creation', async () => {
      const { BoardRepository } = await import('../board.repository');
      const repo = new BoardRepository(pool);

      const board = await repo.createBoard('List Test Board');
      const result = await repo.findAllBoards(1, 100);

      expect(result.data.some((b) => b.id === board.id)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);

      // Cleanup
      await repo.deleteBoard(board.id);
    });

    it('deleteBoard removes the board and cascade-deletes its columns', async () => {
      const { BoardRepository } = await import('../board.repository');
      const repo = new BoardRepository(pool);

      const board = await repo.createBoard('Delete Test Board');
      await repo.deleteBoard(board.id);

      await expect(repo.findBoardById(board.id)).rejects.toThrow();
    });
  });
});
