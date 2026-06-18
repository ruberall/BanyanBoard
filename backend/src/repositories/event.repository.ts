/**
 * event.repository.ts
 *
 * EventRepository — persistence layer for card_events table.
 */

import type { Queryable } from '../db/queryable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventInput {
  boardId: string;
  cardId: string;
  actorId: string | null;
  eventType: string;
  fromColumnId: string;
  toColumnId: string;
  payload: Record<string, unknown>;
}

export interface EventRow {
  id: string;
  board_id: string;
  card_id: string;
  actor_id: string | null;
  event_type: string;
  from_column_id: string;
  to_column_id: string;
  payload: Record<string, unknown>;
  occurred_at: Date;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class EventRepository {
  constructor(private readonly db: Queryable) {}

  async insert(input: EventInput): Promise<EventRow> {
    const result = await this.db.query<EventRow>(
      `INSERT INTO card_events
         (board_id, card_id, actor_id, event_type, from_column_id, to_column_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, board_id, card_id, actor_id, event_type, from_column_id, to_column_id, payload, occurred_at`,
      [
        input.boardId,
        input.cardId,
        input.actorId,
        input.eventType,
        input.fromColumnId,
        input.toColumnId,
        input.payload,
      ],
    );
    return result.rows[0];
  }

  async findRecentByBoard(boardId: string, limit: number): Promise<EventRow[]> {
    const result = await this.db.query<EventRow>(
      `SELECT id, board_id, card_id, actor_id, event_type, from_column_id, to_column_id, payload, occurred_at
       FROM card_events
       WHERE board_id = $1
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [boardId, limit],
    );
    return result.rows;
  }
}
