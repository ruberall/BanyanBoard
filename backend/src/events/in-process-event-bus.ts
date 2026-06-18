/**
 * in-process-event-bus.ts
 *
 * InProcessEventBus — an in-memory implementation of DomainEventBus.
 * Uses a Map<boardId, Set<handler>> for O(1) fan-out per board.
 * Does NOT use Node.js EventEmitter.
 */

import type { DomainEvent, DomainEventBus } from './domain-event-bus';

export class InProcessEventBus implements DomainEventBus {
  /**
   * Internal subscriber registry.
   * Key: boardId — Value: set of handler functions registered for that board.
   * Exposed as `_subscribers` for testability (memory-leak assertions).
   */
  readonly _subscribers = new Map<string, Set<(event: DomainEvent) => void>>();

  publish(event: DomainEvent): void {
    const handlers = this._subscribers.get(event.boardId);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(event);
    }
  }

  subscribe(boardId: string, handler: (event: DomainEvent) => void): () => void {
    let handlers = this._subscribers.get(boardId);
    if (!handlers) {
      handlers = new Set();
      this._subscribers.set(boardId, handlers);
    }
    handlers.add(handler);

    return () => {
      const set = this._subscribers.get(boardId);
      if (!set) {
        return;
      }
      set.delete(handler);
      // Remove the Map entry when the last subscriber for a board is removed
      // to prevent unbounded memory growth.
      if (set.size === 0) {
        this._subscribers.delete(boardId);
      }
    };
  }
}
