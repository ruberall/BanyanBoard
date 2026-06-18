# TASK-012: Realtime Activity Feed

**Complexity**: Level 3
**Status**: COMPLETE
**Reflection**: memory-bank/reflection/reflection-TASK-012.md
**Archived**: memory-bank/archive/archive-TASK-012.md
**Completed**: 2026-06-18
**Roadmap**: FEAT-009
**Branch**: feature/FEAT-009-realtime-activity-feed (merged → main)

## Task Description

Track and display a realtime activity feed of card movements between columns. Card actions (create, move, label, assign, delete) emit domain events per the Domain Event Pattern in `systemPatterns.md`. Events carry timestamp, actor, action type, card ID, and before/after state. Transport uses SSE (Server-Sent Events) for v1 — in-process emitter, designed for future message bus extraction. A new `ActivityFeed` panel on the board page displays the live event stream.

## User Journey Definition

**Feature Type**: End-User Feature
**Creative Phase Required**: Yes — Architecture Design (SSE vs polling, event schema, feed storage), UI/UX Design (feed panel layout, board page integration)

### Invocation Method
- **Location**: Board page (`/boards/:id`)
- **Element**: Activity Feed panel — visible alongside the kanban columns (sidebar or bottom panel, TBD in creative)
- **Visibility**: Always visible on the board page (authenticated users only)
- **Navigation**: User opens any board → feed panel is present automatically

### Success Criteria
- **User sees**: A live-updating list of activity entries, e.g. "Rebecca moved 'Fix login bug' from In Progress → Done · just now"
- **User can verify at**: Board page — activity feed panel updates without page refresh when a card is moved
- **Data persisted**: `card_events` table in PostgreSQL (timestamp, actor_id, action_type, card_id, board_id, before_state, after_state as JSONB)
- **Observable within**: < 3 seconds of the triggering action

### Acceptance Criteria

- **AC-ENTRY-1**: Activity feed panel is visible on every board page for authenticated users
- **AC-HAPPY-1**: When a card is moved between columns, a new entry appears in the feed within 3 seconds without page refresh
- **AC-HAPPY-2**: Feed entries display actor name, action description, card title, and relative timestamp
- **AC-HAPPY-3**: Feed shows the last 20 events on initial load (most recent first)
- **AC-HAPPY-4**: Feed auto-updates via SSE connection — no polling, no manual refresh needed
- **AC-ERROR-1**: If SSE connection drops, the feed shows a "Reconnecting..." indicator and auto-reconnects
- **AC-ERROR-2**: If no events yet, feed shows an empty state: "No activity yet"
- **AC-SCOPE-1**: Only card move events are tracked in v1 (create/update/delete events are out of scope for v1)

### Scope Boundaries

**In scope (v1):**
- Card move events (column change via PATCH /cards/:id/move)
- SSE endpoint: `GET /boards/:id/events`
- `card_events` DB table and migration
- `ActivityFeed` React component on board page
- In-process EventEmitter (Node.js)

**Out of scope (v1):**
- Card create/update/delete events
- WebSocket transport (SSE only for v1)
- Push notifications
- Email/webhook delivery
- Event replay / export
- Multi-tab sync beyond SSE

**Dependencies:**
- TASK-011 (User Authentication) — actor identity comes from `req.session.userId`
- Domain Event Pattern (systemPatterns.md) — in-process emitter for v1

**NFR implications:**
- SSE connections are long-lived — must not block the Express thread pool
- Max 20 concurrent SSE connections per board at MVP scale (small teams)
- Event fan-out is synchronous in-process for v1 (acceptable for small teams)

## Test Strategy

### Approach
- **Emphasis**: Integration + unit balanced
- **Target test count**: 19–26 total

### File Organization
- **New test files**:
  - `backend/src/events/__tests__/card-event.service.test.ts` — unit tests for event emission and fan-out
  - `backend/src/routes/__tests__/events.routes.test.ts` — SSE endpoint integration tests
  - `frontend/src/components/ActivityFeed/__tests__/ActivityFeed.test.tsx` — component unit tests
- **Extend existing**:
  - `backend/src/routes/__tests__/cards.routes.test.ts` — verify card move emits event

### What NOT to Test
- SSE browser API internals — covered by browser/jsdom environment
- EventEmitter internals — Node.js built-in, not our code
- PostgreSQL `card_events` INSERT timing — covered by integration tests

### Per-Phase Test Guidance
- Phase 1 (Domain Events + DB): 6–8 tests — event emission on card move, `card_events` table insert, repository query
- Phase 2 (SSE Endpoint): 5–7 tests — SSE connection, event fan-out to connected clients, reconnect header
- Phase 3 (Frontend Feed): 5–7 tests — ActivityFeed renders entries, empty state, reconnect indicator
- Phase 4 (Race Condition): 3–4 tests — subscribe-before-flush ordering, duplicate eventId suppression, missed-event replay via Last-Event-ID

## Implementation Roadmap

- [x] Phase 1: Domain Events + Persistence — `card_events` migration, EventEmitter service, emit on card move, repository for querying recent events
- [x] Phase 2: SSE Endpoint — `GET /boards/:id/events` route, fan-out to SSE clients, last-20 events on connect
- [x] Phase 3: Frontend Activity Feed — `ActivityFeed` component, SSE client hook (`useActivityFeed`), integration into board page
- [x] Phase 4: Race Condition Hardening — subscribe-before-flush ordering in SSE route, client-side `eventId` deduplication in `useActivityFeed`, missed-event replay via `Last-Event-ID` on reconnect

## Creative Phases

- [x] Architecture Design — SSE transport, DomainEventBus interface + InProcessEventBus (Map-based fan-out), card_events schema, Last-Event-ID replay → memory-bank/creative/TASK-012-activity-feed-architecture.md
- [x] UI/UX Design — collapsible right sidebar (240px, default open), two-line entries, auto-scroll-with-pause, sticky reconnect indicator → memory-bank/creative/TASK-012-activity-feed-uiux.md

---

## Execution State

**Build Status**: IDLE
**Current Phase**: COMPLETE
**Can Resume**: NO
**Build Started**: 2026-06-18
**Phase Number**: 2 of 4
**Is Multi-Phase**: YES
**Can Resume**: YES

### Current Build Step
**Step**: Step 3 - Test Writer
**Status**: RUNNING
**Started**: 2026-06-18

### Completed Steps
- Step 0: TASK-012 created for FEAT-009
- Step 2: Roadmap feature link confirmed (FEAT-009)
- Step 3: Specification written
- Step 3 Test Writer: 8 tests written (in-process-event-bus x4, event.repository x3, cards.routes x1)
- Step 4 Coding Agent: Phase 1 source files implemented
- Step 6 Test Execution: All 3 batches PASS (155/155 tests)
- Step 7 Integration: TypeScript PASS, tests PASS
- Step 8 Code Review: APPROVED (2 blocking fixed — require() DI, null UUID fields)
- Step 9 Documentation: systemPatterns.md + techContext.md updated
- Step 11 Git: Committed + pushed (90ab7b1)
