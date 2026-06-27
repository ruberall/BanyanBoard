# TASK-016: Activity Feed User Attribution

**Complexity**: Level 3
**Status**: BUILD_COMPLETE
**Roadmap**: FEAT-013
**Roadmap Link**: FEAT-013
**Branch**: feature/FEAT-013-activity-feed-user-attribution
**Worktree**: .claude-worktrees/FEAT-013

## Task Description

Update the Activity board with user attribution for card events:

1. When the user moves a card to a different column, the Activity board should show a message like "[User] moved [card label] from column [column name] to [column name] on [date]" where [User] is the first name + last name of the user who moved the card.

2. When the user creates a card, the Activity board should show a message like "[User] created card [card label] on [date]".

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Dev Team Lead / Individual Developer — small team member who opens the board to see what teammates have been doing (daily standup flow, per productBrief.md)
**Creative Exploration Needed**: Yes — storage strategy for actor display name (see Creative Exploration Needed section)

### Invocation Method

- **Location**: `ActivityFeed` sidebar (`frontend/src/components/ActivityFeed/ActivityFeed.tsx`) — the collapsible right-side panel already present on the board screen (`/boards/:boardId`)
- **Element**: Event list items (`<li>` inside `role="log"` `<ul>`) rendered automatically when cards are moved or created — no user action required beyond being on the board page
- **Visibility**: Always visible when the `ActivityFeed` sidebar is open (open/collapsed state persisted to `localStorage` key `activityFeed.open`); items appear in real time via SSE push from `GET /boards/:boardId/events` and on reconnect history replay
- **Navigation**: User opens a board at `/boards/:boardId`; the `ActivityFeed` component receives events from `useActivityFeed(boardId)` hook (`frontend/src/hooks/useActivityFeed.ts`) and renders them automatically
- **Confidence**: HIGH — `ActivityFeed.tsx` and `useActivityFeed.ts` are confirmed, board routing is confirmed, SSE pipeline is confirmed

### Success Criteria

- **User sees (card move)**: `"Rebecca Uberall moved 'Fix login bug' from In Progress to Done · 2m ago"` — the entryActor div currently reads `{event.actorEmail ?? 'Someone'} moved '{event.cardTitle}'`; this changes to `{actorDisplayName} moved '{event.cardTitle}'` where `actorDisplayName` is `"FirstName LastName"`, falling back to email, then `"Someone"` if both are absent
- **User sees (card create)**: `"Rebecca Uberall created card 'Fix login bug' · just now"` — a new event type (`card.created`) added to the feed; no such event type exists today in `domain-event-bus.ts` or `EventService`
- **Verifiable at**: Activity Feed panel on `/boards/:boardId`, `role="log"` list items; also verifiable by querying `card_events` table directly
- **Data persisted**: `card_events` table — `actor_id` column (currently always `null`) populated with `req.session.userId`; actor display name delivered via mechanism decided in creative phase (snapshot fields in `payload` jsonb OR JOIN on read)
- **Observable within**: Immediate (SSE push via `DomainEventBus` → `feed.ts` → `EventSource.onmessage`); history events visible on next SSE connect/reconnect

### Acceptance Criteria

#### AC-ENTRY-1: Activity feed is visible on the board screen
**Priority**: MUST
**Given** a logged-in user navigates to `/boards/:boardId`
**When** the `ActivityFeed` sidebar is open (default state or restored from `localStorage`)
**Then** the `<aside aria-label="Activity feed">` element is present in the DOM with the `role="log"` list visible

#### AC-HAPPY-1: Moving a card shows attributed message with full name
**Priority**: MUST
**Given** user "Rebecca Uberall" (session `userId` set, `first_name="Rebecca"`, `last_name="Uberall"` in `users` table) is on a board
**When** she drags a card titled "Fix login bug" from the "In Progress" column to the "Done" column (triggers `PATCH /cards/:id/move`)
**Then**:
  1. A `card.moved` event row is inserted into `card_events` with `actor_id = <Rebecca's userId>` (not null)
  2. Within 3 seconds, the ActivityFeed sidebar shows an entry whose actor line reads `"Rebecca Uberall moved 'Fix login bug'"` (not `"Someone"` or an email)
  3. The entry's meta line reads `"In Progress → Done · just now"` (column names are resolved)

