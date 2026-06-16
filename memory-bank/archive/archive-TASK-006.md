# Archive: TASK-006 - Pagination for list endpoints

## Metadata

- **Task ID**: TASK-006
- **Feature**: FEAT-007
- **Complexity**: Level 2
- **Branch**: feature/FEAT-007-pagination-list-endpoints
- **Completed**: 2026-06-16
- **Reflection**: [reflection-TASK-006.md](../reflection/reflection-TASK-006.md)

## Summary

Added LIMIT/OFFSET pagination to `GET /boards`, changing the response shape from a bare `Board[]` array to a structured envelope `{ data, total, page, limit }`. Query parameters `?page=N&limit=N` are accepted with defaults (page=1, limit=20) and strict validation (page ≥ 1, limit 1–100, non-numeric → 400).

## Implementation

### Phase 1: Repository and Service Layer

- **`PaginatedResult<T>`** generic interface added to `board.repository.ts` — reusable envelope type for future endpoints
- **`findAllBoards(page, limit)`** — issues parallel `COUNT(*) + SELECT LIMIT/OFFSET` via `Promise.all` for a single round-trip
- **`getAllBoards(page, limit)`** in `board.service.ts` — transparent pass-through
- **Route shim** in `boards.ts` — hardcoded `getAllBoards(1, 20)` to keep tsc clean between phases; replaced in Phase 2

### Phase 2: Route Query-Param Parsing and Validation

- **`parsePagination(query)`** helper in `boards.ts` — validates page ≥ 1, limit 1–100, rejects non-numeric inputs via `Number.isInteger`; throws `ValidationError` → propagates to global error handler as 400
- **`GET /boards`** wired to real query params; route shim removed
- **Breaking change (AC-COMPAT-1)**: Response shape updated from `Board[]` to `{ data, total, page, limit }` — existing route test updated at Phase 1 commit time

## Files Changed

| File | Change |
|------|--------|
| `backend/src/repositories/board.repository.ts` | Added `PaginatedResult<T>`, changed `findAllBoards` signature to accept `page, limit` |
| `backend/src/services/board.service.ts` | Updated `getAllBoards` to accept and forward `page, limit` |
| `backend/src/routes/boards.ts` | Added `parsePagination()`, wired `GET /boards` to query params |
| `backend/src/repositories/__tests__/board.repository.test.ts` | 4 new unit tests (OFFSET math, shape, empty result, parallel query) |
| `backend/src/services/__tests__/board.service.test.ts` | 2 new unit tests (page/limit forwarding, PaginatedResult shape) |
| `backend/src/routes/__tests__/boards.routes.test.ts` | Updated for new envelope (AC-COMPAT-1); 7 new tests (defaults, explicit params, 5 invalid input cases); `makeListPool()` helper |

## Test Results

- **Total Tests**: 59 passing, 7 skipped (integration guards awaiting `DATABASE_URL`)
- **tsc**: Clean
- **Code Review**: APPROVED both phases

## Acceptance Criteria

| AC | Status |
|----|--------|
| AC-HAPPY-1: Default pagination returns `{ data, total, page: 1, limit: 20 }` | ✅ |
| AC-HAPPY-2: Explicit `?page=2&limit=5` forwarded and reflected in response | ✅ |
| AC-ERROR-1: `page=0`, `limit=0`, `limit=101` → 400 VALIDATION_ERROR | ✅ |
| AC-ERROR-2: Non-numeric `page=abc`, `limit=foo` → 400 VALIDATION_ERROR | ✅ |
| AC-COMPAT-1: Response always envelope, never bare array | ✅ |

## Key Technical Decisions

1. **LIMIT/OFFSET over cursor-based** — appropriate for small dataset volumes; cursor can be added later without this task being wrong
2. **Phase 1 shim strategy** — kept codebase compilable across a breaking signature change; enabled clean per-phase commits
3. **`parsePagination` as module-level pure function** — independently testable without supertest; float inputs (`1.5`) rejected as a bonus via `Number.isInteger`

## Reusable Patterns

- **`PaginatedResult<T>`** at `backend/src/repositories/board.repository.ts` — ready for use when Column/Card endpoints add pagination
- **`parsePagination`** at `backend/src/routes/boards.ts` — extract to `src/lib/parsePagination.ts` when a second route needs it
- **`makeListPool()` test helper** — pattern for stubbing multi-query DB calls in route tests

## Notes

- Integration tests (7 skipped) activate automatically once `DATABASE_URL` is set in environment
- `PaginatedResult<T>` should be moved to `src/types.ts` when a second paginated endpoint is added
