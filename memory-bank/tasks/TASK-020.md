# TASK-020: Card Activity Feed

**Complexity**: Level 2 (inherited from FEAT-017)
**Status**: PLANNING_COMPLETE
**Roadmap**: FEAT-017
**Branch**: feature/FEAT-017-card-activity-feed
**Worktree**: N/A

## Task Description

Per-card activity view, reusing existing durable event persistence rather than a new store. Add `EventRepository.findByCardId` to query the existing `card_events`-backed table (already populated by `card.moved` and other events via `event.service.ts` — no new `activityRepository` needed). Add `GET /cards/:id/activity` returning JSON entries shaped `{ id, type, message, createdAt }`. Add an Activity section (loading / empty / error states) inside a new `CardDetailModal` component, which does not yet exist in the frontend and must be created as part of this feature. Activity entries must persist across sessions/days (already satisfied by existing DB-backed persistence — no in-memory/session-scoped cache).

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Individual Developer / Dev Team Lead (productBrief.md — "Know what to work on next; track personal tasks" / "Keep the team's work visible") — activity history helps either persona reconstruct what happened to a card without asking teammates
**Creative Exploration Needed**: No — invocation point (card title click) and modal chrome pattern are both directly inferable from existing codebase patterns (see confidence notes below). Feature was pre-classified Level 2 with an explicit note that no creative pass is required.

### Invocation Method
- **Location**: Board page (`frontend/src/pages/BoardPage`) → any `KanbanCard` rendered inside a `KanbanColumn`
- **Element**: The card title (`<h3 className={styles.title}>` in `frontend/src/components/board/KanbanCard/KanbanCard.tsx`, line 111) becomes a clickable trigger (`<button>`-semantics or `role="button"`) that opens `CardDetailModal` for that card. This is a **new** interaction — the title is currently static text with no handler.
- **Visibility**: Always visible on every card; no conditional gating
- **Navigation**: Board List → open a board → click a card's title → `CardDetailModal` opens showing an Activity section (loading → populated/empty/error)
- **Confidence**: MEDIUM — no existing "open card details" affordance exists anywhere in the codebase today (`KanbanCard` currently only exposes drag handle, label-color buttons, card-color button, and delete button — all of which use `stopPropagation`-safe dedicated `<button>` elements). Title-click is the lowest-friction, lowest-conflict choice because it doesn't collide with any of those four existing interactive elements and matches the common kanban-tool convention (Trello/Linear open card detail on title/card-body click). Flagging MEDIUM rather than HIGH only because this exact pattern has no direct precedent in this codebase to cite — but no ambiguity remains after this decision, so no creative phase is needed.

### Success Criteria
- **User sees**: `CardDetailModal` opens as a native `<dialog>` (matching `BoardSettingsModal.tsx` pattern — `showModal()` via `dialogRef`, `close` event wired to `onClose`), containing an "Activity" section that shows, in reverse-chronological order, one line per event: `message` text and a formatted `createdAt` timestamp
- **User can verify at**: Same board, same card, in the "Activity" section of `CardDetailModal` — reopening the modal (even after navigating away and back, or after a page reload) re-fetches and shows the same history
- **Data persisted**: `card_events` table (existing schema, `backend/src/repositories/event.repository.ts`) — no new table or in-memory cache. Every `card.moved` (and any other event type already written via `EventService`) for the card is durably available.
- **Observable within**: Immediate (synchronous REST GET on modal open; no polling/SSE required for this feature)

### Acceptance Criteria

#### AC-ENTRY-1: User can find the feature
**Priority**: MUST
**Given** a user is viewing a board with at least one card
**When** they click the title of a card
**Then** `CardDetailModal` opens for that card, displaying an "Activity" section

#### AC-HAPPY-1: User views a card's activity history
**Priority**: MUST
**Given** a card that has been moved between columns at least once (so `card_events` contains ≥1 row for it)
**When** the user opens `CardDetailModal` for that card
**Then**:
  1. The Activity section shows a loading state briefly
  2. `GET /cards/:id/activity` is called and returns entries shaped `{ id, type, message, createdAt }`
  3. Entries render in reverse-chronological order (newest first), each showing its `message` and a human-readable `createdAt`
  4. Closing and reopening the modal (or reloading the page and reopening) shows the identical history — proving DB persistence, not an in-memory/session cache

#### AC-EMPTY-1: User sees an empty state for a card with no activity
**Priority**: MUST
**Given** a newly created card with no recorded events yet (or only events that predate this feature and thus have no matching rows — not expected in practice, but the empty state must handle zero rows generically)
**When** the user opens `CardDetailModal` for that card
**Then** the Activity section shows an explicit empty-state message (not a blank area) — following the existing empty-state convention in `DeliveryHistoryPanel.tsx` (`"No deliveries yet..."` pattern), e.g. "No activity yet."

