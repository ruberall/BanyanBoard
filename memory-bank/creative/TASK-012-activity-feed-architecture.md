# Architecture Decision: Realtime Activity Feed

**Created**: 2026-06-18
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-012 / FEAT-009

---

## Context

### System Requirements

- Track card move events and store them in PostgreSQL (`card_events` table)
- Stream live events to connected browser clients without polling
- Display last 20 events on initial page load
- Show "Reconnecting..." indicator when the SSE connection drops, then auto-reconnect
- Scope v1 to card move events only; architecture must not prevent adding more event types later
- Design the in-process EventEmitter so it can be swapped for a message bus (Redis Streams, RabbitMQ, etc.) without changing consumers

### Technical Constraints

- Stack: Node.js + Express + TypeScript + PostgreSQL + React + TanStack Query
- In-process Node.js EventEmitter for v1 — no Redis, no external queue
- Single Express process (no microservices)
- Max 20 concurrent SSE connections per board at MVP scale
- SSE connections are long-lived — must not block Express's single-threaded event loop
- Must follow: 3-layer clean architecture, Dependency Injection via `Queryable`, `asyncHandler`, `AppError`, `createApp` factory
- `config.ts` is the only file that reads `process.env`; all new env vars must be added to the zod schema there
- No `console.log` in production code — pino logger only

### Non-Functional Requirements

- **Latency**: Card move → feed entry visible within 3 seconds (AC-HAPPY-1)
- **Initial load**: Last 20 events returned on GET (AC-HAPPY-3)
- **Auto-update**: No polling — pure SSE push (AC-HAPPY-4)
- **Resilience**: SSE drop → client reconnects automatically (AC-ERROR-1)
- **Performance**: CRUD p95 < 200ms (SSE endpoint excluded — it is long-lived by nature)
- **Scale**: 2–20 concurrent users per board

---

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| `card_events` table | Persistent event store | Append-only log of card move events; supports initial-load query and replay |
| `EventRepository` | DB access for events | INSERT event row; SELECT last N events for a board |
| `EventService` | Domain orchestration | Validate + persist event; invoke emitter; initial-load query |
| `DomainEventEmitter` | In-process fan-out | Receive domain events from service layer; fan-out to registered SSE handlers; abstraction boundary for future bus |
| `ActivityFeedRouter` | SSE + REST endpoints | `GET /boards/:id/feed` (SSE stream); `GET /boards/:id/feed/events` (initial history) |
| `ActivityFeed` (React) | UI component | Renders feed panel; connects EventSource; shows reconnecting state |
| `useActivityFeed` (hook) | Frontend SSE management | Opens EventSource, applies reconnect with back-off, delivers events to component |

### Component Interactions

```
CardService.moveCard()
  └── EventService.emitCardMoved()
        ├── EventRepository.insert()   [persists to card_events]
        └── DomainEventEmitter.emit()  [fans out to SSE handlers]
              └── for each client registered on boardId:
                    res.write(sseFrame)

GET /boards/:id/feed (SSE)
  └── ActivityFeedRouter
        ├── EventService.getRecentEvents(boardId, 20) → initial flush
        └── DomainEventEmitter.subscribe(boardId, handler)
              └── on close → DomainEventEmitter.unsubscribe(boardId, handler)

React ActivityFeed
  └── useActivityFeed(boardId)
        └── new EventSource('/boards/:id/feed')
              ├── onopen  → set connected
              ├── onmessage → prepend event to list
              └── onerror → set reconnecting; EventSource auto-retries via retry: field
```

---

## Options Explored

### Option 1: Global Singleton EventEmitter (no scope)

**Description**: A single module-level `EventEmitter` instance shared across all requests. Board routing done by event name convention (e.g. `board:${boardId}`). SSE handlers listen on the matching event name.

**Architecture Diagram**:
```
card_events INSERT
     |
 globalEmitter.emit(`board:${boardId}`, event)
     |
 listeners registered as: globalEmitter.on(`board:${boardId}`, handler)
     |
 each listener: res.write(sseFrame)
```

**Pros**:
- Zero setup — Node.js `EventEmitter` built-in
- Simple to implement quickly
- Event routing by name is natural for Node.js devs

