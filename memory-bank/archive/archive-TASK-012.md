# Archive: Realtime Activity Feed

## Metadata
- **Task ID**: TASK-012
- **Feature**: FEAT-009
- **Complexity**: Level 3
- **Started**: 2026-06-18
- **Completed**: 2026-06-18
- **Branch**: feature/FEAT-009-realtime-activity-feed
- **Roadmap Link**: FEAT-009

## Summary

Delivered a complete realtime activity feed for BanyanBoard using Server-Sent Events (SSE). When a user moves a card between columns, a live entry appears in a collapsible sidebar panel on the board page within 3 seconds — no polling, no page refresh. The feed displays actor name, card title, from/to column names, and a relative timestamp. On reconnect, missed events are replayed using the standard `Last-Event-ID` mechanism.

The implementation spans the full stack across 4 planned phases: PostgreSQL persistence, SSE endpoint, React UI, and race condition hardening.

## Requirements

### Acceptance Criteria (all met)

| Criterion | Status |
|-----------|--------|
| AC-ENTRY-1: Feed visible on every board page (auth users) | ✅ |
| AC-HAPPY-1: Card move → feed entry within 3s, no refresh | ✅ |
| AC-HAPPY-2: Actor, action, card title, relative timestamp | ✅ |
| AC-HAPPY-3: Last 20 events on initial load | ✅ |
| AC-HAPPY-4: SSE — no polling | ✅ |
| AC-ERROR-1: Reconnecting indicator on connection drop | ✅ |
| AC-ERROR-2: "No activity yet" empty state | ✅ |
| AC-SCOPE-1: Card move events only in v1 | ✅ |

## Implementation

### Approach

Interface-driven in-process event bus (`DomainEventBus`) backed by `Map<boardId, Set<handler>>` fan-out. Events emitted synchronously on card move, persisted to `card_events` PostgreSQL table, and streamed to SSE clients. React frontend uses native `EventSource` API. Phase 4 hardened the subscribe-before-flush ordering race that silently drops events during the initial DB history query window.

### Key Components

1. **`DomainEventBus` / `InProcessEventBus`** (`backend/src/events/`)
   - Interface: `publish(event)` + `subscribe(boardId, handler) → unsubscribe`
   - Implementation: `Map<boardId, Set<handler>>` — O(1) board-scoped fan-out, no EventEmitter max-listener ceiling, explicit cleanup
   - Designed as an explicit message-bus-swap seam for future extraction

2. **`card_events` migration + `EventRepository`** (`backend/src/repositories/event.repository.ts`)
   - Append-only table: `id`, `board_id`, `card_id`, `actor_id` (nullable), `event_type`, `from_column_id`, `to_column_id`, `payload` (jsonb), `occurred_at`
   - `findRecentByBoard(boardId, limit)` — initial load
   - `findAfterById(boardId, afterEventId)` — Last-Event-ID replay via subquery

3. **`EventService`** (`backend/src/services/event.service.ts`)
   - Persists `CardMovedEvent` to DB then publishes to bus
   - Called from `CardService.moveCard` wrapped in try/catch (event failure does not fail card move)

4. **SSE Endpoint** (`backend/src/routes/feed.ts`)
   - `GET /boards/:boardId/events` — requires auth, scoped to board
   - Subscribe-before-flush ordering: subscribe → buffer → flush headers → replay history → drain buffer (dedup by eventId) → live stream
   - Heartbeat every `FEED_SSE_HEARTBEAT_MS` (default 15s)
   - Full cleanup on `req.on('close')`: `clearInterval` + `unsubscribe`

5. **`useActivityFeed` hook** (`frontend/src/hooks/useActivityFeed.ts`)
   - Native `EventSource`, resets `events` + `seenIds` Set on `boardId` change
   - Client-side eventId dedup via `Set<string>` (prevents duplicate entries on reconnect)
   - Surfaces `connectionStatus: 'connecting' | 'open' | 'error'`

6. **`ActivityFeed` component** (`frontend/src/components/ActivityFeed/ActivityFeed.tsx`)
   - Collapsible right sidebar (default open), `localStorage` persistence
   - `<ul role="log" aria-live="polite">` — accessible live region
   - Two-line entry: "{actor} moved '{cardTitle}'" / "from {from} → {to} · {relativeTime}"
   - Amber reconnect banner (`role="status"`) on connection error

### Design Decisions

- **SSE over WebSocket** — correct for server-push-only; native `EventSource` handles reconnect; auth via session cookie; no client library required
- **InProcessEventBus over EventEmitter** — avoids max-listener ceiling, enables DI, explicit cleanup, message-bus-swap seam
- **Subscribe-before-flush ordering** — prevents silent event loss during DB history query window; request-scoped buffer with eventId dedup on drain
- **Collapsible sidebar with localStorage** — balances usability on narrow screens with always-visible default

