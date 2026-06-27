/**
 * event.service.test.ts
 *
 * Phase 1 attribution — unit tests for EventService display name resolution
 * and CardCreatedEvent emission (WI-016-002, WI-016-003).
 *
 * Tests FAIL until the Coding Agent:
 *   1. Adds UserRepository injection into EventService constructor
 *   2. Resolves actor_display_name via UserRepository.findById() in emitCardMoved/emitCardCreated
 *   3. Snapshots actor_display_name into payload jsonb
 *   4. Adds EventService.emitCardCreated() with CardCreatedEvent type
 *   5. Adds projectEventRow() projection in feed.ts normalising EventRow → ActivityEvent
 *
 * AC covered:
 *   AC-HAPPY-1 — emitCardMoved snapshots actor_display_name = "First Last" into payload
 *   AC-HAPPY-2 — emitCardCreated snapshots actor_display_name into payload
 *   AC-HAPPY-3 — history rows with payload.actor_display_name are exposed as-is (no JOIN needed)
 *   AC-ERROR-1 — user with null first_name + null last_name → actor_display_name = email
 *   AC-ERROR-2 — EventRow with actor_id IS NULL → actor_display_name = null (no crash)
 */

import type { DomainEventBus } from '../../events/domain-event-bus';
import type { PublicUser } from '../../repositories/user.repository';
import { EventService } from '../event.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOARD_ID    = 'board-uuid-aaaa-bbbb-cccc-dddddddddddd';
const CARD_ID     = 'card-uuid-1111-2222-3333-444444444444';
const ACTOR_ID    = 'actor-uuid-5555-6666-7777-888888888888';
const FROM_COL    = 'col-uuid-from-0000-1111-222222222222';
const TO_COL      = 'col-uuid-to-0000-1111-333333333333';

const baseUser: PublicUser = {
  id:         ACTOR_ID,
  email:      'rebecca@example.com',
  first_name: 'Rebecca',
  last_name:  'Uberall',
  created_at: new Date('2026-01-01T00:00:00Z'),
};

const baseMovedInput = {
  boardId:        BOARD_ID,
  cardId:         CARD_ID,
  cardTitle:      'Write tests',
  actorId:        ACTOR_ID,
  actorEmail:     'rebecca@example.com',
  fromColumnId:   FROM_COL,
  fromColumnName: 'To Do',
  toColumnId:     TO_COL,
  toColumnName:   'Done',
};

const fixEventRow = {
  id:             'event-uuid-eeee-ffff-0000-111111111111',
  board_id:       BOARD_ID,
  card_id:        CARD_ID,
  actor_id:       ACTOR_ID,
  event_type:     'card.moved',
  from_column_id: FROM_COL,
  to_column_id:   TO_COL,
  payload:        { actor_display_name: 'Rebecca Uberall', cardTitle: 'Write tests' },
  occurred_at:    new Date('2026-06-18T00:00:00Z'),
};

// ---------------------------------------------------------------------------
// Helpers — minimal mocks
// ---------------------------------------------------------------------------

function makeMockDb(responses: Array<{ rows: unknown[]; rowCount?: number }> = []) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? { rows: [] };
      callIndex++;
      return Promise.resolve(response);
    }),
  };
}

function makeMockBus(): jest.Mocked<DomainEventBus> {
  return {
    publish:   jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
  };
}

