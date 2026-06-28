# TASK-017: Workflow Automation

**Complexity**: Level 4
**Status**: REFLECTION_COMPLETE
**Reflection**: memory-bank/reflection/reflection-TASK-017.md
**Roadmap**: FEAT-014
**Roadmap Link**: FEAT-014
**Branch**: feature/FEAT-014-workflow-automation
**Worktree**: .clone-worktrees/FEAT-014

## Task Description

Add trigger-action workflow automation that applies to all cards on every board.

**Core model**: trigger → action. Two built-in rules apply to all cards:

1. **Stale rule** — On board display, for each card not in the "Done" column, calculate how many days old the card is (using `cards.created_at`, which already exists). If a card is ≥ 2 calendar days old, move it to the "Stale" column. A new "Stale" column is added to the left of "Done" (order: To Do → In Progress → Stale → Done). If a user manually moves a card out of Stale, the rule no longer applies to that card (`stale_suppressed` flag wins permanently). Rule failures do not block board load — they are returned as a `warnings[]` array in the board response body.

2. **Done-color rule** — When a user moves a card to the Done column, set the card's background `color` column to pale green asynchronously within 2 seconds after the move commits. The card move HTTP response is not delayed. Rule failure does not block or roll back the card move. Action is retried up to 3 times on failure.

**Rule engine tracking**: trigger execution and action delivery are stored in separate tables (`workflow_rule_triggers`, `workflow_action_deliveries`). Delivery status is tracked independently from trigger status.

**Error shape** for all workflow errors: `{ code, message, details: [{ field, error }] }` (extends existing AppError pattern).

**Interview answers captured**:
- "Label color" = card background `color` column (not label badges)
- "Webhook delivery" = internal retry for rule actions; no external HTTP calls
- Rule #1 failure = board loads normally, failures in `warnings[]` body field
- Stale suppression = user move wins permanently via `stale_suppressed boolean` on cards

**Note**: `cards.created_at` already exists in the DB schema — no new migration required for requirement #2.

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Dev Team Lead / Individual Developer — small team member who opens the board to track card progress and see stale work at a glance
**Creative Exploration Needed**: Yes — workflow engine architecture, rule execution strategy (sync vs. async), retry harness design, stale-suppression UX

### Invocation Method

- **Stale Rule**: Triggered automatically on every `GET /boards/:boardId` request. No user action required. The rule evaluation and card moves happen server-side before the board response is returned.
- **Done-Color Rule**: Triggered automatically when user drags a card to the Done column (via the existing `PATCH /cards/:id/move` endpoint). No user action required beyond the card move.
- **Location**: Board screen (`/boards/:boardId`) — the kanban board with card columns.
- **Visibility**: Effects are always visible — stale cards appear in the Stale column, done cards turn pale green. No UI control to enable/disable rules in this version.
- **Confidence**: HIGH for trigger points (existing endpoints confirmed). MEDIUM for rule engine architecture (design decisions needed in creative phase).

### Success Criteria

- **Stale rule success**: User opens a board. Cards that are ≥ 2 days old and not in Done appear in the "Stale" column (which is left of Done). Cards < 2 days old or in Done are unaffected. If a user drags a card out of Stale, it stays where they put it on subsequent board loads.
- **Done-color rule success**: User drags a card to Done. Within 2 seconds, the card's background turns pale green (the pale green hex from the CardColorPicker palette, `#d4edda` if not already present). The card move itself completes immediately — pale green appears as a near-instant follow-up.
- **Verifiable at**: Board screen `/boards/:boardId`; also verifiable via `GET /boards/:boardId` response (Stale column present, card positions), and `cards.color` column in DB for done cards.
- **Data persisted**: `cards.column_id` (stale rule moves), `cards.color` (done-color rule), `cards.stale_suppressed` (user override flag), `workflow_rule_triggers`, `workflow_action_deliveries` (rule tracking).

### Acceptance Criteria

#### AC-STALE-COL-1: Stale column exists on new boards
**Priority**: MUST
**Given** a logged-in user creates a new board via `POST /boards`
**When** the board creation seeding runs
**Then**:
1. The board has exactly four columns: "To Do" (position 1), "In Progress" (position 2), "Stale" (position 3), "Done" (position 4)
2. `GET /boards/:boardId` returns all four columns in position order
3. The Stale column is rendered between "In Progress" and "Done" on the board screen

