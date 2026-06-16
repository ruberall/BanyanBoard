# Reflection: TASK-008 - Card Move & Ordering

**Date**: 2026-06-16
**Task Complexity**: Level 2
**Total Phases**: 2
**Duration**: 2026-06-16 (single session, resumed after context compaction)

## Executive Summary

TASK-008 implemented the `PATCH /cards/:id/move` endpoint for fractional float ordering of cards across columns. The feature required a database migration (integer → float8), a new `CardRepository.moveCard` method, a `CardService.moveCard` with a 4-case position algorithm, and a route handler with proper routing-order discipline. All 9 acceptance criteria were met. The build was clean on the first run of the full suite — no fix cycles were needed.

The most non-trivial design decision was injecting `Queryable` directly into `CardService` for the column existence check, avoiding a circular dependency while keeping the check at the service layer where it belongs. This is a pattern worth preserving for other services that need ad-hoc cross-entity queries.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: ✅ All Met

- AC-MOVE-1 (insert at top): ✅ position = min/2
- AC-MOVE-2 (insert at bottom): ✅ position = max+1.0
- AC-MOVE-3 (insert between): ✅ midpoint
- AC-MOVE-4 (same-column reorder): ✅ same logic, no special case needed
- AC-MOVE-5 (card not found → 404): ✅
- AC-MOVE-6 (column not found → 404): ✅
- AC-MOVE-7 (missing column_id → 400): ✅
- AC-MOVE-8 (position is float): ✅ float8 migration applied
- AC-MOVE-9 (no routing conflict with PATCH /:id): ✅ explicit registration order

### Code Quality Assessment

**Overall Rating**: Good

- **Maintainability**: Position algorithm is a clean 4-case if/else in `moveCard`. The spec documented all 4 cases in a table, so the implementation reads directly from it.
- **Architecture**: Injecting `Queryable` into `CardService` (alongside `CardRepository`) is a deliberate choice — keeps the column existence check in the service layer without introducing a `ColumnRepository` import that would create coupling. Clean.
- **Error Handling**: Consistent with existing patterns. `NotFoundError` thrown from repo for missing cards; `NotFoundError` thrown from service for missing columns. `ValidationError` at the route layer.
- **Testing**: 16 new tests across 3 files (2 repo, 7 service, 7 route). All 4 position scenarios have dedicated unit tests. AC-MOVE-9 (routing regression) has a dedicated HTTP test.

### Technical Decisions

**Key Decisions:**

1. **`Queryable` injected into `CardService` constructor** — needed to run `SELECT id FROM columns WHERE id = $1` without importing `ColumnRepository`. This avoids circular imports and keeps the footprint small. The `Queryable` interface is already used throughout, so no new dependency type is introduced.

2. **Route registration order enforced in code with a comment** — `PATCH /:id/move` is registered before `PATCH /:id`. A comment documents WHY (prevents Express treating `"move"` as a UUID). Without the comment, a future refactor could silently break routing.

3. **Migration uses `USING position::float8`** — node-pg-migrate's `alterColumn` with explicit cast. All existing integer positions survive the cast (0 → 0.0); no data loss.

**Trade-offs:**

- **`findCardsByColumnId` on every move**: loads all cards in the target column to compute position. Acceptable at MVP scale; columns with >1000 cards would benefit from a MIN/MAX index query. Documented in spec as accepted risk.
- **No rebalancing**: fractional positions converge toward zero after repeated top-inserts. Out of scope — accepted risk at float8 precision levels.

### What Went Well

1. The spec was precise enough that the implementation had zero ambiguity — all 4 position cases were pre-defined with formulas.
2. Extending existing test files (vs. creating new ones) kept the test suite structure clean.
3. `tsc` and full test suite passed on the first run after implementation — no fix cycles.

### Challenges Encountered

1. **`CardService` constructor signature change** — adding `Queryable` as second param required updating both router factory functions (`createColumnCardsRouter` and `createCardsRouter`) and the service test `beforeEach`. This was a ripple effect not explicitly called out in the spec. It was handled cleanly but worth noting for future services.

2. **Context compaction mid-build** — Phase 1 was written in a prior session that hit the context limit. The compaction summary preserved all necessary state (migration timestamp, method signatures, algorithm cases), so resumption was seamless. This validates the Execution State tracking in `TASK-008.md`.

### Technical Debt & Future Work

