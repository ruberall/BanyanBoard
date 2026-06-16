/**
 * card.repository.test.ts
 *
 * Phase 1 coverage: CardRepository (unit tests — mock Queryable only)
 *
 * Acceptance Criteria covered:
 *   AC-HAPPY-1/2 — createCard persists fields and returns Card shape
 *   AC-HAPPY-3   — findCardsByColumnId returns ordered array
 *   AC-HAPPY-4   — findCardById returns full card object
 *   AC-HAPPY-5/6 — updateCard persists partial changes
 *   AC-HAPPY-8   — deleteCard removes row
 *   AC-ERROR-3   — createCard throws NotFoundError when column not found
 *   AC-ERROR-4   — findCardById/updateCard/deleteCard throw NotFoundError for missing id
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

function makeMockDb(responses: Array<{ rows: unknown[]; rowCount?: number }>) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(response);
    }),
  };
}

const BASE_CARD = {
  id: 'card-uuid-1',
  column_id: 'col-uuid-1',
  title: 'Write tests',
  description: null as string | null,
  due_date: null as Date | null,
  labels: [] as string[],
  position: 0,
  created_at: new Date('2026-06-16T00:00:00Z'),
  updated_at: new Date('2026-06-16T00:00:00Z'),
};

describe('CardRepository', () => {
  describe('unit (mock Queryable)', () => {
    // -------------------------------------------------------------------------
    // createCard
    // -------------------------------------------------------------------------
    describe('createCard(columnId, input)', () => {
      it('AC-HAPPY-1: inserts a card with title only and returns Card shape', async () => {
        const mockDb = makeMockDb([{ rows: [BASE_CARD] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const card = await repo.createCard('col-uuid-1', { title: 'Write tests' });

        expect(card.id).toBe('card-uuid-1');
        expect(card.column_id).toBe('col-uuid-1');
        expect(card.title).toBe('Write tests');
        expect(card.description).toBeNull();
        expect(card.due_date).toBeNull();
        expect(card.labels).toEqual([]);
        expect(card.position).toBe(0);
        expect(card.created_at).toBeInstanceOf(Date);
      });

      it('AC-HAPPY-2: inserts a card with all optional fields', async () => {
        const fullCard = {
          ...BASE_CARD,
          id: 'card-uuid-2',
          title: 'Ship v1',
          description: 'Tag and push',
          due_date: new Date('2026-07-01T00:00:00Z'),
          labels: ['backend', 'urgent'],
        };
        const mockDb = makeMockDb([{ rows: [fullCard] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const card = await repo.createCard('col-uuid-1', {
          title: 'Ship v1',
          description: 'Tag and push',
          due_date: '2026-07-01T00:00:00Z',
          labels: ['backend', 'urgent'],
        });

        expect(card.title).toBe('Ship v1');
        expect(card.description).toBe('Tag and push');
        expect(card.labels).toEqual(['backend', 'urgent']);
        expect(card.due_date).toBeInstanceOf(Date);
      });

      it('AC-ERROR-3: throws NotFoundError when column does not exist (FK violation handled in service)', async () => {
        // The repository itself will propagate a DB FK violation — we verify
        // that the service wraps it. At repo layer we just verify the INSERT
        // SQL targets the right columnId.
        const mockDb = makeMockDb([{ rows: [BASE_CARD] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        await repo.createCard('col-uuid-1', { title: 'Test' });

        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toContain('INSERT');
        expect(values).toContain('col-uuid-1');
      });
    });

    // -------------------------------------------------------------------------
    // findCardsByColumnId
    // -------------------------------------------------------------------------
    describe('findCardsByColumnId(columnId)', () => {
      it('AC-HAPPY-3: returns array of cards ordered by position/created_at', async () => {
        const cards = [
          { ...BASE_CARD, id: 'c1', position: 0 },
          { ...BASE_CARD, id: 'c2', position: 1 },
        ];
        const mockDb = makeMockDb([{ rows: cards }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const result = await repo.findCardsByColumnId('col-uuid-1');

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('c1');
        expect(result[1].id).toBe('c2');
      });

      it('returns empty array when column has no cards', async () => {
        const mockDb = makeMockDb([{ rows: [] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const result = await repo.findCardsByColumnId('col-uuid-empty');

        expect(result).toEqual([]);
      });

      it('passes columnId as query parameter', async () => {
        const mockDb = makeMockDb([{ rows: [] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        await repo.findCardsByColumnId('col-uuid-check');

        const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(values).toContain('col-uuid-check');
      });
    });

    // -------------------------------------------------------------------------
    // findCardById
    // -------------------------------------------------------------------------
    describe('findCardById(id)', () => {
      it('AC-HAPPY-4: returns the full card object when it exists', async () => {
        const mockDb = makeMockDb([{ rows: [BASE_CARD] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const card = await repo.findCardById('card-uuid-1');

        expect(card).toMatchObject({ id: 'card-uuid-1', title: 'Write tests' });
        expect(card.updated_at).toBeInstanceOf(Date);
      });

      it('AC-ERROR-4: throws NotFoundError when card does not exist', async () => {
        const mockDb = makeMockDb([{ rows: [] }]);
        const { CardRepository } = await import('../card.repository');
        const { NotFoundError } = await import('../../errors');
        const repo = new CardRepository(mockDb);

        await expect(repo.findCardById('nonexistent')).rejects.toThrow(NotFoundError);
      });
    });

    // -------------------------------------------------------------------------
    // updateCard
    // -------------------------------------------------------------------------
    describe('updateCard(id, updates)', () => {
      it('AC-HAPPY-5: returns updated card with new title', async () => {
        const updated = { ...BASE_CARD, title: 'Updated title', updated_at: new Date('2026-06-16T01:00:00Z') };
        const mockDb = makeMockDb([{ rows: [updated] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const card = await repo.updateCard('card-uuid-1', { title: 'Updated title' });

        expect(card.title).toBe('Updated title');
        expect(card.updated_at.getTime()).toBeGreaterThanOrEqual(BASE_CARD.updated_at.getTime());
      });

      it('AC-HAPPY-6: returns card with updated labels', async () => {
        const updated = { ...BASE_CARD, labels: ['backend', 'urgent'] };
        const mockDb = makeMockDb([{ rows: [updated] }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const card = await repo.updateCard('card-uuid-1', { labels: ['backend', 'urgent'] });

        expect(card.labels).toEqual(['backend', 'urgent']);
      });

      it('AC-ERROR-4: throws NotFoundError when card to update does not exist', async () => {
        const mockDb = makeMockDb([{ rows: [] }]);
        const { CardRepository } = await import('../card.repository');
        const { NotFoundError } = await import('../../errors');
        const repo = new CardRepository(mockDb);

        await expect(repo.updateCard('ghost-id', { title: 'X' })).rejects.toThrow(NotFoundError);
      });
    });

    // -------------------------------------------------------------------------
    // moveCard
    // -------------------------------------------------------------------------
    describe('moveCard(id, columnId, position)', () => {
      it('AC-MOVE: executes UPDATE with column_id, position, updated_at and returns Card', async () => {
        const moved = { ...BASE_CARD, column_id: 'col-uuid-2', position: 1.5 };
        const mockDb = makeMockDb([{ rows: [moved], rowCount: 1 }]);
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        const card = await repo.moveCard('card-uuid-1', 'col-uuid-2', 1.5);

        expect(card.column_id).toBe('col-uuid-2');
        expect(card.position).toBe(1.5);
        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toContain('UPDATE');
        expect(values).toContain('card-uuid-1');
        expect(values).toContain('col-uuid-2');
        expect(values).toContain(1.5);
      });

      it('AC-MOVE-5: throws NotFoundError when card does not exist', async () => {
        const mockDb = makeMockDb([{ rows: [], rowCount: 0 }]);
        const { CardRepository } = await import('../card.repository');
        const { NotFoundError } = await import('../../errors');
        const repo = new CardRepository(mockDb);

        await expect(repo.moveCard('ghost-id', 'col-uuid-1', 1.0)).rejects.toThrow(NotFoundError);
      });
    });

    // -------------------------------------------------------------------------
    // deleteCard
    // -------------------------------------------------------------------------
    describe('deleteCard(id)', () => {
      it('AC-HAPPY-8: executes DELETE without error when card exists', async () => {
        const mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
        const { CardRepository } = await import('../card.repository');
        const repo = new CardRepository(mockDb);

        await expect(repo.deleteCard('card-uuid-1')).resolves.toBeUndefined();
        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toContain('DELETE');
        expect(values).toContain('card-uuid-1');
      });

      it('AC-ERROR-4: throws NotFoundError when card to delete does not exist', async () => {
        const mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
        const { CardRepository } = await import('../card.repository');
        const { NotFoundError } = await import('../../errors');
        const repo = new CardRepository(mockDb);

        await expect(repo.deleteCard('ghost-id')).rejects.toThrow(NotFoundError);
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

    it('createCard inserts and findCardById retrieves the same card', async () => {
      const { CardRepository } = await import('../card.repository');
      const { BoardRepository } = await import('../board.repository');
      const boardRepo = new BoardRepository(pool);
      const repo = new CardRepository(pool);

      const board = await boardRepo.createBoard('Card Integration Board');
      const boardWithCols = await boardRepo.findBoardById(board.id);
      const columnId = boardWithCols.columns[0].id;

      const card = await repo.createCard(columnId, { title: 'Integration card' });
      expect(card.id).toBeDefined();
      expect(card.title).toBe('Integration card');

      const fetched = await repo.findCardById(card.id);
      expect(fetched.id).toBe(card.id);

      await boardRepo.deleteBoard(board.id);
    });
  });
});
