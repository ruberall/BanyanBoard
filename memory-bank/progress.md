# Progress

---

## Task Archive: TASK-016

**Task**: Activity Feed User Attribution (FEAT-013)
**Status**: ✅ ARCHIVED
**Date**: 2026-06-27
**Archive**: `memory-bank/archive/archive-TASK-016.md`

---

## 2026-06-27 - Phase 3: E2E Attribution Tests — COMPLETE (TASK-016)

### What Was Built
- `frontend/e2e/activity-feed.spec.ts` (new): 4 Playwright E2E tests covering all acceptance criteria
  - AC-HAPPY-1: `card.moved` live SSE push shows `"E2E Attribution moved 'Move card'"`
  - AC-HAPPY-2: `card.created` live SSE push shows `"E2E Attribution created card 'Attribution card'"`
  - AC-HAPPY-3: History replay on page load shows attributed `card.created` event
  - AC-HAPPY-4: Attribution survives page reload (SSE reconnect + history replay)
- `frontend/e2e/helpers/auth.ts`: Added `loginAsAttributionUser`, `ATTRIBUTION_EMAIL`, `ATTRIBUTION_DISPLAY_NAME`
- `frontend/e2e/helpers/api.ts`: Added `moveCard(request, cardId, toColumnId, afterCardId?)`

### Test Summary
- TypeScript: clean (`tsc --noEmit` passes on E2E files)
- Code Review: APPROVED — 3 recommendations applied (SSE sync barrier via `waitForRequest`, `aside` visibility guard, combined attribution text regex assertions)
- Playwright E2E: requires running stack to execute; verified TypeScript correctness only

### Strategy Notes
- Attribution user: `e2e-attribution@banyanboard.test` registered with `first_name: 'E2E', last_name: 'Attribution'` — idempotent (409 silently ignored)
- SSE live-push tests: navigate → wait for heading → `waitForRequest(/events)` → API write → assert
- SSE history tests: API write BEFORE `page.goto()` → navigate → assert from history flush

---

## 2026-06-27 - Phase 2: Frontend Attribution — COMPLETE (TASK-016)

### What Was Built
- `frontend/src/types/index.ts`: Added `actorDisplayName: string | null` to `CardMovedEvent`; added `CardCreatedEvent` interface; added `ActivityEvent = CardMovedEvent | CardCreatedEvent` union
- `ActivityFeed.tsx`: Renders both `card.moved` and `card.created` with `actorDisplayName ?? actorEmail ?? 'Someone'` fallback; exhaustiveness guard via `void (event as never)`
- `useActivityFeed.ts`: Type-guards SSE frames by `cardId` presence before casting; accumulates `ActivityEvent[]` state
- `feed.ts`: Applied `projectEventRow()` projection in both history replay paths (initial flush + catch-up)

### Test Summary
- Frontend: 226/226 passing (9 new Phase 2 tests — 5 component, 1 hook, 3 updated)
- TypeScript: clean
- Code Review: APPROVED — 4 recommended fixes applied (structural type guards, exhaustiveness check, button selector, hook test for card.created accumulation)

### Files Changed
- `frontend/src/types/index.ts`
- `frontend/src/components/ActivityFeed/ActivityFeed.tsx`
- `frontend/src/hooks/useActivityFeed.ts`
- `frontend/src/components/ActivityFeed/__tests__/ActivityFeed.test.tsx`
- `frontend/src/hooks/__tests__/useActivityFeed.test.ts`
- `backend/src/routes/feed.ts` (projectEventRow applied in history replay paths)

---

## 2026-06-27 - Phase 1: Backend Attribution — COMPLETE (TASK-016)

### What Was Built
- `CardCreatedEvent`: New `DomainEvent` union member; `actorDisplayName` added to `CardMovedEvent`
- `EventService.resolveDisplayName()`: Looks up user by `actorId`, snapshots `"First Last"` → email → null fallback chain into `payload.actor_display_name` at emit time (Payload Snapshot pattern)
- `EventService.emitCardCreated()`: New method; persists `card.created` event row with `actor_id` + `actor_display_name` in payload jsonb
- `CardService.moveCard()` / `createCard()`: Extended with optional `actorId?`; `createCard()` queries columns table for `board_id` + `name` before emitting event
- `projectEventRow()`: Exported pure projection function in `feed.ts` normalizing `EventRow` → `ActivityEvent` (reads `actor_display_name` from payload — no JOIN)
- `createColumnCardsRouter`: Now accepts and threads `EventService`; passes `req.session?.userId` as `actorId`
- `createCardsRouter`: Simplified — DI violation removed; accepts `eventService?` directly

### Test Summary
- Tests: 184/184 passing (10 new Phase 1 tests)
- Batches: 2 executed in parallel (Card Service: 16/16, Event Service: 6/6)
- Code Review: APPROVED (2 iterations — 3 blocking issues caught and fixed)

### Files Changed
- `backend/src/events/domain-event-bus.ts`
- `backend/src/repositories/event.repository.ts`
- `backend/src/services/event.service.ts`
- `backend/src/services/card.service.ts`
- `backend/src/routes/feed.ts`
- `backend/src/routes/index.ts`
- `backend/src/routes/cards.ts`