- **Position rebalancing**: When cards are inserted at the top repeatedly, float precision degrades. A `POST /columns/:id/rebalance` endpoint would renumber positions 1.0, 2.0, 3.0… without changing visual order. Not urgent at MVP scale.
- **`findCardsByColumnId` efficiency on move**: Replace with `SELECT MIN(position), MAX(position) FROM cards WHERE column_id = $1` plus a targeted lookup for the `afterCardId` card. Avoids loading all card data for large columns.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

**Build Sessions**: 2 (Phase 1, Phase 2 — one session each)
**Sub-Agents Spawned**: 0 (orchestrator-direct execution throughout)
**Errors Recovered**: 0
**Fix Cycles**: 0

#### Tool Utilization

| Tool | Approx Count | Notes |
|------|-------------|-------|
| Read | ~10 | Task file, existing source files, test files before extending |
| Edit | ~12 | Test extensions, implementation, route updates |
| Write | 2 | Migration file, reflection |
| Bash | 4 | npm install (prior session), tsc×2, jest×2 |

#### Sub-Agent Performance

No sub-agents were spawned. The task was sufficiently well-specified that orchestrator-direct execution was efficient.

### Command Workflow Evaluation

**Commands Used**: `/banyan-plan` → `/banyan-build` (×2 phases) → `/banyan-reflect`

**Workflow Efficiency**: Good

- The plan spec was thorough enough to carry the entire build without creative phases or additional clarification. The 4-case position algorithm table in the spec eliminated any ambiguity during implementation.
- Context compaction mid-Phase-1 interrupted the session, but the Execution State tracking in `TASK-008.md` held all the state needed for resumption. No rework.
- The two-phase structure (migration+data layer / route+HTTP) was appropriate. Phase 1 could be verified in isolation before the HTTP surface was added.

### Context File Effectiveness

**Files Loaded**: `TASK-008.md`, existing `card.repository.ts`, `card.service.ts`, `cards.ts`, all three test files.

- **Helpful**: The per-task spec with the position algorithm table and explicit routing order note (`PATCH /:id/move` before `PATCH /:id`) translated directly into implementation without interpretation.
- **Gaps**: None significant for Level 2. The `Queryable` injection pattern for cross-entity checks is a novel pattern not documented in `systemPatterns.md` — worth adding.

### Memory Bank Organization

- The `TASK-008.md` Execution State section proved its value when the session was interrupted by context compaction. The compaction summary accurately reflected the spec and resumption notes, enabling a clean pickup.
- `progress.md` entries from TASK-007 provided useful reference for test patterns (the `as unknown as jest.Mocked<T>` convention).

### Suggested Improvements to Claude Code System

> **Note**: Suggestions only — do NOT implement.

**Medium Priority:**

1. **Document `Queryable`-injection pattern in `systemPatterns.md`**: When a service needs a cross-entity existence check (e.g., does column X exist?), injecting `Queryable` as a second constructor argument is cleaner than importing a peer repository. This pattern appeared here and will recur when auth middleware needs user lookups.

2. **Add position-algorithm pattern to `systemPatterns.md`**: Float/fractional ordering (empty=1.0, top=min/2, bottom=max+1.0, between=midpoint) is a general Kanban ordering strategy. It should be documented as a project pattern so future board features don't re-derive it.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

1. **api-design** (`src/routes/*.ts`): Register `PATCH /:id/[action]` routes before `PATCH /:id` in Express routers to prevent the action segment being matched as the `:id` parameter — add a comment with the WHY.

2. **service-design** (`src/services/*.ts`): When a service method needs a cross-entity existence check, inject `Queryable` as a second constructor parameter rather than importing a peer repository — avoids circular imports and keeps the check at the correct layer.

### Learned Rules Applied

No learned rules were available yet (first task to generate them). The `as unknown as jest.Mocked<T>` cast pattern was self-referentially established in TASK-007 and applied here from `progress.md`.

### For Claude Code Workflow

1. **Execution State tracking works** — mid-session context compaction was fully recovered via `TASK-008.md` Execution State. No information was lost. This validates the state-tracking overhead.
2. **Spec quality directly determines build velocity** — the spec's explicit position algorithm table eliminated all implementation uncertainty. Time spent on spec precision pays back in zero fix cycles.

---

## Conclusion

TASK-008 delivered a complete fractional float card ordering API in two clean phases. All 9 acceptance criteria were met; 119 tests pass with tsc clean. The key architectural insight — injecting `Queryable` into `CardService` for cross-entity checks — is a reusable pattern that should be documented in `systemPatterns.md`. The context compaction recovery validated the Execution State approach.

**Overall Task Success**: ✅ Success

**Overall Workflow Effectiveness**: ✅ Highly Effective

**Recommendation**: Ready to archive.
