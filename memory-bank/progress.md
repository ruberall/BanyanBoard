# Progress

## Completed Tasks

| Task | Feature | Completed | Branch | Archive |
|------|---------|-----------|--------|---------|
| TASK-001 | FEAT-001: Express API with TypeScript Scaffold | 2026-06-13 | feature/FEAT-001-express-api-scaffold | [archive-TASK-001.md](archive/archive-TASK-001.md) |
| TASK-002 | FEAT-002: Board & Column API | 2026-06-15 | feature/FEAT-002-board-column-api | [archive-TASK-002.md](archive/archive-TASK-002.md) |
| TASK-003 | Input validation middleware (Level 1) | 2026-06-16 | task/003-input-validation-middleware | [archive-TASK-003.md](archive/archive-TASK-003.md) |
| TASK-004 | Request logging middleware (Level 1) | 2026-06-16 | task/004-add-request-logging-middleware | [archive-TASK-004.md](archive/archive-TASK-004.md) |
| TASK-007 | FEAT-003: Card Management API | 2026-06-16 | feature/FEAT-003-card-management-api | [archive-TASK-007.md](archive/archive-TASK-007.md) |
| TASK-008 | FEAT-004: Card Move & Ordering | 2026-06-16 | feature/FEAT-004-card-move-ordering | [archive-TASK-008.md](archive/archive-TASK-008.md) |

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
