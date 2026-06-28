# Archive: Workflow Automation Engine

## Metadata
- **Task ID**: TASK-017
- **Roadmap Link**: FEAT-014
- **Complexity**: Level 4
- **Started**: 2026-06-27
- **Completed**: 2026-06-28
- **Duration**: 2 days (1 day planning + creative, 1 day 4 build phases)
- **Branch**: feature/FEAT-014-workflow-automation
- **Reflection**: `memory-bank/reflection/reflection-TASK-017.md`

## Executive Summary

TASK-017 delivered a two-rule workflow automation engine for BanyanBoard. The feature adds automatic board hygiene (stale card surfacing) and positive visual feedback for work completion (done card coloring). Both rules run as side effects of existing API endpoints — no new HTTP endpoints were added.

**Rule #1 (Stale)**: On every `GET /boards/:boardId`, cards ≥ 2 days old not in Done are automatically moved to a new "Stale" column (left of Done). Users who drag a card out of Stale suppress re-staling permanently via a `stale_suppressed` flag. Rule failures are non-blocking: they are returned as `warnings[]` in the board response.

**Rule #2 (Done-color)**: When a card is moved to Done via `PATCH /cards/:id/move`, its background `color` is set to `#d4edda` (pale green) asynchronously via fire-and-forget within 2 seconds, with up to 3 retry attempts. The card move HTTP response is not delayed. The frontend applies the color optimistically via TanStack Query `onMutate` cache manipulation.

Final test count: **460 passing** (223 backend, 237 frontend). All 15 acceptance criteria met. TypeScript clean across both layers.

## System Overview

### Purpose
Surface stale work automatically and provide visual feedback for completed work — two common pain points for small teams using kanban boards.

### Scope
- New "Stale" column seeded for all boards (new and existing via migration backfill)
- `stale_suppressed boolean` on cards
- `WorkflowService` with two built-in rules
- `WorkflowRepository` for DB tracking writes
- `workflow_rule_triggers` and `workflow_action_deliveries` audit tables
- `warnings?: WorkflowWarning[]` additive field on board GET response
- Frontend: Stale column rendering (amber header, ⏰ icon), optimistic pale-green done-color

**Out of scope**: User-configurable rules, rule enable/disable UI, external webhook delivery, rule scheduling, notification UI for rule failures.

### Key Capabilities
- Stale card detection and auto-placement with permanent user-override via drag-out
- Async done-color with exponential backoff retry (200ms → 400ms → 800ms) and per-attempt DB tracking
- Non-blocking rule failures surfaced in `warnings[]` (board always returns HTTP 200)
- Optimistic frontend color update with automatic rollback via TanStack Query snapshot
- Configuration-driven thresholds: `WORKFLOW_STALE_AGE_DAYS`, `WORKFLOW_RULE2_BASE_DELAY_MS`, `WORKFLOW_RULE2_MAX_ATTEMPTS`

## Architecture

