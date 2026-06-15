# TASK-002: Board & Column API

**Complexity**: Level 2
**Status**: INITIALIZED
**Roadmap**: FEAT-002
**Branch**: feature/FEAT-002-board-column-api
**Worktree**: N/A

## Task Description

REST endpoints for board CRUD (create, read, list, delete). Each board is created with three fixed columns seeded automatically: To Do, In Progress, Done. Includes the boards and columns DB schema (migration), repository, service, and routes. No user-configurable columns for MVP.

## User Journey Definition

**Feature Type**: NFR/Infrastructure (API — no frontend yet)
**Creative Phase Required**: No

### Invocation Method (End-User Features)
- **Location**: N/A — REST API
- **Element**: HTTP endpoints
- **Visibility**: Always available
- **Navigation**: N/A

### Success Criteria (End-User Features)
- **User sees**: JSON response body with board/column data
- **User can verify at**: HTTP response
- **Data persisted**: `boards` and `columns` tables in PostgreSQL
- **Observable within**: synchronous HTTP response

### NFR Verification (Infrastructure Features)
- **Test method**: `npm test` (Jest integration tests via `describeIfDb`)
- **Success metrics**: All CRUD endpoints return correct status codes and shapes; columns auto-seeded on board create
- **Observable at**: Test output; API responses

### Acceptance Criteria
- AC-ENTRY-1: `POST /boards` creates a board and returns 201 with board JSON
- AC-HAPPY-1: Created board has 3 auto-seeded columns: "To Do", "In Progress", "Done"
- AC-HAPPY-2: `GET /boards` returns array of all boards
- AC-HAPPY-3: `GET /boards/:id` returns single board with its columns
- AC-HAPPY-4: `DELETE /boards/:id` removes board (and cascades columns) — returns 204
- AC-ERROR-1: `POST /boards` with missing `name` returns 400 `{ error, message }`
- AC-ERROR-2: `GET /boards/:id` for unknown id returns 404 `{ error, message }`

## Test Strategy

### Approach
- **Emphasis**: integration (real Postgres via `describeIfDb`) + unit (mock Queryable)
- **Target test count**: 18–24 tests

### File Organization
- **New test files**:
  - `src/repositories/__tests__/board.repository.test.ts` — unit tests with mock Queryable
  - `src/services/__tests__/board.service.test.ts` — unit tests with mock repository
  - `src/routes/__tests__/boards.routes.test.ts` — integration tests (real DB, `describeIfDb`)
- **Extend existing**: none (new domain)

### What NOT to Test
- Column names/ordering beyond "seeded correctly" — covered by AC-HAPPY-1
- Database connection logic — covered by TASK-001 infrastructure
- Express middleware (body-parser, error handler) — covered by TASK-001

### Per-Phase Test Guidance
- Phase 1 (DB + Repo): 8–10 tests — migration runs, repo CRUD methods, column seeding
- Phase 2 (Service + Routes): 10–14 tests — service logic, HTTP endpoint contracts, error shapes

## Implementation Roadmap

- [x] Phase 1: Database schema, migration, and repository layer ✓
  - **Test Results**: 14/14 passing (7 skipped — integration, expected)
  - **Code Review**: APPROVED WITH NOTES (all in-sprint fixes applied)
- [ ] Phase 2: Service layer and Express routes

## Creative Phases

N/A (Level 2, clear requirements)

---

## Execution State

**Build Status**: RUNNING
**Current Build**: Phase 1: Database schema, migration, and repository layer (TASK-002)
**Build Started**: 2026-06-15
**Phase Number**: 1 of 2
**Is Multi-Phase**: YES

### Current Build Step
**Step**: Step 4 - Coding Agent
**Status**: RUNNING
**Started**: 2026-06-15

### Sub-Agent: Test Writer Agent
**Agent Type**: Test Writer
**Status**: COMPLETE
**Completed**: 2026-06-15
**Output**: 9 tests in board.repository.test.ts (8 unit + 1 integration block)

### Completed Steps
- Step 0.5 Git Setup: COMPLETE (2026-06-15) - branch feature/FEAT-002-board-column-api created
- Step 3 Test Writer: COMPLETE (2026-06-15) - 9 tests in 1 file

### Active Sub-Agents
(none)

### Completed Steps
(none)