#### AC-HAPPY-2: Creating a card shows attributed message with full name
**Priority**: MUST
**Given** user "Rebecca Uberall" is on a board with a column named "To Do"
**When** she creates a new card titled "Write tests" via the CreateCardForm (triggers `POST /columns/:columnId/cards`)
**Then**:
  1. A `card.created` event row is inserted into `card_events` with `actor_id = <Rebecca's userId>`
  2. Within 3 seconds, the ActivityFeed sidebar shows an entry reading `"Rebecca Uberall created card 'Write tests'"` with a timestamp
  3. The entry is visually distinct from card-move entries (or at minimum, the action verb "created card" is present)

#### AC-HAPPY-3: History replay on reconnect includes attributed messages
**Priority**: MUST
**Given** attributed `card.moved` and `card.created` events exist in `card_events`
**When** a user connects or reconnects to `GET /boards/:boardId/events` (or refreshes the board page)
**Then** the last up to 20 events are replayed with actor display names populated — not null/email placeholders

#### AC-ERROR-1: User with no first/last name falls back to email, then "Someone"
**Priority**: MUST
**Given** a card move is performed by a user whose `first_name` and `last_name` are both `null` in the `users` table (e.g., a legacy account)
**When** the event appears in the ActivityFeed
**Then** the actor line shows the user's email (not an empty string or crash); if email is also unavailable (deleted user, `actor_id` null), it shows `"Someone"`

#### AC-ERROR-2: Null actor_id events (legacy / anonymous) render gracefully
**Priority**: MUST
**Given** pre-existing `card_events` rows where `actor_id IS NULL` (events emitted before this feature)
**When** those events are included in history replay
**Then** the ActivityFeed renders them with `"Someone moved 'Card title'"` — no JavaScript error, no blank entry

#### AC-HAPPY-4: Attribution persists across page reload
**Priority**: MUST
**Given** attributed events exist in the `card_events` table
**When** the user reloads the board page (forces a new SSE connection and full history replay)
**Then** the attributed messages are still shown with the correct actor display names

### Scope Boundaries

**In scope**:
- Populating `actor_id` on `card_events` rows for card-move events (currently always `null` in `CardService.moveCard()`)
- Resolving and delivering actor display name (`first_name + " " + last_name`) for card-move events in both SSE live push and history replay
- Adding a new `card.created` event type to `DomainEventBus` (`CardCreatedEvent`), `EventService`, and `card_events` persistence — emitted from `CardService.createCard()`
- Updating `ActivityFeed.tsx` to render `"[Name] moved '[Card]'"` and `"[Name] created card '[Card]'"` message formats, replacing the current `actorEmail ?? 'Someone'` display
- Updating the frontend `CardMovedEvent` type in `frontend/src/types/index.ts` to carry actor display name fields
- Adding a new `CardCreatedEvent` frontend type in `frontend/src/types/index.ts`
- Fallback display: email → "Someone" when name fields are absent

**Out of scope**:
- Profile pictures or avatars next to actor names
- Editing or deleting activity feed entries
- Attribution for card update (`PATCH /cards/:id`), card delete, label change — only move and create are in scope
- Pagination or "load more" for activity feed (currently capped at 20 via `FEED_MAX_HISTORY`)
- Notification system or email digests for activity
- Board-member filtering (show only my activity)
- Any change to the existing SSE transport protocol or heartbeat mechanism

**Dependencies**:
- FEAT-012 (TASK-015) — `users.first_name` / `users.last_name` columns exist (confirmed complete)
- `req.session.userId` available in route handlers (confirmed — `requireAuth` middleware sets it, `types/session.d.ts` augments `SessionData`)
- `card_events.actor_id` FK column already exists in the schema (confirmed in `systemPatterns.md` DB schema table)

**NFR implications**:
- Performance: actor name resolution adds either a DB JOIN (read-time) or a `users` lookup at emit-time — must not push card-move API response past p95 200ms threshold (productBrief.md)
- Security: `actor_id` is a UUID FK; display name must come from a server-side lookup, never from client-supplied input
- Accessibility: new event message text must maintain `aria-live="polite"` on `role="log"` (already implemented in `ActivityFeed.tsx`); actor name text must be screen-reader accessible (no icon-only actor display)

