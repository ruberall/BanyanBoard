/**
 * card.service.test.ts
 *
 * Phase 1 coverage: CardService (unit tests — mock CardRepository)
 * Phase 1 attribution: actor propagation into EventService (WI-016-001, WI-016-002)
 */

import { CardService } from '../card.service';
import { CardRepository } from '../../repositories/card.repository';
import type { Card } from '../../repositories/card.repository';
import type { EventService } from '../event.service';
import { NotFoundError } from '../../errors';

const BASE_CARD: Card = {
  id: 'card-uuid-1',
  column_id: 'col-uuid-1',
  title: 'Write tests',
  description: null,
  due_date: null,
  labels: [],
  position: 0,
  created_at: new Date('2026-06-16T00:00:00Z'),
  updated_at: new Date('2026-06-16T00:00:00Z'),
};

function makeMockRepo(): jest.Mocked<CardRepository> {
  return {
    createCard: jest.fn(),
    findCardsByColumnId: jest.fn(),
    findCardById: jest.fn(),
    updateCard: jest.fn(),
    deleteCard: jest.fn(),
    moveCard: jest.fn(),
  } as unknown as jest.Mocked<CardRepository>;
}

function makeMockDb(responses: Array<{ rows: unknown[]; rowCount?: number }> = []) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const response = responses[callIndex] ?? { rows: [], rowCount: 0 };
      callIndex++;
      return Promise.resolve(response);
    }),
  };
}