### Notes
- SSE history replay normalization (projectEventRow in history flush) deferred to Phase 2 — pre-existing `events.routes.test.ts` asserts raw EventRow snake_case; updating the projection requires updating that test at the same time
- `boardId ?? columnId` fallback in `createCard()` is safe (column always exists at card creation time in production; caught by outer try/catch)

---

## Task Archive: TASK-015

**Task**: User Profile, Messaging, and Navigation Enhancements (FEAT-012)
**Status**: ✅ ARCHIVED
**Date**: 2026-06-27
**Archive**: `memory-bank/archive/archive-TASK-015.md`

---

## Phase 2 Complete: TASK-015

**Task**: User Profile, Messaging, and Navigation Enhancements (FEAT-012)
**Status**: ✅ Phase 2/3 COMPLETE
**Date**: 2026-06-27
**Phase**: Frontend — Register Form Fields + Back Button
**Tests**: 226/226 frontend + 174/174 backend passing
**Code Review**: APPROVED — 0 blocking issues (fixed: merged test file, omit empty name strings)
**Key Changes**:
- Extended `User` type with `first_name: string | null`, `last_name: string | null`
- RegisterPage: "First name" + "Last name" optional inputs; omitted from payload when blank (backend stores NULL)
- BoardPage: Back button via `useNavigate` — navigates to `/`
- `register()` endpoint: accepts optional `first_name?` and `last_name?`

---

## Phase 1 Complete: TASK-015

**Task**: User Profile, Messaging, and Navigation Enhancements (FEAT-012)
**Status**: ✅ Phase 1/3 COMPLETE
**Date**: 2026-06-27
**Phase**: DB Migrations + Backend Plumbing
**Tests**: 174/174 passing (includes 7 new Phase 1 tests)
**TypeScript**: Clean (0 errors)
**Code Review**: APPROVED — 0 blocking issues (1 recommended: PII in seed migration, address before merge)
**Key Changes**:
- Added `first_name`, `last_name` columns to `users` table
- Added `messages` table (id, message, created_at, recipient_user_id FK)
- Seeded existing user with Rebecca Uberall name
- Extended `PublicUser` type, `createUser`, `register`, and POST /register route to accept optional name fields

---

## Task Archive: TASK-013

**Task**: Card Labels
**Status**: ✅ ARCHIVED
**Date**: 2026-06-27
**Archive**: `memory-bank/archive/archive-TASK-013.md`

---

## Task Archive: TASK-014

**Task**: Card Color Picker
**Status**: ✅ ARCHIVED
**Date**: 2026-06-27
**Archive**: `memory-bank/archive/archive-TASK-014.md`

---

## TASK-013 Phase 2: Frontend Core — Card Type + LabelBadge + CardDetailPanel + useUpdateCard (2026-06-22)

