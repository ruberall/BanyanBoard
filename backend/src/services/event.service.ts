/**
 * event.service.ts
 *
 * EventService — coordinates event persistence and in-process bus publication.
 */

import { logger } from '../logger';
import type { DomainEventBus } from '../events/domain-event-bus';
import { EventRepository } from '../repositories/event.repository';
import type { Queryable } from '../db/queryable';
import type { UserRepository } from '../repositories/user.repository';

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
// Input type for emitCardCreated
// ---------------------------------------------------------------------------

export interface CardCreatedInput {
  boardId: string;
  cardId: string;
  cardTitle: string;
  actorId: string | null;
  actorEmail?: string | null;
  columnId: string;
  columnName?: string | null;
}

// ---------------------------------------------------------------------------
// EventService
// ---------------------------------------------------------------------------

export class EventService {
  private readonly repo: EventRepository;

  constructor(
    private readonly bus: DomainEventBus,
    db: Queryable,
    private readonly userRepo?: UserRepository,
  ) {
    this.repo = new EventRepository(db);
  }

  /**
   * Resolve actor display name from the users table.
   * Snapshots the name at emit time — no JOIN needed on read.
   * Fallback chain: "First Last" → email → null
   */
  private async resolveDisplayName(actorId: string | null, actorEmail?: string | null): Promise<string | null> {
    if (actorId === null) return null;
    if (!this.userRepo) return null;

    const user = await this.userRepo.findById(actorId);
    if (!user) return null;

    const nameParts = [user.first_name, user.last_name].filter(Boolean);
    if (nameParts.length > 0) {
      return nameParts.join(' ');
    }
    return user.email ?? actorEmail ?? null;
  }

  async emitCardMoved(input: CardMovedInput): Promise<void> {
    const actorDisplayName = await this.resolveDisplayName(input.actorId, input.actorEmail);

    const row = await this.repo.insert({
      boardId:      input.boardId,
      cardId:       input.cardId,
      actorId:      input.actorId,
      eventType:    'card.moved',
      fromColumnId: input.fromColumnId,
      toColumnId:   input.toColumnId,
      payload: {
        cardTitle:          input.cardTitle,
        fromColumnName:     input.fromColumnName,
        toColumnName:       input.toColumnName,
        actorEmail:         input.actorEmail,
        actor_display_name: actorDisplayName,
      },
    });

    this.bus.publish({
      type:             'card.moved',
      eventId:          row.id,
      boardId:          input.boardId,
      cardId:           input.cardId,
      cardTitle:        input.cardTitle,
      actorId:          input.actorId,
      actorEmail:       input.actorEmail,
      actorDisplayName: actorDisplayName,
      fromColumnId:     input.fromColumnId,
      fromColumnName:   input.fromColumnName,
      toColumnId:       input.toColumnId,
      toColumnName:     input.toColumnName,
      occurredAt:       row.occurred_at,
    });

    logger.info(
      { eventId: row.id, cardId: input.cardId, toColumnId: input.toColumnId },
      'event.card_moved.emitted',
    );
  }

  async emitCardCreated(input: CardCreatedInput): Promise<void> {
    const actorDisplayName = await this.resolveDisplayName(input.actorId, input.actorEmail);

    const row = await this.repo.insert({
      boardId:      input.boardId,
      cardId:       input.cardId,
      actorId:      input.actorId,
      eventType:    'card.created',
      fromColumnId: null,
      toColumnId:   null,
      payload: {
        cardTitle:          input.cardTitle,
        columnId:           input.columnId,
        columnName:         input.columnName ?? null,
        actor_display_name: actorDisplayName,
      },
    });

    this.bus.publish({
      type:             'card.created',
      eventId:          row.id,
      boardId:          input.boardId,
      cardId:           input.cardId,
      cardTitle:        input.cardTitle,
      actorId:          input.actorId,
      actorDisplayName: actorDisplayName,
      columnId:         input.columnId,
      columnName:       input.columnName ?? null,
      occurredAt:       row.occurred_at,
    });

    logger.info(
      { eventId: row.id, cardId: input.cardId, columnId: input.columnId },
      'event.card_created.emitted',
    );
  }
}