### Creative Exploration Needed

**Yes** — one design decision blocks implementation planning:

**Storage strategy for actor display name** (LOW confidence — two valid approaches with different trade-offs):

- **Option A — Snapshot at emit time**: At the moment `emitCardMoved` or `emitCardCreated` is called, look up `first_name` + `last_name` from the `users` table (one `SELECT` by `actor_id`), then snapshot the resolved display name into the `payload` jsonb column alongside `cardTitle`, `fromColumnName`, etc. The `card_events` row carries `payload.actorDisplayName`. History replay reads it directly — no JOIN needed. Trade-off: if a user later changes their name, old events show the name as it was at event time (historical accuracy vs. current accuracy).

- **Option B — Store FK, JOIN at read time**: Keep `actor_id` FK only. `EventRepository.findRecentByBoard` and `findAfterById` add a `LEFT JOIN users ON card_events.actor_id = users.id` and return `first_name`, `last_name` alongside each event row. Live SSE events resolve the name at emit time (since the bus event already carries it) but history replay uses the JOIN. Trade-off: always reflects the current name; adds a JOIN to every history read query; requires changes to `EventRow` type and both repository SELECT queries.

The creative/architecture phase must decide which option to use. This choice affects:
1. The DB migration (does `payload` jsonb need a new field, or does the JOIN approach add no migration?)
2. `EventRepository` SELECT queries (both `findRecentByBoard` and `findAfterById`)
3. `EventRow` type shape returned to the SSE feed
4. The SSE frame JSON shape consumed by `useActivityFeed.ts` and `ActivityFeed.tsx`
5. Whether `CardCreatedEvent` on the bus carries `actorDisplayName` or only `actorId`

## Test Strategy

### Approach
- **Emphasis**: Balanced — unit tests for attribution logic, integration tests for event emission, E2E for rendered output
- **Target test count**: 16-22 total across all phases

### File Organization
- **Extend existing**: `backend/src/__tests__/cards.test.ts` — add attribution assertions to move/create card tests
- **Extend existing**: `frontend/src/components/ActivityFeed.test.tsx` — add rendering tests for attributed messages
- **New test files**: None expected unless attribution logic extracted to separate module

### What NOT to Test
- SSE transport layer — already tested in TASK-012
- Session auth middleware — already tested in TASK-011
- Column name resolution when column exists — covered by integration tests

### Per-Phase Test Guidance
- Phase 1 (DB + Backend): 8-10 tests — migration guard, event emission with user_id, JOIN query returns display name
- Phase 2 (Frontend): 6-8 tests — ActivityFeed renders attributed messages; fallback for missing name
- Phase 3 (E2E): 4-6 tests — move card shows attribution; create card shows attribution; persists on reload

## Implementation Plan

### Overview

Three build phases following the Architecture creative phase. The creative phase resolves the storage strategy (snapshot vs. JOIN), which gates the exact shape of the DB migration and the `EventRow` type. All other changes are mechanical and scoped to card service, event service, event repository, feed route, and ActivityFeed component.

### Component Analysis

**New components:**
- `CardCreatedEvent` — new `DomainEvent` union member in `domain-event-bus.ts`
- `emitCardCreated()` — new method on `EventService` (mirrors `emitCardMoved()`)

**Affected components:**
- `backend/src/routes/cards.ts` — pass `req.session.userId` into `CardService.moveCard()` and `CardService.createCard()`; wire `eventService` into the cards router for create events
- `backend/src/services/card.service.ts` — populate `actorId` in `moveCard()`; emit `card.created` event in `createCard()`
- `backend/src/services/event.service.ts` — add `emitCardCreated()` method
- `backend/src/repositories/event.repository.ts` — update `findRecentByBoard()` and `findAfterById()` to return actor display name (exact SQL depends on creative phase decision)
- `backend/src/events/domain-event-bus.ts` — extend `DomainEvent` union with `CardCreatedEvent`
- `frontend/src/types/index.ts` — update `CardMovedEvent` to carry actor name fields; add `CardCreatedEvent`
- `frontend/src/hooks/useActivityFeed.ts` — handle `card.created` event type alongside `card.moved`
- `frontend/src/components/ActivityFeed/ActivityFeed.tsx` — render attributed messages with fallback chain (name → email → "Someone")

