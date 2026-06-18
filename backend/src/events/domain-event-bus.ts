/**
 * domain-event-bus.ts
 *
 * DomainEventBus interface and domain event types for the activity feed feature.
 */

// ---------------------------------------------------------------------------
// Domain event types
// ---------------------------------------------------------------------------

export interface CardMovedEvent {
  type: 'card.moved';
  eventId: string;
  boardId: string;
  cardId: string;
  cardTitle?: string;
  actorId: string | null;
  actorEmail?: string | null;
  fromColumnId: string;
  fromColumnName?: string | null;
  toColumnId: string;
  toColumnName?: string | null;
  occurredAt: Date;
}

export type DomainEvent = CardMovedEvent;

// ---------------------------------------------------------------------------
// DomainEventBus interface
// ---------------------------------------------------------------------------

export interface DomainEventBus {
  /**
   * Publish a domain event to all subscribers for the event's boardId.
   */
  publish(event: DomainEvent): void | Promise<void>;

  /**
   * Subscribe to domain events for a specific board.
   * Returns an unsubscribe function.
   */
  subscribe(boardId: string, handler: (event: DomainEvent) => void): () => void;
}