#### AC-ERROR-1: User recovers from a failed activity fetch
**Priority**: MUST
**Given** `GET /cards/:id/activity` fails (network error or non-2xx response)
**When** the modal's Activity section attempts to load
**Then** an `ErrorBanner` (`frontend/src/components/common/ErrorBanner/ErrorBanner.tsx`, `role="alert"`) renders inside the Activity section with the error message; the rest of the modal (if any other sections exist) remains usable; the user is not shown a silently-blank section

#### AC-HAPPY-2: Activity entries persist across sessions/days
**Priority**: MUST
**Given** a card event was recorded on a previous day/session
**When** the user (same or different session) opens `CardDetailModal` for that card today
**Then** the event still appears in the Activity list — verifying no TTL/in-memory cache was introduced and the existing `card_events` durability is preserved

### Scope Boundaries
- **In scope**:
  - `EventRepository.findByCardId(cardId: string, limit?: number): Promise<EventRow[]>` — new method in `backend/src/repositories/event.repository.ts`, following the existing `findRecentByBoard`/`findAfterById` query shape (parameterized SQL, `ORDER BY occurred_at DESC`)
  - A card-scoped read path in the service layer — either a new `EventService.getActivityForCard(cardId)` method or a thin route-level projection reusing `projectEventRow`-style logic from `backend/src/routes/feed.ts` to shape `{ id, type, message, createdAt }`. Message text must be derived from the existing `payload` jsonb fields already stored per event type (e.g., for `card.moved`: `"{actor} moved this card from {fromColumnName} to {toColumnName}"`; for `card.created`: `"{actor} created this card"`) — actor resolution reuses the same `actor_display_name` payload snapshot pattern already established (no new user lookups).
  - `GET /cards/:id/activity` route, mounted on the existing `createCardsRouter` (`backend/src/routes/cards.ts`) alongside `GET /cards/:id`, protected by the same `requireAuth` gate applied globally in `routes/index.ts`
  - New `CardDetailModal` component (`frontend/src/components/board/CardDetailModal/` — colocated with other card-related components under `board/`) using the `<dialog>` + `dialogRef` + `showModal()`/`close` pattern from `BoardSettingsModal.tsx`
  - New `useCardActivity(cardId, { enabled })` hook (`frontend/src/hooks/` or `frontend/src/api/hooks.ts`, matching the existing `useWebhookDeliveries` shape) wrapping a new `getCardActivity(cardId)` endpoint function in `frontend/src/api/endpoints.ts`, with a new `queryKeys.cardActivity.byCard(cardId)` key
  - Loading / empty / error states inside the Activity section, following `DeliveryHistoryPanel.tsx`'s conditional-render pattern and `ErrorBanner` for errors
  - Wiring the title-click handler in `KanbanCard.tsx` to open `CardDetailModal`, with card/modal open state owned by the nearest sensible container (likely `KanbanColumn` or `BoardPage`, following the FilterBar precedent of page/column-level state ownership rather than inside `KanbanCard` itself, to avoid one card's modal state colliding with sibling cards)
- **Out of scope**:
  - Any new event types beyond what `EventService` already emits (`card.moved`, `card.created`) — this feature only *reads* existing events, it does not add new event-producing actions
  - Editing card fields (title, description, due date, labels) from within `CardDetailModal` — this task adds only the Activity section; a full card-edit UI inside the modal is a separate future feature
  - Real-time/SSE updates to the Activity section while the modal is open (e.g., live-append if another user moves the card concurrently) — this is a plain REST GET on open, matching the task's explicit "simple REST GET, card-scoped" instruction
  - Pagination/cursor support on `GET /cards/:id/activity` — card-level event volume is expected to be small (single card lifecycle); a reasonable fixed `LIMIT` (e.g., 50, mirroring `FEED_MAX_HISTORY`-style constants) is sufficient for MVP. If this needs revisiting, it should follow the existing Cursor Pagination guiding principle (#13) rather than offset pagination.
  - A new `activityRepository` — explicitly excluded per task description; must reuse `EventRepository`
- **Dependencies**: Existing `card_events` table, `EventRepository`, `EventService`, `requireAuth` middleware, `CardService.getCardById` (for 404 handling — the route should 404 if the card itself doesn't exist, matching `GET /cards/:id` behavior, before/alongside returning an empty activity array)
- **NFR implications** (from productBrief.md):
  - Performance: `GET /cards/:id/activity` must meet the standing p95 < 200ms API target; a single indexed query (`card_events` is already keyed usefully by `board_id`/`occurred_at` per Domain Event Pattern docs — verify `card_id` lookup performance; add an index on `card_events(card_id, occurred_at)` if a table scan would occur, consistent with the precedent set by `cards(column_id, created_at, stale_suppressed)` in TASK-017 Phase 2)
  - Accessibility: `CardDetailModal` must follow the same `<dialog>` accessible pattern as `BoardSettingsModal` (`aria-labelledby`, close button with `aria-label`) to meet WCAG 2.1 AA per productBrief.md
  - No PII beyond what's already stored (actor display name snapshot) — no new privacy surface

### Creative Exploration Needed
Specification is concrete — proceed to implementation planning. The one MEDIUM-confidence decision (title-click as the modal trigger) is resolved above with clear rationale and does not require a dedicated UI/UX creative pass; it can be validated during `/banyan-build` and adjusted in code review if it conflicts with an established pattern this agent missed.

## Implementation Plan

### Requirements
- Reuse existing `card_events` persistence — no new `activityRepository`
- New `GET /cards/:id/activity` returns `{ id, type, message, createdAt }[]`, newest first
- New `CardDetailModal` (doesn't exist yet) with an Activity section: loading / populated / empty / error states
- Entry point: clicking a card's title opens the modal (per approved spec)
- Durability: no in-memory/session cache — reads always hit `card_events` via Postgres

### Codebase Notes (Step 4 analysis)
- `KanbanCard.tsx` already owns **local** `useState` for `pickerState` and `colorPickerOpen` (label/card color popovers) rather than lifting that state to `KanbanColumn`/`BoardPage`. The spec's suggestion to lift modal-open state up to `KanbanColumn` conflicts with this established local-state precedent — **plan follows the existing KanbanCard local-state pattern instead**: `CardDetailModal` open state (`detailOpen`) lives inside `KanbanCard`, consistent with Guiding Principle "match existing patterns."
- `BoardSettingsModal.tsx` is the canonical `<dialog>` pattern to copy: `dialogRef` + `showModal()`/`close()` with jsdom fallback (`setAttribute('open', '')`), `close` event → `onClose`, `aria-labelledby`.
- `DeliveryHistoryPanel.tsx` is the canonical loading/empty/table pattern: `isLoading` → `"Loading..."`, empty array → `<p className={styles.empty}>` message, else render list/table.
- `EventRepository` (`backend/src/repositories/event.repository.ts`) already has `findRecentByBoard`/`findAfterById` — `findByCardId` follows the identical shape (parameterized SQL, `ORDER BY occurred_at DESC`, `LIMIT`).
- `projectEventRow` in `backend/src/routes/feed.ts` is the precedent for a pure row→DTO projection living in the route file (not the service) — the new `GET /cards/:id/activity` handler follows the same precedent with its own `projectActivityRow` function, reading `message` from `payload` per `event_type`.
- `createCardsRouter` already has `GET /:id` calling `service.getCardById(req.params.id)`, which throws `NotFoundError` (404) if the card doesn't exist — the new route reuses this for the 404 case before querying activity.
- `CardService`/`createCardsRouter` already take optional `eventService` — activity read path needs the `EventRepository`, which can be constructed directly in the route factory the same way `EventRepository` is constructed in `feed.ts` (`new EventRepository(db)`), no service-layer indirection required since this is a pure read with no business rules.

### Subtasks
- [ ] Add `EventRepository.findByCardId(cardId, limit)` — mirrors `findRecentByBoard`
- [ ] Add `GET /cards/:id/activity` route in `backend/src/routes/cards.ts` (404 via `service.getCardById` first, then `eventRepo.findByCardId`, project rows to `{ id, type, message, createdAt }`)
- [ ] Add message-formatting projection (`projectActivityRow` or similarly named) handling `card.moved` and `card.created` event types from existing `payload` shape
- [ ] Add frontend `CardActivityEntry` type to `frontend/src/types/index.ts`
- [ ] Add `getCardActivity(cardId)` to `frontend/src/api/endpoints.ts`
- [ ] Add `queryKeys.cardActivity.byCard(cardId)` to `frontend/src/api/queryKeys.ts`
- [ ] Add `useCardActivity(cardId, { enabled })` to `frontend/src/api/hooks.ts` (mirrors `useWebhookDeliveries` shape, `enabled: opts?.enabled !== false && !!cardId`)
- [ ] Create `CardDetailModal` component (`frontend/src/components/board/CardDetailModal/`) — `<dialog>` pattern from `BoardSettingsModal`, Activity section following `DeliveryHistoryPanel` loading/empty/error conventions, `ErrorBanner` on fetch failure
- [ ] Wire `KanbanCard.tsx`: local `detailOpen` state, title becomes a `<button>`-semantics clickable element, renders `<CardDetailModal>` conditionally (matching existing `colorPickerOpen`/`pickerState` local-state precedent)

### Files to Modify
- `backend/src/repositories/event.repository.ts` — add `findByCardId`
- `backend/src/routes/cards.ts` — add `GET /:id/activity` route + projection function
- `backend/src/repositories/__tests__/event.repository.test.ts` — extend with `findByCardId` tests
- `backend/src/__tests__/cards.routes.integration.test.ts` (or existing cards route test file — verify exact filename during build) — extend with activity endpoint tests
- `frontend/src/types/index.ts` — add `CardActivityEntry`
- `frontend/src/api/endpoints.ts` — add `getCardActivity`
- `frontend/src/api/queryKeys.ts` — add `cardActivity` key
- `frontend/src/api/hooks.ts` — add `useCardActivity`
- `frontend/src/components/board/CardDetailModal/CardDetailModal.tsx` (new)
- `frontend/src/components/board/CardDetailModal/CardDetailModal.module.css` (new)
- `frontend/src/components/board/CardDetailModal/__tests__/CardDetailModal.test.tsx` (new)
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — title click wiring
- `frontend/src/components/board/KanbanCard/__tests__/KanbanCard.test.tsx` — extend for new interaction

### Dependencies
- No new tables/migrations — reuses existing `card_events` schema
- No new services — route calls `EventRepository` and `CardService.getCardById` directly (read-only, no business rules to encapsulate)

### Observability Requirements
- **Applies**: Yes — new HTTP handler
- **Logging**: No new log events required beyond standard request logging (pino/pino-http already covers this route via the global middleware); no PII in logs (message/actor name already governed by existing `EventService` snapshot pattern)
- **Tracing**: Covered by existing request-scoped tracing middleware; no new spans needed for a single-query read
- **Metrics**: None beyond standard HTTP metrics

### API Requirements
- **REST API**: Yes → new endpoint `GET /cards/:id/activity`, follows existing `GET /cards/:id` auth/error conventions (protected by global `requireAuth`, 404 via `NotFoundError` if card missing)
- **OpenAPI Spec**: None exists in this project; no spec to update

### Testing
- Backend: repository unit test (mock `Queryable`) for `findByCardId`; route integration test (supertest) for `GET /cards/:id/activity` — happy path, empty history, 404 for missing card
- Frontend: component test for `CardDetailModal` (loading/empty/error/populated states), hook test for `useCardActivity`, `KanbanCard` test extension for the title-click → modal-open interaction
- API integration tests required: Yes
- Observability tests required: No (no new logging/metrics behavior beyond existing middleware coverage)

## Test Strategy

### Approach
- **Emphasis**: Balanced (unit + integration) — no E2E required for Level 2; UI states are covered by component tests per `DeliveryHistoryPanel.test.tsx` precedent
- **Target test count**: ~14 across all phases (repo: 3, route: 4, hook: 2, modal component: 4, KanbanCard extension: 1)

### File Organization
- **New test files**: `frontend/src/components/board/CardDetailModal/__tests__/CardDetailModal.test.tsx` (loading/empty/error/populated)
- **Extend existing**: `backend/src/repositories/__tests__/event.repository.test.ts` (findByCardId), the existing cards route integration test file (GET /:id/activity), `frontend/src/api/__tests__/hooks.test.ts` if present (useCardActivity), `frontend/src/components/board/KanbanCard/__tests__/KanbanCard.test.tsx` (title click opens modal)

### What NOT to Test
- SSE/live-update behavior — explicitly out of scope (this is a plain REST GET, not a feed subscription)
- Pagination — explicitly out of scope for MVP (fixed LIMIT)
- Card editing inside the modal — out of scope; modal only displays Activity in this task

### Per-Phase Test Guidance
- Phase 1 (Backend): 3 tests — `findByCardId` returns rows ordered by `occurred_at DESC`, respects `limit`, empty array for card with no events
- Phase 2 (Backend route): 4 tests — 200 with mapped `{id,type,message,createdAt}` shape, empty array (not error) for card with no events, 404 for nonexistent card, message text correctly derived for both `card.moved` and `card.created` payloads
- Phase 3 (Frontend data layer): 2 tests — `useCardActivity` fetches and returns data, `enabled: false` skips the query
- Phase 4 (Frontend UI): 5 tests — `CardDetailModal` renders loading/empty/error/populated states correctly; `KanbanCard` title click opens the modal

## Implementation Roadmap

- [ ] Phase 1: Backend — `EventRepository.findByCardId`
- [ ] Phase 2: Backend — `GET /cards/:id/activity` route + message projection
- [ ] Phase 3: Frontend — types, endpoint, query key, `useCardActivity` hook
- [ ] Phase 4: Frontend — `CardDetailModal` component + `KanbanCard` wiring (entry-to-success flow complete)

## Creative Phases

(none required — Level 2, spec approved with no LOW-confidence fields)

---

## Execution State

**Build Status**: IDLE
**Current Phase**: BUILD
**Current Step**: Planning complete
**Last Completed**: Step 6 - Finalize Plan
**Can Resume**: NO

### Active Sub-Agents
(none)

### Completed Steps
(none)
