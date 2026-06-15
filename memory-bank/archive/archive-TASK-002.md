# Archive: TASK-002 — Board & Column API

## Metadata

- **Task ID**: TASK-002
- **Feature**: FEAT-002
- **Complexity**: Level 2
- **Branch**: feature/FEAT-002-board-column-api
- **Completed**: 2026-06-15
- **Phases**: 2 (DB + Repo, Service + Routes)
- **Reflection**: [reflection-TASK-002.md](../reflection/reflection-TASK-002.md)

---

## Summary

Implemented full REST CRUD for boards (`GET /boards`, `GET /boards/:id`, `POST /boards`, `DELETE /boards/:id`) with automatic 3-column seeding (To Do, In Progress, Done) on board creation. Covers the complete 3-layer stack: migration → repository → service → routes.

All 7 acceptance criteria met. 26/26 unit tests passing. Integration tests guarded by `describeIfDb` (activate when `DATABASE_URL` is set).

---

## Solution

### Phase 1: DB + Repository

- Migration `1749916800000_create-boards-and-columns.js`: `boards` and `columns` tables with UUID PKs, FK cascade on delete
- `BoardRepository`: `createBoard` (3-column seed via `Promise.all`), `findAllBoards`, `findBoardById` (two-query approach), `deleteBoard`
- UUID PKs chosen over serial to prevent enumeration

### Phase 2: Service + Routes

- `BoardService`: validation (trim + 255-char max), structured logging (pino), delegates to repo
- `boards.ts` router: all four endpoints via `asyncHandler`, errors propagate to central `errorHandler` — no per-route try/catch
- Mounted at `/boards` in `routes/index.ts`

---

## Files Changed

**New files:**
- `backend/migrations/1749916800000_create-boards-and-columns.js`
- `backend/src/repositories/board.repository.ts`
- `backend/src/repositories/__tests__/board.repository.test.ts`
- `backend/src/services/board.service.ts`
- `backend/src/services/__tests__/board.service.test.ts`
- `backend/src/routes/boards.ts`
- `backend/src/routes/__tests__/boards.routes.test.ts`

**Modified files:**
- `backend/src/routes/index.ts` — mounted boards router

**Memory Bank:**
- `memory-bank/techContext.md` — component structure, API endpoints table
- `memory-bank/systemPatterns.md` — router factory convention, co-located test convention

---

## Key Technical Decisions

| Decision | Outcome |
|----------|---------|
| UUID PKs (`gen_random_uuid()`) | Prevents enumeration; TypeScript `id: string` enforces invariant |
| `Promise.all` for column seeding | Parallel inserts; no order dependency |
| Two-query `findBoardById` | Handles zero-column boards without JOIN complexity |
| `asyncHandler` pattern | All route errors propagate to central `errorHandler` |
| Validation at service layer | Trim + 255-char max travels with behaviour regardless of transport |

---

## Deferred Items

| Item | Priority | Suggested Resolution |
|------|----------|---------------------|
| `createBoard` transaction | Low | Wrap board + column inserts in explicit `BEGIN/COMMIT` |
| `POST /boards` should return `BoardWithColumns` | Medium | Return `findBoardById` result from `createBoard` |
| OpenAPI spec for `/boards` | Medium | Scaffold before FEAT-003 column endpoints |
| Board name uniqueness | Low | Decide explicitly; add `UNIQUE` constraint or document as MVP bypass |
| `DATABASE_URL` in CI | Low | Configure in CI — integration tests activate automatically |

---

## Notes

Code review caught real issues in both phases (all resolved in-sprint): serial PKs → UUID, sequential inserts → `Promise.all`, manual try/catch in routes → `asyncHandler`, no name length validation → 255-char max + trim, no service logging → pino `logger.info`.