**Verification**: Integration test on `POST /boards` → GET response; E2E renders all four column headers.

#### AC-STALE-COL-2: Existing boards get Stale column via migration
**Priority**: MUST
**Given** an existing board created before this migration has three columns (To Do, In Progress, Done) with their existing cards
**When** the database migration runs (`migrations/YYYYMMDDHHMMSS_add-stale-column.js`)
**Then**:
1. A "Stale" column is inserted with position 3 for every existing board
2. The "Done" column position is updated from 3 to 4
3. No cards are lost or repositioned
4. `GET /boards/:boardId` returns all four columns for existing boards

**Verification**: Migration integration test; verify column count before and after; verify card counts unchanged.

#### AC-ENTRY-1: Board screen shows four columns including Stale
**Priority**: MUST
**Given** a logged-in user navigates to `/boards/:boardId`
**When** the board page renders
**Then**:
1. Four column headers are visible: "To Do", "In Progress", "Stale", "Done" (left to right)
2. The Stale column accepts card drops (drag-and-drop works)
3. Loading state (`<LoadingSpinner>`) is shown while board data fetches; it disappears once columns render

**Verification**: E2E `expect(page.locator('[data-column-name="Stale"]')).toBeVisible()`.

#### AC-HAPPY-1: Stale rule moves old cards to Stale column on board load
**Priority**: MUST
**Given**:
- Board has card "Old Task" in "To Do" column with `created_at` = 3 days ago (i.e., `NOW() - INTERVAL '3 days'`)
- Card has `stale_suppressed = false`
- User navigates to `/boards/:boardId`
**When** the board loads (`GET /boards/:boardId` is processed)
**Then**:
1. The WorkflowService applies Rule #1 before responding
2. "Old Task" `column_id` is updated to the Stale column's ID in the DB
3. A `workflow_rule_triggers` row is inserted: `{ rule_id: 'stale-rule', board_id, card_id: <Old Task id>, trigger_status: 'success' }`
4. A `workflow_action_deliveries` row is inserted: `{ trigger_id, attempt: 1, delivery_status: 'success' }`
5. The board response includes "Old Task" in the Stale column (not To Do)
6. The Stale column on the board screen shows "Old Task" without page reload

**Verification**: Seed card with old `created_at`, load board, assert card appears in Stale column and DB `column_id` matches Stale column; assert tracking rows exist.

#### AC-HAPPY-2: Cards < 2 days old are not moved to Stale
**Priority**: MUST
**Given** board has card "New Task" in "To Do" with `created_at` = 1 day ago
**When** the board loads
**Then** "New Task" remains in "To Do"; no `workflow_rule_triggers` row is created for this card

**Verification**: Seed card with `NOW() - INTERVAL '1 day'`, load board, assert "New Task" stays in "To Do".

#### AC-HAPPY-3: Cards in Done are not moved to Stale
**Priority**: MUST
**Given** board has card "Done Task" in "Done" column with `created_at` = 5 days ago
**When** the board loads
**Then** "Done Task" remains in "Done"; Rule #1 is not applied to it

**Verification**: Seed old card in Done column, load board, assert position unchanged.

#### AC-HAPPY-4: Done-color rule turns moved card pale green
**Priority**: MUST
**Given**:
- Board has card "Fix Bug" in "In Progress" column
- User drags "Fix Bug" to "Done" column (triggers `PATCH /cards/:id/move` with `toColumnId = <Done column id>`)
**When** the card move completes (HTTP 200 returned)
**Then**:
1. The card move returns HTTP 200 immediately (not delayed by rule execution)
2. Within 2 seconds, `cards.color` is updated to `#d4edda` (pale green) in the DB
3. Within 2 seconds, the "Fix Bug" card on the board screen shows a pale green background (either via optimistic update or board data refresh)
4. A `workflow_rule_triggers` row is inserted: `{ rule_id: 'done-color-rule', board_id, card_id, trigger_status: 'success' }`
5. A `workflow_action_deliveries` row is inserted: `{ trigger_id, attempt: 1, delivery_status: 'success' }`