**Cons**:
- `EventEmitter` has a default max-listener warning at 10 listeners per event — must call `setMaxListeners(0)` or a large number; easy to forget
- No cleanup tracking — a dropped SSE client that doesn't remove its listener causes a memory leak
- Global singleton is invisible to DI — hard to mock in unit tests without monkey-patching the module
- Event names as strings (`board:${boardId}`) are stringly typed — no compiler enforcement
- **Future bus readiness is poor**: swapping this for Redis requires finding every `globalEmitter.on/emit` call site scattered across the codebase

**Technical Fit**: Low (violates DI pattern; not mock-friendly; memory leak risk)
**Complexity**: Low
**Scalability**: Low (max-listener ceiling; memory leaks at scale)

---

### Option 2: Injected `DomainEventBus` Interface with In-Process Implementation

**Description**: Define a `DomainEventBus` interface in a shared types file. Provide an `InProcessEventBus` implementation backed by Node.js `EventEmitter`. The bus is constructed in `server.ts` and injected into `createApp` alongside pool and logger. Services receive it via constructor injection. The SSE router subscribes/unsubscribes through the interface.

This is the **message-bus-ready abstraction boundary**: swapping the implementation (e.g., `RedisStreamEventBus`) requires only a new class that satisfies the same interface — no changes to services, routes, or the React client.

**Architecture Diagram**:
```
server.ts
  const bus: DomainEventBus = new InProcessEventBus();
  createApp({ config, logger, pool, bus })

EventService(repo, bus)
  └── bus.publish({ type: 'card.moved', boardId, payload })

ActivityFeedRouter(db, bus)
  └── GET /boards/:id/feed
        ├── write initial events (history query)
        └── const unsub = bus.subscribe(boardId, handler)
              └── req.on('close', unsub)

// Future: swap InProcessEventBus for RedisStreamEventBus — nothing else changes
```

**Interface contract**:
```typescript
export interface CardMovedEvent {
  type: 'card.moved';
  eventId: string;      // matches card_events.id for deduplication / SSE Last-Event-ID
  boardId: string;
  cardId: string;
  actorId: string;
  fromColumnId: string;
  toColumnId: string;
  occurredAt: string;   // ISO-8601
}

export type DomainEvent = CardMovedEvent; // union grows as event types are added

export interface DomainEventBus {
  publish(event: DomainEvent): void;
  subscribe(boardId: string, handler: (event: DomainEvent) => void): () => void;
  // returns unsubscribe function — caller is responsible for cleanup
}
```

**InProcessEventBus internals**:
- `Map<boardId, Set<handler>>` for O(1) fan-out per board
- No Node.js `EventEmitter` max-listener ceiling (we control the data structure)
- `subscribe` returns an unsub closure — SSE route calls it in `req.on('close', unsub)`
- Zero max-listener warnings; zero memory leaks if routes clean up correctly

**Pros**:
- **Clean abstraction boundary**: `DomainEventBus` interface is the seam for future bus swap
- Fully injectable — `InProcessEventBus` can be replaced with a mock in tests
- No global state — the bus instance flows through DI like the pool and logger
- Type-safe events — `DomainEvent` union prevents stringly-typed publish/subscribe
- Explicit cleanup via returned unsub function — memory leak prevention is enforced by design
- Aligns with existing `createApp` factory pattern (add `bus` to `AppDeps`)
- Board-scoped fan-out map is more efficient than `EventEmitter` named events at scale

**Cons**:
- Slightly more boilerplate than Option 1 (interface + implementation class)
- `createApp` signature grows by one dependency (acceptable; already has 3)

**Technical Fit**: High — matches DI pattern, factory pattern, 3-layer architecture
**Complexity**: Low-Medium
**Scalability**: High for MVP scale; interface allows scaling out to Redis without architectural change

---

### Option 3: WebSocket (socket.io or raw ws)

**Description**: Replace SSE with a full-duplex WebSocket connection. Use `socket.io` or the `ws` library. Rooms map to board IDs for fan-out.

**Pros**:
- Full-duplex — could support future collaborative features (cursor positions, live typing)
- `socket.io` has built-in reconnection handling

**Cons**:
- **Overkill for v1**: activity feed is server-push only; full-duplex is unnecessary complexity
- `socket.io` adds a significant dependency; the `ws` library is lighter but requires more manual protocol handling
- Express session middleware does not automatically apply to WebSocket upgrade requests — auth integration requires extra work (pass session cookie manually or implement a separate handshake)
- productBrief.md explicitly deferred WebSockets ("No real-time updates (no WebSockets) — optimistic UI + manual refresh is sufficient for MVP"); this feature is the first controlled exception — keeping the scope minimal is appropriate
- SSE is native browser API with no library needed on the client

