/**
 * event.service.ts
 *
 * EventService — coordinates event persistence and in-process bus publication.
 */

import { logger } from '../logger';
import type { DomainEventBus } from '../events/domain-event-bus';
import { EventRepository } from '../repositories/event.repository';
import type { Queryable } from '../db/queryable';

// ---------------------------------------------------------------------------
// Input type for emitCardMoved
// ---------------------------------------------------------------------------

export interface CardMovedInput {
  boardId: string;
  cardId: string;
  cardTitle: string;
  actorId: string | null;
  actorEmail: string | null;
  fromColumnId: string;
  fromColumnName: string | null;
  toColumnId: string;
  toColumnName: string | null;
  occurredAt?: Date;
}

// ---------------------------------------------------------------------------
// EventService
// ---------------------------------------------------------------------------

export class EventService {
  private readonly repo: EventRepository;

  constructor(
    private readonly bus: DomainEventBus,
    db: Queryable,
  ) {
    this.repo = new EventRepository(db);
  }

  async emitCardMoved(input: CardMovedInput): Promise<void> {
    const row = await this.repo.insert({
      boardId:      input.boardId,
      cardId:       input.cardId,
      actorId:      input.actorId,
      eventType:    'card.moved',
      fromColumnId: input.fromColumnId,
      toColumnId:   input.toColumnId,
      payload: {
        cardTitle:      input.cardTitle,
        fromColumnName: input.fromColumnName,
        toColumnName:   input.toColumnName,
        actorEmail:     input.actorEmail,
      },
    });

    this.bus.publish({
      type:           'card.moved',
      eventId:        row.id,
      boardId:        input.boardId,
      cardId:         input.cardId,
      cardTitle:      input.cardTitle,
      actorId:        input.actorId,
      actorEmail:     input.actorEmail,
      fromColumnId:   input.fromColumnId,
      fromColumnName: input.fromColumnName,
      toColumnId:     input.toColumnId,
      toColumnName:   input.toColumnName,
      occurredAt:     row.occurred_at,
    });

    logger.info(
      { eventId: row.id, cardId: input.cardId, toColumnId: input.toColumnId },
      'event.card_moved.emitted',
    );
  }
}