**DB migration (conditional on creative phase decision):**
- Snapshot strategy: add `actor_display_name varchar(255)` to `card_events` OR populate into `payload` jsonb — no new column if payload jsonb approach
- JOIN strategy: no migration required (`actor_id` FK already exists)

### Dependencies & Risks

- **Dependency**: `users.first_name` / `users.last_name` columns (FEAT-012 ✓ complete)
- **Dependency**: `card_events.actor_id` FK column (already exists, SET NULL, currently always null)
- **Risk**: SSE live-push event format vs. history-replay `EventRow` format are already diverged — both must be updated consistently or the feed renders differently on reconnect vs. live
- **Mitigation**: History replay in `feed.ts` and live bus events share the same attribution field names; `useActivityFeed.ts` normalizes both paths

### API Requirements

- **REST API**: Yes — no new endpoints, but `PATCH /cards/:id/move` and `POST /columns/:columnId/cards` response shapes unchanged; only backend side-effects change
- **SSE event payload**: `card.moved` frame gains `actorDisplayName` (and `actorEmail` fallback); new `card.created` frame type added

### Observability

- **Applies**: No new HTTP handlers or workers — existing logging in `CardService` and `EventService` is sufficient
- **No new env vars required**

### Work Items

#### WI-016-001: Wire actor_id into card-move event
**Files**: `backend/src/routes/cards.ts`, `backend/src/services/card.service.ts`
**Change**: Pass `req.session.userId` → `CardService.moveCard()` → `EventService.emitCardMoved()` → `EventRepository.insert()`. Currently `actorId` is hardcoded `null` in the service.

#### WI-016-002: Add CardCreatedEvent + emitCardCreated
**Files**: `backend/src/events/domain-event-bus.ts`, `backend/src/services/event.service.ts`, `backend/src/services/card.service.ts`, `backend/src/routes/cards.ts`
**Change**: Define `CardCreatedEvent` (type, boardId, cardId, cardTitle, actorId, actorDisplayName?, actorEmail?, occurredAt). Wire `eventService` into `createColumnCardsRouter`. Call `emitCardCreated()` from `CardService.createCard()`.

#### WI-016-003: Actor display name in repository queries (creative-gated)
**Files**: `backend/src/repositories/event.repository.ts`, optional migration file
**Change**: Update `findRecentByBoard()` and `findAfterById()` to return actor display name via JOIN or payload field (exact approach per creative phase decision).

#### WI-016-004: Frontend type updates
**Files**: `frontend/src/types/index.ts`
**Change**: Add `actorDisplayName: string | null` and `actorEmail: string | null` to `CardMovedEvent`. Add `CardCreatedEvent` type. Update `ActivityEvent` union type consumed by `useActivityFeed.ts`.

#### WI-016-005: ActivityFeed rendering
**Files**: `frontend/src/components/ActivityFeed/ActivityFeed.tsx`, `frontend/src/hooks/useActivityFeed.ts`
**Change**: Replace `event.actorEmail ?? 'Someone'` with `event.actorDisplayName ?? event.actorEmail ?? 'Someone'`. Add rendering branch for `card.created` event type showing `"[Name] created card '[Title]'"`.

---

## Implementation Roadmap

- [x] Phase 1: Backend — actor attribution on card-move + new card-create event (WI-016-001, WI-016-002, WI-016-003) ✓

  **Status**: COMPLETED - 2026-06-27
  **Test Results**: 184/184 tests passing
  **Code Review**: APPROVED (2 iterations)
- [x] Phase 2: Frontend — type updates + ActivityFeed attributed rendering (WI-016-004, WI-016-005) ✓

  **Status**: COMPLETED - 2026-06-27
  **Test Results**: 226/226 tests passing
  **Code Review**: APPROVED (no blockers; 4 recommended fixes applied)
