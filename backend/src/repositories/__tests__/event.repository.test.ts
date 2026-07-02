/**
 * event.repository.test.ts
 *
 * Phase 1 coverage: EventRepository (unit tests — mock Queryable only)
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/repositories/event.repository.ts — EventRepository class
 *
 * Key behaviours verified:
 *   1. insert()              — persists an event row and returns the created record
 *   2. findRecentByBoard()   — returns events ordered by occurred_at DESC, limited to N
 *   3. findRecentByBoard()   — returns empty array when no events exist for the board
 *   4. findByCardId()        — returns events for a card ordered by occurred_at DESC
 *   5. findByCardId()        — respects the limit parameter
 *   6. findByCardId()        — returns empty array when no events exist for the card
 */

// ---------------------------------------------------------------------------
// Helpers — same pattern as board.repository.test.ts
// ---------------------------------------------------------------------------

/** Minimal Queryable stub — each test overrides `query` as needed */
function makeMockDb(responses: Array<{ rows: unknown[]; rowCount?: number }>) {
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
// Fixtures
// ---------------------------------------------------------------------------

const BOARD_ID  = 'board-uuid-aaaa-bbbb-cccc-dddddddddddd';
const CARD_ID   = 'card-uuid-1111-2222-3333-444444444444';
const ACTOR_ID  = 'actor-uuid-5555-6666-7777-888888888888';
const FROM_COL  = 'col-uuid-from-0000-1111-222222222222';
const TO_COL    = 'col-uuid-to-0000-1111-333333333333';

const fixEventInput = {
  boardId:      BOARD_ID,
  cardId:       CARD_ID,
  actorId:      ACTOR_ID,
  eventType:    'card.moved',
  fromColumnId: FROM_COL,
  toColumnId:   TO_COL,
  payload:      { note: 'drag-and-drop' },
};

const fixEventRow = {
  id:             'event-uuid-eeee-ffff-0000-111111111111',
  board_id:       BOARD_ID,
  card_id:        CARD_ID,
  actor_id:       ACTOR_ID,
  event_type:     'card.moved',
  from_column_id: FROM_COL,
  to_column_id:   TO_COL,
  payload:        { note: 'drag-and-drop' },
  occurred_at:    new Date('2026-06-18T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventRepository', () => {
  describe('unit (mock Queryable)', () => {

    describe('insert(event)', () => {
      it('inserts an event row and returns the persisted record with id and occurred_at', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixEventRow], rowCount: 1 },
        ]);
        const { EventRepository } = await import('../event.repository');
        const repo = new EventRepository(mockDb);

        // Act
        const result = await repo.insert(fixEventInput);

        // Assert — returned row has all expected fields
        expect(result.id).toBe(fixEventRow.id);
        expect(result.board_id).toBe(BOARD_ID);
        expect(result.card_id).toBe(CARD_ID);
        expect(result.actor_id).toBe(ACTOR_ID);
        expect(result.event_type).toBe('card.moved');
        expect(result.from_column_id).toBe(FROM_COL);
        expect(result.to_column_id).toBe(TO_COL);
        expect(result.occurred_at).toEqual(fixEventRow.occurred_at);

        // The INSERT query must have been issued once
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toContain('INSERT');
        expect(values).toContain(BOARD_ID);
        expect(values).toContain(CARD_ID);
      });
    });

    describe('findRecentByBoard(boardId, limit)', () => {
      it('returns events ordered newest-first, limited to N rows', async () => {
        // Arrange — DB returns 2 event rows already ordered by occurred_at DESC
        const olderRow = {
          ...fixEventRow,
          id: 'event-uuid-older',
          occurred_at: new Date('2026-06-17T00:00:00Z'),
        };
        const newerRow = {
          ...fixEventRow,
          id: 'event-uuid-newer',
          occurred_at: new Date('2026-06-18T00:00:00Z'),
        };
        const mockDb = makeMockDb([
          { rows: [newerRow, olderRow] },
        ]);
        const { EventRepository } = await import('../event.repository');
        const repo = new EventRepository(mockDb);

        // Act
        const results = await repo.findRecentByBoard(BOARD_ID, 20);

        // Assert — correct order and count
        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('event-uuid-newer');
        expect(results[1].id).toBe('event-uuid-older');

        // SELECT query must include ORDER BY occurred_at DESC and a LIMIT param
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toMatch(/ORDER BY.*occurred_at.*DESC/i);
        expect(values).toContain(BOARD_ID);
        expect(values).toContain(20);
      });

      it('returns an empty array when no events exist for the board', async () => {
        // Arrange — DB returns no rows
        const mockDb = makeMockDb([
          { rows: [] },
        ]);
        const { EventRepository } = await import('../event.repository');
        const repo = new EventRepository(mockDb);

        // Act
        const results = await repo.findRecentByBoard('board-with-no-events', 20);

        // Assert
        expect(results).toEqual([]);
      });
    });

    describe('findByCardId(cardId, limit)', () => {
      it('returns events for the card ordered newest-first', async () => {
        // Arrange — DB returns 2 event rows already ordered by occurred_at DESC
        const olderRow = {
          ...fixEventRow,
          id: 'event-uuid-older',
          occurred_at: new Date('2026-06-17T00:00:00Z'),
        };
        const newerRow = {
          ...fixEventRow,
          id: 'event-uuid-newer',
          occurred_at: new Date('2026-06-18T00:00:00Z'),
        };
        const mockDb = makeMockDb([
          { rows: [newerRow, olderRow] },
        ]);
        const { EventRepository } = await import('../event.repository');
        const repo = new EventRepository(mockDb);

        // Act
        const results = await repo.findByCardId(CARD_ID, 50);

        // Assert — correct order and count
        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('event-uuid-newer');
        expect(results[1].id).toBe('event-uuid-older');

        // SELECT query must filter by card_id, order by occurred_at DESC
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toContain('SELECT');
        expect(sql.toUpperCase()).toMatch(/WHERE.*card_id/i);
        expect(sql.toUpperCase()).toMatch(/ORDER BY.*occurred_at.*DESC/i);
        expect(values).toContain(CARD_ID);
      });

      it('respects the limit parameter', async () => {
        // Arrange
        const mockDb = makeMockDb([
          { rows: [fixEventRow] },
        ]);
        const { EventRepository } = await import('../event.repository');
        const repo = new EventRepository(mockDb);

        // Act
        await repo.findByCardId(CARD_ID, 5);

        // Assert — LIMIT param passed through to the query
        expect(mockDb.query).toHaveBeenCalledTimes(1);
        const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
        expect(sql.toUpperCase()).toContain('LIMIT');
        expect(values).toContain(CARD_ID);
        expect(values).toContain(5);
      });

      it('returns an empty array when no events exist for the card', async () => {
        // Arrange — DB returns no rows
        const mockDb = makeMockDb([
          { rows: [] },
        ]);
        const { EventRepository } = await import('../event.repository');
        const repo = new EventRepository(mockDb);

        // Act
        const results = await repo.findByCardId('card-with-no-events', 50);

        // Assert
        expect(results).toEqual([]);
      });
    });
  });
});