**Verification**: E2E — move card to Done, assert card background color changes to `#d4edda` within 2 seconds; assert DB `cards.color = '#d4edda'`; assert tracking rows exist.

#### AC-ASYNC-1: Frontend shows optimistic color update on Done move
**Priority**: MUST
**Given** a user drags card "Fix Bug" to "Done"
**When** the `PATCH /cards/:id/move` request is in-flight
**Then**:
1. The card moves visually to "Done" immediately (optimistic update — existing behavior)
2. The card's color is set to `#d4edda` client-side immediately (optimistic color update)
3. If the Done-color rule action ultimately fails (after 3 retries), the card color reverts to its previous value on the next board data refresh (TanStack Query invalidation)

**Verification**: Mock a slow card-move response; assert optimistic color appears immediately; simulate rule failure (via server error injection), refresh board, assert color reverted.

#### AC-STALE-SUPPRESS-1: User move out of Stale suppresses re-staling
**Priority**: MUST
**Given**:
- Card "Old Task" (created 3 days ago) was moved to Stale by Rule #1
- User drags "Old Task" from Stale back to "In Progress" (triggers `PATCH /cards/:id/move` with `fromColumnId = <Stale id>`)
**When** the user subsequently reloads the board (next `GET /boards/:boardId`)
**Then**:
1. The move request sets `cards.stale_suppressed = true` for "Old Task"
2. Rule #1 does NOT move "Old Task" to Stale on the next board load
3. "Old Task" remains in "In Progress"

**Verification**: Move card out of Stale via API, assert `stale_suppressed = true` in DB, load board again, assert card stays in "In Progress".

#### AC-ASYNC-2: Board loading state visible during fetch
**Priority**: MUST
**Given** user navigates to `/boards/:boardId`
**When** the board data is loading (network request in-flight)
**Then** a loading indicator (`<LoadingSpinner>` or skeleton) is visible; columns and cards are not rendered until data arrives

**Verification**: Playwright — throttle network, assert loading indicator visible; assert columns appear after data loads.

#### AC-ERROR-1: Stale-rule move failure returned in board warnings
**Priority**: MUST
**Given** the database raises an error when WorkflowService attempts to move card "Old Task" to Stale (e.g., DB constraint violation)
**When** `GET /boards/:boardId` is called
**Then**:
1. HTTP 200 is returned (board loads normally)
2. Response body includes `warnings: [{ code: "WORKFLOW_ACTION_FAILED", message: "Stale rule failed for card <id>", details: [{ field: "column_id", error: "<db error message>" }] }]`
3. Board data (other columns and cards) is present and correct
4. A `workflow_rule_triggers` row is inserted with `trigger_status: 'failed'`, `trigger_error: <db error>`
5. A `workflow_action_deliveries` row is inserted with `delivery_status: 'failed'`, `delivery_error: <db error>`

**Verification**: Inject DB failure for stale-move; assert 200 response with `warnings` array; assert `trigger_status = 'failed'` in DB.

#### AC-ERROR-2: Done-color rule failure does not block card move
**Priority**: MUST
**Given** the Done-color rule action fails (DB write to `cards.color` raises an error) after all 3 retry attempts
**When** user moves card to Done
**Then**:
1. `PATCH /cards/:id/move` returns HTTP 200 (card is in Done)
2. The card's `color` remains its previous value (not `#d4edda`)
3. `workflow_action_deliveries` has 3 rows for this trigger: attempt 1, 2, 3 all with `delivery_status: 'failed'`
4. `workflow_rule_triggers` row has `trigger_status: 'failed'`
5. No error is shown to the user in the UI (failure is silent from user perspective)
6. Card color on board screen reverts to previous value on next board data refresh (TanStack Query invalidation resolves optimistic update)

**Verification**: Inject DB failure for color update; move card to Done; assert 200; assert 3 delivery rows with failed status; assert card color unchanged in DB.

#### AC-ERROR-3: Invalid board ID returns structured error
**Priority**: MUST
**Given** caller sends `GET /boards/not-a-uuid/`
**When** request is processed
**Then**: HTTP 400, body `{ code: "VALIDATION_ERROR", message: "Invalid board ID", details: [{ field: "boardId", error: "must be a valid UUID" }] }`