**Technical Fit**: Low (unnecessary complexity for server-push-only; auth friction; contradicts product decision to avoid WebSockets at MVP)
**Complexity**: High
**Scalability**: High (but irrelevant at MVP scale)

---

### Option 4: Long-Polling

**Description**: Client polls `GET /boards/:id/feed/since?cursor=<lastEventId>` every 2–3 seconds. Server returns new events since the cursor.

**Pros**:
- No persistent connection — stateless, works behind any reverse proxy
- Simple to implement; no special server-side handling

**Cons**:
- Does not satisfy AC-HAPPY-4 ("Auto-updates via SSE — no polling")
- 2–3 second polling interval may breach the 3-second latency requirement in worst case
- Higher DB read load (20 clients × ~0.33 polls/sec = 6-7 DB queries/sec just for the feed)
- Worse UX: updates arrive in bursts rather than pushed in real time

**Technical Fit**: Low (explicitly excluded by acceptance criteria)
**Complexity**: Low
**Scalability**: Medium

---

## Evaluation Matrix

| Criteria | Option 1: Global Singleton | Option 2: Injected Bus Interface | Option 3: WebSocket | Option 4: Long-Polling |
|----------|---------------------------|----------------------------------|---------------------|------------------------|
| Scalability | Low | High | High | Medium |
| Maintainability | Low | High | Medium | Medium |
| Performance | Medium | High | High | Low |
| Security / Auth Integration | Medium | High | Low | High |
| Observability | Low | High | Medium | High |
| Implementation Cost | Low | Low-Medium | High | Low |
| Future Bus Readiness | Low | High | N/A | N/A |
| Acceptance Criteria Compliance | Medium | High | High | Low |

---

## Observability Architecture

### Logging

- **Library**: pino (already in use); `req.log` child logger in SSE route handler
- **Format**: Structured JSON with `traceId`, `spanId`, `service`, `version`
- **Key log events**:
  - `card.moved` emitted (service layer): `{ event: 'card.moved', boardId, cardId, fromColumnId, toColumnId, actorId }`
  - SSE client connected: `{ event: 'feed.client.connected', boardId, clientCount }`
  - SSE client disconnected: `{ event: 'feed.client.disconnected', boardId, clientCount }`
  - SSE publish error (write to closed stream): `{ event: 'feed.publish.error', boardId }`
- **Configuration**: `LOG_LEVEL` env var (already in config.ts)

### Distributed Tracing

- **SDK**: OpenTelemetry (configured via `OTEL_*` env vars already in config.ts)
- **SSE endpoint**: Create a root span on connection open; end span on connection close
  - Span name: `GET /boards/:id/feed` (semantic HTTP conventions)
  - Tags: `board.id`, `feed.client_count`
- **Card move path**: Trace propagates from `PATCH /cards/:id/move` through `CardService` → `EventService` → `DomainEventBus.publish`
  - SSE fan-out happens synchronously in the publish call — it shares the publish span

### Metrics

- **Standard metrics** (already emitted by pino-http):
  - `http_requests_total{method, route, status_code}`
  - `http_request_duration_seconds{method, route}`
- **Custom metrics** (add to `ActivityFeedRouter`):
  - `feed_sse_connections_active{board_id}` — gauge; increment on connect, decrement on close
  - `feed_events_published_total{board_id, event_type}` — counter; increment in `DomainEventBus.publish`
  - `feed_events_dropped_total{board_id}` — counter; increment when write fails (client already closed)

### Configuration Variables (additions to config.ts zod schema)

| Variable | Purpose | Default |
|----------|---------|---------|
| `FEED_MAX_HISTORY` | Number of events returned on initial SSE load | `20` |
| `FEED_SSE_HEARTBEAT_MS` | Interval for SSE keep-alive comment (`:heartbeat`) | `15000` |

---

## `card_events` Schema