function makeMockUserRepo(user: PublicUser | null = baseUser) {
  return {
    findById: jest.fn().mockResolvedValue(user),
    // Stub the rest so the type is satisfied
    createUser:   jest.fn(),
    findByEmail:  jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventService', () => {

  describe('emitCardMoved() — actor_display_name resolution (WI-016-003)', () => {

    it('AC-HAPPY-1: snapshots "First Last" into payload.actor_display_name when user found', async () => {
      // Arrange
      const mockDb      = makeMockDb([{ rows: [fixEventRow], rowCount: 1 }]);
      const mockBus     = makeMockBus();
      const mockUserRepo = makeMockUserRepo(baseUser);

      // EventService constructor now receives UserRepository as third arg (WI-016-003)
      const svc = new EventService(mockBus, mockDb, mockUserRepo as any);

      // Act
      await svc.emitCardMoved({ ...baseMovedInput, actorId: ACTOR_ID });

      // Assert — UserRepository.findById called with actorId
      expect(mockUserRepo.findById).toHaveBeenCalledWith(ACTOR_ID);

      // Assert — INSERT payload includes actor_display_name = "Rebecca Uberall"
      const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      const payload = values.find(
        (v) => typeof v === 'object' && v !== null && 'actor_display_name' in (v as object),
      ) as Record<string, unknown> | undefined;
      expect(payload).toBeDefined();
      expect(payload!['actor_display_name']).toBe('Rebecca Uberall');

      // Assert — bus.publish carries actorDisplayName
      expect(mockBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ actorDisplayName: 'Rebecca Uberall' }),
      );
    });

    it('AC-ERROR-1: uses actorEmail as display name when first_name and last_name are both null', async () => {
      // Arrange — user exists but has no name fields
      const namelessUser: PublicUser = {
        ...baseUser,
        first_name: null,
        last_name:  null,
      };
      const mockDb       = makeMockDb([{ rows: [fixEventRow], rowCount: 1 }]);
      const mockBus      = makeMockBus();
      const mockUserRepo = makeMockUserRepo(namelessUser);

      const svc = new EventService(mockBus, mockDb, mockUserRepo as any);

      // Act
      await svc.emitCardMoved({ ...baseMovedInput, actorEmail: 'rebecca@example.com' });

      // Assert — payload.actor_display_name = email, NOT empty string / null
      const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      const payload = values.find(
        (v) => typeof v === 'object' && v !== null && 'actor_display_name' in (v as object),
      ) as Record<string, unknown> | undefined;
      expect(payload!['actor_display_name']).toBe('rebecca@example.com');
    });

    it('AC-ERROR-2 (move): actor_display_name = null when actorId is null (unauthenticated move)', async () => {
      // Arrange — no actor
      const mockDb       = makeMockDb([{ rows: [{ ...fixEventRow, actor_id: null, payload: { actor_display_name: null } }], rowCount: 1 }]);
      const mockBus      = makeMockBus();
      const mockUserRepo = makeMockUserRepo(null);

      const svc = new EventService(mockBus, mockDb, mockUserRepo as any);

      // Act
      await svc.emitCardMoved({ ...baseMovedInput, actorId: null, actorEmail: null });

      // Assert — UserRepository.findById NOT called when actorId is null
      expect(mockUserRepo.findById).not.toHaveBeenCalled();

      // Assert — payload.actor_display_name = null
      const [, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      const payload = values.find(
        (v) => typeof v === 'object' && v !== null && 'actor_display_name' in (v as object),
      ) as Record<string, unknown> | undefined;
      expect(payload!['actor_display_name']).toBeNull();
    });
  });

  describe('emitCardCreated() — new event type (WI-016-002)', () => {

    it('AC-HAPPY-2: persists card.created event with actorId and actor_display_name in payload', async () => {
      // Arrange
      const createdEventRow = {
        ...fixEventRow,
        id:         'event-uuid-created-1111-2222',
        event_type: 'card.created',
        payload:    { actor_display_name: 'Rebecca Uberall', cardTitle: 'Write tests' },
      };
      const mockDb       = makeMockDb([{ rows: [createdEventRow], rowCount: 1 }]);
      const mockBus      = makeMockBus();
      const mockUserRepo = makeMockUserRepo(baseUser);

      const svc = new EventService(mockBus, mockDb, mockUserRepo as any);

      // Act — emitCardCreated must exist (WI-016-002)
      await (svc as any).emitCardCreated({
        boardId:     BOARD_ID,
        cardId:      CARD_ID,
        cardTitle:   'Write tests',
        columnId:    FROM_COL,
        actorId:     ACTOR_ID,
        actorEmail:  'rebecca@example.com',
      });

      // Assert — INSERT with event_type = 'card.created'
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [sql, values] = mockDb.query.mock.calls[0] as [string, unknown[]];
      expect(sql.toUpperCase()).toContain('INSERT');
      expect(values).toContain('card.created');

      // Assert — payload includes actor_display_name
      const payload = values.find(
        (v) => typeof v === 'object' && v !== null && 'actor_display_name' in (v as object),
      ) as Record<string, unknown> | undefined;
      expect(payload!['actor_display_name']).toBe('Rebecca Uberall');

      // Assert — bus published a card.created event
      expect(mockBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'card.created', actorId: ACTOR_ID }),
      );
    });
  });

  describe('history replay — projectEventRow() shape (WI-016-003)', () => {

    it('AC-HAPPY-3: EventRow with payload.actor_display_name exposes the name without JOIN', async () => {
      // Arrange — simulate what findRecentByBoard returns for an attributed event
      const rowWithDisplayName = {
        ...fixEventRow,
        actor_id: ACTOR_ID,
        payload:  { actor_display_name: 'Rebecca Uberall', cardTitle: 'Write tests' },
      };

      // The feed.ts projectEventRow() function maps EventRow → ActivityEvent.
      // Import it directly to test the projection logic in isolation.
      // (This import will fail until projectEventRow is exported from feed.ts)
      const { projectEventRow } = await import('../../routes/feed');

      // Act
      const activity = projectEventRow(rowWithDisplayName);

      // Assert — actorDisplayName is surfaced from payload
      expect(activity.actorDisplayName).toBe('Rebecca Uberall');
      expect(activity.eventType).toBe('card.moved');
      expect(activity.cardId).toBe(CARD_ID);
    });

    it('AC-ERROR-2 (history): EventRow with actor_id IS NULL produces actorDisplayName = null without crash', async () => {
      // Arrange — a legacy row inserted before actor attribution existed
      const legacyRow = {
        ...fixEventRow,
        actor_id: null,
        payload:  { cardTitle: 'Old card' }, // no actor_display_name key at all
      };

      const { projectEventRow } = await import('../../routes/feed');

      // Act
      const activity = projectEventRow(legacyRow);

      // Assert — no crash; actorDisplayName is null
      expect(activity.actorDisplayName).toBeNull();
    });
  });
});
