# Progress

## Completed Tasks

| Task | Feature | Completed | Branch | Archive |
|------|---------|-----------|--------|---------|
| TASK-001 | FEAT-001: Express API with TypeScript Scaffold | 2026-06-13 | feature/FEAT-001-express-api-scaffold | [archive-TASK-001.md](archive/archive-TASK-001.md) |

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

## Phase Summary

### v0.1.0 Foundation (1/6 features complete)

- [x] FEAT-001: Express API with TypeScript Scaffold — Express + TypeScript backend, Docker Compose, PostgreSQL pool, node-pg-migrate, pino logging, 3-layer clean architecture
- [ ] FEAT-002: Board & Column API — Phase 1/2 complete (in progress)
- [ ] FEAT-003: Card Management API — planned
- [ ] FEAT-004: Card Move & Ordering — planned
- [ ] FEAT-005: React Frontend Scaffold — planned
- [ ] FEAT-006: User Authentication — planned