```sql
CREATE TABLE card_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id        uuid        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  card_id         uuid        NOT NULL REFERENCES cards(id)  ON DELETE CASCADE,
  actor_id        uuid        NOT NULL REFERENCES users(id)  ON DELETE SET NULL,
  event_type      varchar(64) NOT NULL,           -- 'card.moved' for v1
  from_column_id  uuid        REFERENCES columns(id) ON DELETE SET NULL,
  to_column_id    uuid        REFERENCES columns(id) ON DELETE SET NULL,
  payload         jsonb,                          -- before/after state; extensible for future event types
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX card_events_board_id_occurred_at_idx
  ON card_events (board_id, occurred_at DESC);
```

**Design rationale**:
- Dedicated columns for `from_column_id` / `to_column_id` for card-move events — avoids JSONB extraction in queries for the common case
- `payload` JSONB for before/after state snapshot and extensibility (future event types add fields without schema migration)
- Composite index on `(board_id, occurred_at DESC)` directly serves the "last N events for board" query pattern
- `ON DELETE CASCADE` from boards ensures events are cleaned up with the board
- `event_type` varchar(64) — not an enum — so new event types require no migration

---

## SSE Wire Protocol

### Headers (server)
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no    ← disables Nginx buffering (required for SSE behind Nginx)
```

### Event frame format
```
id: <card_events.id>          ← used as SSE Last-Event-ID for reconnect replay
event: card.moved
data: {"eventId":"...","boardId":"...","cardId":"...","actorId":"...","fromColumnId":"...","toColumnId":"...","occurredAt":"...","fromColumnName":"...","toColumnName":"...","cardTitle":"...","actorEmail":"..."}
retry: 3000                   ← tells browser to retry after 3s on drop

(blank line)
```

### Keep-alive heartbeat
Every `FEED_SSE_HEARTBEAT_MS` (default 15s), the server writes:
```
: heartbeat

```
This prevents reverse proxies and load balancers from closing idle connections.

### Client reconnect flow (EventSource native behavior)
1. Browser opens `EventSource('/boards/:id/feed')`
2. On error/drop, browser waits `retry` ms then reconnects automatically, sending `Last-Event-ID` header
3. Server reads `Last-Event-ID`; if present, queries `card_events` for events `occurred_at > event.occurred_at` up to the last 20 and flushes them before entering the live stream
4. React component shows "Reconnecting..." by listening to `EventSource.CONNECTING` state in `useActivityFeed`

---

## Decision

**Chosen**: Option 2 — Injected `DomainEventBus` Interface with In-Process Implementation

### Rationale

Option 2 is the only option that satisfies all five design questions simultaneously:

1. **Transport**: SSE is the correct choice for server-push-only feeds. It is a native browser API, works over HTTP/1.1, traverses most reverse proxies with the `X-Accel-Buffering: no` header, and requires zero client-side library. The `EventSource` API handles reconnection natively via the `retry:` field.

2. **EventEmitter fan-out**: The `Map<boardId, Set<handler>>` structure in `InProcessEventBus` gives O(1) fan-out per board, zero max-listener warnings, and deterministic cleanup via the returned unsub closure. This is strictly better than a global Node.js `EventEmitter` for this use case.

3. **card_events schema**: Dedicated columns for the common card-move case, JSONB `payload` for extensibility, composite index on `(board_id, occurred_at DESC)` for the initial-load query.

4. **Reconnection strategy**: SSE `retry:` field + `Last-Event-ID` header enables native browser reconnect. Server replays missed events on reconnect by querying `card_events WHERE occurred_at > last_seen_event`. React component tracks `EventSource.readyState` to show the reconnecting indicator.

5. **Future message bus readiness**: The `DomainEventBus` interface is the explicit seam. Swapping `InProcessEventBus` for a `RedisStreamEventBus` requires:
   - Implementing the same interface against Redis Streams
   - Changing one line in `server.ts` (`new InProcessEventBus()` → `new RedisStreamEventBus(redisClient)`)
   - Zero changes to services, routes, or the React client

Option 1 (global singleton) fails the DI principle and the bus-readiness requirement. Option 3 (WebSocket) is overkill for server-push and has auth friction. Option 4 (long-polling) is explicitly excluded by the acceptance criteria.

### Trade-offs Accepted

- **More boilerplate than Option 1**: The interface + implementation class adds ~50 lines of code vs a one-liner `const emitter = new EventEmitter()`. This is the correct trade for DI compliance and future-proofing.
- **`createApp` signature grows**: `AppDeps` gains a `bus` field. This is consistent with how `pool` and `logger` are already injected — the pattern is established.
- **SSE is one-directional**: If a future feature requires client-to-server realtime messages, SSE will need to be complemented (not replaced) with fetch calls or upgraded to WebSocket at that point. This is an acceptable deferral for v1.

---

## Implementation Guidelines

### File locations

```
backend/src/
├── events/
│   ├── domain-event-bus.ts          # DomainEventBus interface + DomainEvent union types
│   ├── in-process-event-bus.ts      # InProcessEventBus class
│   └── __tests__/
│       └── in-process-event-bus.test.ts
├── repositories/
│   └── event.repository.ts          # EventRepository — INSERT + SELECT last N by board
├── services/
│   └── event.service.ts             # EventService — persist + emit card.moved
└── routes/
    └── feed.ts                      # createFeedRouter(db, bus) — SSE + history endpoints