**Verification**: Integration test with invalid UUID.

#### AC-ERROR-4: Board not found returns structured error
**Priority**: MUST
**Given** caller sends `GET /boards/<valid-uuid-that-doesn't-exist>`
**When** request is processed
**Then**: HTTP 404, body `{ code: "NOT_FOUND", message: "Board not found", details: [] }`

**Verification**: Integration test with nonexistent board UUID.

### Scope Boundaries

**In scope**:
- Add Stale column (seed + migration)
- `stale_suppressed` boolean on cards (migration)
- WorkflowService with Rule #1 (stale) and Rule #2 (done-color)
- Async retry harness for action delivery (up to 3 retries)
- `workflow_rule_triggers` and `workflow_action_deliveries` tracking tables (migration)
- `warnings[]` field in board GET response
- Frontend: Stale column rendering, optimistic pale green on Done move, rollback on failure
- Pale green hex `#d4edda` added to CardColorPicker palette if not already present

**Out of scope**:
- User-configurable workflow rules (hard-coded rules only)
- Rule enable/disable toggle
- External webhook delivery (no outbound HTTP calls)
- Rule scheduling (timer-based execution) — rules fire on board load or card move only
- Notification UI for rule failures
- Rule audit log UI

**Dependencies**:
- Existing `PATCH /cards/:id/move` endpoint
- Existing `GET /boards/:boardId` endpoint
- Existing `CardColorPicker` palette
- `cards.created_at` (already present)

**NFR implications**:
- Board load latency: stale rule evaluation must complete within 500ms for typical boards (≤ 100 cards). If rule evaluation degrades board load past 500ms, it must be made async (results cached or deferred).
- Retry delay: Rule #2 retries use exponential backoff: attempt 1 immediately, attempt 2 after 1s, attempt 3 after 3s. All within the "within 2 seconds" window for attempt 1; overall retry window ≤ 10 seconds.

## Test Strategy

### Approach
- **Emphasis**: Balanced — unit tests for WorkflowService rule logic, integration tests for new DB tables and board GET response, E2E tests for stale column visibility and done-color optimistic update
- **Target test count**: 24–32 total across all phases

### File Organization
- **New test files**:
  - `backend/src/workflow/__tests__/workflow.service.test.ts` — Rule #1 and #2 logic, stale suppression, retry harness
  - `backend/src/workflow/__tests__/workflow-deliveries.repository.test.ts` — DB tracking tables
  - `frontend/e2e/workflow.spec.ts` — Stale column visibility, done-color appearance, suppression
- **Extend existing**:
  - `backend/src/cards/__tests__/cards.routes.test.ts` — PATCH /cards/:id/move with Done-color rule side effect
  - `backend/src/boards/__tests__/boards.routes.test.ts` — GET /boards/:boardId warnings field

### What NOT to Test
- Pale green hex value visually — CSS pixel comparison; assert `background-color` style attribute instead
- TanStack Query invalidation internals — framework behavior, not our code
- DB migration SQL correctness — covered by running migration against real test DB

