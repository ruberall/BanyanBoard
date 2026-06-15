# Progress

## Completed Tasks

| Task | Feature | Completed | Branch | Archive |
|------|---------|-----------|--------|---------|
| TASK-001 | FEAT-001: Express API with TypeScript Scaffold | 2026-06-13 | feature/FEAT-001-express-api-scaffold | [archive-TASK-001.md](archive/archive-TASK-001.md) |
| TASK-002 | FEAT-002: Board & Column API | 2026-06-15 | feature/FEAT-002-board-column-api | [archive-TASK-002.md](archive/archive-TASK-002.md) |

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