```

Frontend:
```
frontend/src/
├── hooks/
│   └── useActivityFeed.ts           # EventSource management + reconnect state
├── components/
│   └── ActivityFeed/
│       ├── ActivityFeed.tsx
│       └── ActivityFeed.test.tsx
```

### Key interfaces

```typescript
// backend/src/events/domain-event-bus.ts

export interface CardMovedEvent {
  type: 'card.moved';
  eventId: string;
  boardId: string;
  cardId: string;
  cardTitle: string;
  actorId: string;
  actorEmail: string;
  fromColumnId: string;
  fromColumnName: string;
  toColumnId: string;
  toColumnName: string;
  occurredAt: string;  // ISO-8601
}

export type DomainEvent = CardMovedEvent;
// Extend: export type DomainEvent = CardMovedEvent | CardCreatedEvent | ...

export interface DomainEventBus {
  publish(event: DomainEvent): void;
  subscribe(boardId: string, handler: (event: DomainEvent) => void): () => void;
}
```

```typescript
// backend/src/events/in-process-event-bus.ts

export class InProcessEventBus implements DomainEventBus {
  private readonly handlers = new Map<string, Set<(event: DomainEvent) => void>>();

  publish(event: DomainEvent): void {
    const listeners = this.handlers.get(event.boardId);
    if (!listeners) return;
    for (const handler of listeners) {
      try { handler(event); }
      catch (err) { /* log — never throw from publish */ }
    }
  }

  subscribe(boardId: string, handler: (event: DomainEvent) => void): () => void {
    if (!this.handlers.has(boardId)) {
      this.handlers.set(boardId, new Set());
    }
    this.handlers.get(boardId)!.add(handler);
    return () => {
      this.handlers.get(boardId)?.delete(handler);
      if (this.handlers.get(boardId)?.size === 0) {
        this.handlers.delete(boardId);  // GC empty board sets
      }
    };
  }
}
```

### Wire into createApp

```typescript
// server.ts — add bus construction
const bus: DomainEventBus = new InProcessEventBus();

// app.ts — extend AppDeps
interface AppDeps {
  config: Config;
  logger: Logger;
  pool: Pool;
  bus: DomainEventBus;  // ADD
}

// routes/index.ts — mount feed router
router.use('/boards', createFeedRouter(db, bus));  // SSE at /boards/:id/feed
```

### SSE route skeleton

```typescript
// routes/feed.ts
export function createFeedRouter(db: Queryable, bus: DomainEventBus): Router {
  const router = Router({ mergeParams: true });

  // History endpoint
  router.get('/:boardId/feed/events', asyncHandler(async (req, res) => {
    const events = await eventService.getRecentEvents(req.params.boardId, config.FEED_MAX_HISTORY);
    res.json(events);
  }));

  // SSE stream endpoint
  router.get('/:boardId/feed', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Flush history first
    eventService.getRecentEvents(boardId, config.FEED_MAX_HISTORY)
      .then(events => events.forEach(e => writeEvent(res, e)));

    const unsub = bus.subscribe(boardId, event => writeEvent(res, event));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), config.FEED_SSE_HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  });

  return router;
}
```

### How CardService emits events

```typescript
// services/card.service.ts (existing) — add EventService injection
class CardService {
  constructor(
    private readonly cardRepo: CardRepository,
    private readonly eventService: EventService,  // ADD
  ) {}