### Per-Phase Test Guidance
- Phase 1 (DB + column seeding): 6 tests — Stale column in new board seed, migration adds Stale to existing boards, stale_suppressed default false, workflow tables exist with correct FK constraints
- Phase 2 (WorkflowService + board GET): 10 tests — Rule #1 fires for old cards, skips young cards, skips Done cards, skips suppressed cards, inserts trigger+delivery rows, warnings returned on failure
- Phase 3 (Rule #2 + retry harness): 8 tests — Rule #2 fires async, sets color, retries up to 3x on failure, delivery rows count correct, card move not blocked
- Phase 4 (Frontend): 8 tests — Stale column renders, loading spinner, optimistic color update, rollback on failure, suppression after drag out of Stale

## Architectural Plan

### Business Context

BanyanBoard's primary persona (Dev Team Lead, Individual Developer) needs to keep the board clean and actionable. Two pain points drive this feature:
1. **Stale cards accumulate** — cards sitting in To Do or In Progress for days are a signal of blocked or forgotten work. Making them visually distinct (Stale column) surfaces the problem without manual triage.
2. **Closing a card should feel rewarding** — a subtle visual change (pale green) when a card reaches Done creates positive feedback and makes "done" state easy to scan.

### Vision and Goals

- **Vision**: Boards that self-organize around work health — stale work surfaces automatically, completed work is visually distinct.
- **Goals**:
  - Rule #1 fires within 200ms overhead on board load for boards with ≤ 100 cards
  - Rule #2 color change appears within 2 seconds of card reaching Done
  - Zero card data loss from rule execution (rule failures are logged and surfaced, not silently corrupt)
  - Architecture extensible to future rules without touching rule execution harness

### Architectural Principles

1. **Rules are services, not middleware** — `WorkflowService` owns all rule logic; routes and existing services call it; no rule logic in route handlers or repositories
2. **Fire-and-forget for async rules** — Rule #2 follows the same `try/catch`-and-log pattern already used by `EventService` in `CardService.moveCard` (lines 98-112 of `card.service.ts`); no promise chaining on the HTTP response
3. **WorkflowService is an optional constructor injection** — follows `EventService` pattern; `createRouter` constructs it and passes it to `BoardService` and `CardService`; absent in tests that don't need it
4. **Stale column looked up from board data, not re-queried** — `findBoardById` already returns all columns; `WorkflowService.applyBoardRules` receives the `columns` array and derives Stale/Done column IDs without an extra DB query
5. **`warnings` is an additive response field** — `GET /boards/:boardId` response changes from `BoardWithColumns` to `{ ...board, warnings?: WorkflowWarning[] }`; existing consumers that don't read `warnings` are unaffected
6. **Stale suppression via source column at move time** — `CardService.moveCard` already fetches `existingCard` (line 68); when `existingCard.column_id === staleColumnId`, set `stale_suppressed = true` on the DB update; no separate mechanism required
7. **New error shape extends, not replaces, AppError** — Add a `WorkflowError` class that carries `details: Array<{field: string; error: string}>`. The `errorHandler` already serializes `AppError.code`; extend it to include `details` when present.

### API Requirements

**Modified endpoints:**

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/boards/:boardId` | Response shape: `BoardWithColumns & { warnings?: WorkflowWarning[] }` |
| `PATCH` | `/cards/:id/move` | Side effect: when target is Done column, fire Rule #2 async |

**No new HTTP endpoints** — rule execution is a side effect of existing endpoints.

**New response type** (TypeScript, `board.repository.ts` or new `workflow.types.ts`):
```typescript
interface WorkflowWarning {
  code: 'WORKFLOW_ACTION_FAILED';
  message: string;
  details: Array<{ field: string; error: string }>;
}

interface BoardWithColumnsAndWarnings extends BoardWithColumns {
  warnings?: WorkflowWarning[];
}
```

**New `WorkflowError` class** (extends `AppError`, `errors.ts`):
```typescript
export class WorkflowError extends AppError {
  constructor(
    message: string,
    public readonly details: Array<{ field: string; error: string }> = [],
  ) { super(400, 'WORKFLOW_ACTION_FAILED', message); }
}
```
`errorHandler` middleware extended to serialize `details` when present on any `AppError`.

### New DB Tables (via migrations)

```sql
-- workflow_rule_triggers
CREATE TABLE workflow_rule_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id varchar NOT NULL,
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE,
  card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  trigger_status varchar NOT NULL CHECK (trigger_status IN ('success', 'failed')),
  trigger_error text
);

-- workflow_action_deliveries
CREATE TABLE workflow_action_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES workflow_rule_triggers(id) ON DELETE CASCADE,
  attempt int NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  delivery_status varchar NOT NULL CHECK (delivery_status IN ('pending', 'success', 'failed')),
  delivery_error text
);
```

### New DB Column (migration)

```sql
-- On cards table
ALTER TABLE cards ADD COLUMN stale_suppressed boolean NOT NULL DEFAULT false;
```

### WorkflowService Design

```
WorkflowService(db: Queryable)
  ├─ applyBoardRules(boardId, columns, cards?): Promise<WorkflowWarning[]>
  │    └─ executeRule1Stale(boardId, columns, cards)
  │         ├─ findStaleCandidates(): SELECT id, column_id FROM cards WHERE board_id = $1
  │         │    AND column_id != <Done id> AND stale_suppressed = false
  │         │    AND created_at < NOW() - INTERVAL '2 days'
  │         └─ moveToStale(cardId, staleColumnId): UPDATE cards SET column_id = $1 WHERE id = $2
  │              → inserts workflow_rule_triggers + workflow_action_deliveries rows
  │              → on failure: returns WorkflowWarning (does not throw)
  │
  └─ triggerDoneColorRule(boardId, cardId): Promise<void>  [async, fire-and-forget]
       └─ executeRule2DoneColor(cardId): UPDATE cards SET color = '#d4edda' WHERE id = $1
            → inserts workflow_rule_triggers + workflow_action_deliveries rows
            → on failure: retries up to 3x (attempt 1: immediate, 2: 1s, 3: 3s)
            → failure after 3x: logs warn, updates final delivery row to failed
