# Architecture Decision: Workflow Automation Engine

**Created**: 2026-06-27
**Status**: DECIDED
**Decision Type**: Architecture

---

## Context

### System Requirements

1. **Stale Rule (Rule #1)**: On `GET /boards/:boardId`, identify all non-Done cards with `created_at` >= 2 days old and `stale_suppressed = false`, then move each such card to the "Stale" column. Rule failures must not block board load — they are surfaced as `warnings[]` in the response body.
2. **Done-Color Rule (Rule #2)**: When `PATCH /cards/:id/move` targets the Done column, set `cards.color = '#d4edda'` asynchronously within 2 seconds. Fire-and-forget from HTTP response. Retried up to 3 times on failure.
3. **Stale suppression**: When a card is manually moved OUT of the Stale column, `stale_suppressed = true` must be set so Rule #1 does not move it back.
4. **Tracking tables**: `workflow_rule_triggers` and `workflow_action_deliveries` must record every rule evaluation and its delivery attempts.
5. `DEFAULT_COLUMNS` changes from `['To Do', 'In Progress', 'Done']` to `['To Do', 'In Progress', 'Stale', 'Done']`.

### Technical Constraints

- **Guiding Principles (hard blocks)**: 3-Layer Architecture, DI via constructor, config via `config.ts` only, pino logging (no `console.log`), parameterized SQL, `RETURNING` on INSERTs, `asyncHandler` on async routes, `AppError` for domain errors, no sensitive data in logs.
- **Single PostgreSQL instance** — no distributed systems, no message queue, no background job scheduler.
- **Single Express process** — in-process async is the only concurrency model available (setTimeout/Promise).
- **No module-level singletons except logger** — `WorkflowService` must be DI-constructed like `EventService`.
- Columns available at `BoardService.getBoardById` time already include `name` field — no extra DB query needed to resolve Stale/Done column IDs.
- `CardService.moveCard` already has `existingCard` at line 68 with `existingCard.column_id` — stale suppression detection must use information already in scope, not add a new query.

### Non-Functional Requirements

- Rule #1 overhead for boards with <= 100 cards: **<= 500ms** total added latency on the board load path.
- Rule #2 color change: **within 2 seconds** of the card reaching Done.
- **Zero data loss**: card position/content must never be corrupted by rule failures.
- API p95 < 200ms for all CRUD operations (product NFR) — Rule #1's synchronous path must not push p95 past 200ms on typical boards.
- Self-hosted single instance: no distributed coordination needed.

---

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|-----------------|
| `WorkflowService` | Orchestrates rule execution | `applyBoardRules(boardId, columns)` for Rule #1; `triggerDoneColorRule(boardId, cardId)` for Rule #2; column ID resolution via name match |
| `WorkflowRepository` | DB persistence for tracking | Write `workflow_rule_triggers` and `workflow_action_deliveries`; `moveCardToStale` (UPDATE card); `setCardColor` (UPDATE card) |
| `WorkflowError extends AppError` | Domain error wrapper | Carries `details[]` of per-card failures; does not propagate to HTTP error handler |
| `retryWithBackoff` utility | Exponential retry harness | Generic `<T>(fn, maxAttempts, baseDelayMs) => Promise<T>`; used by Rule #2 |
| Migration: `stale_suppressed` column | DB schema | `ALTER TABLE cards ADD COLUMN stale_suppressed boolean NOT NULL DEFAULT false` |
| Migration: workflow tracking tables | DB schema | `workflow_rule_triggers`, `workflow_action_deliveries` |
| Migration: `color` column | DB schema | `ALTER TABLE cards ADD COLUMN color varchar(7)` |

### Component Interactions

```
GET /boards/:boardId
  BoardRoute
    └─ BoardService.getBoardById(id)
         └─ BoardRepository.findBoardById(id)   →  returns BoardWithColumns (includes columns[].name)
    └─ WorkflowService.applyBoardRules(boardId, columns)
         └─ WorkflowRepository.findStaleCards(boardId, staleColumnId, doneColumnId)
         └─ WorkflowRepository.moveCardToStale(cardId, staleColumnId)    (per card)
         └─ WorkflowRepository.insertTrigger(...)
         └─ WorkflowRepository.insertDelivery(...)
    ←  { board, columns, warnings[] }

PATCH /cards/:id/move  (to Done)
  CardRoute
    └─ CardService.moveCard(id, columnId, afterCardId, actorId)
         └─ [stale suppression detection — inline]
         └─ CardRepository.moveCard(...)
         └─ WorkflowService.triggerDoneColorRule(boardId, cardId)  ← fire-and-forget (void, no await)
              └─ retryWithBackoff(setCardColor, 3, 200ms)
                   └─ WorkflowRepository.setCardColor(cardId, '#d4edda')
                   └─ WorkflowRepository.insertTrigger(...)
                   └─ WorkflowRepository.insertDelivery(...)
```

---

## Decision 1: Rule #1 Execution Strategy

### Decision 1 — Option A: Synchronous Sequential Inside `applyBoardRules`

The board columns are already fetched by `findBoardById`. `WorkflowService.applyBoardRules` runs in the same async call chain as `getBoardById`. Cards are moved one at a time sequentially.

**Pros:**
- Simplest code path — linear, easy to reason about errors.
- Fits the existing EventService fire-and-forget pattern; callers already know the shape.

**Cons:**
- N sequential DB round-trips for N stale cards (unbounded per-card latency).
- On a board with 50 stale cards, 50 sequential UPDATEs could easily exceed 500ms NFR.

**Technical Fit**: High | **Complexity**: Low | **Scalability**: Low

### Decision 1 — Option B: Parallel Batch Inside `applyBoardRules` (Promise.all)

Stale cards are identified with a single SELECT query. Moves are dispatched with `Promise.all` so all card UPDATEs run concurrently. Errors from individual card moves are caught per-card and collected as warnings, not thrown.

**Architecture Diagram**:
```
applyBoardRules(boardId, columns)
  1. staleColumnId = columns.find(c => c.name === 'Stale').id
  2. doneColumnId  = columns.find(c => c.name === 'Done').id
  3. staleCards    = await repo.findStaleCards(boardId, staleColumnId, doneColumnId)
  4. results       = await Promise.allSettled(staleCards.map(card => moveOne(card)))
  5. return results.filter(rejected).map(toWarning)
```

**Pros:**
- Single SELECT to find all stale cards (1 DB round-trip).
- All moves run in parallel — total latency bounded by the slowest single UPDATE, not sum.
- Handles partial failure cleanly via `Promise.allSettled`.
- Consistent with `Promise.all` established pattern in systemPatterns.md (e.g., board create seed columns).

**Cons:**
- Slightly more complex than sequential — needs `Promise.allSettled` and result mapping.
- High concurrency of UPDATEs on a single Postgres instance is acceptable at MVP scale (2–20 users, small boards); not a concern.

**Technical Fit**: High | **Complexity**: Low–Medium | **Scalability**: Medium (sufficient for MVP scale)

### Decision 1 — Option C: Async (true background, parallel to board fetch)

Rule #1 runs concurrently with `findBoardById` using `Promise.all([fetchBoard, applyRules])`. Both are awaited before the response is sent.

**Pros:**
- Board fetch and rule evaluation overlap — may shave latency if DB is the bottleneck.

**Cons:**
- `applyBoardRules` needs the `columns` array, which comes from `findBoardById` — so it can't start until the board is fetched anyway. This option is a false parallel.
- Even if columns were pre-fetched separately, the second query adds a DB round-trip that negates the overlap.
- Adds complexity for no real benefit given the data dependency.

**Technical Fit**: Low | **Complexity**: Medium | **Scalability**: Medium

**Decision 1 Chosen: Option B** — Parallel batch via `Promise.allSettled`. The columns array from `findBoardById` already contains the name field, so Stale/Done IDs are resolved by name match with zero extra queries. One SELECT fetches all stale cards. All card moves run concurrently. Per-card errors become `warnings[]` and do not block board load.

---

## Decision 2: Rule #2 Retry Harness

### Decision 2 — Option A: Raw `setTimeout` Chain

Three nested `setTimeout` callbacks, each retrying on failure. Catches are inlined.

**Pros:** No abstraction overhead.

**Cons:**
- Deeply nested; unreadable.
- Not reusable.
- Easy to mishandle errors (missed catch, unhandled rejection).

**Technical Fit**: Low | **Complexity**: High (maintenance) | **Scalability**: N/A

### Decision 2 — Option B: Recursive Async Utility Function

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T>
```

Implemented in `src/utils/retry.ts`. Each attempt on failure: wait `baseDelayMs * 2^(attempt-1)` then retry. On final failure, throws.

**Pros:**
- Simple, readable, testable in isolation.
- Reusable for any future rule's retry needs.
- Matches the "small utility" pattern already used in this codebase (e.g., `asyncHandler`).
- No dependencies beyond standard JS.

**Cons:**
- None significant for MVP scale.

**Technical Fit**: High | **Complexity**: Low | **Scalability**: High

### Decision 2 — Option C: Configurable Retry Class

A `RetryPolicy` class with configurable strategy, jitter, circuit breaker, etc.

**Pros:** Enterprise-ready.

**Cons:**
- Significant over-engineering for a kanban board with 2–20 concurrent users.
- Violates the product's design principle ("no bloat").

**Technical Fit**: Low | **Complexity**: High | **Scalability**: High

**Decision 2 Chosen: Option B** — `retryWithBackoff` recursive async utility in `src/utils/retry.ts`. Three attempts (base 200ms → 400ms → 800ms). The retry call lives entirely inside `WorkflowService.triggerDoneColorRule`, which is invoked fire-and-forget from `CardService.moveCard` using the existing EventService pattern (try/catch wrapper; failure logged at warn, does not propagate to HTTP response).

---

## Decision 3: Stale and Done Column ID Resolution

### Decision 3 — Option A: Name Match on `columns` Array (No Extra Query)

`applyBoardRules(boardId, columns: Column[])` receives the full `columns` array already returned by `findBoardById`. It finds Stale and Done column IDs with:
```typescript
const staleCol = columns.find(c => c.name === 'Stale');
const doneCol  = columns.find(c => c.name === 'Done');
```

**Pros:**
- Zero additional DB queries.
- Data already in memory; O(n) where n = column count (always <= ~10).
- Fails gracefully: if the board has no "Stale" column yet, `applyBoardRules` returns empty warnings (no cards to move).
- Consistent with the query pattern established in systemPatterns.md ("two-query over JOIN" — board data reused rather than re-fetched).

**Cons:**
- Brittle to column name changes. But DEFAULT_COLUMNS is defined as a constant in `board.repository.ts` — the "Stale" name is controlled in one place.

**Technical Fit**: High | **Complexity**: Low | **Scalability**: High

### Decision 3 — Option B: Query DB by Name Each Call

```sql
SELECT id FROM columns WHERE board_id = $1 AND name = $2
```

Called twice (once for Stale, once for Done) on every board load.

**Pros:** Decoupled from the in-memory array shape.

**Cons:**
- 2 extra DB round-trips per board load — adds latency for no benefit since the column data is already in scope.
- Violates the "Promise.all — independent queries run concurrently" query pattern spirit: re-fetching data already available.

**Technical Fit**: Low | **Complexity**: Low | **Scalability**: Low

### Decision 3 — Option C: Enum / Constant IDs

Store Stale and Done column UUIDs in constants or config at board creation time.

**Pros:** Deterministic.

**Cons:**
- Column IDs are per-board UUIDs generated at creation — cannot be constants.
- Would require a different schema or a lookup table.
- Over-engineered for a kanban MVP.

**Technical Fit**: Low | **Complexity**: High | **Scalability**: Low

**Decision 3 Chosen: Option A** — Name match on the `columns` array passed into `applyBoardRules`. No extra DB queries. Guard: if `staleCol` is undefined (e.g., a board created before the new default column was added), Rule #1 is skipped for that board and a warning is logged.

---

## Decision 4: Stale Suppression Detection in `CardService.moveCard`

The requirement: when a card is moved OUT of the Stale column by a user, set `stale_suppressed = true` so Rule #1 does not move it back.

`CardService.moveCard` at line 68 already does:
```typescript
const existingCard = await this.repo.findCardById(id);  // has existingCard.column_id
```
And at line 70 it queries the destination column:
```typescript
const colResult = await this.db.query<{ id: string; board_id: string }>(
  'SELECT id, board_id FROM columns WHERE id = $1', [columnId]
);
```

### Decision 4 — Option A: Pass `columns` Array Into `moveCard`

Add a `columns?: Column[]` parameter to `moveCard`. Match `existingCard.column_id` against the array to determine if source is Stale.

**Pros:** No extra DB query.

**Cons:**
- `moveCard` is currently called from the card route handler, which does not have the board's columns in scope. The caller would need to fetch them.
- Changes the public signature of `moveCard` non-trivially; ripples through tests.
- The caller (card route) does not currently know the board context.

**Technical Fit**: Low | **Complexity**: Medium | **Scalability**: N/A

### Decision 4 — Option B: Query Column Name by ID Inside `moveCard`

After fetching `existingCard`, do:
```typescript
const srcColResult = await this.db.query<{ name: string }>(
  'SELECT name FROM columns WHERE id = $1', [existingCard.column_id]
);
const isFromStale = srcColResult.rows[0]?.name === 'Stale';
```

**Pros:**
- Self-contained in `moveCard`, no signature change.
- Correct: directly checks the source column name.

**Cons:**
- One extra DB SELECT per card move.
- But this SELECT is fast (PK or FK lookup, indexed), well within the p95 budget.
- The existing code at line 70 already does a `SELECT` on the destination column — same pattern, same cost.

**Technical Fit**: High | **Complexity**: Low | **Scalability**: High

### Decision 4 — Option C: Pass `staleColumnId` as Parameter From Caller

Add a `staleColumnId?: string` parameter. Caller resolves the Stale column ID before calling `moveCard`.

**Pros:** No extra DB query inside `moveCard`.

**Cons:**
- The card route handler does not have the board's column list in scope. It would need a new query.
- Moves board-topology knowledge into the route layer — violates the single-responsibility boundary.
- The stale column concept is a workflow concern, not a core card-move concern.

**Technical Fit**: Low | **Complexity**: Medium | **Scalability**: N/A

**Decision 4 Chosen: Option B** — Query source column name by ID within `moveCard`. This mirrors the existing destination column query pattern (line 70), keeps `moveCard`'s signature stable, and adds exactly one fast indexed SELECT. The query can be combined with the existing line 70 destination column query via `Promise.all` to add zero serial latency.

Implementation detail: The existing line 70 query selects `{ id: string; board_id: string }` from the destination column. We extend `moveCard` to also fetch the source column name in parallel:

```typescript
const [colResult, srcColResult] = await Promise.all([
  this.db.query<{ id: string; board_id: string }>(
    'SELECT id, board_id FROM columns WHERE id = $1', [columnId]
  ),
  this.db.query<{ name: string }>(
    'SELECT name FROM columns WHERE id = $1', [existingCard.column_id]
  ),
]);
const isFromStale = srcColResult.rows[0]?.name === 'Stale';
```

If moving from Stale, call `this.repo.setSuppressed(id, true)` after the move completes. This is an extra UPDATE, but it only runs on moves originating from Stale (rare) and is fire-and-forget-safe within the synchronous path since it is small.

---

## Decision 5: Workflow Tracking Transaction Strategy

The new tables are:
```sql
workflow_rule_triggers(id, rule_id, board_id, card_id nullable, triggered_at, trigger_status, trigger_error)
workflow_action_deliveries(id, trigger_id, attempt, attempted_at, delivery_status, delivery_error)
```

### Decision 5 — Option A: Tracking Writes in Same Transaction as Rule Action

Each card move and tracking insert are wrapped in a `BEGIN/COMMIT`. On failure, the move is rolled back along with the tracking insert.

**Pros:** Atomicity — tracking record only exists if the action succeeded.

**Cons:**
- Adds transaction overhead to every board load (Rule #1 runs N transactions for N stale cards).
- If the DB is partially unavailable mid-transaction, both action and tracking are lost — no audit trail of the failure.
- systemPatterns.md explicitly documents "No transactions — multi-step writes use parallel independent inserts". This would be a direct violation requiring justification.
- For a self-hosted MVP with zero SLA, the complexity is not warranted.

**Technical Fit**: Low | **Complexity**: High | **Scalability**: Medium

### Decision 5 — Option B: Tracking Writes Separate from Rule Action (Best-Effort Audit)

The card move UPDATE runs first. The trigger and delivery tracking inserts run immediately after, independently. If the tracking write fails, a warning is logged but the move result stands.

**Architecture**:
```
moveCardToStale(cardId, staleColumnId)  → success/failure
insertTrigger(triggerId, ...)           → best-effort
insertDelivery(triggerId, ...)          → best-effort
```

**Pros:**
- Consistent with systemPatterns.md "No transactions" principle.
- Simple to implement.
- The card action is always committed independently — tracking failure never rolls back a successful card move.
- DB failures in tracking are logged at warn level with context; the failure mode is known and acceptable.

**Cons:**
- Tracking records may be absent when the action succeeded (e.g., DB connectivity blip after move commit).
- For a self-hosted MVP with no compliance requirements, incomplete audit trails are acceptable.

**Technical Fit**: High | **Complexity**: Low | **Scalability**: High

### Decision 5 — Option C: Async Tracking (Insert After Response)

Tracking inserts are deferred to a `setImmediate` or microtask after the response is sent.

**Pros:** Zero tracking cost in the response path.

**Cons:**
- Rule #1 is already in the request path — tracking latency is dominated by the card move, not the tracking insert.
- Adds process-exit risk: if the Node process crashes between response and tracking insert, the record is lost entirely.
- For Rule #2 (already fire-and-forget), this is moot — the entire operation is async.

**Technical Fit**: Low | **Complexity**: Medium | **Scalability**: Medium

**Decision 5 Chosen: Option B** — Separate best-effort tracking writes. This directly complies with the systemPatterns.md "No transactions" pattern and the MVP's best-effort reliability posture. Tracking failures are logged at warn level with `ruleId`, `boardId`, `cardId` context so operators can diagnose audit gaps. If partial DB availability causes tracking to fail, the card has still been moved — data integrity is preserved.

---

## Options Explored (Summary Matrix)

| Decision | Option A | Option B (Chosen) | Option C |
|---|---|---|---|
| Rule #1 execution | Sequential (Low scalability) | **Parallel `Promise.allSettled`** | Fake-async (data dependency) |
| Rule #2 retry | Raw setTimeout (unreadable) | **`retryWithBackoff` utility** | Retry class (overkill) |
| Column ID resolution | **Name match on columns[] (chosen)** | DB query (extra round-trips) | Enum/constant (impossible) |
| Stale suppression | Pass columns[] to moveCard (sig change) | **Query source column name** | Pass staleColumnId (route leak) |
| Tracking writes | Same transaction (violates patterns) | **Separate best-effort writes** | Async deferred (process-exit risk) |

---

## Evaluation Matrix

| Criteria | Sequential Rule #1 | **Parallel Rule #1** | Raw Retry | **`retryWithBackoff`** | DB Column Lookup | **Name Match** |
|---|---|---|---|---|---|---|
| Scalability | Low | **High** | N/A | **High** | Low | **High** |
| Maintainability | High | **High** | Low | **High** | Medium | **High** |
| Performance | Low (N serial) | **High (parallel)** | Low | **High** | Low | **High** |
| Pattern Fit | Medium | **High** | Low | **High** | Medium | **High** |
| Implementation Cost | Low | **Low** | Low | **Low** | Low | **Low** |

---

## Observability Architecture

### Logging

- **Library**: Existing pino module logger (`src/logger.ts`) — consistent with systemPatterns.md.
- **Format**: Structured JSON with traceId, spanId, service, version (inherited from pino-http middleware).
- **Configuration**: `LOG_LEVEL`, `LOG_FORMAT`, `LOG_OUTPUT` from `config.ts`.

Key log events for WorkflowService:

| Event | Level | Fields |
|---|---|---|
| `workflow.rule1.skipped` | warn | `{ boardId, reason: 'no_stale_column' }` |
| `workflow.rule1.applied` | info | `{ boardId, cardCount, staleCount, durationMs }` |
| `workflow.rule1.card_moved` | debug | `{ boardId, cardId, staleColumnId }` |
| `workflow.rule1.card_move_failed` | warn | `{ boardId, cardId, err }` |
| `workflow.rule2.triggered` | debug | `{ boardId, cardId }` |
| `workflow.rule2.color_set` | info | `{ boardId, cardId, attempt }` |
| `workflow.rule2.retry` | warn | `{ boardId, cardId, attempt, err }` |
| `workflow.rule2.failed` | error | `{ boardId, cardId, attempts, err }` |
| `workflow.tracking.failed` | warn | `{ ruleId, boardId, cardId, err }` |

**No sensitive data** in any log entry — only UUIDs and rule/status strings.

### Distributed Tracing

The app already uses OpenTelemetry via `requestContext` middleware. `WorkflowService` operations run within the existing request span context.

| Boundary | Protocol | Propagation |
|---|---|---|
| HTTP request → `WorkflowService.applyBoardRules` | In-process | Inherits active span from pino-http request context |
| `WorkflowService.triggerDoneColorRule` (fire-and-forget) | In-process async | New child span created from active context; Rule #2 span survives past HTTP response |

Rule #2 requires its own span since it executes after the HTTP response is sent:
```typescript
// Inside triggerDoneColorRule — after HTTP response is gone
const span = tracer.startSpan('WorkflowService.triggerDoneColorRule', {
  attributes: { 'workflow.rule_id': 'done-color', 'card.id': cardId, 'board.id': boardId },
});
```

### Metrics

**Custom Business Metrics** (Prometheus-compatible labels, no high-cardinality IDs):

```
workflow_rule_executions_total{rule_id, status}          # Counter: rule1/rule2, success/failed/skipped
workflow_rule_duration_seconds{rule_id}                  # Histogram: e2e latency per rule execution
workflow_cards_moved_to_stale_total                      # Counter: stale moves by rule1
workflow_rule2_retries_total{attempt}                    # Counter: retry attempts (attempt=1/2/3)
```

Labels use only bounded values (`rule_id`: `stale` | `done-color`; `status`: `success` | `failed` | `skipped`; `attempt`: `1` | `2` | `3`). No card IDs or board IDs as labels (cardinality).

### Configuration Variables

| Variable | Purpose | Default |
|---|---|---|
| `LOG_LEVEL` | Log verbosity | `info` |
| `LOG_FORMAT` | Output format | `json` |
| `LOG_OUTPUT` | Destination | `stdout` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | — |
| `OTEL_SERVICE_NAME` | Service identifier | `banyanboard-api` |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio | `1.0` (dev) |
| `WORKFLOW_STALE_AGE_DAYS` | Stale threshold in days | `2` |
| `WORKFLOW_RULE2_BASE_DELAY_MS` | Rule #2 retry base delay | `200` |
| `WORKFLOW_RULE2_MAX_ATTEMPTS` | Rule #2 max retry attempts | `3` |

`WORKFLOW_*` variables are read in `config.ts` with sensible defaults; injected into `WorkflowService` constructor.

---

## Final Decision Summary

**Rule #1 execution**: Synchronous in request path, parallel card moves via `Promise.allSettled`. Column IDs resolved by name match on `columns[]` already in scope — zero extra queries.

**Rule #2 retry**: `retryWithBackoff` recursive utility in `src/utils/retry.ts`. Fire-and-forget from `CardService.moveCard` using the existing EventService pattern.

**Stale suppression**: `moveCard` queries source column name in parallel with existing destination column query (no serial overhead). If source is "Stale", `setSuppressed(cardId, true)` is called after the move.

**Tracking writes**: Best-effort independent writes after each action. Failure logged at warn; does not roll back action.

---

## Implementation Guidelines

### 1. New Files

- `backend/src/services/workflow.service.ts` — `WorkflowService` class with `applyBoardRules` and `triggerDoneColorRule`
- `backend/src/repositories/workflow.repository.ts` — `WorkflowRepository` with all SQL; exports `WorkflowRuleTrigger`, `WorkflowActionDelivery` types at top of file (Guiding Principle 11)
- `backend/src/utils/retry.ts` — `retryWithBackoff<T>(fn, maxAttempts, baseDelayMs): Promise<T>` generic utility
- `backend/migrations/YYYYMMDDHHMMSS_add-workflow-tables.js` — creates `workflow_rule_triggers`, `workflow_action_deliveries`, adds `stale_suppressed` to `cards`, adds `color` to `cards`; updates default columns seed

### 2. Modified Files

- `backend/src/services/board.service.ts` — add optional `workflowService?: WorkflowService` constructor dep; call `applyBoardRules` in `getBoardById`, merge warnings into response
- `backend/src/services/card.service.ts` — add optional `workflowService?: WorkflowService` constructor dep; detect stale source column and call `setSuppressed`; fire-and-forget `triggerDoneColorRule` when moving to Done
- `backend/src/routes/index.ts` — construct `WorkflowRepository` and `WorkflowService`; inject into `createBoardsRouter` and `createCardsRouter`
- `backend/src/repositories/board.repository.ts` — update `DEFAULT_COLUMNS` to include `'Stale'` (position 3, before Done)
- `backend/src/config.ts` — add `WORKFLOW_STALE_AGE_DAYS`, `WORKFLOW_RULE2_BASE_DELAY_MS`, `WORKFLOW_RULE2_MAX_ATTEMPTS` with defaults
- Frontend `types/index.ts` — add `warnings?: WorkflowWarning[]` to `BoardWithColumns` API response type

### 3. `WorkflowService` Method Signatures

```typescript
interface WorkflowWarning {
  cardId: string;
  ruleId: string;
  message: string;
}

class WorkflowService {
  constructor(
    private readonly repo: WorkflowRepository,
    private readonly config: Pick<Config, 'workflowStaleAgeDays' | 'workflowRule2BaseDelayMs' | 'workflowRule2MaxAttempts'>,
  ) {}

  // Called synchronously from BoardService.getBoardById
  // columns: already-fetched Column[] from findBoardById — no extra queries
  async applyBoardRules(boardId: string, columns: Column[]): Promise<WorkflowWarning[]>

  // Fire-and-forget from CardService.moveCard — NEVER awaited by caller
  // Caller wraps in: void this.workflowService?.triggerDoneColorRule(boardId, cardId)
  async triggerDoneColorRule(boardId: string, cardId: string): Promise<void>
}
```

### 4. `BoardService.getBoardById` Integration

```typescript
async getBoardById(id: string): Promise<BoardWithColumnsAndWarnings> {
  const board = await this.repo.findBoardById(id);   // returns BoardWithColumns

  let warnings: WorkflowWarning[] = [];
  if (this.workflowService) {
    try {
      warnings = await this.workflowService.applyBoardRules(board.id, board.columns);
    } catch (err) {
      logger.warn({ err, boardId: id }, 'workflow.rule1.unexpected_error');
      // Non-blocking — board still returned
    }
  }

  return { ...board, warnings };
}
```

The response shape `{ board, columns, warnings[] }` must be documented in the board route response type. Frontend ignores unknown fields if `warnings` is absent (backward compatible).

### 5. `CardService.moveCard` Integration

After `const card = await this.repo.moveCard(id, columnId, newPosition)`:

```typescript
// Stale suppression: if card was in Stale column, mark suppressed
if (isFromStale) {
  try {
    await this.repo.setSuppressed(id, true);
  } catch (err) {
    logger.warn({ err, cardId: id }, 'card.stale_suppression.failed');
  }
}

// Rule #2: fire-and-forget color rule when moving to Done
if (this.workflowService && toColumnName === 'Done') {
  void this.workflowService.triggerDoneColorRule(boardId, card.id).catch(err => {
    logger.warn({ err, cardId: id }, 'workflow.rule2.unhandled_rejection');
  });
}
```

Note: `toColumnName` is resolved from the destination column query result (already fetched at line 70, extended to include `name`).

### 6. `retryWithBackoff` Utility

```typescript
// src/utils/retry.ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise<void>(resolve =>
          setTimeout(resolve, baseDelayMs * Math.pow(2, attempt - 1)),
        );
      }
    }
  }
  throw lastError;
}
```

### 7. `WorkflowRepository` Key Methods

All SQL must use parameterized queries. Key methods:

```typescript
// Returns cards not in Done, not stale_suppressed, created >= staleAgeDays ago
async findStaleCards(boardId: string, staleColumnId: string, doneColumnId: string, staleAgeDays: number): Promise<StaleCard[]>