  async moveCard(cardId: string, toColumnId: string, actorId: string): Promise<Card> {
    const card = await this.cardRepo.findById(cardId);
    const updated = await this.cardRepo.moveCard(cardId, toColumnId);
    await this.eventService.emitCardMoved({ card, toColumnId, actorId });
    return updated;
  }
}
```

### Frontend `useActivityFeed` hook

```typescript
export function useActivityFeed(boardId: string) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');

  useEffect(() => {
    const es = new EventSource(`/api/boards/${boardId}/feed`, { withCredentials: true });

    es.onopen = () => setStatus('connected');
    es.addEventListener('card.moved', (e: MessageEvent) => {
      const event = JSON.parse(e.data) as FeedEvent;
      setEvents(prev => [event, ...prev].slice(0, 50));  // keep last 50 in memory
    });
    es.onerror = () => {
      setStatus('reconnecting');
      // EventSource reconnects automatically after retry: interval
    };

    return () => es.close();
  }, [boardId]);

  return { events, status };
}
```

---

## Validation Checklist

- [x] Meets all system requirements (SSE transport; persistent store; initial load; auto-update)
- [x] Respects technical constraints (in-process for v1; no Redis; single Express app)
- [x] Addresses non-functional requirements (3s latency; no polling; auto-reconnect; p95 CRUD unaffected)
- [x] Technically feasible (all components use existing patterns and built-in Node.js capabilities)
- [x] Risks identified and acceptable (see Risk Assessment below)
- [x] Complies with all Guiding Principles in systemPatterns.md:
  - 3-layer architecture honored (route → service → repository; bus injected)
  - DI via constructor injection (bus passed through createApp like pool)
  - `asyncHandler` wraps async route handlers
  - `config.ts` is extended with new env vars (not hardcoded)
  - `AppError` used for validation errors in EventService
  - No `console.log` — pino logger throughout
- [x] Observability architecture defined (logging, tracing, metrics)
- [x] Trace context propagated: card move span → EventService span → publish (synchronous)
- [x] SSE connections cleaned up via `req.on('close')` — no memory leaks
- [x] Message-bus-ready seam explicitly designed (`DomainEventBus` interface)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Nginx/proxy buffers SSE responses, breaking the stream | Medium | High | Set `X-Accel-Buffering: no` header; document in Docker Compose nginx config |
| SSE client fails to call `close()` on React unmount, leaking the connection | Medium | Medium | `useActivityFeed` returns cleanup in `useEffect` return; enforced by ESLint react-hooks |
| `InProcessEventBus.publish` throws if a handler throws (one bad client kills all) | Low | High | Wrap each handler call in try/catch; log error; continue to next handler |
| History query + live subscription race: events emitted between history fetch and subscribe are missed | Low | Medium | Subscribe BEFORE flushing history; or flush history after subscribe so in-flight events are delivered twice and deduplicated client-side by `eventId` |
| SSE heartbeat interval leaks if `req.close` fires before interval is set | Low | Low | Assign heartbeat after `res.flushHeaders()`; unsub and clearInterval in single `close` handler |
| `card_events` table grows unbounded | Low | Medium | Add TTL-based cleanup job in a future task (not in scope for v1); table is append-only and indexed |

---

## Next Steps

1. **Migration**: Create `backend/migrations/<timestamp>_create-card-events.js` with the `card_events` schema above
2. **EventBus**: Implement `domain-event-bus.ts` (interface + types) and `in-process-event-bus.ts` (Map-based implementation with tests)
3. **Repository**: Implement `EventRepository` with `insert(event)` and `findRecentByBoard(boardId, limit)` methods
4. **Service**: Implement `EventService.emitCardMoved()` — persist then publish
5. **Wire CardService**: Add `EventService` parameter to `CardService` constructor; call `emitCardMoved` in `moveCard`
6. **Route**: Implement `createFeedRouter(db, bus)` with SSE stream and history endpoints; mount in `routes/index.ts`
7. **Extend AppDeps**: Add `bus: DomainEventBus` to `createApp` deps; construct `InProcessEventBus` in `server.ts`
8. **Frontend**: Implement `useActivityFeed` hook and `ActivityFeed` panel component
9. **Config**: Add `FEED_MAX_HISTORY` and `FEED_SSE_HEARTBEAT_MS` to `config.ts` zod schema with defaults
10. **Tests**: Unit tests for `InProcessEventBus`; integration test for SSE route using supertest + event-stream parsing; Playwright E2E for AC-HAPPY-1 and AC-ERROR-1