```

**WorkflowRepository** (new, `workflow.repository.ts`):
- `insertTrigger(trigger): Promise<WorkflowTriggerRow>`
- `insertDelivery(delivery): Promise<WorkflowDeliveryRow>`
- `updateDeliveryStatus(id, status, error?): Promise<void>`

### Integration Points

**`BoardService`** — receives optional `WorkflowService` injection:
```typescript
class BoardService {
  constructor(
    private readonly repo: BoardRepository,
    private readonly workflowService?: WorkflowService,
  ) {}

  async getBoardById(id: string): Promise<BoardWithColumnsAndWarnings> {
    const board = await this.repo.findBoardById(id);
    if (!this.workflowService) return board;
    const warnings = await this.workflowService.applyBoardRules(board.id, board.columns);
    return warnings.length > 0 ? { ...board, warnings } : board;
  }
}
```

**`CardService.moveCard`** — receives optional `WorkflowService` injection; after DB move:
```typescript
// After: const card = await this.repo.moveCard(id, columnId, newPosition);
if (this.workflowService && isDoneColumn) {
  // fire-and-forget — no await, no throw
  this.workflowService.triggerDoneColorRule(boardId, card.id).catch((err) => {
    logger.warn({ err, cardId: card.id }, 'workflow.rule2.trigger_failed');
  });
}
```

**`createBoardsRouter`** — receives `WorkflowService?` and passes it to `BoardService`:
```typescript
export function createBoardsRouter(db: Queryable, workflowService?: WorkflowService): Router {
  const repo = new BoardRepository(db);
  const service = new BoardService(repo, workflowService);
  ...
}
```

**`createRouter`** — constructs `WorkflowService` and passes to relevant routers:
```typescript
const workflowService = new WorkflowService(db);
router.use('/boards', createBoardsRouter(db, workflowService));
router.use('/cards', createCardsRouter(db, eventService, workflowService));
```

### Observability Requirements

All workflow observability uses the existing pino logger (`req.log` in routes, `logger` module-level). No new observability infrastructure.

| Event | Level | Fields | Pattern |
|-------|-------|--------|---------|
| Rule #1 fires for a card | `info` | `{ rule: 'stale-rule', boardId, cardId, trigger_status }` | per-card |
| Rule #2 fires | `info` | `{ rule: 'done-color-rule', boardId, cardId, attempt }` | per-attempt |
| Rule action fails | `warn` | `{ rule, boardId, cardId, attempt, err }` | |
| Rule #2 exhausted retries | `error` | `{ rule: 'done-color-rule', boardId, cardId, finalAttempt: 3 }` | |

No new environment variables. No new metrics or tracing spans (single Express app, no distributed boundaries).

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Board load latency from Rule #1 (many stale cards) | Medium | High | Query EXPLAIN; add index on `cards(column_id, created_at, stale_suppressed)`; 500ms SLA enforced in AC |
| Stale rule race: two users load board simultaneously, double-move a card | Low | Low | DB UPDATE is idempotent (card already in Stale → UPDATE is no-op, position unchanged) |
| Rule #2 retry storms if DB is down | Low | Medium | Exponential backoff caps total retry window at ~4 seconds; 3-attempt limit is hard cap |
| `stale_suppressed` flag not reset after card moves to Done | Low | Low | Does not need reset: Done cards are excluded from Rule #1 regardless of flag |
| Creative phase decision invalidates phases 2–4 | Medium | Medium | Creative phase is Phase 0 (before build); phases 2–4 depend on creative output |

## Implementation Roadmap

#### [x] Phase 1: DB Foundation
**Scope**: Stale column seeding + migration, `stale_suppressed` flag, workflow tracking tables, pale green in CardColorPicker

- Update `DEFAULT_COLUMNS` in `board.repository.ts` line 29: `['To Do', 'In Progress', 'Stale', 'Done']`
- Migration: add Stale column (position 3) to all existing boards, update Done to position 4
- Migration: `ALTER TABLE cards ADD COLUMN stale_suppressed boolean NOT NULL DEFAULT false`
- Migration: create `workflow_rule_triggers` and `workflow_action_deliveries` tables
- Add `WorkflowError` class to `errors.ts`; extend `errorHandler` to serialize `details`
- Add `#d4edda` (pale green) to `CardColorPicker` swatch palette if absent

