# TASK-008: Card Move & Ordering

**Complexity**: Level 2 (inherited from FEAT-004)
**Status**: REFLECTION_COMPLETE
**Roadmap**: FEAT-004
**Branch**: feature/FEAT-004-card-move-ordering
**Worktree**: .claude-worktrees/FEAT-004

## Task Description

API endpoint to move a card to a different column and update its sort position within that column. Uses a float/fractional ordering strategy to avoid rewriting all positions on every move. Includes position field on cards schema and a PATCH /cards/:id/move endpoint.

## Specification

**Feature Type**: NFR/Infrastructure (API-only feature — no frontend UI; consumed by future frontend clients)
**Primary Persona**: API consumer (developer integrating Kanban board frontend)
**Creative Exploration Needed**: No — design decisions resolved below; proceed to implementation planning.

---

### Invocation Method

- **Endpoint**: `PATCH /cards/:id/move`
- **Mounted at**: `src/routes/cards.ts` → `createCardsRouter(db)`, which is already mounted at `/cards` in `src/routes/index.ts`
- **Visibility**: Always available to any caller with a valid card UUID
- **Request body** (JSON):
  ```json
  {
    "column_id": "<uuid>",       // required — destination column (may equal current column for reorder)
    "after_card_id": "<uuid>"    // optional — insert AFTER this card; omit/null = insert at top
  }
  ```
- **Response**: `200 OK` with the full updated `Card` JSON object (same shape as `GET /cards/:id`)
- **Confidence**: HIGH — exact router factory pattern established in `src/routes/cards.ts`; `createCardsRouter` already has GET/PATCH/DELETE handlers to extend.

---

### Database Migration Required

**Migration**: `backend/migrations/<timestamp>_alter-cards-position-to-float8.js`

The `cards.position` column is currently `integer DEFAULT 0` (migration `1750003200000_create-cards.js`, line 15). The fractional ordering strategy requires `float8` (PostgreSQL `double precision`).

Migration must:
- `ALTER TABLE cards ALTER COLUMN position TYPE float8 USING position::float8`
- Change default to `1.0` (existing `DEFAULT 0` can remain; new cards placed via move logic override it)
- Provide a matching `down` migration reverting to `integer`

The `Card` interface in `src/repositories/card.repository.ts` already types `position` as `number` (TypeScript) — no interface change required.

---

### Position Calculation Algorithm

All position arithmetic happens in `CardService` (business logic, no SQL). The repository receives the computed `position` float.

| Scenario | Formula |
|---|---|
| No cards in target column | `1.0` |
| Insert at top (`after_card_id` null/omitted) | `(smallest existing position) / 2` |
| Insert at bottom (`after_card_id` = last card id) | `(largest existing position) + 1.0` |
| Insert between two cards | `(card_before.position + card_after.position) / 2` |

The service fetches all cards in the target column (ordered by `position ASC`) via the existing `findCardsByColumnId`, computes the new position, then updates the card's `column_id` and `position` in a single `UPDATE`.

**Precision exhaustion**: Fractional positions converge toward zero after ~50 insertions at the top without rebalancing. This risk is accepted for now (rebalancing is explicitly out of scope). At float8 precision (~15 significant digits), practical exhaustion requires thousands of consecutive top-inserts.

---

### New Repository Method

Add to `CardRepository` in `src/repositories/card.repository.ts`:

```typescript
async moveCard(id: string, columnId: string, position: number): Promise<Card>
```

Executes:
```sql
UPDATE cards
SET column_id = $2, position = $3, updated_at = now()
WHERE id = $1
RETURNING id, column_id, title, description, due_date, labels, position, created_at, updated_at
```

Throws `NotFoundError('Card not found')` when `rowCount === 0`.

---

### New Service Method

Add to `CardService` in `src/services/card.service.ts`:

```typescript
async moveCard(id: string, columnId: string, afterCardId: string | null): Promise<Card>
```

Steps:
1. Verify the card exists: `repo.findCardById(id)` (throws `NotFoundError` if not)
2. Verify the destination column exists: query `SELECT id FROM columns WHERE id = $1` — throws `NotFoundError('Column not found')` if absent. *(The repository can expose a `columnExists(id)` helper, or the service queries via a `ColumnRepository` — use a minimal inline check to avoid circular imports; a standalone `columnExists` query on `Queryable` is acceptable.)*
3. Fetch cards in target column: `repo.findCardsByColumnId(columnId)`
4. Compute `newPosition` using the algorithm above
5. Call `repo.moveCard(id, columnId, newPosition)`
6. Log: `logger.info({ cardId: id, columnId, position: newPosition }, 'card.moved')`
7. Return updated card

