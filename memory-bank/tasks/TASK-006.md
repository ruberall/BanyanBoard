# TASK-006: Pagination for list endpoints

**Complexity**: Level 2 (inherited from FEAT-007)
**Status**: INITIALIZED
**Roadmap**: FEAT-007
**Branch**: feature/FEAT-007-pagination-list-endpoints
**Worktree**: N/A

## Task Description

Add `?page=1&limit=20` query parameter support to list endpoints (initially `GET /boards`). Returns a paginated envelope `{ data, total, page, limit }`. Uses LIMIT/OFFSET at the repository layer. Validates `page` ≥ 1, `limit` 1–100, with sensible defaults (page=1, limit=20).

## Specification

**Feature Type**: NFR/Infrastructure (API contract change — no UI yet; consumed by future React frontend)
**Creative Exploration Needed**: No — LIMIT/OFFSET pagination is well-understood; response envelope is conventional.

### Invocation Method
- **Location**: `GET /boards` HTTP endpoint
- **Element**: Query parameters `?page=N&limit=N` appended to the request URL
- **Visibility**: Always available; omitting params uses defaults (page=1, limit=20)
- **Navigation**: API consumer passes query params; response envelope changes shape from `Board[]` to `{ data: Board[], total: number, page: number, limit: number }`

### Success Criteria
- **Consumer sees**: JSON response `{ data: [...], total: N, page: N, limit: N }` with correct slice of boards
- **Consumer can verify at**: `GET /boards?page=1&limit=5` returns at most 5 boards; `total` reflects full count
- **Data persisted**: No mutation — read-only query with LIMIT/OFFSET
- **Observable within**: Same p95 < 200ms SLA as other CRUD endpoints (productBrief.md)

### Acceptance Criteria

**AC-HAPPY-1: Default pagination returns first page**
**Priority**: MUST

**Given** boards exist in the database
**When** `GET /boards` is called with no query params
**Then**:
- Response is `{ data: Board[], total: number, page: 1, limit: 20 }`
- `data` contains up to 20 boards ordered by `created_at ASC`
- `total` equals the full count of boards in the database

**Verification**:
- [x] Repository unit test (mock Queryable): `findAllBoards(1, 20)` calls correct SQL with LIMIT/OFFSET
- [x] Service unit test: `getAllBoards()` returns paginated shape
- [x] Route integration test (supertest): `GET /boards` returns paginated envelope

---

**AC-HAPPY-2: Explicit page/limit respected**
**Priority**: MUST

**Given** more boards exist than the requested limit
**When** `GET /boards?page=2&limit=5` is called
**Then**:
- `data` contains at most 5 boards, starting from the 6th (OFFSET 5)
- `page` is `2`, `limit` is `5`
- `total` still reflects the full count

**Verification**:
- [x] Repository unit test: OFFSET = (page-1) * limit
- [x] Route integration test: correct slice returned

---

**AC-ERROR-1: Invalid page/limit rejected**
**Priority**: MUST

**Given** a caller passes invalid pagination params
**When** `GET /boards?page=0` or `GET /boards?limit=0` or `GET /boards?limit=200`
**Then**:
- Response is `400 Bad Request` with `{ error: "VALIDATION_ERROR", message: "..." }`
- `page` must be ≥ 1; `limit` must be between 1 and 100

**Verification**:
- [x] Route unit test: invalid params produce `ValidationError`
- [x] Route integration test: 400 status + error body

---

**AC-ERROR-2: Non-numeric params rejected**
**Priority**: MUST

**Given** `GET /boards?page=abc` or `GET /boards?limit=foo`
**Then** 400 with `VALIDATION_ERROR`

**Verification**:
- [x] Route integration test: non-numeric input handled gracefully

---

**AC-COMPAT-1: Response shape is consistent**
**Priority**: MUST

**Given** the endpoint is called
**Then** response is always `{ data, total, page, limit }` — never a bare array.
This is a **breaking change** to the existing `GET /boards` response shape; document clearly.

**Verification**:
- [x] Existing route test updated to assert new envelope shape

## Test Strategy

### Approach
- **Emphasis**: Unit (repository + service) + integration (routes via supertest)
- **Target test count**: 12–15 tests total

### File Organization
- **New test files**: None
- **Extend existing**:
  - `src/repositories/__tests__/board.repository.test.ts` — add `findAllBoards` pagination tests (mock Queryable)
  - `src/services/__tests__/board.service.test.ts` — add `getAllBoards` pagination tests (mock repo)
  - `src/routes/__tests__/boards.routes.test.ts` — update `GET /boards` tests to assert new envelope shape + add error cases

### What NOT to Test
- SQL query correctness against a real DB — covered by integration tests when DATABASE_URL is available; mock is sufficient for unit
- Express query parsing internals — trust the framework
- Pagination of other endpoints (FEAT-003 cards, etc.) — out of scope for this task

### Per-Phase Test Guidance
- Phase 1 (Repository + Service): ~6 tests — LIMIT/OFFSET SQL, COUNT query, shape of PaginatedResult, service pass-through
- Phase 2 (Route + Validation): ~7 tests — default params, explicit page/limit, invalid page, invalid limit, non-numeric, existing tests updated for new envelope

## Implementation Roadmap

- [x] Phase 1: Pagination at repository and service layer
- [ ] Phase 2: Route query-param parsing, validation, and response envelope

## Creative Phases

None required.

---

## Execution State

**Build Status**: IDLE
**Current Build**: Phase 1: Repository and Service layer (TASK-006) — COMPLETE
**Build Started**: 2026-06-16
**Phase Number**: 1 of 2 COMPLETE
**Is Multi-Phase**: YES

### Current Build Step
**Step**: Step 11 - Git Commit
**Status**: COMPLETE
**Completed**: 2026-06-16

### Active Sub-Agents
(none)

### Completed Steps
- Step 0.1 Auto-provision: COMPLETE — TASK-006 created for FEAT-007
- Step 0.5 Git Setup: COMPLETE — on feature/FEAT-007-pagination-list-endpoints
- Step 1 Read Task Context: COMPLETE — Phase 1 identified (Repository + Service)
- Step 2 Load Context: COMPLETE — Level 2 rules loaded
- Step 3 Test Writer: COMPLETE — updated board.repository.test.ts (+4 tests), board.service.test.ts (+1 test), boards.routes.test.ts (AC-COMPAT-1 update)
- Step 4 Coding Agent: COMPLETE — PaginatedResult<T>, findAllBoards(page,limit), getAllBoards(page,limit), Phase 1 route shim
- Step 6 Test Batches: COMPLETE — 53/53 passing (7 skipped)
- Step 7 Integration Verify: COMPLETE — tsc clean, all tests green
- Step 8 Code Review: APPROVED
