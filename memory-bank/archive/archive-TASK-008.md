# Archive: TASK-008 — Card Move & Ordering

**Archived**: 2026-06-16
**Complexity**: Level 2
**Feature**: FEAT-004
**Branch**: feature/FEAT-004-card-move-ordering (merged to master)
**Reflection**: [reflection-TASK-008.md](../reflection/reflection-TASK-008.md)

---

## Summary

Implemented `PATCH /cards/:id/move` — a fractional float ordering endpoint that moves cards between columns or reorders within the same column. Uses a 4-case position algorithm (empty→1.0, top→min/2, bottom→max+1.0, between→midpoint) to avoid rewriting all positions on every move.

---

## What Was Built

### Phase 1: Migration + Repository + Service

- **`backend/migrations/1781635709483_alter-cards-position-to-float8.js`** — `ALTER TABLE cards ALTER COLUMN position TYPE float8 USING position::float8`; default changed to 1.0
- **`CardRepository.moveCard(id, columnId, position)`** — single `UPDATE ... RETURNING`; throws `NotFoundError` when `rowCount === 0`
- **`CardService.moveCard(id, columnId, afterCardId)`** — verifies card exists, checks column exists via inline `Queryable` query, computes position, delegates to repo, logs `card.moved`
- **`CardService` constructor** updated to `(repo: CardRepository, db: Queryable)` — `Queryable` injection avoids circular imports for cross-entity existence check

### Phase 2: Route Handler

- **`PATCH /:id/move`** added to `createCardsRouter` in `src/routes/cards.ts` — registered **before** `PATCH /:id` to prevent Express matching `"move"` as a UUID
- Validation: `column_id` required non-empty string (400 if absent/empty); `after_card_id` optional non-empty string (400 if empty)
- Both `createColumnCardsRouter` and `createCardsRouter` updated to pass `db` to `CardService`

---

## Test Summary

- **Tests**: 119 passing (8 skipped — describeIfDb integration guards)
- **tsc**: clean
- **New tests**: 16 across 3 files (2 repo, 7 service, 7 route)
- **No new test files** — all extensions to existing files

### Acceptance Criteria Coverage

| AC | Description | Status |
|----|-------------|--------|
| AC-MOVE-1 | Insert at top (no after_card_id) | ✅ |
| AC-MOVE-2 | Insert at bottom (after_card_id = last) | ✅ |
| AC-MOVE-3 | Insert between two cards (midpoint) | ✅ |
| AC-MOVE-4 | Same-column reorder | ✅ |
| AC-MOVE-5 | Non-existent card → 404 | ✅ |
| AC-MOVE-6 | Non-existent column → 404 | ✅ |
| AC-MOVE-7 | Missing column_id → 400 | ✅ |
| AC-MOVE-8 | position field is float | ✅ |
| AC-MOVE-9 | PATCH /:id routing non-regression | ✅ |

---

## Files Changed

| File | Change |
|------|--------|
| `backend/migrations/1781635709483_alter-cards-position-to-float8.js` | New |
| `backend/src/repositories/card.repository.ts` | Added `moveCard` |
| `backend/src/repositories/__tests__/card.repository.test.ts` | Extended (+2 tests) |
| `backend/src/services/card.service.ts` | Added `moveCard`, updated constructor |
| `backend/src/services/__tests__/card.service.test.ts` | Extended (+7 tests) |
| `backend/src/routes/cards.ts` | Added move handler, updated CardService construction |
| `backend/src/routes/__tests__/cards.routes.test.ts` | Extended (+7 tests) |

---

## Key Patterns Established

1. **`Queryable` injection into service** for cross-entity existence checks — avoids circular imports, keeps check at service layer
2. **Route registration order** — `PATCH /:id/[action]` must precede `PATCH /:id` in Express
3. **Fractional float position algorithm** — 4-case formula for Kanban ordering without full rebalancing

---

## Known Technical Debt

- `findCardsByColumnId` called on every move (loads all cards). Replace with `SELECT MIN/MAX` + targeted lookup for >1000-card columns.
- No position rebalancing. When float precision degrades from repeated top-inserts, a `POST /columns/:id/rebalance` endpoint would renumber cleanly.
