/**
 * in-process-event-bus.test.ts
 *
 * Phase 1 coverage: InProcessEventBus (unit tests — no external dependencies)
 *
 * Tests will FAIL until the Coding Agent implements:
 *   src/events/in-process-event-bus.ts — InProcessEventBus class
 *   src/events/domain-event-bus.ts     — DomainEventBus interface
 *
 * Key behaviours verified:
 *   1. publish() fans out to ALL subscribers for a given boardId
 *   2. subscribe() returns an unsubscribe function that silently removes the handler
 *   3. publish() is scoped — subscribers on boardId A do NOT receive events for boardId B
 *   4. Unsubscribing the last handler for a board removes the Map entry (no memory leak)
 */

// ---------------------------------------------------------------------------
// Minimal event fixture
// ---------------------------------------------------------------------------

interface CardMovedEvent {
  type: 'card.moved';
  eventId: string;
  boardId: string;
  cardId: string;
  actorId: string | null;
  fromColumnId: string;
  toColumnId: string;
  occurredAt: Date;
}

function makeEvent(boardId: string): CardMovedEvent {
  return {
    type: 'card.moved',
    eventId: 'event-uuid-0000',
    boardId,
    cardId: 'card-uuid-1111',
    actorId: 'actor-uuid-aaaa',
    fromColumnId: 'col-uuid-from',
    toColumnId: 'col-uuid-to',
    occurredAt: new Date('2026-06-18T00:00:00Z'),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InProcessEventBus', () => {
  // Dynamic import so tests fail cleanly when the file doesn't exist yet,
  // rather than at module-load time (consistent with repository test pattern).
  async function makeEventBus() {
    const { InProcessEventBus } = await import('../in-process-event-bus');
    return new InProcessEventBus();
  }

  it('publish() fans out to all subscribers for the same boardId', async () => {
    // Arrange
    const bus = await makeEventBus();
    const BOARD_ID = 'board-uuid-1111';
    const received1: CardMovedEvent[] = [];
    const received2: CardMovedEvent[] = [];

    bus.subscribe(BOARD_ID, (e) => received1.push(e as CardMovedEvent));
    bus.subscribe(BOARD_ID, (e) => received2.push(e as CardMovedEvent));

    const event = makeEvent(BOARD_ID);

    // Act
    await bus.publish(event);

    // Assert — both handlers received exactly one copy of the event
    expect(received1).toHaveLength(1);
    expect(received1[0]).toEqual(event);
    expect(received2).toHaveLength(1);
    expect(received2[0]).toEqual(event);
  });

  it('subscribe() returns an unsubscribe function that stops delivery to that handler', async () => {
    // Arrange
    const bus = await makeEventBus();
    const BOARD_ID = 'board-uuid-2222';
    const received: CardMovedEvent[] = [];

    const unsubscribe = bus.subscribe(BOARD_ID, (e) => received.push(e as CardMovedEvent));

    // Act — unsubscribe before publishing
    unsubscribe();
    await bus.publish(makeEvent(BOARD_ID));

    // Assert — handler never fired
    expect(received).toHaveLength(0);
  });

  it('publish() does NOT deliver events to subscribers of a different boardId', async () => {
    // Arrange
    const bus = await makeEventBus();
    const BOARD_A = 'board-uuid-aaaa';
    const BOARD_B = 'board-uuid-bbbb';
    const receivedByB: CardMovedEvent[] = [];

    bus.subscribe(BOARD_B, (e) => receivedByB.push(e as CardMovedEvent));

    // Act — publish to board A only
    await bus.publish(makeEvent(BOARD_A));

    // Assert — board B handler received nothing
    expect(receivedByB).toHaveLength(0);
  });

  it('unsubscribing the last handler for a board removes the Map entry (no memory leak)', async () => {
    // Arrange
    const bus = await makeEventBus();
    const BOARD_ID = 'board-uuid-3333';

    const unsub = bus.subscribe(BOARD_ID, () => {});

    // Act — remove the only subscriber
    unsub();

    // Assert — the internal map should NOT hold an empty Set for this boardId.
    // We access the private map via type assertion to inspect internal state.
    // This is intentional: we are testing an observable memory-management invariant.
    const internalMap = (bus as unknown as { _subscribers: Map<string, Set<unknown>> })._subscribers;
    expect(internalMap.has(BOARD_ID)).toBe(false);
  });
});
