/**
 * card.service.test.ts
 *
 * Phase 1 coverage: CardService (unit tests — mock CardRepository)
 * Phase 1 attribution: actor propagation into EventService (WI-016-001, WI-016-002)
 *
 * Phase 2 additions (TASK-017):
 *   Stale suppression — when moveCard source column is Stale, repo.setSuppressed(id, true)
 *   is called after the move. Failure to set suppression is best-effort (does not block move).
 *   These tests FAIL until CardService.moveCard queries the source column name and calls
 *   repo.setSuppressed when moving from Stale.
 *
 * Phase 3 additions (TASK-017):
 *   Done-color rule trigger — when moveCard target column name is 'Done',
 *   workflowService.triggerDoneColorRule(boardId, cardId) is called fire-and-forget.
 *   The move response must not be blocked or delayed by the rule.
 *   Tests FAIL until CardService.moveCard:
 *     - Detects destination column name === 'Done' from the colResult query
 *     - Calls this.workflowService?.triggerDoneColorRule(boardId, card.id) fire-and-forget
 *     - Swallows any rejection from triggerDoneColorRule (does not propagate to caller)
 *     - Does NOT call triggerDoneColorRule when destination column is not 'Done'
 */

import { CardService } from '../card.service';
import { CardRepository } from '../../repositories/card.repository';
import type { Card } from '../../repositories/card.repository';
import type { EventService } from '../event.service';
import type { WorkflowService } from '../workflow.service';
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
    getColumnName: jest.fn().mockResolvedValue(null),
    setSuppressed: jest.fn().mockResolvedValue(undefined),
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
  // Phase 2 (TASK-017): stale suppression in moveCard
  //
  // When a card is moved FROM the Stale column, CardService must:
  //   1. Query the source column name (parallel with destination column query)
  //   2. If source name === 'Stale', issue UPDATE cards SET stale_suppressed = true
  //   3. Suppression write failure is best-effort — does NOT block the move response
  //
  // These tests FAIL until CardService.moveCard:
  //   - fetches source column name via db.query
  //   - calls repo.setSuppressed OR issues a direct UPDATE when isFromStale is true
  // ---------------------------------------------------------------------------

  describe('moveCard — stale suppression (Phase 2)', () => {
    it('AC-STALE-SUPPRESS-1: sets stale_suppressed=true when card moves FROM Stale column', async () => {
      // Arrange — db responds for destination column query only;
      // source column name and suppression update go through repo methods.
      const db = makeMockDb([
        { rows: [{ id: 'col-inprogress', board_id: 'board-uuid-1', name: 'In Progress' }] }, // dest col
      ]);
      const r = makeMockRepo();
      r.getColumnName.mockResolvedValueOnce('Stale');
      r.setSuppressed.mockResolvedValueOnce(undefined);
      const svc = new CardService(r, db);

      const staleCard = { ...BASE_CARD, column_id: 'col-stale' };
      r.findCardById.mockResolvedValueOnce(staleCard);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-inprogress', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      // Act
      const result = await svc.moveCard('card-uuid-1', 'col-inprogress', null);

      // Assert — card moved successfully
      expect(result.column_id).toBe('col-inprogress');

      // repo.getColumnName called with the source column id
      expect(r.getColumnName).toHaveBeenCalledWith('col-stale');
      // repo.setSuppressed called with the card id and true
      expect(r.setSuppressed).toHaveBeenCalledWith('card-uuid-1', true);
    });

    it('does NOT set stale_suppressed when card moves from a non-Stale column', async () => {
      // Arrange — source column is 'To Do', not 'Stale'
      const db = makeMockDb([
        { rows: [{ id: 'col-stale', board_id: 'board-uuid-1', name: 'Stale' }] }, // dest col
      ]);
      const r = makeMockRepo();
      r.getColumnName.mockResolvedValueOnce('To Do');
      const svc = new CardService(r, db);

      r.findCardById.mockResolvedValueOnce(BASE_CARD); // BASE_CARD.column_id = 'col-uuid-1'
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-stale', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      // Act
      await svc.moveCard('card-uuid-1', 'col-stale', null);

      // Assert — repo.setSuppressed NOT called when source is not Stale
      expect(r.setSuppressed).not.toHaveBeenCalled();
    });

    it('stale suppression write failure does NOT block the move response', async () => {
      // Arrange — source is Stale; repo.setSuppressed throws a DB error
      const db = makeMockDb([
        { rows: [{ id: 'col-inprogress', board_id: 'board-uuid-1', name: 'In Progress' }] }, // dest col
      ]);
      const r = makeMockRepo();
      r.getColumnName.mockResolvedValueOnce('Stale');
      r.setSuppressed.mockRejectedValueOnce(new Error('suppress write failed'));
      const svc = new CardService(r, db);

      const staleCard = { ...BASE_CARD, column_id: 'col-stale' };
      r.findCardById.mockResolvedValueOnce(staleCard);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-inprogress', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);

      // Act — must resolve (not throw) even when suppression write fails
      await expect(svc.moveCard('card-uuid-1', 'col-inprogress', null)).resolves.toMatchObject({
        column_id: 'col-inprogress',
      });
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

  // ---------------------------------------------------------------------------
  // Phase 3 (TASK-017): Done-color rule fire-and-forget trigger in moveCard
  //
  // When moveCard is called with a destination column named 'Done', CardService
  // must call workflowService.triggerDoneColorRule(boardId, cardId) without
  // awaiting it (fire-and-forget). The card move response must not be blocked.
  //
  // These tests FAIL until CardService.moveCard:
  //   - Uses the column name from the existing colResult query (SELECT id, board_id, name)
  //   - Detects toColumnName === 'Done' and calls triggerDoneColorRule fire-and-forget
  //   - Uses .catch(() => {}) or similar to swallow rejections
  //   - Does NOT call triggerDoneColorRule when destination column name is not 'Done'
  //   - Does NOT call triggerDoneColorRule when workflowService is not injected
  // ---------------------------------------------------------------------------

  describe('moveCard — Done-color rule trigger (Phase 3)', () => {
    /** Build a WorkflowService mock with triggerDoneColorRule as a spy */
    function makeMockWorkflowService(): jest.Mocked<Pick<WorkflowService, 'triggerDoneColorRule'>> {
      return {
        triggerDoneColorRule: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<Pick<WorkflowService, 'triggerDoneColorRule'>>;
    }

    it('AC-HAPPY-4: calls triggerDoneColorRule when moving card to Done column', async () => {
      // Arrange — destination column name is 'Done'
      const db = makeMockDb([
        { rows: [{ id: 'col-done', board_id: 'board-uuid-1', name: 'Done' }] },
      ]);
      const r = makeMockRepo();
      const mockWorkflow = makeMockWorkflowService();
      const svc = new CardService(r, db, undefined, mockWorkflow as unknown as WorkflowService);

      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-done', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);
      r.getColumnName.mockResolvedValueOnce('In Progress'); // source column name (not Stale)

      // Act
      const result = await svc.moveCard('card-uuid-1', 'col-done', null);

      // Assert — move succeeded
      expect(result.column_id).toBe('col-done');

      // triggerDoneColorRule was called with correct boardId and cardId
      expect(mockWorkflow.triggerDoneColorRule).toHaveBeenCalledTimes(1);
      expect(mockWorkflow.triggerDoneColorRule).toHaveBeenCalledWith('board-uuid-1', movedCard.id);
    });

    it('does NOT call triggerDoneColorRule when destination column is not Done', async () => {
      // Arrange — destination column name is 'In Progress'
      const db = makeMockDb([
        { rows: [{ id: 'col-inprogress', board_id: 'board-uuid-1', name: 'In Progress' }] },
      ]);
      const r = makeMockRepo();
      const mockWorkflow = makeMockWorkflowService();
      const svc = new CardService(r, db, undefined, mockWorkflow as unknown as WorkflowService);

      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      r.moveCard.mockResolvedValueOnce({ ...BASE_CARD, column_id: 'col-inprogress', position: 1.0 });
      r.getColumnName.mockResolvedValueOnce('To Do'); // source column is To Do — not Stale

      // Act
      await svc.moveCard('card-uuid-1', 'col-inprogress', null);

      // Assert — NOT triggered for non-Done columns
      expect(mockWorkflow.triggerDoneColorRule).not.toHaveBeenCalled();
    });

    it('does NOT call triggerDoneColorRule when workflowService is not injected', async () => {
      // Arrange — no workflowService provided; destination is Done
      const db = makeMockDb([
        { rows: [{ id: 'col-done', board_id: 'board-uuid-1', name: 'Done' }] },
      ]);
      const r = makeMockRepo();
      // CardService constructed without workflowService
      const svc = new CardService(r, db);

      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      r.moveCard.mockResolvedValueOnce({ ...BASE_CARD, column_id: 'col-done', position: 1.0 });
      r.getColumnName.mockResolvedValueOnce('To Do');

      // Act + Assert — must not throw; no WorkflowService to call
      await expect(svc.moveCard('card-uuid-1', 'col-done', null)).resolves.toMatchObject({
        column_id: 'col-done',
      });
    });

    it('AC-ERROR-2: move response resolves successfully even when triggerDoneColorRule rejects', async () => {
      // Arrange — triggerDoneColorRule rejects; card move must still succeed
      const db = makeMockDb([
        { rows: [{ id: 'col-done', board_id: 'board-uuid-1', name: 'Done' }] },
      ]);
      const r = makeMockRepo();
      const mockWorkflow = makeMockWorkflowService();
      // triggerDoneColorRule is designed to never reject (it catches internally),
      // but we simulate a leaked rejection to verify CardService also swallows it.
      mockWorkflow.triggerDoneColorRule.mockRejectedValueOnce(new Error('workflow rejected'));
      const svc = new CardService(r, db, undefined, mockWorkflow as unknown as WorkflowService);

      r.findCardById.mockResolvedValueOnce(BASE_CARD);
      r.findCardsByColumnId.mockResolvedValueOnce([]);
      const movedCard = { ...BASE_CARD, column_id: 'col-done', position: 1.0 };
      r.moveCard.mockResolvedValueOnce(movedCard);
      r.getColumnName.mockResolvedValueOnce('In Progress');

      // Act + Assert — must not throw; fire-and-forget rejection does not block response
      await expect(svc.moveCard('card-uuid-1', 'col-done', null)).resolves.toMatchObject({
        column_id: 'col-done',
      });
    });
  });
});