describe('CardService', () => {
  let repo: jest.Mocked<CardRepository>;
  let mockDb: ReturnType<typeof makeMockDb>;
  let service: CardService;

  beforeEach(() => {
    repo = makeMockRepo();
    mockDb = makeMockDb();
    service = new CardService(repo, mockDb);
  });

  describe('createCard(columnId, input)', () => {
    it('delegates to repo.createCard and returns the card', async () => {
      repo.createCard.mockResolvedValueOnce(BASE_CARD);

      const card = await service.createCard('col-uuid-1', { title: 'Write tests' });

      expect(repo.createCard).toHaveBeenCalledWith('col-uuid-1', { title: 'Write tests' });
      expect(card).toBe(BASE_CARD);
    });
  });

  describe('getCardsByColumnId(columnId)', () => {
    it('delegates to repo.findCardsByColumnId and returns cards array', async () => {
      repo.findCardsByColumnId.mockResolvedValueOnce([BASE_CARD]);

      const cards = await service.getCardsByColumnId('col-uuid-1');

      expect(repo.findCardsByColumnId).toHaveBeenCalledWith('col-uuid-1');
      expect(cards).toHaveLength(1);
    });
  });

  describe('getCardById(id)', () => {
    it('delegates to repo.findCardById and returns card', async () => {
      repo.findCardById.mockResolvedValueOnce(BASE_CARD);

      const card = await service.getCardById('card-uuid-1');

      expect(repo.findCardById).toHaveBeenCalledWith('card-uuid-1');
      expect(card).toBe(BASE_CARD);
    });
  });

  describe('updateCard(id, updates)', () => {
    it('delegates to repo.updateCard and returns updated card', async () => {
      const updated = { ...BASE_CARD, title: 'Updated' };
      repo.updateCard.mockResolvedValueOnce(updated);

      const card = await service.updateCard('card-uuid-1', { title: 'Updated' });

      expect(repo.updateCard).toHaveBeenCalledWith('card-uuid-1', { title: 'Updated' });
      expect(card.title).toBe('Updated');
    });
  });

  describe('deleteCard(id)', () => {
    it('delegates to repo.deleteCard and resolves void', async () => {
      repo.deleteCard.mockResolvedValueOnce(undefined);

      await expect(service.deleteCard('card-uuid-1')).resolves.toBeUndefined();
      expect(repo.deleteCard).toHaveBeenCalledWith('card-uuid-1');
    });
  });

  describe('moveCard(id, columnId, afterCardId)', () => {
    function buildService(dbResponses: Array<{ rows: unknown[]; rowCount?: number }>) {
      const r = makeMockRepo();
      const db = makeMockDb(dbResponses);
      const svc = new CardService(r, db);
      return { r, db, svc };
    }

    it('AC-MOVE empty column: computes position 1.0 when target column has no cards', async () => {
      const { r, svc } = buildService([{ rows: [{ id: 'col-uuid-1' }] }]);
      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-uuid-1', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      const card = await svc.moveCard('card-uuid-1', 'col-uuid-1', null);

      expect(r.moveCard).toHaveBeenCalledWith('card-uuid-1', 'col-uuid-1', 1.0);
      expect(card.position).toBe(1.0);
    });

    it('AC-MOVE-1 top: computes position = min/2 when afterCardId is null and cards exist', async () => {
      const cards = [
        { ...BASE_CARD, id: 'c1', position: 1.0 },
        { ...BASE_CARD, id: 'c2', position: 2.0 },
      ];
      const { r, svc } = buildService([{ rows: [{ id: 'col-uuid-2' }] }]);
      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce(cards);
      const movedCard = { ...BASE_CARD, column_id: 'col-uuid-2', position: 0.5 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      const card = await svc.moveCard('card-uuid-1', 'col-uuid-2', null);

      expect(r.moveCard).toHaveBeenCalledWith('card-uuid-1', 'col-uuid-2', 0.5);
      expect(card.position).toBe(0.5);
    });

    it('AC-MOVE-2 bottom: computes position = max+1.0 when afterCardId is last card', async () => {
      const cards = [
        { ...BASE_CARD, id: 'c1', position: 1.0 },
        { ...BASE_CARD, id: 'c2', position: 2.0 },
      ];
      const { r, svc } = buildService([{ rows: [{ id: 'col-uuid-2' }] }]);
      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce(cards);
      const movedCard = { ...BASE_CARD, column_id: 'col-uuid-2', position: 3.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      const card = await svc.moveCard('card-uuid-1', 'col-uuid-2', 'c2');

      expect(r.moveCard).toHaveBeenCalledWith('card-uuid-1', 'col-uuid-2', 3.0);
      expect(card.position).toBe(3.0);
    });

    it('AC-MOVE-3 between: computes midpoint when afterCardId is an intermediate card', async () => {
      const cards = [
        { ...BASE_CARD, id: 'c1', position: 1.0 },
        { ...BASE_CARD, id: 'c2', position: 3.0 },
      ];
      const { r, svc } = buildService([{ rows: [{ id: 'col-uuid-2' }] }]);
      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce(cards);
      const movedCard = { ...BASE_CARD, column_id: 'col-uuid-2', position: 2.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      const card = await svc.moveCard('card-uuid-1', 'col-uuid-2', 'c1');

      expect(r.moveCard).toHaveBeenCalledWith('card-uuid-1', 'col-uuid-2', 2.0);
      expect(card.position).toBe(2.0);
    });

    it('AC-MOVE-5: throws NotFoundError when card does not exist', async () => {
      const { r, svc } = buildService([]);
      r.findCardById.mockRejectedValueOnce(new NotFoundError('Card not found'));

      await expect(svc.moveCard('ghost-id', 'col-uuid-1', null)).rejects.toThrow(NotFoundError);
      expect(r.moveCard).not.toHaveBeenCalled();
    });

    it('AC-MOVE-6: throws NotFoundError when destination column does not exist', async () => {
      const { r, svc } = buildService([{ rows: [] }]);
      r.findCardById.mockResolvedValueOnce(BASE_CARD);

      await expect(svc.moveCard('card-uuid-1', 'nonexistent-col', null)).rejects.toThrow(NotFoundError);
      expect(r.moveCard).not.toHaveBeenCalled();
    });

    it('logs card.moved after a successful move', async () => {
      const { r, svc } = buildService([{ rows: [{ id: 'col-uuid-1' }] }]);
      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      await svc.moveCard('card-uuid-1', 'col-uuid-1', null);

      expect(r.moveCard).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // Phase 1 attribution — WI-016-001
    // These tests FAIL until CardService.moveCard() accepts and forwards actorId.
    // -------------------------------------------------------------------------

    it('AC-HAPPY-1: passes actorId to EventService.emitCardMoved when session user provided', async () => {
      // Arrange
      const mockEventService: jest.Mocked<Pick<EventService, 'emitCardMoved'>> = {
        emitCardMoved: jest.fn().mockResolvedValue(undefined),
      };
      const r = makeMockRepo();
      const db = makeMockDb([{ rows: [{ id: 'col-uuid-2', board_id: 'board-uuid-1' }] }]);
      const svc = new CardService(r, db, mockEventService as unknown as EventService);

      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-uuid-2', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      // Act — call moveCard with an actorId (new parameter required by WI-016-001)
      await svc.moveCard('card-uuid-1', 'col-uuid-2', null, 'actor-user-uuid-1');

      // Assert — emitCardMoved called with the real actorId (not null)
      expect(mockEventService.emitCardMoved).toHaveBeenCalledTimes(1);
      expect(mockEventService.emitCardMoved).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-user-uuid-1',
          cardId: 'card-uuid-1',
          toColumnId: 'col-uuid-2',
        }),
      );
    });

    it('AC-HAPPY-1: actorId defaults to null when no session user provided (backward-compat)', async () => {
      // Arrange
      const mockEventService: jest.Mocked<Pick<EventService, 'emitCardMoved'>> = {
        emitCardMoved: jest.fn().mockResolvedValue(undefined),
      };
      const r = makeMockRepo();
      const db = makeMockDb([{ rows: [{ id: 'col-uuid-2', board_id: 'board-uuid-1' }] }]);
      const svc = new CardService(r, db, mockEventService as unknown as EventService);

      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-uuid-2', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      // Act — no actorId argument
      await svc.moveCard('card-uuid-1', 'col-uuid-2', null);

      // Assert — actorId is null (not undefined, not missing)
      expect(mockEventService.emitCardMoved).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: null }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 1 attribution — createCard with emitCardCreated (WI-016-002)
  // These tests FAIL until:
  //   1. CardCreatedEvent is added to DomainEvent union
  //   2. EventService.emitCardCreated() is implemented
  //   3. CardService.createCard() calls emitCardCreated with actorId
  // ---------------------------------------------------------------------------

  describe('createCard(columnId, input) — Phase 1 attribution', () => {
    it('AC-HAPPY-2: calls EventService.emitCardCreated with actorId when session user provided', async () => {
      // Arrange
      const mockEventService = {
        emitCardMoved:   jest.fn().mockResolvedValue(undefined),
        emitCardCreated: jest.fn().mockResolvedValue(undefined),
      } as unknown as EventService;
      const r = makeMockRepo();
      const db = makeMockDb([]);
      const svc = new CardService(r, db, mockEventService);

      r.createCard.mockResolvedValueOnce(BASE_CARD);

      // Act — createCard with actorId (new parameter required by WI-016-002)
      await svc.createCard('col-uuid-1', { title: 'Write tests' }, 'actor-user-uuid-1');

      // Assert — emitCardCreated called with real actorId (not null), cardId, boardId
      expect((mockEventService as any).emitCardCreated).toHaveBeenCalledTimes(1);
      expect((mockEventService as any).emitCardCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor-user-uuid-1',
          cardId: BASE_CARD.id,
        }),
      );
    });

    it('AC-HAPPY-2: does not throw when EventService is not wired (backward-compat)', async () => {
      // Arrange — no eventService injected
      const r = makeMockRepo();
      const db = makeMockDb([]);
      const svc = new CardService(r, db); // no eventService

      r.createCard.mockResolvedValueOnce(BASE_CARD);

      // Act + Assert — createCard still succeeds without eventService
      await expect(svc.createCard('col-uuid-1', { title: 'Write tests' })).resolves.toBe(BASE_CARD);
    });
  });
});