- [x] Phase 3: E2E — activity feed attribution tests (AC-HAPPY-1, AC-HAPPY-2, AC-HAPPY-3, AC-HAPPY-4) ✓

  **Status**: COMPLETED - 2026-06-27
  **Tests**: 4 Playwright E2E tests in `frontend/e2e/activity-feed.spec.ts`
  **Code Review**: APPROVED (3 recommendations applied: SSE sync barrier, aside visibility guard, combined text assertion)

## Creative Phases

- [x] Architecture Design → DECIDED: Option 1 — Payload Snapshot (`memory-bank/creative/TASK-016-activity-feed-attribution-architecture.md`)

---

## Execution State

**Build Status**: IDLE
**Current Phase**: BUILD → REFLECT
**Current Build**: Phase 3: E2E — attribution tests (TASK-016) — COMPLETE
**Build Started**: 2026-06-27
**Phase Number**: 3 of 3
**Is Multi-Phase**: YES
**Can Resume**: NO

### Current Build Step
**Step**: Step 11 - Git Commit (Phase 3)
**Status**: COMPLETE
**Completed**: 2026-06-27

### Completed Steps
- Step 0.5 Git Setup: COMPLETE (2026-06-27) — Worktree created at .claude-worktrees/FEAT-013, branch feature/FEAT-013-activity-feed-user-attribution
- Step 3 Test Writer: COMPLETE (2026-06-27) — 9 tests in 2 files (card.service.test.ts +4, event.service.test.ts new +5)
- Step 4 Coding Agent: COMPLETE (2026-06-27) — 7 files modified, 10 new tests green, 184 total passing
- Step 5 Create Test Batches: COMPLETE (2026-06-27) — 2 batches, 1 parallel group
- Step 6 Execute Test Batches: COMPLETE (2026-06-27) — Batch 1: 16/16 PASS, Batch 2: 6/6 PASS
- Step 7 Integration Verification: COMPLETE (2026-06-27) — Tests: 184/184 PASS, Build: PASS (tsc --noEmit clean)
- Step 8 Code Review: COMPLETE (2026-06-27) — APPROVED after 2 iterations; 3 blocking issues fixed (boardId bug, EventService wiring, DI violation)
- Step 9 Documentation Agent: COMPLETE (2026-06-27) — systemPatterns.md + productBrief.md updated; inline comment on boardId fallback in card.service.ts
- Step 10 Update Memory Bank (Phase 1): COMPLETE (2026-06-27) — Phase 1 checkbox marked, progress.md updated, tasks.md updated
- Step 7 Integration Verification (Phase 2): COMPLETE (2026-06-27) — Backend 184/184 PASS, Frontend 226/226 PASS, TypeScript clean
- Step 8 Code Review (Phase 2): COMPLETE (2026-06-27) — APPROVED; 4 recommended fixes applied (type guards, exhaustiveness, button selector, hook test)
- Step 9 Documentation Agent (Phase 2): COMPLETE (2026-06-27) — systemPatterns.md updated with SSE type-guard discrimination pattern
- Step 10 Update Memory Bank (Phase 2): COMPLETE (2026-06-27) — Phase 2 checkbox marked, progress.md + tasks.md updated
- Step 3 Test Writer (Phase 3 E2E): COMPLETE (2026-06-27) — 4 Playwright E2E tests in activity-feed.spec.ts; moveCard helper, loginAsAttributionUser added
- Step 7 TypeScript Verification (Phase 3): COMPLETE (2026-06-27) — tsc --noEmit clean on E2E files
- Step 8 Code Review (Phase 3): COMPLETE (2026-06-27) — APPROVED; 3 recommendations applied (SSE sync barrier, aside guard, combined text regex)
- Step 9 Documentation Agent (Phase 3): COMPLETE (2026-06-27) — techContext.md + systemPatterns.md updated with E2E attribution test patterns
- Step 10 Update Memory Bank (Phase 3): COMPLETE (2026-06-27) — Phase 3 checkbox marked, tasks.md + progress.md updated
- Spec Writer Agent: COMPLETE (2026-06-27) — Specification section written to TASK-016.md
- Implementation Plan: COMPLETE (2026-06-27) — written to TASK-016.md
- Architecture Creative: COMPLETE (2026-06-27) — Output: memory-bank/creative/TASK-016-activity-feed-attribution-architecture.md — Decision: Payload Snapshot