**Milestone**: All migrations run cleanly; `POST /boards` returns 4 columns; `GET /boards/:boardId` shows 4 columns for existing boards.

**Verification gate**: `npm test` backend passes; existing board route tests still pass; column count assertions updated.

#### [x] Phase 2: WorkflowService + Rule #1 + Board GET Integration
**Scope**: `WorkflowService`, `WorkflowRepository`, Rule #1 stale-move logic, stale suppression on card move, `warnings[]` in board GET response

- Create `backend/src/workflow/workflow.repository.ts` (insertTrigger, insertDelivery, updateDeliveryStatus)
- Create `backend/src/services/workflow.service.ts` (applyBoardRules, executeRule1Stale)
- Extend `BoardService` to accept optional `WorkflowService`; call `applyBoardRules` in `getBoardById`
- Extend `CardService.moveCard` to detect source = Stale → set `stale_suppressed = true` on card
- Extend `createBoardsRouter` to accept and pass `WorkflowService`
- Extend `createRouter` to construct and inject `WorkflowService`
- Index on `cards(column_id, created_at, stale_suppressed)` (add to migration)

**Milestone**: `GET /boards/:boardId` moves stale cards and returns `warnings` on failure; user move out of Stale suppresses re-staling on next load.

**Verification gate**: Unit tests for `WorkflowService` rule logic; integration test on `GET /boards/:boardId` with old card → assert moved to Stale + tracking rows inserted.

#### [x] Phase 3: Rule #2 + Async Retry Harness
**Scope**: Done-color rule, async fire-and-forget, exponential backoff retry, delivery tracking

- Add `triggerDoneColorRule` to `WorkflowService` (async, retry harness)
- Extend `CardService.moveCard` to call `workflowService?.triggerDoneColorRule` when target = Done column
- Retry harness: attempt 1 immediate, attempt 2 after 1000ms, attempt 3 after 3000ms (via `setTimeout`-wrapped Promises)
- Each attempt inserts a `workflow_action_deliveries` row with final status

**Milestone**: Move card to Done → color updates to `#d4edda` in DB within 2s; 3 delivery rows on failure scenario.

**Verification gate**: Unit tests for retry harness; integration test: move card to Done, wait 2s, assert `cards.color = '#d4edda'`; inject DB failure, assert 3 delivery rows with `delivery_status = 'failed'`.

#### [x] Phase 4: Frontend
**Scope**: Stale column render, optimistic pale green on Done move, rollback on failure, loading states

- Stale column renders between In Progress and Done (no new frontend column config needed — columns come from API)
- Accept card drops into Stale column (existing dnd-kit setup handles any column)
- Optimistic update: when card dragged to Done, immediately apply `color: '#d4edda'` to card in TanStack Query cache before PATCH response
- Rollback: TanStack Query invalidation on mutation settle restores server truth if rule ultimately failed
- Loading state: confirm `<LoadingSpinner>` shown during initial board fetch (existing pattern)
- Parse new `warnings` field from board GET response (no UI toast for now — field is available for future use)

**Milestone**: Stale column visible and accepts drops; Done cards turn pale green within 2s; optimistic color visible immediately on drag.

**Verification gate**: E2E `workflow.spec.ts` — Stale column visible, old card appears in Stale after board load, Done card turns pale green.

## Creative Phases

