# Architecture Decision: Webhook Delivery for Workflow Rules

**Created**: 2026-06-30
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-019 (Level 4) — FEAT-016 (extends FEAT-014 Workflow Automation / TASK-017)

## Context

This task adds a **user-configurable webhook action** to BanyanBoard's workflow
automation. When a configured trigger fires (v1: "card moved to Done"), the system
POSTs a JSON payload to a user-supplied URL, retrying up to 3 times with 30-second
backoff, and tracks the full delivery lifecycle (`pending → delivered | failed →
exhausted`) in a dedicated table. It is **purely additive** to the FEAT-014 built-in
rule engine — the existing `workflow_rule_triggers` / `workflow_action_deliveries`
tables and the hardcoded `STALE_RULE_ID` / `DONE_COLOR_RULE_ID` rules are not modified.

### System Requirements

- **R1** — User-configurable rules: a board owner can create/list/enable-disable/delete
  automation rules (`trigger_type`, `webhook_url`, `enabled`) scoped to a board.
- **R2** — Trigger evaluation: on a card move to **Done**, the engine reads the board's
  enabled rules and records one `trigger_executions` row per firing, **decoupled from
  delivery** (a rule fires and is recorded even if the webhook later fails).
- **R3** — Asynchronous webhook dispatch: POST the agreed payload envelope; retry up to
  3 attempts with 30s backoff; never block or delay the card-move HTTP response.
- **R4** — Delivery lifecycle tracking: one `webhook_deliveries` row per firing,
  transitioning `pending → delivered | failed → exhausted` with `attempt_count`,
  `http_response_code` (distinct `NULL` on timeout/connection error vs the received
  non-2xx code), and a structured `error`.
- **R5** — Read endpoints backing the UI: list rules and list deliveries per board.
- **R6** — Reconcile `trigger_executions` with the existing `workflow_rule_triggers`
  concept so the two engines are coherent and not silently conflated (highest priority).

### Technical Constraints