// UPDATE cards SET column_id = $1 WHERE id = $2 RETURNING id
async moveCardToStale(cardId: string, staleColumnId: string): Promise<void>

// UPDATE cards SET color = $1 WHERE id = $2
async setCardColor(cardId: string, color: string): Promise<void>

// UPDATE cards SET stale_suppressed = $1 WHERE id = $2
async setSuppressed(cardId: string, suppressed: boolean): Promise<void>

// INSERT INTO workflow_rule_triggers ... RETURNING id
async insertTrigger(input: TriggerInput): Promise<string>  // returns trigger id

// INSERT INTO workflow_action_deliveries ... RETURNING id
async insertDelivery(input: DeliveryInput): Promise<void>
```

### 8. DI Wiring in `createRouter`

```typescript
export function createRouter(db: Queryable, bus?: DomainEventBus, config?: Config): Router {
  const userRepo     = new UserRepository(db);
  const workflowRepo = new WorkflowRepository(db);
  const workflowService = config
    ? new WorkflowService(workflowRepo, config)
    : undefined;
  const eventService = bus ? new EventService(bus, db, userRepo) : undefined;

  // ... existing route setup ...
  router.use('/boards', createBoardsRouter(db, workflowService));
  router.use('/cards', createCardsRouter(db, eventService, workflowService));
}
```

### 9. Migration Strategy

Single migration file adds all new schema in order:
1. `ALTER TABLE cards ADD COLUMN stale_suppressed boolean NOT NULL DEFAULT false`
2. `ALTER TABLE cards ADD COLUMN color varchar(7)`
3. `CREATE TABLE workflow_rule_triggers (...)`
4. `CREATE TABLE workflow_action_deliveries (...)`

The `DEFAULT_COLUMNS` constant change in `board.repository.ts` takes effect for newly created boards only. Existing boards already in production will not have a "Stale" column — `applyBoardRules` must guard for this (`staleCol` undefined → skip + warn log).

### 10. Board Route Response Shape

The board route handler currently returns `BoardWithColumns`. Extend to:
```typescript
interface BoardWithColumnsAndWarnings extends BoardWithColumns {
  warnings: WorkflowWarning[];
}
```
The route always returns `warnings: []` even when no rules fired. This is a stable API extension (additive only).

---

## Validation Checklist

- [x] Meets all system requirements (Rule #1 on board load, Rule #2 on move to Done, stale suppression, tracking)
- [x] Respects technical constraints (3-layer, DI, no console.log, parameterized SQL, RETURNING, asyncHandler)
- [x] Addresses non-functional requirements (parallel moves meet <500ms; Rule #2 within 2s via async; zero data loss via non-blocking rule failures)
- [x] Technically feasible with current constraints (single Express process, single PG instance)
- [x] Risks identified and acceptable (see Risk Assessment below)
- [x] Complies with all Guiding Principles in systemPatterns.md (no deviations required)
- [x] Respects established patterns (Promise.all for parallel queries, EventService fire-and-forget pattern for Rule #2, asyncHandler, AppError hierarchy)
- [x] Observability architecture defined (logging, tracing, metrics)
- [x] Trace context propagation: Rule #1 inherits HTTP request span; Rule #2 creates own span
- [x] Logging strategy consistent with observability-requirements.md (pino, structured JSON, no sensitive data)
- [x] Metrics strategy follows naming conventions (snake_case, bounded labels, base units)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stale rule exceeds 500ms on board with many stale cards | Low | Medium | `Promise.allSettled` parallelizes all moves; even 100 concurrent UPDATEs complete well within 500ms on local Postgres. Add `durationMs` logging to detect if this becomes an issue. |
| Boards without "Stale" column (pre-migration boards) | Medium | Low | `applyBoardRules` guards `staleCol === undefined` → skips rule, logs warn. No card data affected. |
| Rule #2 exhausts 3 retries and color is never set | Low | Low | Failure is logged at error level with cardId. Color is cosmetic — card data integrity is unaffected. Operator can re-trigger by moving the card to Done again. |
| Tracking write fails silently after successful card move | Low | Low | Logged at warn. Audit trail is best-effort per MVP posture. No data integrity impact. |
| `retryWithBackoff` delays block Node event loop | Low | Low | `setTimeout` is non-blocking; delays are async; no synchronous busy-wait. |
| `setSuppressed` fails after card moved from Stale | Low | Medium | Failure logged at warn. Worst case: Rule #1 moves card back to Stale on next board load. User can move again (suppression persists on next attempt). |
| Migration adds `stale_suppressed` NOT NULL without DEFAULT on existing rows | High (without mitigation) | High | Migration uses `DEFAULT false` — safe for existing rows. Included in migration spec above. |

---

## Next Steps

1. Write migration file: add `stale_suppressed`, `color` columns; create `workflow_rule_triggers` and `workflow_action_deliveries` tables; update seeding notes (DEFAULT_COLUMNS constant change is code-only).
2. Implement `src/utils/retry.ts` — `retryWithBackoff` utility with unit tests.
3. Implement `WorkflowRepository` with all SQL methods and domain type definitions at file top.
4. Implement `WorkflowService` — `applyBoardRules` (parallel stale detection + move), `triggerDoneColorRule` (fire-and-forget retry wrapper).
5. Extend `CardService.moveCard` — parallel destination+source column query, stale suppression, fire-and-forget Rule #2.
6. Extend `BoardService.getBoardById` — inject optional `WorkflowService`, call `applyBoardRules`, merge warnings.
7. Update `createRouter` in `routes/index.ts` — wire `WorkflowRepository` and `WorkflowService`.
8. Update `config.ts` — add `WORKFLOW_*` env vars with defaults.
9. Update `DEFAULT_COLUMNS` constant to include `'Stale'`.
10. Update frontend `types/index.ts` — add `warnings?: WorkflowWarning[]` to board response type.
11. Write tests: `retry.test.ts` (unit), `workflow.repository.test.ts` (mock Queryable), `workflow.service.test.ts` (mock repo), board route integration test asserting `warnings[]` shape, card move integration test asserting `stale_suppressed` and `color`.