References: `memory-bank/creative/TASK-012-activity-feed-architecture.md`, `memory-bank/creative/TASK-012-activity-feed-uiux.md`

## Testing

| Phase | Tests Added | Total Suite |
|-------|------------|-------------|
| Phase 1 | 8 (in-process-event-bus, event.repository, cards.routes) | 155/155 |
| Phase 2 | 7 SSE integration tests (native http.get) | 162/162 |
| Phase 3 | 14 (ActivityFeed component x8, useActivityFeed hook x6) + BoardPage mock | 175/175 |
| Phase 4 | 3 (SSE-RACE-1, DEDUP-1, RECONNECT-1) | 177 backend / 162 frontend |

**All tests passing: ✅** — 177 backend, 162 frontend

Notable testing pattern: SSE integration tests written with native `http.createServer` + `http.get()` against a random port — supertest 7 is incompatible with long-lived SSE connections (blocks `server.close()`, never sends `buffer(false)` requests).

## Files Changed

**Backend:**
- `backend/src/events/domain-event-bus.ts` — `CardMovedEvent`, `DomainEvent`, `DomainEventBus` interface (new)
- `backend/src/events/in-process-event-bus.ts` — `InProcessEventBus` implementation (new)
- `backend/src/repositories/event.repository.ts` — `EventRepository` with `insert`, `findRecentByBoard`, `findAfterById` (new)
- `backend/src/services/event.service.ts` — `EventService.emitCardMoved` (new)
- `backend/src/services/card.service.ts` — emits event on move, wrapped in try/catch (modified)
- `backend/src/routes/feed.ts` — SSE endpoint with subscribe-before-flush + heartbeat + cleanup (new)
- `backend/src/routes/cards.ts` — proper DI for `EventService` (modified)
- `backend/src/routes/index.ts` — mounts feed router, wires EventService (modified)
- `backend/src/app.ts` — `AppDeps.bus` field (modified)
- `backend/src/config.ts` — `FEED_MAX_HISTORY`, `FEED_SSE_HEARTBEAT_MS` (modified)
- `backend/tsconfig.json` — `src/**/__tests__` added to exclude (modified)
- `backend/migrations/20260618120000_create-card-events.js` — card_events migration (new)

**Frontend:**
- `frontend/src/hooks/useActivityFeed.ts` — EventSource hook with dedup (new)
- `frontend/src/components/ActivityFeed/ActivityFeed.tsx` — collapsible sidebar component (new)
- `frontend/src/pages/BoardPage/BoardPage.tsx` — integrates ActivityFeed (modified)
- `frontend/src/types/index.ts` — `CardMovedEvent` type (modified)

**Tests:**
- `backend/src/events/__tests__/in-process-event-bus.test.ts` (new)
- `backend/src/repositories/__tests__/event.repository.test.ts` (new)
- `backend/src/routes/__tests__/events.routes.test.ts` (new)
- `frontend/src/hooks/__tests__/useActivityFeed.test.ts` (new)
- `frontend/src/components/ActivityFeed/__tests__/ActivityFeed.test.tsx` (new)
- `backend/src/routes/__tests__/cards.routes.test.ts` (extended)
- `frontend/src/pages/BoardPage/BoardPage.test.tsx` (extended — EventSource mock)

## Lessons Learned

1. **Subscribe-before-flush is mandatory for SSE + history replay** — Any SSE endpoint that replays history on connect must subscribe to the event bus before issuing the DB query, buffer incoming live events, and drain with dedup after history flush. Events emitted during the async DB window are silently dropped otherwise.

2. **SSE endpoints require native http.get for integration tests** — Supertest 7 is incompatible with long-lived streaming connections. Use `http.createServer` + `http.get()` against a random bound port.

3. **tsconfig exclude must use recursive glob** — `src/**/__tests__` not `src/__tests__` — the flat pattern misses nested test helper files and causes TS2393 duplicate declaration errors.

4. **Code review gate is high-value for cross-layer data flow** — Both Phase 1 blocking issues (empty-string UUIDs, require() DI violation) were silent errors that the review gate caught before commit.

Reference: `memory-bank/reflection/reflection-TASK-012.md`

## Technical Debt (Future Work)

- SSE route silently swallows DB errors during history flush — should send a structured `event: error` frame before entering live stream
- `InProcessEventBus.publish` is synchronous — at >100 concurrent clients per board, switch to `setImmediate(() => handler(event))`
- `card_events` table has no TTL cleanup — add a background job to expire events older than 30 days

## References

- Task Plan: `memory-bank/tasks/TASK-012.md`
- Architecture Creative: `memory-bank/creative/TASK-012-activity-feed-architecture.md`
- UI/UX Creative: `memory-bank/creative/TASK-012-activity-feed-uiux.md`
- Reflection: `memory-bank/reflection/reflection-TASK-012.md`
- Roadmap Feature: FEAT-009
