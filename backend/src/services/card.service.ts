import type { CardRepository, Card, CardInput, CardUpdate } from '../repositories/card.repository';
import { logger } from '../logger';
import { NotFoundError } from '../errors';
import type { Queryable } from '../db/queryable';
import type { EventService } from './event.service';
import type { WorkflowService } from './workflow.service';

export class CardService {
  constructor(
    private readonly repo: CardRepository,
    private readonly db: Queryable,
    private readonly eventService?: EventService,
    private readonly workflowService?: WorkflowService,
  ) {}

  async createCard(columnId: string, input: CardInput, actorId?: string | null): Promise<Card> {
    const card = await this.repo.createCard(columnId, input);
    logger.info({ cardId: card.id, columnId }, 'card.created');

    if (this.eventService) {
      try {
        const colResult = await this.db.query<{ board_id: string; name: string }>(
          'SELECT board_id, name FROM columns WHERE id = $1',
          [columnId],
        );
        const boardId = colResult.rows[0]?.board_id ?? null;
        const columnName = colResult.rows[0]?.name ?? null;

        await this.eventService.emitCardCreated({
          // boardId should always resolve from the columns query; fall back to
          // columnId only if the row is unexpectedly missing (e.g., race with
          // a concurrent column delete).  The columnId is a valid UUID but is
          // not a board_id — this path triggers a FK violation in the event
          // insert, which is caught by the outer try/catch and logged as a warning.
          boardId:    boardId ?? columnId,
          cardId:     card.id,
          cardTitle:  card.title,
          actorId:    actorId ?? null,
          columnId,
          columnName,
        });
      } catch (err) {
        logger.warn({ err, cardId: card.id }, 'card.created.event_emission_failed');
      }
    }

    return card;
  }

  async getCardsByColumnId(columnId: string): Promise<Card[]> {
    return this.repo.findCardsByColumnId(columnId);
  }

  async getCardById(id: string): Promise<Card> {
    return this.repo.findCardById(id);
  }

  async updateCard(id: string, updates: CardUpdate): Promise<Card> {
    const card = await this.repo.updateCard(id, updates);
    logger.info({ cardId: id }, 'card.updated');
    return card;
  }

  async deleteCard(id: string): Promise<void> {
    await this.repo.deleteCard(id);
    logger.info({ cardId: id }, 'card.deleted');
  }

  async moveCard(id: string, columnId: string, afterCardId: string | null, actorId?: string | null): Promise<Card> {
    const existingCard = await this.repo.findCardById(id);

    // Query destination column (required for board_id and existence check).
    const colResult = await this.db.query<{ id: string; board_id: string; name: string }>(
      'SELECT id, board_id, name FROM columns WHERE id = $1',
      [columnId],
    );
    if (colResult.rows.length === 0) {
      throw new NotFoundError('Column not found');
    }
    const boardId      = colResult.rows[0].board_id;
    const destColName  = colResult.rows[0].name;

    const cards = await this.repo.findCardsByColumnId(columnId);

    let newPosition: number;
    if (cards.length === 0) {
      newPosition = 1.0;
    } else if (afterCardId === null) {
      newPosition = cards[0].position / 2;
    } else {
      const afterIndex = cards.findIndex((c) => c.id === afterCardId);
      if (afterIndex === cards.length - 1) {
        newPosition = cards[cards.length - 1].position + 1.0;
      } else {
        newPosition = (cards[afterIndex].position + cards[afterIndex + 1].position) / 2;
      }
    }

    const card = await this.repo.moveCard(id, columnId, newPosition);
    logger.info({ cardId: id, columnId, position: newPosition }, 'card.moved');

    // Stale suppression: best-effort UPDATE when card was moved FROM the Stale column.
    // Query the source column name inside try/catch so any failure is non-fatal.
    try {
      const sourceColumnName = await this.repo.getColumnName(existingCard.column_id);
      if (sourceColumnName === 'Stale') {
        await this.repo.setSuppressed(id, true);
      }
    } catch (err) {
      logger.warn({ err, cardId: id }, 'card.stale_suppression.failed');
    }

    // Done-color rule: fire-and-forget when card is moved to the Done column.
    if (this.workflowService && destColName === 'Done') {
      this.workflowService.triggerDoneColorRule(boardId, card.id).catch((err) => {
        logger.warn({ err, cardId: card.id }, 'workflow.rule2.trigger_failed');
      });
    }

    if (this.eventService) {
      try {
        await this.eventService.emitCardMoved({
          boardId:        boardId,
          cardId:         card.id,
          cardTitle:      card.title,
          actorId:        actorId ?? null,
          actorEmail:     null,
          fromColumnId:   existingCard.column_id,
          fromColumnName: null,
          toColumnId:     card.column_id,
          toColumnName:   null,
        });
      } catch (err) {
        logger.warn({ err, cardId: id }, 'card.moved.event_emission_failed');
      }
    }

    return card;
  }
}