### Overview
Rules are services, not middleware. `WorkflowService` owns all rule logic; existing services (`BoardService`, `CardService`) call it via optional constructor injection — the same DI pattern as `EventService`. All SQL is in `WorkflowRepository` (no SQL in service layer per GP#1). All INSERTs use `RETURNING` per GP#6.

### Component Relationships

```
routes/index.ts
  └─ creates WorkflowService(db)
       ├─ passed to createBoardsRouter(db, workflowService?)
       │    └─ BoardService(repo, workflowService?)
       │         └─ getBoardById() → applyBoardRules() [Rule #1]
       └─ passed to createCardsRouter(db, eventService, workflowService?)
            └─ CardService(repo, eventService, workflowService?)
                 └─ moveCard() → triggerDoneColorRule() [Rule #2, fire-and-forget]
```

### Data Flow — Rule #1 (Stale)
1. `GET /boards/:boardId` received
2. `BoardService.getBoardById` fetches board + columns + cards via `BoardRepository`
3. `WorkflowService.applyBoardRules(boardId, columns)` called
4. `WorkflowRepository.findStaleCards(boardId, staleColumnId, doneColumnId, staleDays)` queries cards eligible for stale-move
5. `Promise.allSettled` runs one `moveCardToStale` per eligible card (non-blocking on individual failures)
6. Each successful move: inserts `workflow_rule_triggers` (success) + `workflow_action_deliveries` (success)
7. Each failed move: inserts trigger (failed, trigger_error from delivery) + delivery (failed)
8. Failures collected into `WorkflowWarning[]` returned alongside board data

### Data Flow — Rule #2 (Done-color)
1. `PATCH /cards/:id/move` received → card moved → HTTP 200 returned
2. If destination column name = "Done": `workflowService.triggerDoneColorRule(boardId, cardId).catch(warn)` called (fire-and-forget)
3. Inside `triggerDoneColorRule`:
   - Manual for-loop up to `maxAttempts` (3)
   - Each attempt: `WorkflowRepository.setCardColor(cardId, '#d4edda')`
   - On success: record delivery (success), break
   - On failure: record delivery (failed, error message), wait exponential backoff
4. After loop: insert `workflow_rule_triggers` with final `trigger_status` and `trigger_error = lastDelivery.delivery_error` on failure
5. Insert all `workflow_action_deliveries` rows (one per attempt)
6. If tracking writes fail: log error, swallow (always resolves)

### Frontend — Optimistic Done-color
```
useMoveCard.onMutate(destColumnId):
  1. Read all board queries from cache via qc.getQueriesData<BoardWithColumns>()
  2. Find if destColumnId matches a column named "Done"
  3. If yes: set color: DONE_CARD_COLOR on the moving card in optimistic state
  4. Apply to cache via setQueriesData
  5. Existing snapshot/rollback (onError) covers the color change automatically
```

### Integration Points
- **`GET /boards/:boardId`**: Additive `warnings?` field appended to response (backward-compatible)
- **`PATCH /cards/:id/move`**: Fire-and-forget Rule #2 side effect; no response change
- **`CardService.moveCard`**: `CardRepository.getColumnName(columnId)` used to detect Stale source (for suppression) and Done destination (for Rule #2)

## Design Decisions

### Decision 1: Manual Retry Loop for Rule #2 (not `retryWithBackoff`)
- **Decision**: Rule #2 uses a manual `for` loop rather than the `retryWithBackoff<T>` utility shipped in Phase 1.
- **Rationale**: `retryWithBackoff` wraps a single `fn` call and does not expose the attempt number to the caller. Per-attempt `workflow_action_deliveries` row insertion requires knowing the attempt number inside the loop. A manual loop collects `DeliveryRecord[]` per attempt and inserts them after the trigger row is created.
- **Alternatives Considered**: `retryWithBackoff` with a side-effect callback parameter (added complexity, breaks the utility's simplicity); writing delivery rows inside `setCardColor` (violation of repository responsibility).
- **Trade-off**: Gives up code reuse of `retryWithBackoff` for Rule #2, retains the utility for future rules that do not need per-attempt callbacks.
- **Reference**: `memory-bank/creative/TASK-017-workflow-automation-architecture.md`

### Decision 2: `trigger_error` Populated from Last Delivery Error
- **Decision**: After Rule #2 exhausts all retries, `trigger_error` in the trigger row is set to `deliveries.at(-1)?.delivery_error` rather than remaining null.
- **Rationale**: Makes the trigger table a self-sufficient audit trail — root cause of failure readable without joining to `workflow_action_deliveries`.
- **Alternatives Considered**: Leave `trigger_error` null and require joining to deliveries (omitted diagnostic value at negligible savings).
- **Outcome**: Code-review catch in Phase 3 that required a one-line fix. Significant diagnostic improvement at near-zero cost.

### Decision 3: Optional Constructor Injection for WorkflowService
- **Decision**: `BoardService` and `CardService` accept `workflowService?` as an optional constructor parameter.
- **Rationale**: Follows the established `EventService` DI pattern. Tests that don't exercise workflow paths do not need the service injected. Absence is graceful.
- **Reference**: `memory-bank/creative/TASK-017-workflow-automation-architecture.md`

### Decision 4: `warnings[]` as Additive Optional Field
- **Decision**: Board GET response adds `warnings?: WorkflowWarning[]` rather than a new endpoint or error code.
- **Rationale**: Backward-compatible — existing consumers that don't read `warnings` are unaffected. Absence is semantically equivalent to empty.
- **Reference**: `memory-bank/creative/TASK-017-workflow-automation-uiux.md`

### Decision 5: Cross-Slice Cache Read in `useMoveCard.onMutate`
- **Decision**: Frontend reads the board query cache via `qc.getQueriesData<BoardWithColumns>()` to find the destination column name and apply optimistic done-color without a new hook parameter.
- **Rationale**: Keeps `useMoveCard` self-contained; consistent with existing onMutate snapshot pattern; avoids adding `doneColumnId` as a mutation argument.

## Implementation

### Phases

| Phase | Scope | Key Files | Tests | Commits |
|-------|-------|-----------|-------|---------|
| Phase 1 — DB Foundation | Migration, `retryWithBackoff` utility, `WorkflowError`, `DEFAULT_COLUMNS` | `backend/migrations/20260628120000_add-workflow-foundation.js`, `retry.ts`, `errors.ts`, `board.repository.ts` | ~30 | `44e4f88` |
| Phase 2 — WorkflowService + Rule #1 | `WorkflowRepository`, `WorkflowService.applyBoardRules`, `BoardService`/`CardService` wiring, config | `workflow.repository.ts`, `workflow.service.ts`, `card.repository.ts`, `card.service.ts`, `board.service.ts`, `config.ts` | 193 backend | `7c0d585` |
| Phase 3 — Rule #2 + Retry Harness | `WorkflowRepository.setCardColor`, `WorkflowService.triggerDoneColorRule`, `CardService` fire-and-forget, `cards.ts` wiring | `workflow.repository.ts`, `workflow.service.ts`, `card.service.ts`, `routes/cards.ts`, `routes/index.ts` | 223 backend | `a0bf300` |
| Phase 4 — Frontend | `WorkflowWarning` type, optimistic done-color in `useMoveCard`, Stale column rendering | `types/index.ts`, `api/hooks.ts`, `workflowWarning.test.ts`, `useMoveCard.test.tsx`, `BoardPage.test.tsx` | 237 frontend | `7099e97` |

### Key Components

**`WorkflowService`** (`backend/src/services/workflow.service.ts`): 189 lines. `applyBoardRules` → `executeRule1StaleMove` via `Promise.allSettled`. `triggerDoneColorRule` → always-resolves, manual retry loop. Named constants: `STALE_RULE_ID`, `DONE_COLOR_RULE_ID`, `DONE_COLOR_HEX`.

**`WorkflowRepository`** (`backend/src/repositories/workflow.repository.ts`): `insertTrigger` (RETURNING id), `insertDelivery` (RETURNING id), `updateDeliveryStatus`, `findStaleCards` (parameterized SQL), `moveCardToStale` (parameterized UPDATE), `setCardColor` (parameterized UPDATE).

**`retryWithBackoff<T>`** (`backend/src/utils/retry.ts`): Generic retry utility with exponential backoff. Ships a Node 26 pre-rejection guard (no-op `.catch()` synchronously attached to the outer promise) to prevent `UnhandledPromiseRejectionWarning` when tested with Jest fake timers.

**Migration `20260628120000_add-workflow-foundation.js`**: Adds `stale_suppressed boolean NOT NULL DEFAULT false` to `cards`; creates `workflow_rule_triggers` and `workflow_action_deliveries`; seeds Stale column at position 3; updates Done to position 4; backfills Stale column for existing boards.

### Technical Specifications

**Config variables** (12-factor, all in `config.ts` with defaults):
| Variable | Default | Purpose |
|----------|---------|---------|
| `WORKFLOW_STALE_AGE_DAYS` | 2 | Days before a card becomes stale |
| `WORKFLOW_RULE2_BASE_DELAY_MS` | 200 | Base delay for Rule #2 exponential backoff |
| `WORKFLOW_RULE2_MAX_ATTEMPTS` | 3 | Max retry attempts for Rule #2 |

**Error shape** (all workflow errors):
```typescript
{ code: 'WORKFLOW_ACTION_FAILED', message: string, details: Array<{ field: string; error: string }> }
```
Implemented via `WorkflowError extends AppError` with `details` field; `errorHandler` duck-types `'details' in err` to serialize.

**Stale column constants**: `DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Stale', 'Done']` in `board.repository.ts`.

## Testing

### Strategy
Balanced approach: unit tests for rule logic (config-driven thresholds, always-resolves contract, retry exhaustion), integration tests for DB tracking tables and API response shape, frontend unit tests for optimistic update and type contract.

### Results

| Phase | Test Type | Count | Result |
|-------|-----------|-------|--------|
| Phase 1 | Backend unit (migration, retry utility) | ~30 | ✅ Pass |
| Phase 2 | Backend integration (Rule #1, board GET warnings) | 193 | ✅ Pass |
| Phase 3 | Backend integration (Rule #2, retry harness) | 223 | ✅ Pass |
| Phase 4 | Frontend unit (types, hooks, page parsing) | 237 | ✅ Pass |
| **Total** | | **460** | **✅ 460/460 Pass** |

### Notable Test Patterns
- `retryWithBackoff` tests use `jest.useFakeTimers()` + `jest.runAllTimersAsync()` + the pre-rejection guard pattern (documented in `retry.ts`)
- `WorkflowService.triggerDoneColorRule` tests verify the always-resolves contract by asserting the promise resolves even when all DB operations throw
- Frontend type tests (`workflowWarning.test.ts`) verify the `{ code, message, details? }` shape matches the backend contract

### Coverage Gap
`frontend/e2e/workflow.spec.ts` was committed with TypeScript clean but was not executed against a running stack. The spec covers Stale column visibility, done-color appearance, and stale suppression flows. Completion of `/banyan-uat` would verify these paths in a real browser.

## Deployment

### Procedures
1. `docker compose up --build` in the FEAT-014 worktree
2. Knex migrations run automatically on API startup (`knex.migrate.latest()`)
3. Migration backfills existing boards with a Stale column — safe to run against existing data

### Configuration
Add these environment variables for non-default tuning (optional — defaults are appropriate for MVP):
```
WORKFLOW_STALE_AGE_DAYS=2
WORKFLOW_RULE2_BASE_DELAY_MS=200
WORKFLOW_RULE2_MAX_ATTEMPTS=3
```

### Rollback
To roll back: run `knex migrate:rollback` which executes the `down()` function in `20260628120000_add-workflow-foundation.js`. The `down()` drops `workflow_rule_triggers`, `workflow_action_deliveries`, removes `stale_suppressed` from `cards`, and removes Stale columns inserted by the migration. **Note**: Existing boards that had Stale columns added by the migration will have them removed; cards currently in Stale will be orphaned (their `column_id` will reference a deleted column). Ensure all stale cards are manually moved before rollback in a production environment.

## Maintenance

### Monitoring
Key log events to watch (all pino JSON format):
- `workflow.rule1.stale_move_failed` — stale-move failure for a specific card (warn level)
- `workflow.rule2.trigger_failed` — done-color rule async trigger failed (warn level, fire-and-forget catch)
- `workflow.rule2.tracking_failed` — tracking write failed after rule execution (error level)

Query the audit tables to diagnose rule failures:
```sql
-- Rule #2 failures in last 24h
SELECT t.id, t.card_id, t.trigger_error, t.triggered_at,
       count(d.id) AS attempt_count
FROM workflow_rule_triggers t
LEFT JOIN workflow_action_deliveries d ON d.trigger_id = t.id
WHERE t.rule_id = 'done-color' AND t.trigger_status = 'failed'
  AND t.triggered_at > now() - interval '24 hours'
GROUP BY t.id, t.card_id, t.trigger_error, t.triggered_at;
```

### Common Issues

| Issue | Resolution |
|-------|------------|
| Cards not auto-moving to Stale | Check `WORKFLOW_STALE_AGE_DAYS` env var; check `cards.stale_suppressed` flag |
| Done cards not turning green | Check `workflow_rule_triggers` for the card; check `WORKFLOW_RULE2_MAX_ATTEMPTS` |
| `warnings[]` appearing on every board load | Check `workflow_rule_triggers` for repeated failures; likely a DB connectivity issue |
| Stale suppression not persisting | `CardRepository.setSuppressed` failure is best-effort; check warn logs for the error |

### Operational Procedures
- Stale age threshold adjustable at runtime via `WORKFLOW_STALE_AGE_DAYS` (requires API restart)
- Retry tuning via `WORKFLOW_RULE2_BASE_DELAY_MS` and `WORKFLOW_RULE2_MAX_ATTEMPTS` (requires API restart)
- Audit tables grow unbounded — add a periodic cleanup job if table size becomes a concern at scale

## Lessons Learned

### What Went Well
- **4-phase decomposition matched architectural layers exactly** — DB → service → async rule → frontend. Each phase had a clear scope boundary and produced a complete, testable increment.
- **Code review agent stopped 2 blocking issues in Phase 2** — SQL in service layer and missing `RETURNING id` caught before commit. Zero blocking issues in Phases 3 and 4.
- **Creative phase was load-bearing** — `Promise.allSettled` approach, DI pattern, `warnings[]` additive shape, and name-match column resolution were all specified precisely in the architecture creative and followed exactly in the build.
- **Configuration-driven thresholds** — all rule parameters are environment variables with sensible defaults, consistent with 12-factor.

### Challenges
- **Node 26 + Jest 29 fake timer pre-rejection guard** — 5 test iteration cycles to resolve `UnhandledPromiseRejectionWarning` in `retryWithBackoff` tests. Solution: `outerPromise` wrapper + synchronous no-op `.catch()`. Documented in `retry.ts`.
- **Test Writer invented wrong `WorkflowWarning` shape (Phase 4)** — Agent asserted `{ code, message, severity }` instead of `{ code, message, details? }`. Caught and corrected before commit.
- **Code review catch: `trigger_error` null on exhaustion** — Initial Phase 3 implementation left `trigger_error` null even when all retries failed. Fixed by carrying `deliveries.at(-1)?.delivery_error`.

### Key Learnings (Extracted to _learned/)
- Before writing frontend type tests, read the backend type definition — do not infer the shape from context alone.
- When a creative phase specifies a retry utility with per-attempt side effects, annotate in the creative doc that a manual loop is required.
- Populate `trigger_error` from the last delivery's error on exhaustion — makes the trigger table self-sufficient for root-cause diagnosis.
- Mark additive response fields as optional (`warnings?`) so existing consumers compile without changes.

Reference: `memory-bank/reflection/reflection-TASK-017.md`

## Technical Debt & Future Work
- **Frontend E2E spec unverified**: `frontend/e2e/workflow.spec.ts` committed without live-stack Playwright execution. Run `/banyan-uat` to verify.
- **`retryWithBackoff` not used by Rule #2**: Available for future rules that don't need per-attempt delivery rows.
- **Stale suppression race condition**: Concurrent board loads by two users produce duplicate trigger rows for the same card. Idempotent card position; acceptable at MVP scale.
- **`warnings[]` not rendered in UI**: Parsed into TypeScript type but not displayed. Architecture supports adding a developer overlay or admin panel without data model changes.
- **Metrics observability gap**: The creative phase specified Prometheus counters for rule execution. Not implemented in any build phase. Add in a future NFR task.
- **Audit table growth**: No cleanup job for `workflow_rule_triggers`/`workflow_action_deliveries`. Add periodic purge at scale.

## References
- **Reflection**: `memory-bank/reflection/reflection-TASK-017.md`
- **Architecture Creative**: `memory-bank/creative/TASK-017-workflow-automation-architecture.md`
- **UI/UX Creative**: `memory-bank/creative/TASK-017-workflow-automation-uiux.md`
- **Progress Log**: `memory-bank/progress.md`
- **Learned Rules**: `memory-bank/agent-rules/_learned/architecture-foundation.md`, `error-handling.md`, `testing-patterns.md`, `api-design.md`