- [x] Architecture Design — Promise.allSettled Rule #1, retryWithBackoff utility Rule #2, name-match column resolution, parallel source column query for stale suppression, best-effort tracking writes → `memory-bank/creative/TASK-017-workflow-automation-architecture.md`
- [x] UI/UX Design — Amber header + ⏰ icon on Stale column, immediate optimistic #d4edda on Done move via onMutate, silent rollback, warnings[] parsed but not rendered → `memory-bank/creative/TASK-017-workflow-automation-uiux.md`

---

## Execution State

**Build Status**: IDLE
**Current Phase**: REFLECT → ARCHIVE
**Can Resume**: NO

### Current Build Step
**Step**: Step 5 - Report Completion
**Status**: COMPLETE

### Active Sub-Agents
(none)

### Completed Steps
- Step 0: Task provisioned from FEAT-014
- Step 0.5 Git Setup: COMPLETE — worktree created at .clone-worktrees/FEAT-014, branch feature/FEAT-014-workflow-automation
- Step 1 Read Task Context: COMPLETE — Phase 1: DB Foundation identified (1 of 4)
- Step 2 Load Context: COMPLETE — Level 4 rules + architecture creative doc loaded; cards.color already exists, skip in migration
- Step 2 Roadmap feature link confirmed (FEAT-014)
- Step 3: Specification generated (inline — rich description from roadmap + interview answers captured in /banyan-roadmap)
- Step 4: Codebase analyzed — board.repository.ts, card.service.ts, cards.ts, boards.ts, routes/index.ts, errors.ts
- Step 5: Level 4 architectural plan written — WorkflowService DI pattern, API contract, DB schema, 4-phase roadmap
- Step 6: Validation gate passed — all ACs concrete, approach respects all Guiding Principles
- Step 9 Documentation (Phase 1): COMPLETE — techContext.md updated (new DB tables, DEFAULT_COLUMNS, retry utility); systemPatterns.md updated (WorkflowError pattern, retryWithBackoff pattern, DB schema rows for cards.stale_suppressed + workflow tables); Phase 1 checkbox marked complete
- Phase 2 Build: COMPLETE — WorkflowRepository (insertTrigger, insertDelivery RETURNING id, updateDeliveryStatus, findStaleCards, moveCardToStale); WorkflowService.applyBoardRules (Rule #1) using Promise.allSettled; CardRepository.getColumnName + setSuppressed; CardService stale suppression via repo methods; BoardService optional WorkflowService injection; boards.ts + routes/index.ts wired; config.ts WORKFLOW_STALE_AGE_DAYS/RULE2_BASE_DELAY_MS/RULE2_MAX_ATTEMPTS; migration 20260629000000_add-workflow-indexes.js
- Step 9 Documentation (Phase 2): COMPLETE — techContext.md updated (workflow.service.ts + workflow.repository.ts in component structure, 3 new env vars, performance index note); systemPatterns.md updated (WorkflowService DI pattern, Rule #1 Promise.allSettled pattern, warnings[] additive field contract, CardRepository cross-table query pattern); Phase 2 checkbox marked complete
- Phase 3 Build: COMPLETE — WorkflowRepository.setCardColor; WorkflowService.triggerDoneColorRule (manual retry loop, always resolves, trigger_error from last delivery); CardService optional workflowService 4th param; fire-and-forget Done-color in moveCard; routes/cards.ts + routes/index.ts wired; code review W1 fix (trigger_error from last delivery); 223/223 tests passing, TypeScript clean
- Step 9 Documentation (Phase 3): COMPLETE — techContext.md updated (setCardColor, triggerDoneColorRule, cards.ts/index.ts Phase 3 wiring); systemPatterns.md updated (Manual Retry Loop Pattern, Fire-and-Forget Trigger Pattern, trigger_error Observability Contract)
- Step 3 Reflection Agent: COMPLETE — memory-bank/reflection/reflection-TASK-017.md created
- Step 3.5 Pattern Extraction: COMPLETE — 4 learnings extracted: error-handling (new), architecture-patterns (new), testing-patterns (amended 12→13), api-design (amended 3→4); learning-log.md + learning-metrics.md updated
- Step 4 Git Commit: (pending)
- Step 5 Report Completion: COMPLETE
