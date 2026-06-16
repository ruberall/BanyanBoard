# TASK-007: Card Management API

**Complexity**: Level 2 (inherited from FEAT-003)
**Status**: PLANNING_COMPLETE
**Roadmap**: FEAT-003
**Branch**: feature/FEAT-003-card-management-api
**Worktree**: .claude-worktrees/FEAT-003

## Task Description

REST endpoints for card CRUD within a column (create, read, update, delete). Cards have title (required), description (optional), due date (optional), and labels (optional array of strings — card-scoped, free-form). Includes cards DB schema (migration), repository, service, and routes.

## Specification

**Feature Type**: End-User Feature (API surface consumed by the React frontend)
**Primary Persona**: Individual Developer — needs to create, view, edit, and delete cards within a column to track tasks
**Creative Exploration Needed**: No — straightforward CRUD following the established Board/Column API pattern in `backend/src/routes/boards.ts`, `backend/src/services/board.service.ts`, and `backend/src/repositories/board.repository.ts`

### Invocation Method

- **Location**: HTTP REST API, nested under column context
- **Element**: Five endpoints (see table below); consumed by the React frontend's API client (`frontend/src/api/`)
- **Visibility**: All endpoints are public for MVP (auth is FEAT-006, post-FEAT-003)
- **Navigation**: Consumers must first know the `columnId` (obtained from `GET /boards/:id` which returns `BoardWithColumns` with column UUIDs)
- **Confidence**: HIGH — exact pattern exists in `backend/src/routes/boards.ts`; column UUID is already returned by the board repository

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/columns/:columnId/cards` | Create a card in a column |
| `GET` | `/columns/:columnId/cards` | List all cards in a column |
| `GET` | `/cards/:id` | Get a single card by ID |
| `PATCH` | `/cards/:id` | Update card fields (partial update) |
| `DELETE` | `/cards/:id` | Delete a card |

**URL design rationale**: Create and list are column-scoped (`/columns/:columnId/cards`) because a card always belongs to a column and columnId is the natural filter. Get, update, and delete are card-scoped (`/cards/:id`) because the card UUID alone is sufficient — no column context is needed to identify the record.

### Success Criteria

- **User sees**: JSON card object or array on success; `{ error, message }` on failure (matches existing error shape in `src/errors.ts`)
- **Verifiable at**: HTTP response body and status code
- **Data persisted**: `cards` table — fields: `id` (uuid), `column_id` (uuid FK → columns), `title` (varchar 255), `description` (text nullable), `due_date` (timestamptz nullable), `labels` (text[] nullable), `position` (integer, default 0 for MVP — FEAT-004 owns ordering), `created_at` (timestamptz), `updated_at` (timestamptz)
- **Observable within**: Immediate (synchronous DB write, same request cycle)

**Labels storage decision**: Store as a PostgreSQL `text[]` array column on `cards`. Rationale: labels are card-scoped free-form strings with no cross-card identity, no separate entity lifecycle, and no join queries needed. A join table would add schema complexity with no benefit at MVP scale. PostgreSQL native array operators (e.g., `@>`, `ANY`) are sufficient if label filtering is added later.

**`updated_at` column**: Required on `cards` (unlike `boards` and `columns` which omit it) because PATCH partial updates are a first-class operation on cards. The value is set by an `ON UPDATE` trigger or updated explicitly in the PATCH SQL.

### Acceptance Criteria

#### AC-HAPPY-1: Create a card with title only
**Priority**: MUST
**Given** a valid `columnId` UUID referencing an existing column
**When** `POST /columns/:columnId/cards` with body `{ "title": "Write tests" }`
**Then**
- Response status is `201`
- Response body contains `{ id, column_id, title: "Write tests", description: null, due_date: null, labels: [], position: 0, created_at }`
- A subsequent `GET /columns/:columnId/cards` includes the new card

#### AC-HAPPY-2: Create a card with all optional fields
**Priority**: MUST
**Given** a valid `columnId`
**When** `POST /columns/:columnId/cards` with body `{ "title": "Ship v1", "description": "Tag and push", "due_date": "2026-07-01T00:00:00Z", "labels": ["backend", "urgent"] }`
**Then**
- Response status is `201`
- Response body contains all submitted fields with `due_date` as a parseable ISO timestamp and `labels` as `["backend", "urgent"]`

#### AC-HAPPY-3: List cards in a column returns ordered array
**Priority**: MUST
**Given** a column with two or more cards
**When** `GET /columns/:columnId/cards`
**Then**
- Response status is `200`
- Response body is a JSON array of card objects ordered by `position ASC, created_at ASC`
- Each card object contains `id, column_id, title, description, due_date, labels, position, created_at, updated_at`

#### AC-HAPPY-4: Get a single card by ID
**Priority**: MUST
**Given** a card exists with a known `id`
**When** `GET /cards/:id`
**Then**
- Response status is `200`
- Response body is the full card object matching the stored record

#### AC-HAPPY-5: Partial update — title only
**Priority**: MUST
**Given** a card exists
**When** `PATCH /cards/:id` with body `{ "title": "Updated title" }`
**Then**
- Response status is `200`
- Response body contains the updated card with `title: "Updated title"` and all other fields unchanged
- `updated_at` value is more recent than `created_at`

#### AC-HAPPY-6: Partial update — labels only
**Priority**: MUST
**Given** a card exists with `labels: ["backend"]`
**When** `PATCH /cards/:id` with body `{ "labels": ["backend", "urgent"] }`
**Then**
- Response status is `200`
- Response body contains `labels: ["backend", "urgent"]`
- `title`, `description`, `due_date` are unchanged

#### AC-HAPPY-7: Partial update — clear optional fields
**Priority**: MUST
**Given** a card with `description: "Some text"` and `labels: ["tag"]`
**When** `PATCH /cards/:id` with body `{ "description": null, "labels": [] }`
**Then**
- Response status is `200`
- Response body contains `description: null` and `labels: []`

#### AC-HAPPY-8: Delete a card
**Priority**: MUST
**Given** a card exists
**When** `DELETE /cards/:id`
**Then**
- Response status is `204` with no body
- Subsequent `GET /cards/:id` returns `404`

#### AC-ERROR-1: Create card — missing title
**Priority**: MUST
**Given** a valid `columnId`
**When** `POST /columns/:columnId/cards` with body `{}` or `{ "title": "" }`
**Then**
- Response status is `400`
- Response body is `{ "error": "VALIDATION_ERROR", "message": "..." }` (using `ValidationError` from `src/errors.ts`)

#### AC-ERROR-2: Create card — title exceeds 255 characters
**Priority**: MUST
**Given** a valid `columnId`
**When** `POST /columns/:columnId/cards` with `title` longer than 255 characters
**Then** response status is `400` with `{ "error": "VALIDATION_ERROR", ... }`

#### AC-ERROR-3: Create card — column not found
**Priority**: MUST
**Given** a `columnId` UUID that does not exist in the database
**When** `POST /columns/:columnId/cards`
**Then**
- Response status is `404`
- Response body is `{ "error": "NOT_FOUND", "message": "Column not found" }` (using `NotFoundError` from `src/errors.ts`)

#### AC-ERROR-4: Get/update/delete — card not found
**Priority**: MUST
**Given** a card `id` UUID that does not exist
**When** `GET /cards/:id` or `PATCH /cards/:id` or `DELETE /cards/:id`
**Then** response status is `404` with `{ "error": "NOT_FOUND", "message": "Card not found" }`

#### AC-ERROR-5: Update card — title explicitly set to empty string
**Priority**: MUST
**Given** an existing card
**When** `PATCH /cards/:id` with body `{ "title": "" }` or `{ "title": "   " }` (whitespace-only)
**Then** response status is `400` with `{ "error": "VALIDATION_ERROR", ... }` — title must remain non-empty if supplied

#### AC-ERROR-6: Update card — no valid fields provided
**Priority**: SHOULD
**Given** an existing card
**When** `PATCH /cards/:id` with body `{}` or body containing only unrecognised fields
**Then** response status is `400` with `{ "error": "VALIDATION_ERROR", "message": "No valid fields to update" }`

#### AC-ERROR-7: Create card — invalid due_date format
**Priority**: MUST
**Given** a valid `columnId`
**When** `POST /columns/:columnId/cards` with `{ "title": "X", "due_date": "not-a-date" }`
**Then** response status is `400` with `{ "error": "VALIDATION_ERROR", ... }`

#### AC-ERROR-8: Create card — labels is not an array of strings
**Priority**: MUST
**Given** a valid `columnId`
**When** `POST /columns/:columnId/cards` with `{ "title": "X", "labels": "urgent" }` (string, not array)
**Then** response status is `400` with `{ "error": "VALIDATION_ERROR", ... }`

### Scope Boundaries

**In scope**:
- `cards` database migration (new file in `backend/migrations/` following `<epoch-ms>_<description>.js` naming, e.g., `1750003200000_create-cards.js`)
- `CardRepository` class in `backend/src/repositories/card.repository.ts` implementing `Queryable` interface
- `Card` and `CardInput` TypeScript interfaces exported from `card.repository.ts` (domain types co-located with repository, per `systemPatterns.md`)
- `CardService` class in `backend/src/services/card.service.ts`
- `createCardsRouter(db: Queryable)` in `backend/src/routes/cards.ts`; mounted in `backend/src/routes/index.ts`
- Unit tests: `CardRepository` (mock `Queryable`), `CardService` (mock repo), HTTP integration tests via `supertest` + `createApp()`
- Optional DB integration tests gated by `describeIfDb` guard (per learned testing-patterns rule)

**Out of scope**:
- Card position/ordering within a column (FEAT-004 owns `position` as a fully ordered field; this task seeds `position = 0` as a placeholder)
- Moving a card between columns (FEAT-004)
- Board-level label registry or label filtering endpoints
- Pagination of the cards list (FEAT-007 pattern can be applied later; list all cards per column for MVP)
- Authentication / authorization middleware (FEAT-006)
- Soft delete / archive (not in MVP)

**Dependencies**:
- `columns` table must exist (delivered by FEAT-002 / TASK-002 migration `1749916800000_create-boards-and-columns.js`) — FK `column_id → columns(id)` with `ON DELETE CASCADE`
- `src/errors.ts` — `ValidationError`, `NotFoundError` already available
- `src/lib/asyncHandler.ts` — already available
- `src/middleware/validate.ts` (`requireFields`) — already available (used in boards router)

**NFR implications**:
- Response time: p95 < 200ms per `productBrief.md` — all card operations are single-table queries; no multi-table JOINs required
- Labels stored as `text[]`: no full-text-search index needed for MVP; a GIN index can be added later if label-based filtering is required
- `updated_at` must be set accurately on every PATCH so consumers can detect stale caches (important for optimistic UI per `productBrief.md`)

### Creative Exploration Needed

Specification is concrete — proceed to implementation planning.

## Test Strategy

### Approach
- **Emphasis**: Unit (repository + service) + route integration (supertest + mock pool)
- **Target test count**: 20–26 tests total

### File Organization
- **New test files**:
  - `backend/src/repositories/__tests__/card.repository.test.ts` — CardRepository unit tests (mock Queryable) + DB integration block
  - `backend/src/services/__tests__/card.service.test.ts` — CardService unit tests (mock repo)
  - `backend/src/routes/__tests__/cards.routes.test.ts` — HTTP integration tests (supertest + mock pool)
- **Extend existing**: None — cards is a new module

### What NOT to Test
- SQL syntax correctness against real DB — covered by integration guards when DATABASE_URL is set
- Express routing internals — trust the framework
- `position` ordering logic — FEAT-004 scope
- `updated_at` trigger implementation — covered by AC-HAPPY-5 assertion that `updated_at > created_at`

### Per-Phase Test Guidance
- Phase 1 (Migration + Repository + Service): ~12 tests
  - `createCard`: persists title, optional fields, returns Card shape
  - `findCardsByColumnId`: returns array ordered by position/created_at, returns empty array for empty column
  - `findCardById`: returns card, throws NotFoundError for missing id
  - `updateCard`: updates supplied fields, throws NotFoundError for missing id
  - `deleteCard`: deletes row, throws NotFoundError for missing id
  - `CardService`: thin pass-through tests for all 5 methods
- Phase 2 (Routes + Validation): ~10–14 tests
  - Happy paths: POST 201, GET list 200, GET single 200, PATCH 200, DELETE 204
  - Validation errors: missing title, title empty, title >255 chars, bad due_date, labels not array, empty PATCH body
  - Not found: column not found on create (404), card not found on get/patch/delete (404)

### Observability Requirements
- **Applies**: Yes — new HTTP handlers and service methods
- **Logging**: Log business events at service layer: `card.created` (cardId, columnId), `card.updated` (cardId), `card.deleted` (cardId) — matching the pattern in `board.service.ts`
- **Tracing**: Handled by existing pino-http request logger; no additional spans needed for MVP

### API Requirements
- **REST API**: Yes — 5 new endpoints; follows existing pattern in `boards.ts`
- **OpenAPI Spec**: Deferred (no toolchain yet; noted in TASK-002 reflection)

## Implementation Roadmap

- [x] Phase 1: Migration, CardRepository, and CardService
- [ ] Phase 2: Route handlers, validation, and index.ts mounting

## Creative Phases

None required.

---

## Execution State

**Build Status**: IDLE
**Current Build**: Phase 1 COMPLETE — awaiting Phase 2
**Phase Number**: 1 of 2 COMPLETE
**Is Multi-Phase**: YES
**Can Resume**: NO

### Current Build Step
**Step**: Phase 1 COMPLETE
**Status**: COMPLETE
**Completed**: 2026-06-16

### Completed Steps
- Step 0.5 Git Setup: COMPLETE (2026-06-16) - Worktree created at .claude-worktrees/FEAT-003
- Step 3 Test Writer: COMPLETE (2026-06-16) - card.repository.test.ts (14 tests), card.service.test.ts (5 tests)
- Step 4 Coding Agent: COMPLETE (2026-06-16) - migration + CardRepository + CardService
- Step 6 Test Execution: COMPLETE (2026-06-16) - 77/77 passing (8 skipped)
- Step 7 Integration Verification: COMPLETE (2026-06-16) - tsc clean, no regressions
- Step 11 Git Commit: COMPLETE (2026-06-16)

### Sub-Agents
(none — orchestrator-direct build)