---

### Route Handler

Added to `createCardsRouter` in `src/routes/cards.ts`:

```typescript
router.patch('/:id/move', asyncHandler(async (req, res) => {
  // validate
  // call service.moveCard(...)
  res.json(card);
}));
```

**Validation rules** (throw `ValidationError` for violations):
- `column_id` must be present and a non-empty string (UUID format check optional but recommended)
- `after_card_id` is optional; if present must be a non-empty string
- Unknown extra fields in body are silently ignored (consistent with existing `PATCH /:id`)

**Important**: Register `PATCH /:id/move` BEFORE `PATCH /:id` in the router to prevent Express matching `:id = "move"` on the generic patch route.

---

### Success Criteria

- `PATCH /cards/:id/move` returns `200` with full card JSON, `position` field is a float (not integer), `column_id` reflects destination
- Moving to a non-existent column returns `404 { "error": "NotFoundError", "message": "Column not found" }`
- Moving a non-existent card returns `404 { "error": "NotFoundError", "message": "Card not found" }`
- Missing `column_id` in body returns `400 { "error": "ValidationError" }`
- Inserting between two cards: resulting `position` is strictly between `card_before.position` and `card_after.position`
- Same-column reorder works (no error when `column_id` equals the card's current `column_id`)
- `GET /columns/:columnId/cards` returns cards ordered by `position ASC` (unchanged behavior, but float positions must sort correctly)

---

### Acceptance Criteria

#### AC-MOVE-1: Move card to a different column, no position preference (insert at top)
**Priority**: MUST
**Given** a card exists in column A, and column B exists with 2 cards at positions 1.0 and 2.0
**When** `PATCH /cards/:cardId/move` is called with `{ "column_id": "<columnB_id>" }` (no `after_card_id`)
**Then**
- Response is `200` with `column_id` = columnB id
- `position` < 1.0 (specifically 0.5)
- `GET /columns/:columnB_id/cards` returns the moved card first (lowest position)

#### AC-MOVE-2: Move card to bottom of target column
**Priority**: MUST
**Given** column B has 2 cards at positions 1.0 and 2.0 with known UUIDs
**When** `PATCH /cards/:cardId/move` is called with `{ "column_id": "<columnB_id>", "after_card_id": "<last_card_id>" }`
**Then**
- Response is `200` with `position` > 2.0 (specifically 3.0)
- `GET /columns/:columnB_id/cards` returns the moved card last

#### AC-MOVE-3: Insert between two cards
**Priority**: MUST
**Given** column B has cards at positions 1.0 (`card_a`) and 3.0 (`card_b`)
**When** `PATCH /cards/:cardId/move` with `{ "column_id": "<columnB_id>", "after_card_id": "<card_a_id>" }`
**Then**
- Response `position` = 2.0 (midpoint)
- `GET /columns/:columnB_id/cards` order is: card_a, moved card, card_b

#### AC-MOVE-4: Same-column reorder
**Priority**: MUST
**Given** a card is already in column A
**When** `PATCH /cards/:cardId/move` with `{ "column_id": "<same_column_A_id>", "after_card_id": null }`
**Then** Response is `200`, card is now at top of column A

#### AC-MOVE-5: Non-existent card returns 404
**Priority**: MUST
**Given** a UUID that does not correspond to any card
**When** `PATCH /cards/<nonexistent_uuid>/move` with valid `column_id`
**Then** `404 { "error": "NotFoundError", "message": "Card not found" }`

#### AC-MOVE-6: Non-existent destination column returns 404
**Priority**: MUST
**Given** a valid card UUID
**When** `PATCH /cards/:id/move` with a `column_id` UUID that does not exist
**Then** `404 { "error": "NotFoundError", "message": "Column not found" }`

#### AC-MOVE-7: Missing column_id returns 400
**Priority**: MUST
**Given** a valid card UUID
**When** `PATCH /cards/:id/move` with body `{}` (no `column_id`)
**Then** `400 { "error": "ValidationError" }`

#### AC-MOVE-8: Position is float after migration
**Priority**: MUST
**Given** the migration has run
**When** any move operation is performed
**Then** the `position` field in the response JSON is a floating-point number (e.g., `0.5`, `1.0`, `2.0`) — not a truncated integer string

#### AC-MOVE-9: Generic PATCH /:id still works after adding move route
**Priority**: MUST
**Given** the new route is registered
**When** `PATCH /cards/:id` is called with a valid `title` update
**Then** `200` with updated title (no routing conflict)

---

### Scope Boundaries

**In scope**:
- Database migration: `position integer` → `float8` on `cards` table
- `CardRepository.moveCard(id, columnId, position)` method
- `CardService.moveCard(id, columnId, afterCardId)` method with position calculation
- `PATCH /cards/:id/move` route handler with input validation
- Column existence check before move
- Same-column reorder support
- Tests: repository unit (mock Queryable), service unit (mock repo), HTTP integration (supertest mock pool)

**Out of scope**:
- Position rebalancing / normalization when float precision degrades
- Bulk move (multiple cards in one request)
- Moving columns (separate feature)
- Optimistic locking / concurrency conflict detection
- Authorization / ownership checks (no auth layer yet)
- Frontend UI

**Dependencies**:
- Existing `CardRepository`, `CardService`, `createCardsRouter` (all from FEAT-003)
- `asyncHandler` and `AppError` hierarchy from `src/lib/asyncHandler.ts` and `src/errors.ts`
- `node-pg-migrate` for the migration file

**NFR implications**:
- Performance: `findCardsByColumnId` is called on every move to compute position. Acceptable at current scale; columns with >1000 cards may benefit from an indexed `MIN`/`MAX` query optimization (out of scope)
- Observability: `logger.info` with `cardId`, `columnId`, `position` fields — consistent with existing `card.created` / `card.updated` events
- 12-Factor: no new environment variables required

## Test Strategy

### Approach
- **Emphasis**: Unit (repository + service position math) + route integration (supertest mock pool)
- **Target test count**: 18–22 tests total

### File Organization
- **Extend existing**:
  - `backend/src/repositories/__tests__/card.repository.test.ts` — add `moveCard` unit tests
  - `backend/src/services/__tests__/card.service.test.ts` — add `moveCard` delegation + position algorithm tests
  - `backend/src/routes/__tests__/cards.routes.test.ts` — add HTTP tests for `PATCH /cards/:id/move`
- **New test files**: None — all card test files already exist

### What NOT to Test
- `float8` precision limits — accepted risk documented in spec; not a test concern at MVP scale
- `ORDER BY position ASC` sort correctness — covered by integration guard when DATABASE_URL is set
- Express routing internals — trust the framework

### Per-Phase Test Guidance
- Phase 1 (Migration + `moveCard` repo/service): ~12 tests
  - Repository: `moveCard` persists column_id + position, throws NotFoundError for missing card
  - Service: `moveCard` delegates to repo; position algorithm — insert at top (min/2), insert at bottom (max+1), insert between (midpoint), empty column (1.0), same-column reorder
  - Service: column-not-found path (mock column check returns no rows)
- Phase 2 (Route handler + routing non-regression): ~8–10 tests
  - HTTP: `PATCH /cards/:id/move` 200 happy path
  - HTTP: 400 missing `column_id`
  - HTTP: 404 card not found, 404 column not found
  - HTTP: `PATCH /:id/move` registered before `PATCH /:id` — no routing conflict (AC-MOVE-9)
  - HTTP: `after_card_id` present vs omitted both resolve to 200

### Observability Requirements
- Log `card.moved` at service layer: `{ cardId, columnId, position }`
- No new environment variables

## Implementation Roadmap

- [x] Phase 1: Migration, `CardRepository.moveCard`, and `CardService.moveCard` (with position algorithm)
- [x] Phase 2: Route handler (`PATCH /cards/:id/move`), validation, routing order fix

## Creative Phases

None required.

---

## Execution State

**Build Status**: BUILD_COMPLETE
**Current Build**: All phases complete
**Build Started**: 2026-06-16
**Phase Number**: 2 of 2 COMPLETE
**Is Multi-Phase**: YES
**Can Resume**: NO

### Current Build Step
**Step**: All phases complete — run /banyan-reflect TASK-008
**Status**: IDLE

### Completed Steps
- Step 0.5 Git Setup: COMPLETE (2026-06-16) - Worktree created at .claude-worktrees/FEAT-004
- Phase 1 Build: COMPLETE (2026-06-16) - Migration + CardRepository.moveCard + CardService.moveCard; 104/104 tests pass; tsc clean
- Phase 2 Build: COMPLETE (2026-06-16) - PATCH /cards/:id/move route; 111/111 tests pass; tsc clean

### Sub-Agents
(none — orchestrator-direct build)