**Phase**: 2 of 3 — COMPLETE
**Changes**:
- `frontend/src/types/index.ts`: `Card` interface — replaced `labels: string[]` with `label_text: string | null`, `label_color: string | null`
- `frontend/src/api/endpoints.ts`: `updateCard` Pick type updated to `label_text | label_color`
- `frontend/src/api/hooks.ts`: Added `useUpdateCard(columnId)` mutation hook
- `frontend/src/components/board/LabelBadge/LabelBadge.tsx` (NEW): colored badge; exports `LabelColor`; WCAG AA contrast (#00bcd4/#ff1493 both on black)
- `frontend/src/components/board/CardDetailPanel/CardDetailPanel.tsx` (NEW): inline expand form; label text input + radio color selector + description textarea; validates co-presence; shows `ErrorBanner` on save error
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx`: renders `LabelBadge`, truncated description with tooltip, inline `CardDetailPanel` on click-to-expand
- Fixture migrations in `client.test.ts`, `useMoveCard.test.tsx`, `KanbanColumn.test.tsx`
- Code review fixes: hotpink color changed to black text (WCAG AA ✓); `LabelColor` type consolidated to single export from `LabelBadge.tsx`
- Deferred: `useUpdateCard` wiring in `KanbanCard.handleSave` (currently closes panel without persisting — Phase 3 integration)
**Test results**: 193/193 frontend + 167/167 backend passing; TypeScript build clean

---

## TASK-013 Phase 1: Backend — DB Migration + Card Repository + API Validation (2026-06-22)

**Phase**: 1 of 3 — COMPLETE
**Changes**:
- `backend/migrations/20260622120000_alter-cards-add-label-fields.js`: Drops `labels text[]`, adds `label_text varchar(100)` + `label_color varchar(20)` (both nullable); rollback restores `labels text[]`
- `backend/src/repositories/card.repository.ts`: `Card`/`CardInput`/`CardUpdate` interfaces — replaced `labels: string[]` with `label_text: string | null`, `label_color: string | null`; all SQL updated accordingly
- `backend/src/routes/cards.ts`: Added `VALID_LABEL_COLORS` constant + `LabelColor` type (exported for Phase 2 frontend import); `validateCardInput` validates color allowlist + label_text max length (100) + co-presence rule (label_text requires label_color)
- `backend/src/routes/__tests__/cards.routes.test.ts`: Removed `labels` fixture fields + AC-ERROR-8; added 6 new label PATCH tests (`label-PATCH-1` through `label-PATCH-6`)
- `backend/src/repositories/__tests__/card.repository.test.ts`: Updated `BASE_CARD` fixture + assertions to use `label_text`/`label_color`
- `backend/src/services/__tests__/card.service.test.ts`: Updated `BASE_CARD: Card` fixture
- `memory-bank/systemPatterns.md`: Updated cards schema table to reflect new columns
- `memory-bank/projectbrief.md`: Added Security Debt section (jest/ts-jest upgrade, LOW priority, test-only)
**Test results**: 167/167 passing (14 integration skipped — require live Postgres); TypeScript build PASS

---

## Completed Tasks

| Task | Feature | Completed | Branch | Archive |
|------|---------|-----------|--------|---------|
| TASK-001 | FEAT-001: Express API with TypeScript Scaffold | 2026-06-13 | feature/FEAT-001-express-api-scaffold | [archive-TASK-001.md](archive/archive-TASK-001.md) |
| TASK-002 | FEAT-002: Board & Column API | 2026-06-15 | feature/FEAT-002-board-column-api | [archive-TASK-002.md](archive/archive-TASK-002.md) |
| TASK-003 | Input validation middleware (Level 1) | 2026-06-16 | task/003-input-validation-middleware | [archive-TASK-003.md](archive/archive-TASK-003.md) |
| TASK-004 | Request logging middleware (Level 1) | 2026-06-16 | task/004-add-request-logging-middleware | [archive-TASK-004.md](archive/archive-TASK-004.md) |
| TASK-007 | FEAT-003: Card Management API | 2026-06-16 | feature/FEAT-003-card-management-api | [archive-TASK-007.md](archive/archive-TASK-007.md) |
| TASK-008 | FEAT-004: Card Move & Ordering | 2026-06-16 | feature/FEAT-004-card-move-ordering | [archive-TASK-008.md](archive/archive-TASK-008.md) |
| TASK-009 | FEAT-005: React Frontend Scaffold | 2026-06-17 | feature/FEAT-005-react-frontend-scaffold | [archive-TASK-009.md](archive/archive-TASK-009.md) |
| TASK-011 | FEAT-006: User Authentication | 2026-06-18 | feature/FEAT-006-user-authentication | [archive-TASK-011.md](archive/archive-TASK-011.md) |
| TASK-012 | FEAT-009: Realtime Activity Feed | 2026-06-18 | feature/FEAT-009-realtime-activity-feed | [archive-TASK-012.md](archive/archive-TASK-012.md) |

## TASK-013 Phase 1: FilterBar — COMPLETE (2026-06-25)

**Task**: TASK-013 — Card Labels (FEAT-010)
**Phase**: 1 of 3 — FilterBar
**Branch**: feature/FEAT-010-card-labels

**Files Created**:
- `frontend/src/components/board/FilterBar/FilterBar.tsx` — controlled text input + × clear; React derived-state pattern for parent-reset sync
- `frontend/src/components/board/FilterBar/FilterBar.module.css`

**Files Modified**:
- `frontend/src/components/board/KanbanColumn/KanbanColumn.tsx` — `filterText?` prop + client-side substring filter on title/description
- `frontend/src/components/board/KanbanBoard/KanbanBoard.tsx` — threads `filterText` to KanbanColumn
- `frontend/src/pages/BoardPage/BoardPage.tsx` — `filterText` useState lifted here; FilterBar in heading row
- `frontend/src/pages/BoardPage/BoardPage.module.css` — `.headingRow` flex layout, `.heading` ellipsis

**Test Results**: 188/188 passing (19 files), TypeScript clean, ESLint clean (Phase 1 files)
**Code Review**: APPROVED — 2 recommended fixes applied (lowerFilter hoisting; removed redundant onClear)
**Security**: PASS — no new dependencies; filter text used client-side only (no XSS surface)
**Key Pattern**: FilterBar uses two-useState derived-state (React docs recommended pattern for locally-editable + parent-resetable controlled inputs)

---

## TASK-013 Creative Phase Complete (2026-06-25)

**Task**: TASK-013 — Card Labels (FEAT-010)
**Status**: CREATIVE_COMPLETE

#### Creative Phase: UI/UX Design — COMPLETE
- Completed: 2026-06-25
- Output: memory-bank/creative/TASK-013-card-labels-uiux.md
- Decisions:
  - FilterBar: inline in `BoardPage` heading row as flex sibling of `<h1>` (justify-content: space-between)
  - KanbanCard: single flex row `[handle][badge(s)][title]`, title flex:1 with ellipsis
  - Color picker: badge is a `<button>` with caret; fixed-position focus-trapped popover; boundary detection for ActivityFeed zone; optimistic TanStack Query update

---

## TASK-013 Planning Complete (2026-06-25)

**Task**: TASK-013 — Card Labels (FEAT-010)
**Status**: PLANNING_COMPLETE
**Branch**: feature/FEAT-010-card-labels
**Complexity**: Level 3

**Planned Phases**:
1. FilterBar — client-side filter by title/description; filter state lifted to BoardPage; × clear button
2. Label enhancements + color picker — badge right of drag handle; DB migration; LabelColorPicker 10-swatch grid; label_color persisted
3. E2E + polish — Playwright tests for filter and color-pick flows

**Creative Phase Required**: UI/UX Design (3 open design questions: FilterBar placement, card flex layout, color picker trigger)

---

## TASK-011 Phase 4: E2E & Hardening (2026-06-18)

**Phase**: 4 of 4 — BUILD_COMPLETE
**Changes**:
- `frontend/e2e/auth.spec.ts`: 11 Playwright E2E tests (unauthenticated redirect, login, register, logout, a11y)
- `frontend/e2e/helpers/auth.ts`: auth helper using `page.request` to share session cookie
- `frontend/e2e/helpers/api.ts`: refactored to `APIRequestContext` for auth-aware board CRUD
- Existing E2E specs updated with `beforeEach` authentication
- `frontend/vitest.config.ts`: excluded `e2e/**` from vitest (Playwright specs were polluting unit test runs)
- Security checklist verified: bcrypt 12 rounds, HttpOnly cookie, no password_hash in any response, no email in logs
- `memory-bank/techContext.md`: updated to reflect auth components, AuthContext, PrivateRoute, E2E structure
**Test results**: 147 backend + 160 frontend unit tests passing; Playwright E2E requires running stack
**Security**: All 4 checklist items PASS

## TASK-011 Phase 3: Integration & Docker Compose Wiring (2026-06-18)

**Phase**: 3 of 4
**Status**: COMPLETE
**Changes**:
- `docker-compose.yml`: Added `SESSION_SECRET` env var to `api` service
- `backend/src/app.ts`: Wired `connect-pg-simple` as PostgreSQL session store (`createTableIfMissing: true`); MemoryStore fallback for `NODE_ENV === 'test'`
- `backend/src/routes/auth.ts`: Added `req.session.regenerate()` on register and login (session fixation hardening); auto-login on register
- `backend/src/__tests__/auth.integration.test.ts`: 6 real-DB smoke tests (describeIfDb pattern): register → auto-login → boards → logout → re-login → /me
- Frontend test lint fixes: replaced `require()` with ES imports in `LoginPage.test.tsx` and `RegisterPage.test.tsx`
**Test results**: 147 backend + 160 frontend unit tests passing; 14 backend + real-DB skipped (no DATABASE_URL in CI)
**Security**: Session fixation patched via `req.session.regenerate()` on privilege escalation

## Task Archive: TASK-009

**Task**: React Frontend Scaffold
**Status**: ✅ ARCHIVED
**Date**: 2026-06-17
**Archive**: `memory-bank/archive/archive-TASK-009.md`

---

## 2026-06-17 — TASK-009: React Frontend Scaffold — BUILD_COMPLETE (All 5 Phases)

### Phase 5: Docker Compose & Production Build

**Files Created/Modified:**
- `frontend/Dockerfile` — multi-stage: `node:20-alpine` (npm ci + vite build) → `nginx:alpine` (serves `dist/`)
- `frontend/nginx.conf` — SPA fallback (`try_files $uri $uri/ /index.html`), 1y cache for fingerprinted assets, no-cache for `index.html`
- `docker-compose.yml` — added `frontend` service: `node:20-alpine` running `npm run dev -- --host`, port `5173:5173`, volume mount `./frontend:/app` + named `frontend_node_modules` volume (prevents Windows/Mac node_modules shadowing), `VITE_API_URL=http://localhost:3000`, `depends_on: api`

**Verification:** 115/115 tests PASS · `npm run build` PASS (326 kB JS / 2.8 kB CSS) · lint PASS

---

## 2026-06-17 — TASK-009: React Frontend Scaffold — Phase 4/5 COMPLETE

### Phase 4: Drag-and-Drop

**Files Modified:**
- `frontend/src/api/hooks.ts` — added `useMoveCard(setBannerError)` hook: optimistic both-column cache rewrite in `onMutate`, snapshot restore + `ErrorBanner` in `onError`, both-column invalidation in `onSettled`; `findCardColumn` helper scans cache to locate card's column
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — upgraded with `useSortable({ id: card.id })`, accessible drag handle button (`aria-label="Reorder card: {title}"`, `aria-roledescription="draggable"`), `overlay` prop dims opacity during drag
- `frontend/src/components/board/KanbanColumn/KanbanColumn.tsx` — added `useDroppable({ id: column.id })` for empty-column drop target + `SortableContext` wrapping card list
- `frontend/src/pages/BoardPage/BoardPage.tsx` — wired `DndContext` (PointerSensor + KeyboardSensor), `DragOverlay` floating clone, `onDragEnd` with `after_card_id` derivation, `bannerError` state + `ErrorBanner`

**Verification:** 115/115 tests PASS · build PASS · lint PASS (fixed unused `ALL_COLUMN_IDS` in test)

**Code review:** 0 blocking issues — all Creative 3 decisions correctly implemented (after_card_id derivation, cache atomicity, no-op guard, accessibility)

**Key Patterns:**
- `after_card_id` = id of card immediately above resting slot with dragged card excluded; `undefined` = top insertion — matches backend fractional-position algorithm exactly
- No-op guard: same-column same-position drops skip the mutation entirely (compares current neighbour-above vs new)

---

## 2026-06-17 — TASK-009: React Frontend Scaffold — Phase 3/5 COMPLETE

### Phase 3: Board View & Kanban Layout

**Files Created:**
- `frontend/src/components/board/KanbanCard/` — display-only card: title, labels, due-date chip, description (article element)
- `frontend/src/components/board/KanbanColumn/` — self-fetches cards via `useCards(column.id)`; loading/error/empty states; renders CreateCardForm
- `frontend/src/components/board/CreateCardForm/` — inline form with accessible label, validation, pending state, clears on success
- `frontend/src/components/board/KanbanBoard/` — receives sorted columns prop, renders KanbanColumns in order
- `frontend/src/pages/BoardPage/` — reads boardId from useParams, fetches board, sorts columns, delegates to KanbanBoard (AC-5, AC-9)
- `frontend/src/pages/NotFoundPage/` — "Not Found" heading + Link to `/` (AC-11)

**Files Updated:**
- `frontend/src/App.tsx` — added `/boards/:boardId` → BoardPage and `*` → NotFoundPage routes

**Verification:** 94/94 tests PASS · build PASS · lint PASS

**Code review fixes applied:**
1. `CreateCardForm`: input lacked accessible `<label>` — fixed with visually-hidden label + id linkage; mutation errors surfaced to UI

**Key Patterns:**
- Column-level self-fetch: each KanbanColumn calls `useCards(column.id)` for parallel React Query fetches and isolated loading states
- Route params via `useParams<{ boardId: string }>()` with `?? ''` fallback for the `enabled` guard in `useBoard`

---

## 2026-06-17 — TASK-009: React Frontend Scaffold — Phase 2/5 COMPLETE

### Phase 2: Board List Page

**Files Created:**
- `frontend/src/api/hooks.ts` — TanStack Query v5 hooks: useBoards, useBoard, useCards, useCreateBoard, useDeleteBoard, useCreateCard
- `frontend/src/components/common/ErrorBanner/` — dismissable alert banner (role="alert", controlled + uncontrolled dismiss)
- `frontend/src/components/common/LoadingSpinner/` — accessible spinner (role="status", visually-hidden label)
- `frontend/src/pages/BoardListPage/` — board list page: loading/error/empty states, board links (AC-2/3), create form (AC-4/9/10)
- `frontend/src/lib/logger.ts` — always-emit console wrapper (warn/error); ESLint disable intentional

**Files Updated:**
- `frontend/src/main.tsx` — QueryClientProvider + BrowserRouter wiring; QueryClient with staleTime:30s, refetchOnWindowFocus:false
- `frontend/src/App.tsx` — React Router v6 routes: / → BoardListPage, * → 404 stub

**Verification:** 53/53 tests PASS · build PASS (270KB, 85KB gzip) · lint PASS

**Code review fixes applied:**
1. `error instanceof Error` guard in BoardListPage (not unsafe cast)
2. `logger.ts` always emits (never silences production errors)
3. `MutationMock` interface replaces removed `buildMutationMock` helper
4. Template literal for board URLs

---

## 2026-06-16 — TASK-009: React Frontend Scaffold — Phase 1/5 COMPLETE

### Phase 1: Project Scaffold & API Client

**Files Created:**
- `frontend/package.json` — Vite 8, React 19, TanStack Query v5, Vitest 3, TypeScript 6
- `frontend/vite.config.ts` — build config with `@/` path alias
- `frontend/vitest.config.ts` — test config (split to avoid Vite 8 / Vitest 3 type conflict)
- `frontend/tsconfig.app.json` — strict mode, path aliases, erasable syntax
- `frontend/eslint.config.js` — ESLint v10 flat config, no-console rule
- `frontend/src/test-setup.ts` — jest-dom setup
- `frontend/src/types/index.ts` — Board, Column, Card, BoardWithColumns, PaginatedResponse, ApiError
- `frontend/src/api/client.ts` — `request<T>()` transport (per-call env read for vi.stubEnv compat)
- `frontend/src/api/endpoints.ts` — 10 typed endpoint functions
- `frontend/src/api/queryKeys.ts` — hierarchical key factory (boards + cards with `all` anchors)
- `frontend/src/api/__tests__/client.test.ts` — 19 tests covering transport + VITE_API_URL + all 10 endpoints

**Verification:** 19/19 tests PASS · build PASS (190KB bundle, 60KB gzip) · lint PASS

**Key Design Decisions:**
- `ApiError` lives in `src/types/index.ts`, NOT re-exported from `client.ts` — type layer independent of transport
- `VITE_API_URL` read per-call inside `request<T>()` for `vi.stubEnv()` test compatibility
- Config file split: `vite.config.ts` (build only) + `vitest.config.ts` (uses `mergeConfig` from `vitest/config`) — avoids Vite 8 / Vitest 3 Plugin type conflict

---

## 2026-06-16 — TASK-004: Request Logging Middleware — BUILD_COMPLETE

### What Was Built
- `backend/src/middleware/requestLogger.ts`: `createRequestLogger(logger?: Logger)` — wraps pino-http; optional logger param for testability; used by app.ts
- `backend/src/logger.ts`: removed `createHttpLogger` and `pino-http` import (concern separation)
- `backend/src/app.ts`: now imports from `./middleware/requestLogger`; mounts `createRequestLogger()` using module-level pino singleton

### Test Summary
- Tests: 41/41 passing (7 skipped — integration, expected); 5 new tests in requestLogger.test.ts
- tsc: clean

### Files Changed
- `backend/src/middleware/requestLogger.ts` (new)
- `backend/src/middleware/__tests__/requestLogger.test.ts` (new)
- `backend/src/logger.ts` (removed createHttpLogger + pino-http import)
- `backend/src/app.ts` (updated import, removed unused _logger destructure)

### Notes
- Root cause of mid-build regression: pino-http validates its logger arg as a real pino instance; passing a jest stub logger crashed. Fixed by calling createRequestLogger() with no args in app.ts — uses the module-level singleton which is always a real pino instance.

---

## 2026-06-15 — TASK-002 Phase 1: Database schema, migration, and repository layer — COMPLETE

### What Was Built
- `backend/migrations/1749916800000_create-boards-and-columns.js`: boards (uuid PK, name, created_at) and columns (uuid PK, board_id FK cascade, name, position, created_at) tables
- `backend/src/repositories/board.repository.ts`: BoardRepository — createBoard (auto-seeds 3 columns via Promise.all), findAllBoards, findBoardById (throws NotFoundError), deleteBoard (throws NotFoundError)

### Test Summary
- Tests: 14/14 passing (7 skipped — integration tests guarded by describeIfDb, expected)
- Batches: 1 executed (batch-1-board-repository)
- Code Review: APPROVED WITH NOTES — all in-sprint fixes applied (UUID PKs, Promise.all inserts, generic error messages)

### Files Changed
- `backend/migrations/1749916800000_create-boards-and-columns.js` (new)
- `backend/src/repositories/board.repository.ts` (new)
- `backend/src/repositories/__tests__/board.repository.test.ts` (new)
- `memory-bank/systemPatterns.md` (updated — co-located test convention, domain type placement)
- `memory-bank/techContext.md` (updated — migration naming convention, UUID usage, component structure)

### Notes
- UUID PKs chosen over serial — prevents row count leakage and enumeration
- Two-query approach in findBoardById (no JOIN) — handles zero-column boards cleanly
- Integration tests will activate once DATABASE_URL is available in Phase 2

---

## 2026-06-15 — TASK-002 Phase 2: Service layer and Express routes — COMPLETE

### What Was Built
- `backend/src/services/board.service.ts`: BoardService — createBoard (trim+validate+log), getAllBoards, getBoardById, deleteBoard; delegates to BoardRepository
- `backend/src/routes/boards.ts`: Express router — GET /boards, GET /boards/:id, POST /boards, DELETE /boards/:id; uses asyncHandler, errors propagate to errorHandler
- `backend/src/routes/index.ts`: boards router mounted at `/boards`

### Test Summary
- Tests: 26/26 passing (7 skipped — integration, expected)
- Batches: 2 parallel (board-service + board-routes), both green on first run
- Code Review: APPROVED WITH NOTES — route try/catch removed, name trim+length validation added, structured logging added

### Files Changed
- `backend/src/services/board.service.ts` (new)
- `backend/src/routes/boards.ts` (new)
- `backend/src/routes/index.ts` (modified)
- `backend/src/services/__tests__/board.service.test.ts` (new)
- `backend/src/routes/__tests__/boards.routes.test.ts` (new)
- `memory-bank/techContext.md` (updated — component structure, API endpoints table)
- `memory-bank/systemPatterns.md` (updated — router factory convention, test guidance)

### Notes
- OpenAPI spec deferred — no toolchain scaffolded yet; recommended before column endpoints
- Board name trimmed before DB write; 255-char limit enforced at service layer

---

## 2026-06-16 — TASK-007 Phase 1: Migration, CardRepository, and CardService — COMPLETE

### What Was Built
- `backend/migrations/1750003200000_create-cards.js`: cards table with uuid PK, column_id FK (CASCADE), title, description, due_date, labels (text[]), position (default 0), created_at, updated_at
- `backend/src/repositories/card.repository.ts`: CardRepository — createCard, findCardsByColumnId, findCardById (NotFoundError), updateCard (dynamic SET, NotFoundError), deleteCard (NotFoundError); exports Card, CardInput, CardUpdate interfaces
- `backend/src/services/card.service.ts`: CardService — thin pass-through with structured logging (card.created, card.updated, card.deleted)

### Test Summary
- Tests: 77/77 passing (8 skipped — describeIfDb integration guards, expected)
- tsc: clean
- No regressions in existing suite

### Files Changed
- `backend/migrations/1750003200000_create-cards.js` (new)
- `backend/src/repositories/card.repository.ts` (new)
- `backend/src/repositories/__tests__/card.repository.test.ts` (new)
- `backend/src/services/card.service.ts` (new)
- `backend/src/services/__tests__/card.service.test.ts` (new)

### Notes
- updateCard uses dynamic SQL field building; always appends `updated_at = now()` to every PATCH
- Service test mock pattern: `jest.Mocked<CardRepository>` cast via `as unknown as jest.Mocked<CardRepository>` (matches board.service.test.ts convention)

---

## 2026-06-16 — TASK-007 Phase 2: Route handlers, validation, and index.ts mounting — COMPLETE

### What Was Built
- `backend/src/routes/cards.ts`: Two router factories — `createColumnCardsRouter(db)` (POST/GET at `/:columnId/cards`) and `createCardsRouter(db)` (GET/PATCH/DELETE at `/:id`). Validates title required/non-empty/≤255, due_date ISO format, labels array-of-strings, and empty PATCH body.
- `backend/src/routes/index.ts`: Mounted both card routers — `/columns` and `/cards`.
- `backend/src/repositories/card.repository.ts`: Updated `createCard` to catch PostgreSQL FK violation (code `23503`) and rethrow as `NotFoundError('Column not found')`.

### Test Summary
- Tests: 95/95 passing (8 skipped — describeIfDb integration guards, expected); 18 new HTTP integration tests
- tsc: clean
- No regressions in existing suite

### Files Changed
- `backend/src/routes/cards.ts` (new)
- `backend/src/routes/__tests__/cards.routes.test.ts` (new)
- `backend/src/routes/index.ts` (modified — added two card router mounts)
- `backend/src/repositories/card.repository.ts` (modified — FK violation → NotFoundError in createCard)

### Notes
- Two router exports in one file (createColumnCardsRouter + createCardsRouter) avoids mount-prefix ambiguity while keeping card concerns co-located
- FK violation (23503) caught at repository layer — consistent with where other NotFoundErrors are thrown

---

## Phase Summary

---

## Task Archive: TASK-002

**Task**: Board & Column API
**Status**: ✅ ARCHIVED
**Date**: 2026-06-15
**Archive**: `memory-bank/archive/archive-TASK-002.md`

---

### v0.1.0 Foundation (1/6 features complete)

- [x] FEAT-001: Express API with TypeScript Scaffold — Express + TypeScript backend, Docker Compose, PostgreSQL pool, node-pg-migrate, pino logging, 3-layer clean architecture
- [x] FEAT-002: Board & Column API — BUILD_COMPLETE (both phases)
- [ ] FEAT-003: Card Management API — planned
- [ ] FEAT-004: Card Move & Ordering — planned
- [ ] FEAT-005: React Frontend Scaffold — planned
- [ ] FEAT-006: User Authentication — planned

---

## 2026-06-16 — TASK-006 Phase 1: Pagination — Repository and Service layer — COMPLETE

### What Was Built
- `PaginatedResult<T>` interface in `board.repository.ts` — reusable envelope type
- `findAllBoards(page, limit)`: parallel COUNT(*) + SELECT LIMIT/OFFSET queries
- `getAllBoards(page, limit)` in `board.service.ts`: transparent pass-through
- Phase 1 route shim in `boards.ts` (hardcoded page=1, limit=20): keeps codebase compilable; replaced in Phase 2

### Test Summary
- Tests: 53/53 passing (7 skipped — integration guards); 6 new/updated tests
- tsc: clean

### Files Changed
- `backend/src/repositories/board.repository.ts` (PaginatedResult<T> type, findAllBoards signature)
- `backend/src/services/board.service.ts` (getAllBoards signature + PaginatedResult import)
- `backend/src/routes/boards.ts` (Phase 1 shim)
- `backend/src/repositories/__tests__/board.repository.test.ts` (pagination tests, integration updated)
- `backend/src/services/__tests__/board.service.test.ts` (getAllBoards pagination tests)
- `backend/src/routes/__tests__/boards.routes.test.ts` (AC-COMPAT-1: updated for new envelope)

---

## 2026-06-16 — TASK-006 Phase 2: Pagination — Route query-param parsing and validation — COMPLETE

### What Was Built
- `parsePagination(query)` helper in `boards.ts`: validates page ≥ 1, limit 1–100, non-numeric → ValidationError
- `GET /boards` wired to real `page`/`limit` from query string; defaults page=1, limit=20
- Phase 1 route shim removed

### Test Summary
- Tests: 59/59 passing (7 skipped — integration guards); 7 new route tests
- tsc: clean

### Files Changed
- `backend/src/routes/boards.ts` (parsePagination helper, route updated, shim removed)
- `backend/src/routes/__tests__/boards.routes.test.ts` (7 new pagination tests)

### Status: BUILD_COMPLETE

---

## 2026-06-16 — TASK-005: CORS Configuration — BUILD_COMPLETE

### What Was Built
- `backend/src/middleware/cors.ts`: `corsMiddleware()` factory — reads `CORS_ORIGINS`, `CORS_METHODS`, `CORS_HEADERS` from env; safe default = deny all cross-origin when `CORS_ORIGINS` unset; wildcard `*` is explicit opt-in
- `backend/src/app.ts`: `corsMiddleware()` mounted first (before body-parser/routes); also brought in `createRequestLogger` from TASK-004 (branch cut from master pre-TASK-004-merge)
- `backend/src/middleware/requestLogger.ts`: carried forward from TASK-004

### Test Summary
- Tests: 45/45 passing (7 skipped — integration, expected); 9 new tests in cors.test.ts
- tsc: clean

### Dependency Audit
- `cors` 2.x: clean (no vulnerabilities)
- 21 pre-existing vulns in node-pg-migrate (glob CLI) and Jest/ts-jest (js-yaml DoS) — deferred to dedicated security task

### Files Changed
- `backend/src/middleware/cors.ts` (new)
- `backend/src/middleware/__tests__/cors.test.ts` (new, 9 tests)
- `backend/src/middleware/requestLogger.ts` (new — TASK-004 carry-forward)
- `backend/src/app.ts` (corsMiddleware + requestLogger)
- `backend/package.json`, `package-lock.json` (cors + @types/cors)

---

## Task Archive: TASK-005

**Task**: Add CORS configuration
**Status**: ✅ ARCHIVED
**Date**: 2026-06-16
**Archive**: `memory-bank/archive/archive-TASK-005.md`

---

## Task Archive: TASK-006

**Task**: Pagination for list endpoints
**Status**: ✅ ARCHIVED
**Date**: 2026-06-16
**Archive**: `memory-bank/archive/archive-TASK-006.md`

---

## Task Archive: TASK-008

**Task**: Card Move & Ordering
**Status**: ✅ ARCHIVED
**Date**: 2026-06-16
**Archive**: `memory-bank/archive/archive-TASK-008.md`

---

## 2026-06-17 — TASK-011: User Authentication — Phase 2 COMPLETE

### Phase 2: Frontend Auth Shell

**Files Created:**
- `frontend/src/hooks/useCurrentUser.ts` — TanStack Query hook for `GET /auth/me` (retry: false, staleTime: 0); single source of auth truth
- `frontend/src/hooks/useLogin.ts`, `useLogout.ts`, `useRegister.ts` — auth mutation hooks
- `frontend/src/components/PrivateRoute/PrivateRoute.tsx` — 4-state route guard (loading/error/unauthenticated/authenticated)
- `frontend/src/components/AppHeader/AppHeader.tsx` — persistent app shell header with Sign out button
- `frontend/src/pages/LoginPage/LoginPage.tsx` — email/password form with `?next=` redirect
- `frontend/src/pages/RegisterPage/RegisterPage.tsx` — email/password form; auto-redirects to `/` on success

**Files Modified:**
- `frontend/src/types/index.ts` — added `User { id: string; email: string }`
- `frontend/src/api/client.ts` — added `credentials: 'include'` to all fetch calls
- `frontend/src/api/endpoints.ts` — added `fetchMe`, `login`, `logout`, `register`
- `frontend/src/api/queryKeys.ts` — added `auth: { me: ['auth', 'me'] as const }`
- `frontend/src/App.tsx` — `/login` and `/register` public; existing routes wrapped in `<PrivateRoute>`
- `backend/src/middleware/cors.ts` — `credentials: true`; wildcard `*` now reflects request `Origin` for credentials compatibility

**Test Results:** 160 frontend tests passing · 147 backend tests passing · 0 failures

**Key Decisions:**
- TanStack Query `useCurrentUser` replaces AuthContext — no separate state library
- `removeQueries` on logout (not `invalidateQueries`) prevents stale-cache flash
- CORS origin-reflection pattern enables `credentials: true` without breaking dev permissiveness

---

## 2026-06-17 — TASK-011: User Authentication — Phase 1 COMPLETE

### Phase 1: Backend Auth Foundation

**Files Created:**
- `backend/migrations/20260617120001_create-users.js` — users table migration
- `backend/src/types/session.d.ts` — express-session SessionData augmentation
- `backend/src/repositories/user.repository.ts` — UserRepository (createUser, findByEmail, findById)
- `backend/src/services/auth.service.ts` — AuthService (register, login, getMe) with bcrypt cost 12
- `backend/src/middleware/requireAuth.ts` — synchronous auth gate middleware
- `backend/src/routes/auth.ts` — createAuthRouter (POST /auth/register, /auth/login, /auth/logout, GET /auth/me)
- `backend/src/repositories/__tests__/user.repository.test.ts` — 8 tests
- `backend/src/services/__tests__/auth.service.test.ts` — 9 tests
- `backend/src/middleware/__tests__/requireAuth.test.ts` — 5 tests
- `backend/src/routes/__tests__/auth.routes.test.ts` — 14 tests

**Files Modified:**
- `backend/src/config.ts` — SESSION_SECRET (optional, prod fail-fast), SESSION_COOKIE_MAX_AGE_MS, SESSION_SECURE
- `backend/src/app.ts` — express-session wired after requestContext; prod guard for missing SESSION_SECRET
- `backend/src/routes/index.ts` — auth router (public) + requireAuth gate before domain routes
- `backend/src/routes/__tests__/boards.routes.test.ts` — added beforeAll session auth pattern
- `backend/src/routes/__tests__/cards.routes.test.ts` — added beforeAll session auth pattern
- `memory-bank/techContext.md` — auth section, new packages, API endpoints, env vars
- `memory-bank/systemPatterns.md` — auth patterns section
- `memory-bank/productBrief.md` — security NFR updated

**Test Results:** 147 tests passing, 8 skipped, 0 failures
**Build:** tsc — PASS

**Key Decisions Applied:**
- Group `requireAuth` in routes/index.ts (not per-router) — single declaration protects all domain routes
- TanStack Query `useCurrentUser()` chosen for frontend (Phase 2 — not yet implemented)
- `connect-pg-simple` wired but MemoryStore used in tests; production uses PG store (Phase 3 wiring)
- Identical error for wrong password + unknown user (email enumeration prevention)
- bcrypt cost 12; password max 72 chars (bcrypt Blowfish limit)

---