- **C1 — 3-Layer Architecture** (Principle #1): Routes → Services → Repositories. No SQL
  in services, no HTTP in services/repositories. The webhook HTTP call is the sharpest
  edge — it must live in a dedicated **transport** dependency injected into the service,
  not called inline in the service body, to keep the service HTTP-free and unit-testable.
- **C2 — Dependency Injection** (Principle #2): constructor injection only; no
  module-level singletons except `logger`. Follows the established **WorkflowService
  Optional DI Pattern**.
- **C3 — Config via `config.ts` only** (Principle #3): backoff constants, request
  timeout, max attempts, SSRF toggle are all `WEBHOOK_*` Config fields with zod defaults.
  No hardcoded timeouts/URLs.
- **C4 — No `console.log`** (Principle #4): pino only. No secrets in logs (Principle #9) —
  webhook URLs may embed tokens, so the full URL is never logged (host-only).
- **C5 — Parameterized SQL + `RETURNING`** (Principles #5, #6).
- **C6 — Fire-and-Forget Trigger Pattern**: the dispatch is fired from `moveCard` with a
  mandatory `.catch()` guard; the dispatch entry point never throws to the caller.
- **C7 — Rule #2 Manual Retry Loop Pattern**: per-attempt DB writes require an imperative
  loop, **not** `retryWithBackoff` (which throws on exhaustion and offers no per-attempt
  hook).
- **C8 — No message bus for v1**: in-process async only (Domain Event Pattern is
  "in-process emitter for v1; designed for future message bus extraction").
- **C9 — No new runtime dependency** preferred: backend has `pg`, `express`, `pino`,
  `zod` — no HTTP client. Node's built-in `fetch` + `AbortController` (Node 18+/undici)
  satisfies the HTTP need with zero new deps.
- **C10 — WorkflowError shape** for synchronous validation failures (`{ error:
  'WORKFLOW_ACTION_FAILED', message, details: [{field,error}] }`).

### Non-Functional Requirements

- **NFR1 — API p95 < 200ms**: the synchronous card-move path must never await webhook
  delivery. Delivery is fully off-request (fire-and-forget).
- **NFR2 — Zero data loss on moves**: a webhook outage must never corrupt board state or
  roll back a move (Reliability NFR).
- **NFR3 — Security / SSRF**: webhook URL is user-supplied; on a self-hosted box the
  outbound POST can reach loopback / link-local metadata endpoints. Basic URL validation
  is in scope; full egress allow-listing is out of scope but a **toggleable private-range
  block** is included as a low-cost mitigation.
- **NFR4 — Observability**: pino structured logs with trace context; host-only URL
  logging; per-attempt log lines.
- **NFR5 — Scale**: hundreds of boards / thousands of cards, 2–20 concurrent users. The
  in-process `setTimeout` scheduler is sufficient at this scale (no queue infrastructure).

### Existing Patterns That Must Be Respected

3-Layer Clean Architecture · App Factory (`createApp`/`createRouter(db)`) · Optional DI ·
Manual Retry Loop (Rule #2) · Fire-and-Forget Trigger · WorkflowError · Domain Types at
Repository Layer · Two-query-over-JOIN / no transactions · node-pg-migrate JS migrations
with `gen_random_uuid()` PKs and named `addConstraint` CHECKs.

## Component Analysis

### Core Components

| Component | Layer | Purpose | Responsibilities |
|-----------|-------|---------|------------------|
| `AutomationRepository` | Repository | Persist rules, executions, deliveries | `insertRule`, `findRulesByBoard`, `findEnabledRulesByBoardAndTrigger`, `updateRuleEnabled`, `deleteRule`, `insertTriggerExecution`, `insertWebhookDelivery`, `updateDeliveryAttempt`, `findDeliveriesByBoard`. Parameterized SQL + `RETURNING`. |
| `AutomationService` | Service | Rule CRUD + trigger evaluation | Validate webhook URL (sync, throws `WorkflowError`); CRUD orchestration; `evaluateCardMovedToDone(boardId, card)` — resolve enabled rules, record a `trigger_executions` row per firing, hand each off to the dispatcher. Holds no SQL, no `fetch`. |
| `WebhookDispatcher` | Service | Async delivery + retry lifecycle | Manual retry loop (3 attempts / 30s backoff); per-attempt `webhook_deliveries` write; drives `pending → delivered \| failed → exhausted`. Calls `WebhookTransport`. Never throws to caller. |
| `WebhookTransport` | Infrastructure (injected) | The single HTTP edge | `post(url, body, timeoutMs): Promise<TransportResult>` using built-in `fetch` + `AbortController`. Returns `{ status: number }` on response (any code), or `{ status: null, error }` on timeout/connection failure. Propagates `traceparent`. This is the only component permitted to do HTTP. |
| `automation` routes | Route | HTTP surface | `POST/GET/PATCH/DELETE /boards/:boardId/automation-rules`, `GET /boards/:boardId/webhook-deliveries`. `asyncHandler` + `requireAuth` (group middleware). Maps `WorkflowError` → 400. |

### Component Interactions

```
PATCH /cards/:id/move (route)
   └─> CardService.moveCard()                     [synchronous, returns 200]
         ├─ repo.moveCard()  (authoritative state — committed first)
         ├─ workflowService.triggerDoneColorRule().catch()   (existing Rule #2)
         └─ automationService.evaluateCardMovedToDone(boardId, card).catch()   [FIRE-AND-FORGET]
                 │  (await NOTHING from here on the request path)
                 ├─ repo.findEnabledRulesByBoardAndTrigger(boardId, 'card.moved.done')
                 └─ for each rule:
                       ├─ repo.insertTriggerExecution(rule, card)  → executionId   [R2: decoupled]
                       └─ dispatcher.dispatch(rule, execution, payload).catch()      [async, off-request]
                              ├─ repo.insertWebhookDelivery(status='pending', attempt_count=0) → deliveryId
                              └─ MANUAL RETRY LOOP (attempt 1..3):
                                    ├─ transport.post(url, payload, timeout)
                                    ├─ updateDeliveryAttempt(deliveryId, attempt_count, status, code, error)
                                    │     2xx        → 'delivered' (terminal)
                                    │     non-2xx/NULL & budget left → 'failed', sleep 30s
                                    │     non-2xx/NULL & exhausted    → 'exhausted' (terminal)
```

The card move commits **before** any workflow side effect runs; both Rule #2 and the new
automation evaluation are fired with `.catch()` guards (C6). The dispatcher is the only
component that loops/sleeps; the transport is the only component that touches the network.

## Options Explored

The two highest-leverage decisions get dedicated option sets: **(A)** the
`trigger_executions` vs `workflow_rule_triggers` reconciliation (R6 — highest priority),
and **(B)** the retry/scheduler mechanism (C7/C8). Remaining open questions (schema
details, payload, transport, SSRF) are resolved inline in the Decision section.

---

### Decision A — `trigger_executions` vs `workflow_rule_triggers`

#### Option A1: Reuse / extend `workflow_rule_triggers`
- **Description**: Treat `trigger_executions` as the existing `workflow_rule_triggers`
  table under a new name; add a nullable `automation_rule_id` FK and widen the
  `trigger_status` CHECK to cover the new flow.
- **Pros**:
  - One firing table; no conceptual duplication.
  - Reuses `WorkflowRepository.insertTrigger`.
- **Cons**:
  - **Violates the additive scope boundary** — the task explicitly states the existing
    tables are NOT modified. Widening the CHECK and adding an FK is a modification.
  - `rule_id` in `workflow_rule_triggers` is a **varchar** holding hardcoded string
    constants (`'stale-rule'`, `'done-color-rule'`), not a UUID FK to `automation_rules`.
    Overloading it conflates two rule-identity models.
  - Couples the two engines: a future change to the built-in engine's firing table risks
    breaking webhook delivery.
- **Technical Fit**: Low — directly contradicts the stated scope.
- **Complexity**: Medium (migration to alter a live table + back-compat).
- **Scalability**: Medium.

#### Option A2: Separate `trigger_executions` table (one row per firing), deliveries FK to it
- **Description**: A genuinely new `trigger_executions` table records one row each time a
  **user-configurable** rule fires. `webhook_deliveries` FKs to `trigger_executions`
  (and denormalizes `automation_rule_id`/`board_id` for cheap querying). The existing
  `workflow_rule_triggers` is left entirely untouched and continues to serve the two
  built-in rules.
- **Pros**:
  - **Honors the additive scope** — zero changes to existing tables/CHECKs.
  - Clean separation of the two engines: built-in rules → `workflow_rule_triggers`;
    user rules → `trigger_executions`. The naming divergence is intentional and documented.
  - `trigger_executions.automation_rule_id` is a real UUID FK — coherent identity model.
  - Decoupling (R2) is structural: the execution row is written and committed before any
    delivery row exists; a delivery failure cannot un-record a firing.
- **Cons**:
  - Two firing tables exist in the schema with similar semantics — requires a clear
    documented note so future readers don't conflate them.
  - Slight duplication of the "firing" concept.
- **Technical Fit**: High — mirrors the existing `triggers → deliveries` shape while
  staying additive.
- **Complexity**: Low (pure new-table migration; no live-table alteration).
- **Scalability**: High.

#### Option A3: Collapse — no `trigger_executions`, deliveries FK directly to `automation_rules`
- **Description**: Skip a firing table entirely; `webhook_deliveries` references
  `automation_rules` directly and carries the card/event snapshot inline.
- **Pros**:
  - Fewest tables; simplest joins.
- **Cons**:
  - **Fails R2 decoupling and the AC** — AC-HAPPY-1 step 2 explicitly requires a
    `trigger_executions` row created decoupled from delivery; the payload envelope carries
    `trigger_execution_id`. Without the table there is nothing to reference.
  - A rule that fires but whose delivery is later disabled/cancelled leaves no record of
    the firing.
  - Loses the "rule fired N times, here are the deliveries per firing" audit shape.
- **Technical Fit**: Low — contradicts the spec's named entity and payload field.
- **Complexity**: Low.
- **Scalability**: Medium.

---

### Decision B — Retry mechanism & async scheduler

#### Option B1: `retryWithBackoff` utility
- **Description**: Wrap `transport.post` in the existing `retryWithBackoff(fn, 3, 30000)`.
- **Pros**: Reuses tested utility; exponential backoff built in.
- **Cons**:
  - **Cannot interleave a per-attempt DB write** — exactly the limitation that produced
    the Rule #2 Manual Retry Loop Pattern. AC-ASYNC-1 requires the row to transition
    `failed` on each transient attempt and be **persisted at each step**, not just the
    terminal state. `retryWithBackoff` throws on exhaustion and exposes no per-attempt hook.
  - Backoff is exponential (30s, 60s) — the spec mandates a **flat 30s** between attempts.
- **Technical Fit**: Low — violates C7 and the per-step persistence test requirement.
- **Complexity**: Low.
- **Scalability**: Medium.

#### Option B2: Manual retry loop + `setTimeout` self-scheduling (Rule #2 pattern)
- **Description**: An imperative `for attempt in 1..3` loop inside `WebhookDispatcher`,
  writing/updating the `webhook_deliveries` row per attempt and `await`-ing a flat 30s
  delay between attempts (`await new Promise(r => setTimeout(r, backoffMs))`). The whole
  loop runs detached from the request via the fire-and-forget `.catch()` at the
  `moveCard` call site. Never throws to caller.
- **Pros**:
  - **Directly satisfies C7 + AC-ASYNC-1**: per-attempt DB write, per-step persistence.
  - Flat 30s backoff is a single constant — exactly the spec.
  - Mirrors the proven `triggerDoneColorRule` flow → consistent, low-risk, already
    reviewed pattern in the codebase.
  - Zero new infrastructure (C8) — `setTimeout` inside an async loop.
  - Distinguishes `http_response_code = NULL` (timeout/connection) from a numeric non-2xx
    cleanly because the transport returns `status: number | null`.
- **Cons**:
  - In-process: a process restart mid-backoff loses the in-flight retry (no durable
    queue). Acceptable for a self-hosted MVP — documented as a known limitation; the
    `pending`/`failed` row remains in the DB as a forensic record.
  - Long-lived timer holds a small amount of memory for up to ~60s per in-flight delivery.
- **Technical Fit**: High — this is the codebase's sanctioned pattern for exactly this
  shape.
- **Complexity**: Low-Medium.
- **Scalability**: High at target scale (10s–100s of deliveries/hour, not 1000s/sec).

#### Option B3: In-process job queue / worker
- **Description**: A small in-memory queue with a worker draining deliveries and a
  scheduled-retry data structure.
- **Pros**: Decouples dispatch from the firing path; centralizes concurrency control;
  closer to a future message-bus extraction.
- **Cons**:
  - **Over-engineered for MVP scale** (NFR5) and the explicit "no message bus for v1"
    constraint; the Clean-architecture-over-engineering risk in productBrief flags this.
  - Still in-process → same durability story as B2 but with materially more code,
    lifecycle management, and graceful-shutdown handling.
  - Larger blast radius and test surface for a Level 4 task already carrying 4 phases.
- **Technical Fit**: Medium.
- **Complexity**: High.
- **Scalability**: High (but unneeded headroom).

## Evaluation Matrix

Decision A (firing table):

| Criteria | A1 Reuse | A2 Separate table | A3 Collapse |
|----------|----------|-------------------|-------------|
| Scalability | Med | **High** | Med |
| Maintainability | Low | **High** | Med |
| Scope compliance (additive) | **Fail** | **Pass** | Partial |
| AC compliance (R2 + envelope) | Med | **High** | **Fail** |
| Implementation Cost | Med | **Low** | Low |

Decision B (retry/scheduler):

| Criteria | B1 retryWithBackoff | B2 Manual loop + setTimeout | B3 In-proc queue |
|----------|---------------------|------------------------------|------------------|
| Scalability | Med | **High** (at target) | High |
| Maintainability | Med | **High** (proven pattern) | Med |
| Per-attempt persistence (AC-ASYNC-1) | **Fail** | **Pass** | Pass |
| Flat 30s backoff fidelity | **Fail** | **Pass** | Pass |
| Constraint fit (C7/C8) | Fail | **Pass** | Partial |
| Implementation Cost | Low | **Low-Med** | High |

## Observability Architecture

### Logging
- **Library**: pino — module `logger` inside services/dispatcher, `req.log` in routes
  (matches existing workflow code). No `console.log` (Principle #4).
- **Format**: structured JSON; OTel-aligned base fields (`service`, `version`,
  `environment`) plus `requestId`/`traceId` in request scope.
- **No-secrets rule (Principle #9 / NFR3)**: the **full `webhook_url` is never logged** —
  log only the parsed **host** (`new URL(url).host`) plus the `automation_rule_id` and
  `delivery_id`. The URL may embed query-string tokens.
- **Per-attempt log lines** (the analog of `workflow.rule2.*`):
  - `webhook.dispatch.attempt` — `{ deliveryId, ruleId, attempt, host }`
  - `webhook.dispatch.delivered` — `{ deliveryId, ruleId, attempt, httpStatus }`
  - `webhook.dispatch.failed` — `{ deliveryId, ruleId, attempt, httpStatus|null, errKind }`
  - `webhook.dispatch.exhausted` — `{ deliveryId, ruleId, attemptCount: 3 }`

### Distributed Tracing
- **SDK**: OpenTelemetry (project standard; `OTEL_SDK_DISABLED` defaults true in this MVP
  config but the propagation must still be wired so it works when enabled).
- **Propagation**: W3C Trace Context. The dispatcher creates a **root span** for the
  delivery job (background work originating off the request) tagged with `rule.id`,
  `board.id`, `delivery.id`; the `WebhookTransport` **injects the `traceparent` header**
  into the outbound POST so a downstream receiver can correlate.

| From | To | Protocol | Propagation Method |
|------|-----|----------|--------------------|
| `moveCard` request span | `evaluateCardMovedToDone` | in-process | active context / span link |
| `WebhookDispatcher` (root span) | external webhook URL | HTTP | `traceparent` request header (injected by transport) |

- **Sampling**: `OTEL_TRACES_SAMPLER_ARG` (existing convention); dev 1.0.

### Metrics
- **Standard**: `http_requests_total{method, route, status_code}` and
  `http_request_duration_seconds{method, route}` already governed by the platform standard
  for the inbound API.
- **Custom business metrics** (low-cardinality labels only — never the URL or rule UUID as
  a label):
  - `webhook_deliveries_total{trigger_type, outcome}` where `outcome ∈
    {delivered, exhausted}`.
  - `webhook_delivery_attempts_total{outcome}` where `outcome ∈
    {2xx, non_2xx, timeout, connection_error}`.
  - `webhook_delivery_attempt_duration_seconds{outcome}`.
- **Cardinality guideline**: no `delivery_id`, `rule_id`, `board_id`, or host as a metric
  label (those live in logs/spans, not metric dimensions).

### Configuration Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `LOG_LEVEL` | Log verbosity | info |
| `LOG_FORMAT` | Output format | json |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | (unset) |
| `OTEL_SDK_DISABLED` | Disable OTel SDK | true (MVP) |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio | 1.0 (dev) |
| `WEBHOOK_MAX_ATTEMPTS` | Max delivery attempts | 3 |
| `WEBHOOK_BACKOFF_MS` | Flat backoff between attempts | 30000 |
| `WEBHOOK_REQUEST_TIMEOUT_MS` | Per-attempt HTTP timeout | 5000 |
| `WEBHOOK_BLOCK_PRIVATE_RANGES` | SSRF: block loopback/link-local/private IP targets | true |

## Decision

**Chosen**: **A2 (separate `trigger_executions` table)** + **B2 (manual retry loop with
`setTimeout` self-scheduling)**, with the supporting decisions below.

### Resolution of all 7 open questions

1. **`trigger_executions` vs `workflow_rule_triggers` (A2)** — genuinely **separate**
   tables. `trigger_executions` is new and records firings of **user-configurable** rules;
   `workflow_rule_triggers` is untouched and continues to serve the two built-in rules.
   This is intentional and additive. `webhook_deliveries` FKs to `trigger_executions`.

2. **`webhook_deliveries` schema** — one row per firing (created `pending`, updated in
   place per attempt). FK to `trigger_executions` (CASCADE) **and** a denormalized
   `automation_rule_id` (CASCADE) + `board_id` (CASCADE) so the Delivery History query can
   filter by board without a 3-table join. `status` CHECK enumerates **exactly**
   `('pending','delivered','failed','exhausted')` — **intentionally divergent** from
   `workflow_action_deliveries`' `('pending','success','failed')`. Index on
   `(board_id, created_at DESC)` for the history list (cursor pagination, Principle #13).

3. **`automation_rules` schema** — `trigger_type` varchar with CHECK `('card.moved.done')`
   for v1 (extensible by widening the CHECK in a future migration); `webhook_url` text
   (validated at the service layer); `enabled` boolean NOT NULL DEFAULT true; `board_id`
   FK CASCADE. Phase-2 matching reads enabled rules via
   `findEnabledRulesByBoardAndTrigger(boardId, 'card.moved.done')` at the `moveCard` Done
   fire point — a single indexed query (`(board_id, trigger_type)` partial index
   `WHERE enabled`).

4. **Retry mechanism (B2)** — manual imperative loop in `WebhookDispatcher`, per-attempt
   DB write, **flat** 30s backoff (`WEBHOOK_BACKOFF_MS`, not exponential), max 3
   (`WEBHOOK_MAX_ATTEMPTS`), per-attempt timeout `WEBHOOK_REQUEST_TIMEOUT_MS` (5s). Async
   scheduler is **immediate-with-`setTimeout`** inside the detached loop — no in-process
   queue, no message bus (C8). `retryWithBackoff` is explicitly **not** used (cannot do
   per-attempt persistence; backoff shape wrong).

5. **Payload envelope** — adopt the proposed shape, **add a top-level `version` field** for
   forward compatibility (cheap insurance against future shape changes; receivers can
   branch on it):
   ```json
   {
     "version": "1",
     "event": "card.moved",
     "rule_id": "<automation_rule uuid>",
     "board_id": "<board uuid>",
     "trigger_execution_id": "<trigger_executions uuid>",
     "occurred_at": "<ISO 8601>",
     "data": {
       "card_id": "<uuid>",
       "card_title": "<string>",
       "from_column": "<string|null>",
       "to_column": "Done"
     }
   }
   ```

6. **Dispatch HTTP client** — Node's **built-in `fetch`** (undici, Node 18+) wrapped in
   `WebhookTransport`, with an `AbortController` + `setTimeout(timeoutMs)` for the timeout.
   No new dependency (C9). The transport injects `traceparent` and `Content-Type:
   application/json`. It returns a discriminated result so the dispatcher can record
   `http_response_code` exactly:
   - response received (any status) → `{ ok: res.status>=200 && <300, status: res.status }`
     → persist `http_response_code = status`.
   - `AbortError` (timeout) or network/connection error → `{ ok: false, status: null,
     errorKind: 'timeout' | 'connection' }` → persist `http_response_code = NULL`.
   The transport never logs the URL (host-only).

7. **SSRF / URL validation depth** — **two-tier, proportionate to a self-hosted product**:
   - **Sync (rule-create time, always on)**: parse with `new URL()`; reject non-`http(s)`
     schemes; reject malformed URLs → `WorkflowError` (400, field `webhook_url`). This is
     the only validation surfaced to the user.
   - **Dispatch-time (toggleable, default on)**: when `WEBHOOK_BLOCK_PRIVATE_RANGES=true`,
     refuse to POST to hosts that resolve to loopback / link-local (`169.254.0.0/16`, the
     cloud-metadata `169.254.169.254`) / RFC-1918 private ranges, recording the delivery as
     `exhausted` with a structured `error` rather than attempting the request. Full egress
     allow-listing, DNS-rebind defense, and HMAC signing remain **out of scope** (per
     Scope Boundaries) — the toggle defaults on but a self-hoster who *wants* to hit an
     internal CI endpoint can set it false. This is documented, not silently enforced.

### Migration SQL sketch (node-pg-migrate JS — next epoch-ms filename)

Filename: `backend/migrations/20260630120000_add-automation-webhooks.js`

```js
/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  // 1. automation_rules — user-configurable rules
  pgm.createTable('automation_rules', {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    board_id:    { type: 'uuid', notNull: true, references: '"boards"', onDelete: 'CASCADE' },
    trigger_type:{ type: 'varchar', notNull: true },
    webhook_url: { type: 'text', notNull: true },
    enabled:     { type: 'boolean', notNull: true, default: true },
    created_at:  { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('automation_rules', 'automation_rules_trigger_type_check',
    "CHECK (trigger_type IN ('card.moved.done'))");
  // partial index for the hot Phase-2 lookup (enabled rules per board+trigger)
  pgm.createIndex('automation_rules', ['board_id', 'trigger_type'],
    { where: 'enabled = true', name: 'automation_rules_board_trigger_enabled_idx' });

  // 2. trigger_executions — one row per user-rule firing (decoupled from delivery)
  pgm.createTable('trigger_executions', {
    id:                { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    automation_rule_id:{ type: 'uuid', notNull: true, references: '"automation_rules"', onDelete: 'CASCADE' },
    board_id:          { type: 'uuid', notNull: true, references: '"boards"', onDelete: 'CASCADE' },
    card_id:           { type: 'uuid', references: '"cards"', onDelete: 'SET NULL' },
    occurred_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('trigger_executions', ['board_id', 'occurred_at']);

  // 3. webhook_deliveries — one row per firing, updated in place per attempt
  pgm.createTable('webhook_deliveries', {
    id:                  { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    trigger_execution_id:{ type: 'uuid', notNull: true, references: '"trigger_executions"', onDelete: 'CASCADE' },
    automation_rule_id:  { type: 'uuid', notNull: true, references: '"automation_rules"', onDelete: 'CASCADE' },
    board_id:            { type: 'uuid', notNull: true, references: '"boards"', onDelete: 'CASCADE' },
    attempt_count:       { type: 'int', notNull: true, default: 0 },
    status:              { type: 'varchar', notNull: true, default: 'pending' },
    http_response_code:  { type: 'int' },              // NULL on timeout/connection error
    error:               { type: 'jsonb' },            // structured { field, error }[] detail
    created_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:          { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // intentional divergence from workflow_action_deliveries (pending|success|failed)
  pgm.addConstraint('webhook_deliveries', 'webhook_deliveries_status_check',
    "CHECK (status IN ('pending', 'delivered', 'failed', 'exhausted'))");
  pgm.createIndex('webhook_deliveries', ['board_id', 'created_at']); // Delivery History list
};

exports.down = (pgm) => {
  pgm.dropTable('webhook_deliveries');   // children first
  pgm.dropTable('trigger_executions');
  pgm.dropTable('automation_rules');
};
```

> **Note on `error` column type**: `jsonb` (not `text`) so the persisted async failure
> mirrors the `WorkflowError` `details: [{field,error}]` shape directly (AC-ERROR-1 step 2
> requires the structured detail shape in `webhook_deliveries.error`). The built-in
> engine's `workflow_action_deliveries.delivery_error` is plain `text`; this divergence is
> intentional and matches the spec's stronger structured-error requirement.

### Dispatcher retry-loop pseudo-code (Rule #2 Manual Retry Loop Pattern applied)

```
WebhookDispatcher.dispatch(rule, execution, payload): Promise<void>   // never throws
  1. deliveryId = repo.insertWebhookDelivery({
         trigger_execution_id: execution.id,
         automation_rule_id:   rule.id,
         board_id:             rule.board_id,
         status: 'pending', attempt_count: 0,
     })                                                  // AC-ASYNC-1: pending, attempt_count=0

  2. // SSRF dispatch-time guard (question 7)
     if config.WEBHOOK_BLOCK_PRIVATE_RANGES and isPrivateHost(rule.webhook_url):
         repo.updateDeliveryAttempt(deliveryId, {
             attempt_count: 0, status: 'exhausted',
             http_response_code: null,
             error: [{ field: 'webhook_url', error: 'blocked private/loopback target' }],
         })
         logger.warn({ deliveryId, ruleId: rule.id, host }, 'webhook.dispatch.blocked')
         return

  3. lastError = null
     for attempt = 1 to config.WEBHOOK_MAX_ATTEMPTS:
         logger.info({ deliveryId, ruleId, attempt, host }, 'webhook.dispatch.attempt')
         result = await transport.post(rule.webhook_url, payload, config.WEBHOOK_REQUEST_TIMEOUT_MS)
                  // result: { ok, status: number|null, errorKind? }

         if result.ok:                                   // 2xx
             repo.updateDeliveryAttempt(deliveryId, {
                 attempt_count: attempt, status: 'delivered',
                 http_response_code: result.status, error: null,
             })
             logger.info({ deliveryId, ruleId, attempt, httpStatus: result.status }, 'webhook.dispatch.delivered')
             return                                       // terminal — AC-HAPPY-1

         // failure (non-2xx OR timeout/connection)
         lastError = buildErrorDetail(result)            // { field:'webhook', error: '...' }
         budgetLeft = attempt < config.WEBHOOK_MAX_ATTEMPTS
         repo.updateDeliveryAttempt(deliveryId, {
             attempt_count: attempt,
             status: budgetLeft ? 'failed' : 'exhausted', // AC-ASYNC-1: failed (transient) / exhausted (terminal)
             http_response_code: result.status,           // numeric on non-2xx, NULL on timeout/conn (AC-ERROR-1)
             error: [lastError],
         })
         logger.warn({ deliveryId, ruleId, attempt, httpStatus: result.status, errKind: result.errorKind },
                     'webhook.dispatch.failed')

         if budgetLeft:
             await sleep(config.WEBHOOK_BACKOFF_MS)        // flat 30s — NOT exponential

     logger.error({ deliveryId, ruleId, attemptCount: config.WEBHOOK_MAX_ATTEMPTS }, 'webhook.dispatch.exhausted')
     return                                                // never throws
```

Fire point (Fire-and-Forget Trigger Pattern, mirrors the existing Rule #2 call in
`card.service.ts`):

```typescript
// In CardService.moveCard, alongside the existing Rule #2 fire-and-forget:
if (this.automationService && destColName === 'Done') {
  this.automationService.evaluateCardMovedToDone(boardId, card).catch((err) => {
    logger.warn({ err, cardId: card.id }, 'automation.evaluate.trigger_failed');
  });
}
```

`evaluateCardMovedToDone` itself awaits `dispatcher.dispatch(...)` only with a
`.catch()` per rule (or `Promise.allSettled` across rules, mirroring `applyBoardRules`),
so one rule's delivery never blocks another and nothing rejects to `moveCard`.

### Rationale

- **A2** is the only firing-table option that honors the **additive scope boundary**
  (existing tables untouched), satisfies **R2 decoupling** structurally, and supplies the
  `trigger_execution_id` the payload envelope and AC explicitly require. The two-firing-
  table divergence is a documented, intentional consequence of keeping the engines
  independent — far safer than overloading a varchar `rule_id` that today holds string
  constants.
- **B2** is mandated in spirit by the codebase: the **Rule #2 Manual Retry Loop Pattern**
  exists precisely because `retryWithBackoff` cannot persist per-attempt. AC-ASYNC-1
  requires per-step persistence and a flat 30s cadence — only the manual loop delivers
  both. It also reuses a proven, reviewed shape (`triggerDoneColorRule`), minimizing risk
  on a 4-phase Level 4 task.
- **Built-in `fetch`** avoids a new dependency (the codebase deliberately has no HTTP
  client), and its `AbortController` model gives the exact `http_response_code = NULL`
  vs numeric distinction AC-ERROR-1 demands.
- **`WebhookTransport` as a separate injected component** keeps `AutomationService` and
  `WebhookDispatcher` free of `fetch`, preserving Principle #1 (no HTTP in services) and
  making the dispatcher unit-testable with a mock transport (the Phase-3 test strategy
  asserts the **actual POST body** via a stub transport — Stub Detection).

### Trade-offs Accepted

- **In-process retry is not durable** — a process restart mid-30s-backoff abandons the
  in-flight retry. Acceptable for a self-hosted MVP with no SLA (productBrief Availability:
  "best-effort, no SLA"); the partial `webhook_deliveries` row persists as a forensic
  record. Future durable-queue extraction is unblocked because the dispatcher is a single
  injected component.
- **Two firing tables** (`workflow_rule_triggers` + `trigger_executions`) — extra
  conceptual surface, mitigated by an explicit systemPatterns note and intentional naming.
- **SSRF defense is basic** — a toggle, not a full egress firewall. Proportionate to the
  self-hosted threat model and the stated scope; default-on protects the naive operator,
  off lets the deliberate one reach internal endpoints.
- **`webhook_deliveries.error` is `jsonb`** while the built-in table uses `text` — minor
  schema inconsistency, justified by AC-ERROR-1's structured-detail requirement.

## Implementation Guidelines

1. **Migration** `20260630120000_add-automation-webhooks.js` — three new tables exactly as
   sketched; named CHECK constraints; partial index on `automation_rules`; `(board_id,
   created_at)` index on `webhook_deliveries`. Verify the next epoch-ms is greater than the
   latest existing migration (`20260629000000`) at implementation time.
2. **`AutomationRepository`** — all methods parameterized (`$1,$2,…`), `RETURNING id` on
   inserts (Principles #5/#6). Domain types (`AutomationRule`, `TriggerExecution`,
   `WebhookDelivery`) defined at the top of the repository file (Principle #11).
   `updateDeliveryAttempt` sets `updated_at = now()` on every write.
3. **`AutomationService`** — sync `validateWebhookUrl` throws `WorkflowError` with field
   `webhook_url`. `evaluateCardMovedToDone` uses `Promise.allSettled` across matched rules
   (mirrors `applyBoardRules`); never throws.
4. **`WebhookDispatcher`** — the manual loop above; never throws; injected
   `WebhookTransport`, `AutomationRepository`, and a `WebhookConfig` slice
   (`maxAttempts`, `backoffMs`, `requestTimeoutMs`, `blockPrivateRanges`) following the
   `WorkflowConfig` precedent.
5. **`WebhookTransport`** — built-in `fetch` + `AbortController`; returns the discriminated
   `{ ok, status, errorKind }`; injects `traceparent` + `Content-Type`; logs host only.
6. **Config** — add `WEBHOOK_MAX_ATTEMPTS` (3), `WEBHOOK_BACKOFF_MS` (30000),
   `WEBHOOK_REQUEST_TIMEOUT_MS` (5000), `WEBHOOK_BLOCK_PRIVATE_RANGES` (true) to the zod
   schema **and** the `Config` type in `src/config.ts` (the only `process.env` reader).
7. **Wiring** — construct `AutomationRepository`, `WebhookTransport`, `WebhookDispatcher`,
   `AutomationService` in `createRouter(db)`; inject `AutomationService` into `CardService`
   as an **optional** dependency (WorkflowService Optional DI Pattern) so existing
   `CardService` tests stay free of automation infra.
8. **Routes** — `createAutomationRouter(db)` mounted under the `requireAuth` gate; all
   handlers `asyncHandler`-wrapped; list endpoints use cursor pagination (Principle #13).
9. **Logging** — never log `webhook_url`; host-only. Use the `webhook.dispatch.*` event
   names. No `console.log`.

## Validation Checklist

- [x] Meets all system requirements (R1–R6)
- [x] Respects technical constraints (C1–C10)
- [x] Addresses non-functional requirements (NFR1–NFR5)
- [x] Technically feasible (built-in `fetch`; no new deps; proven retry pattern)
- [x] Risks identified and acceptable (see Risk Assessment)
- [x] Complies with Guiding Principles in systemPatterns.md (no deviations required;
      `jsonb error` column + two firing tables are additive schema choices, not principle
      violations)
- [x] Respects established patterns (Manual Retry Loop, Fire-and-Forget, Optional DI,
      App Factory, WorkflowError, Domain Types at repo, parameterized SQL + RETURNING)
- [x] Observability architecture defined (pino events, host-only URL, OTel root span +
      `traceparent` injection, custom metrics)
- [x] Trace context propagation across all service boundaries (in-process context →
      `traceparent` header on outbound POST)
- [x] Logging strategy consistent with observability-requirements.md (structured JSON,
      no secrets, configurable via env)
- [x] Metrics strategy follows naming conventions (low-cardinality labels; `_total` /
      `_seconds` suffixes)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Process restart loses in-flight retry | Med | Low | Acceptable for self-hosted/no-SLA; partial DB row persists; dispatcher is a single injectable component for future durable-queue swap |
| Webhook URL embeds a token leaked to logs | Med | High | Host-only logging enforced in transport + dispatcher; Principle #9 covered by Code Reviewer |
| SSRF to loopback / cloud-metadata endpoint | Med | Med | `WEBHOOK_BLOCK_PRIVATE_RANGES` default-on; sync scheme/format validation at create time |
| Two firing tables conflated by future devs | Med | Med | systemPatterns note documenting intentional separation; distinct table names + FK identity model |
| Long backoff (up to ~60s) holds timer/memory per delivery | Low | Low | Bounded by `WEBHOOK_MAX_ATTEMPTS`; target scale is 10s–100s deliveries/hour |
| `fetch`/undici timeout semantics differ across Node versions | Low | Med | `AbortController` timeout is stable Node 18+; transport unit-tested with fake timers + mock fetch |
| Card move delayed by accidental `await` on dispatch | Low | High | Fire-and-forget `.catch()` at the `moveCard` call site; decoupling asserted by Phase-2 test |

## Next Steps

1. **Phase 1** — Write migration `20260630120000_add-automation-webhooks.js`; build
   `AutomationRepository` + domain types; add CRUD routes (`POST/GET/PATCH/DELETE
   /boards/:boardId/automation-rules`) with `WorkflowError` validation; add `WEBHOOK_*`
   Config fields. Tests: migration integration (tables, FKs, CHECK enum), repo unit
   (mock `Queryable`), route integration (supertest).
2. **Phase 2** — `AutomationService.evaluateCardMovedToDone`; wire optional
   `AutomationService` into `CardService.moveCard` Done fire point; record
   `trigger_executions` decoupled from delivery. Tests: matching/no-match/disabled,
   decoupling assertion, fire-and-forget regression.
3. **Phase 3** — `WebhookTransport` (built-in `fetch` + `AbortController`) and
   `WebhookDispatcher` (manual retry loop); SSRF dispatch-time guard. Tests: AC-HAPPY-1
   (assert actual POST body == envelope), AC-ERROR-1 (500 → code; timeout → NULL),
   AC-ASYNC-1 (full lifecycle, fake timers across 30s backoff), no-throw guarantee,
   no-URL-in-logs.
4. **Phase 4** — Board Settings → Automation tab (per UI/UX creative doc): rules list,
   New Rule form, Delivery History; `GET /boards/:boardId/webhook-deliveries` read
   endpoint.

---

**Cross-references**: builds on `systemPatterns.md` (Rule #2 Manual Retry Loop Pattern,
Fire-and-Forget Trigger Pattern, Webhook Delivery Pattern, WorkflowService Optional DI
Pattern, WorkflowError Pattern). UI surface decisions are deferred to the parallel
UI/UX creative doc (`TASK-019-webhook-delivery-uiux.md`).
