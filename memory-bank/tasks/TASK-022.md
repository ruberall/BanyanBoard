# TASK-022: Characterization Tests Card Workflow

**Complexity**: Level 3 (inherited from FEAT-018)
**Status**: CREATIVE_COMPLETE
**Roadmap**: FEAT-018
**Branch**: feature/FEAT-018-characterization-tests-card-workflow
**Worktree**: [set during /banyan-build git setup]

## Task Description

Author characterization tests for the entire Card Workflow Automation feature — the status-change handler (`WorkflowService.applyBoardRules` stale-rule + `triggerDoneColorRule`, and `CardService.moveCard`'s fire-and-forget trigger) AND the `GET /cards/:id/activity` endpoint. Exercise the REAL code — no mocks, stubs, spies, or fakes; a mock captures the mock's behavior, not the code's, which defeats characterization. For every public function/handler, capture what it CURRENTLY does, exactly (never what it SHOULD do) — use exact equality (`toBe`), never `toContain`, for all string output. Cover: entry ordering, JSON shape, timestamp format, 404 body, empty-feed shape, notification text and recipient, and every error path. Split by how each function reaches its result: **Pure** (no I/O, e.g. the message formatter) — import and call directly; if private, extract it to a util — goes in `tests/characterization/card-workflow.test.ts`. **DB-backed** — run against a real test DB with seeded rows — goes in `card-workflow.integration.test.ts` + `card-activity.integration.test.ts` (both under `tests/characterization/`, require a real `DATABASE_URL`). Report: pure vs DB functions covered, cases per function, anything extracted, anything skipped and why.

## Specification

**Feature Type**: NFR/Infrastructure
**Creative Exploration Needed**: Yes — see below

### Codebase Findings (grounding this spec)

- **`projectActivityRow`** (`backend/src/routes/cards.ts:33`) is **already a pure, exported function** — takes an `EventRow`, returns `{ id, type, message, createdAt }`. It requires **no extraction**; it can be imported and called directly today. **Confidence: HIGH.**
- **`WorkflowService.applyBoardRules`** and **`WorkflowService.triggerDoneColorRule`** (`backend/src/services/workflow.service.ts`) build their `WorkflowWarning`/log messages **inline, interleaved with `await this.repo.*` calls in the same method body** (e.g. `` `Stale rule failed for card ${cardId}: ${err.message}` ``, the `WORKFLOW_STALE_COL_MISSING` message). There is no already-separated pure formatter to import — extracting one is a genuine refactor decision (must stay behavior-preserving) or the alternative is to characterize these messages only via the DB-backed integration suite. **Confidence: MEDIUM — needs a creative decision** on whether to extract (Phase 1) or accept DB-backed-only coverage.
- **No "recipient" concept exists** for `WorkflowWarning` messages in this codebase — they're returned in the `GET /boards/:id` response body's `warnings[]` array (per `systemPatterns.md`/`techContext.md`), not delivered to a specific user/channel. The task description's "notification text and recipient" phrase most plausibly maps to: (a) the warning `message` text itself, and (b) the `workflow_rule_triggers`/`workflow_action_deliveries` rows' `card_id`/`board_id` fields, which are the closest thing to a "recipient" (identifying which card/board the outcome applies to). **Confidence: LOW — flagged for creative** to confirm this mapping is what's intended, since no literal notification-recipient mechanism exists in scope.
- `CardService.moveCard` (`backend/src/services/card.service.ts:118-123`) fires `this.workflowService.triggerDoneColorRule(boardId, card.id)` fire-and-forget (`.catch()` swallows errors, logs a warning) when `destColName === 'Done'`. This is the "status-change handler" entry point referenced in the task description.
- `GET /cards/:id/activity` (`backend/src/routes/cards.ts:161-165`) calls `service.getCardById` first (404 via `NotFoundError` if missing — `errors.ts:23-25`, body shape `{ code: 'NOT_FOUND', ... }` per `AppError`), then `eventRepo.findByCardId(id, 50)`, then maps rows through `projectActivityRow`.
- Existing real-DB integration test convention (`backend/src/__tests__/workflow-foundation.integration.test.ts`): `describeIfDb = process.env.DATABASE_URL ? describe : describe.skip`, `new Pool({ connectionString: DATABASE_URL })`, `runMigrations(pool, testConfig)` in `beforeAll`, direct repository/pool queries, `DELETE FROM boards WHERE id = $1` cascade cleanup in `afterEach`. The new integration suites should follow this exact pattern.

### Verification Method
- **Test method**: `cd backend && npm test tests/characterization` (Jest) for both pure and DB-backed suites; DB-backed suites additionally require `DATABASE_URL` pointed at a real Postgres instance (Docker-managed per `techContext.md`) and gate via `describeIfDb`, matching the existing integration-test convention
- **Success metrics**: Every pure function in scope (confirmed: `projectActivityRow`; TBD by creative: any extracted `WorkflowService` message formatter) has direct-call tests in `card-workflow.test.ts` using `toBe` exact-equality assertions — zero `toContain` for string output; every DB-backed function/handler (`WorkflowService.applyBoardRules`, `WorkflowService.triggerDoneColorRule`, `CardService.moveCard`'s Done-color trigger, `GET /cards/:id/activity`) has integration tests against seeded real rows with zero mocks/stubs/spies/fakes; every identified error path has an explicit test
- **Observable at**: Test run output (`npm test` pass/fail across the three new files under `tests/characterization/`), plus the final task report (pure vs DB functions covered, cases per function, anything extracted, anything skipped and why)
- **Verification frequency**: One-time (this task's deliverable); the resulting suites then run continuously as part of `cd backend && npm test`

### Acceptance Criteria

#### AC-VERIFY-1: All three characterization suites run and pass
**Priority**: MUST
**Given** the backend test suite is run via `cd backend && npm test tests/characterization`
**When** `DATABASE_URL` points at a real, migrated Postgres instance
**Then** all three suites (`card-workflow.test.ts`, `card-workflow.integration.test.ts`, `card-activity.integration.test.ts`) execute and pass, with the two integration suites actually running (not skipped) under that `DATABASE_URL`

#### AC-VERIFY-2: Pure functions characterized with exact-equality, real-code calls
**Priority**: MUST
**Given** `card-workflow.test.ts` imports `projectActivityRow` (and any function extracted per the Phase 1 creative decision) directly from its source module
**When** each is called with representative `EventRow`/input fixtures covering every known `event_type` and edge case (missing optional payload fields, unknown event type)
**Then** the test asserts the exact current output string via `toBe` (never `toContain`), with no mocking of the function itself or its inputs

#### AC-VERIFY-3: DB-backed workflow functions characterized against real seeded data
**Priority**: MUST
**Given** a real seeded board/column/card fixture set in a test DB (via `describeIfDb`, following the `workflow-foundation.integration.test.ts` pattern)
**When** `WorkflowService.applyBoardRules` runs against a stale-eligible card, and `WorkflowService.triggerDoneColorRule` / `CardService.moveCard`'s Done-color trigger run against a card moved to Done
**Then** the tests capture: the exact `WorkflowWarning[]` shape and message text returned; the exact rows written to `workflow_rule_triggers` and `workflow_action_deliveries` (status, attempt count, error text) for both success and induced-failure paths; the exact resulting `cards.column_id`/`cards.color` values — using real repository/DB calls with no mocking

#### AC-VERIFY-4: Activity endpoint characterized against real seeded data
**Priority**: MUST
**Given** a real Express app + real DB (via supertest, following `automation.routes.integration.test.ts`'s pattern) with seeded `card_events` rows for a card, and a separate card with zero events, and a nonexistent card id
**When** `GET /cards/:id/activity` is called for each case
**Then** the tests capture: exact entry ordering (newest-first per `EventRepository.findByCardId`'s existing `ORDER BY`), exact JSON shape (`{ id, type, message, createdAt }[]`), exact `createdAt` serialization format (ISO string as JSON-serialized by Express, not a `Date` object), the exact empty-array shape for the zero-events card, and the exact 404 response body (`{ code: 'NOT_FOUND', message: ... }`) for the nonexistent card — via `toBe`/`toEqual` exact assertions, not `toContain`

#### AC-VERIFY-5: Every error path is captured, not just happy paths
**Priority**: MUST
**Given** the full set of failure-inducing conditions reachable in scope (missing Stale column, `repo.moveCardToStale` failure for one card among several via `Promise.allSettled`, all `workflowRule2MaxAttempts` attempts failing for the Done-color rule, activity fetch for a nonexistent card)
**When** each condition is induced against real code (e.g. a real DB constraint violation or a genuinely-missing row — not a mocked rejection)
**Then** each has a dedicated test capturing the exact resulting warning/response/DB-row shape

### Scope Boundaries
- **In scope**: `WorkflowService.applyBoardRules` (stale rule), `WorkflowService.triggerDoneColorRule` (Done-color rule), `CardService.moveCard`'s fire-and-forget trigger of the above, `projectActivityRow`, `GET /cards/:id/activity` (including its 404-via-`getCardById` and empty-feed paths)
- **Out of scope**: `AutomationService`/webhook delivery (FEAT-016, separate already-shipped feature, even though `CardService.moveCard` also fires `evaluateCardMovedToDone` alongside the Done-color trigger); any frontend code; fixing any behavior found to be surprising during characterization (report it, don't change it, per the task's explicit instruction)
- **Dependencies**: A real Postgres instance with migrations applied (existing `runMigrations` helper), the existing `describeIfDb`/`Pool` integration-test convention, existing `board.repository.ts`/`card.repository.ts`/`event.repository.ts` seed helpers or direct SQL inserts for fixture setup
- **NFR implications**: None beyond standard test-suite runtime — these are read/characterization tests, not a performance or security surface

### Creative Exploration Needed

Yes — three specific questions, appropriate for an **Algorithm Design** creative pass (test-architecture decisions, not UI/architecture-of-the-product decisions):

1. **Extraction decision**: Should the inline warning/message-building logic in `WorkflowService.applyBoardRules`/`triggerDoneColorRule` be extracted into standalone pure functions (behavior-preserving refactor, Phase 1), or is DB-backed-only characterization sufficient given the messages are inherently interleaved with I/O? This determines whether Phase 1 (extraction) is needed at all.
2. **"Notification text and recipient" mapping**: Confirm the task's phrase maps to `WorkflowWarning.message` text + the `workflow_rule_triggers`/`workflow_action_deliveries` `card_id`/`board_id` fields (this spec's working assumption), since no literal notification/recipient mechanism exists in the current codebase for this feature.
3. **DB seeding/teardown strategy**: Concrete fixture-setup approach for two independent integration suites (board/column/card creation helpers vs. raw SQL inserts; how to induce genuine failures like "Stale column missing" or "all retry attempts fail" using real code paths rather than mocks — e.g. a card in a board with no Stale column, or a `setCardColor` call against a since-deleted card to force a real DB error).

## Implementation Plan

### Overview
Author three new characterization-test files under `backend/tests/characterization/` that lock in the CURRENT, real behavior of the Card Workflow Automation status-change handler and the `GET /cards/:id/activity` endpoint, using real code paths (no mocks/stubs/spies/fakes) and exact-equality assertions. No product behavior changes; the only source change permitted is a behavior-preserving extraction of pure formatting logic (Phase 1, pending creative decision).

### Requirements

#### Functional
- Three new test files exist and pass: `card-workflow.test.ts` (pure), `card-workflow.integration.test.ts` (DB-backed), `card-activity.integration.test.ts` (DB-backed)
- Every public function/handler in scope is characterized with real-code calls
- Every string assertion uses `toBe`, never `toContain`
- Final task report documents pure vs DB functions covered, cases per function, anything extracted, anything skipped and why

#### Non-Functional
- Zero mocks/stubs/spies/fakes anywhere in the three new files
- DB-backed suites gate on `DATABASE_URL` via `describeIfDb`, matching `workflow-foundation.integration.test.ts`'s existing convention, so unit-only CI runs (no `DATABASE_URL`) skip gracefully rather than fail
- No behavior changes — if Phase 1 extraction happens, it must be verified behavior-preserving by the full existing backend suite passing unchanged

### Component Analysis

#### New Components
- `backend/tests/characterization/card-workflow.test.ts` — new pure-function test file
- `backend/tests/characterization/card-workflow.integration.test.ts` — new DB-backed test file
- `backend/tests/characterization/card-activity.integration.test.ts` — new DB-backed test file
- (Conditional on creative decision) A new util module housing any extracted `WorkflowService` message-formatting logic

#### Affected Components
- `backend/src/services/workflow.service.ts` — read-only characterization target; touched only if the creative phase decides on extraction (Phase 1)
- `backend/src/repositories/workflow.repository.ts` — read-only characterization target (DB-backed)
- `backend/src/services/card.service.ts` — read-only characterization target (`moveCard`'s fire-and-forget trigger)
- `backend/src/routes/cards.ts` — read-only characterization target (`projectActivityRow`, `GET /:id/activity`)

#### Component Interactions
No new runtime interactions — these are read-only test suites exercising existing call chains: `CardService.moveCard` → `WorkflowService.triggerDoneColorRule` → `WorkflowRepository.setCardColor`/`insertTrigger`/`insertDelivery`; `WorkflowService.applyBoardRules` → `WorkflowRepository.findStaleCards`/`moveCardToStale`/`insertTrigger`/`insertDelivery`; `GET /cards/:id/activity` → `CardService.getCardById` → `EventRepository.findByCardId` → `projectActivityRow`.

### Implementation Strategy
1. Phase 1 — Inventory every public pure vs DB-backed function in scope; resolve the 3 creative questions (extraction decision, notification/recipient mapping, DB seeding strategy); if extraction is decided, perform it as a behavior-preserving refactor and verify via the full existing suite
2. Phase 2 — Pure characterization tests (`card-workflow.test.ts`)
3. Phase 3 — DB-backed workflow characterization tests (`card-workflow.integration.test.ts`)
4. Phase 4 — DB-backed activity characterization tests (`card-activity.integration.test.ts`) + final report

### Documented Deviation from systemPatterns.md

`systemPatterns.md` Testing Patterns → File Organization states: "Infrastructure/cross-cutting tests in `backend/src/__tests__/`" and "Domain tests co-located under `backend/src/[module]/__tests__/`". The task explicitly specifies `backend/tests/characterization/` — a new top-level directory outside `src/`. **This is an intentional, user-directed deviation**, justified because characterization tests have a fundamentally different intent (document CURRENT behavior, including possible bugs, without judgment) than the existing co-located suites (which encode INTENDED behavior per TDD). Keeping them in a clearly-separated top-level directory prevents a future reader from mistaking a characterization test's assertion for a spec. This deviation is called out here per planning Step 4's requirement to flag any departure from documented patterns explicitly. Guiding Principle #10 ("Test Against Real Behaviour" — real DB for integration tests, no mocking) is otherwise followed exactly.

### Dependencies & Risks
- **Dependency**: Real Postgres instance with migrations applied (Docker-managed, `runMigrations` helper) — DB-backed suites are non-functional without it (they skip, not fail, which is intended)
- **Risk**: `triggerDoneColorRule`'s retry loop uses real `setTimeout`-based exponential backoff (`workflow.service.ts:127`) — a genuine-failure integration test exercising all `workflowRule2MaxAttempts` attempts will incur real wall-clock delay unless `WORKFLOW_RULE2_BASE_DELAY_MS` is set low for the test DB/env → Mitigation: set a small base delay via test-scoped config/env var, consistent with how `testConfig` is constructed in `workflow-foundation.integration.test.ts`
- **Risk**: Inducing a "genuine" DB failure (e.g. `setCardColor` against a deleted card) without mocking requires careful fixture choreography (create → capture id → delete → call) → Mitigation: resolved during Phase 1 as part of the DB-seeding creative decision
- **Risk**: Extraction (if chosen) could subtly change behavior → Mitigation: full existing backend suite must pass unchanged before Phase 2 begins; extraction is copy-then-replace, not rewrite

### Observability Requirements
- **Applies**: No — this task adds test files only, no new HTTP handlers, background workers, external calls, or metrics

### API Requirements
- **REST API**: No — no new or modified endpoints; `GET /cards/:id/activity` is characterized, not changed

### Creative Phases Required
- [x] Algorithm design — Type: Algorithm (test-architecture decisions: extraction decision, notification/recipient mapping confirmation, DB seeding/teardown + failure-induction strategy) → `memory-bank/creative/TASK-022-characterization-test-strategy-algorithm.md`

### Work Items

#### WI-TASK-022-001: Inventory + extraction decision (Phase 1)
**Status**: Pending
**Dependencies**: None (blocked on Creative)
**Files**: `backend/src/services/workflow.service.ts` (read or modify, per creative decision), possibly a new util module
**Implementation**: Confirm full function inventory; if creative decides to extract, move pure message-building logic to a util module with identical output, verify full existing suite passes unchanged

#### WI-TASK-022-002: Pure characterization tests (Phase 2)
**Status**: Pending
**Dependencies**: WI-001
**Files**: `backend/tests/characterization/card-workflow.test.ts`
**Implementation**: Direct-import and call `projectActivityRow` (+ any extracted function) with representative fixtures; assert exact output via `toBe`

#### WI-TASK-022-003: Workflow DB-backed characterization tests (Phase 3)
**Status**: Pending
**Dependencies**: WI-001
**Files**: `backend/tests/characterization/card-workflow.integration.test.ts`
**Implementation**: Real Pool + migrations; seed board/column/card fixtures; exercise `applyBoardRules` and `triggerDoneColorRule` (success, retry, exhaustion) and `CardService.moveCard`'s trigger; assert exact `WorkflowWarning[]`, exact `workflow_rule_triggers`/`workflow_action_deliveries` rows, exact resulting card state

#### WI-TASK-022-004: Activity DB-backed characterization tests + final report (Phase 4)
**Status**: Pending
**Dependencies**: WI-001
**Files**: `backend/tests/characterization/card-activity.integration.test.ts`
**Implementation**: Real Express app + real DB via supertest; seed populated/empty/nonexistent-card cases; assert exact ordering, JSON shape, timestamp format, empty shape, 404 body; write the final report (pure vs DB functions covered, cases per function, anything extracted, anything skipped and why) into this task file's Execution State

## Test Strategy

### Approach
- **Emphasis**: Integration-heavy — this task IS test authoring; "tests for the tests" is not applicable. Emphasis per systemPatterns.md is on characterizing real behavior, so DB-backed integration tests dominate the count; pure-function tests are direct-call unit tests with no mocking.
- **Target test count**: ~25-35 across all phases (justified: two previously-separate feature areas — workflow automation status-change handling and the activity endpoint — each need entry-ordering, JSON-shape, timestamp-format, and error-path coverage; exact count finalized during Creative phase once the full function inventory is confirmed)

### File Organization
- **New test files**:
  - `backend/tests/characterization/card-workflow.test.ts` — pure functions only (message/notification formatters, any extracted projection logic), direct import + call, `toBe` assertions
  - `backend/tests/characterization/card-workflow.integration.test.ts` — DB-backed: `WorkflowService.applyBoardRules` (stale rule), `WorkflowService.triggerDoneColorRule` (Done-color rule), `CardService.moveCard`'s fire-and-forget trigger, against seeded rows in a real test DB
  - `backend/tests/characterization/card-activity.integration.test.ts` — DB-backed: `GET /cards/:id/activity` route (via supertest against the real Express app + real DB), covering entry ordering, JSON shape, timestamp format, 404 body, empty-feed shape
- **Extend existing**: None — these are new, dedicated characterization suites kept separate from existing behavior-driven test files (`card.service.test.ts`, `workflow.service.test.ts`, `automation.routes.integration.test.ts`) so characterization intent (current behavior, not intended behavior) isn't conflated with those suites' TDD intent

### What NOT to Test
- Frontend behavior — out of scope; this task is backend-only (status-change handler + activity endpoint are both backend)
- Intended/future behavior or bug fixes — characterization tests capture CURRENT behavior only, even if a captured behavior looks like a bug; any such findings are reported, not fixed, per the task's explicit instruction
- Webhook delivery (`AutomationService`, `webhook_deliveries`) — a separate, already-shipped feature (FEAT-016); out of scope unless the status-change handler's fire-and-forget trigger directly overlaps with it (to be confirmed during codebase analysis)

### Per-Phase Test Guidance
- Phase 1 (Creative-informed util extraction, if any): 0 new test cases — this phase is refactor-only (extract pure functions to a util module) and must be behavior-preserving; existing test suites must continue passing unchanged as the regression check
- Phase 2 (Pure characterization — `card-workflow.test.ts`): ~6-10 cases — one or more per pure function found (formatter output for each event/rule type, edge cases like missing optional fields)
- Phase 3 (Workflow DB-backed characterization — `card-workflow.integration.test.ts`): ~10-14 cases — stale-rule trigger/skip paths, Done-color rule success/retry/exhaustion paths, `workflow_rule_triggers`/`workflow_action_deliveries` record shapes, moveCard fire-and-forget trigger firing
- Phase 4 (Activity DB-backed characterization — `card-activity.integration.test.ts`): ~8-11 cases — populated/empty/ordering/timestamp-format/404 cases, JSON shape exact-equality

## Implementation Roadmap

- [ ] Phase 1: Codebase inventory + (if needed) behavior-preserving extraction of private pure functions to a util module, verified via existing test suites still passing
- [ ] Phase 2: Pure characterization tests — `tests/characterization/card-workflow.test.ts`
- [ ] Phase 3: DB-backed characterization tests — `tests/characterization/card-workflow.integration.test.ts`
- [ ] Phase 4: DB-backed characterization tests — `tests/characterization/card-activity.integration.test.ts` + final report (pure vs DB functions covered, cases per function, anything extracted, anything skipped and why)

## Creative Phases

- [x] Algorithm design → COMPLETE — `memory-bank/creative/TASK-022-characterization-test-strategy-algorithm.md`
  - **Decision 1 (extraction)**: Extract `WorkflowService`'s inline message-building logic to a new `backend/src/services/workflow.messages.ts` pure util (Phase 1), verified behavior-preserving via the full existing backend suite
  - **Decision 2 (notification/recipient mapping)**: "Notification text" = `WorkflowWarning.message`; "recipient" = `card_id`/`board_id` on `workflow_rule_triggers`/`workflow_action_deliveries` rows — documented as an interpretation, not a literal match, to be called out explicitly in the final report
  - **Decision 3 (DB seeding strategy)**: Direct repository-method fixture builders matching `workflow-foundation.integration.test.ts`'s existing convention, no new fixture-factory abstraction; genuine-failure induction via real constraint violations / missing-Stale-column boards, with the exact SQL-level mechanism for a couple of failure cases flagged as needing verification during Phase 1/3 (not blocking); test-scoped `WorkflowConfig` with a small retry base delay to avoid wall-clock cost

---

## Execution State

**Build Status**: IDLE
**Current Phase**: CREATIVE → BUILD
**Last Completed**: Algorithm Design Creative Phase
**Can Resume**: NO

### Active Sub-Agents
(none)

### Completed Steps
- Step 0/0.1: Feature FEAT-018 resolved, TASK-022 auto-provisioned and linked
- Step 0.2: Phase Gate — task registered in tasks.md, PASSED
- Step 3: Specification drafted inline (Spec Writer role performed by orchestrator) — 5 acceptance criteria (AC-VERIFY-1..5), 3 creative questions flagged (extraction decision, notification/recipient mapping [LOW confidence], DB seeding strategy)
- Step 3.2: Human review requested via AskUserQuestion — no response within timeout; proceeded with best judgment (spec approved as-is) per session's autonomous-operation guidance, since creative phase was already mandatory regardless of the answer
- Step 3.3: Creative phase REQUIRED (Level 3 + LOW confidence on notification/recipient mapping)
- Step 4-5: Codebase analysis + Implementation Plan written (Requirements, Component Analysis, Implementation Strategy, Dependencies & Risks, documented deviation from systemPatterns.md file-organization convention, Observability N/A, API N/A, 4 Work Items)
- Step 6: Validation gate passed (NFR: Test Method concrete, Success Metrics concrete, Observable Location concrete); Status set to PLANNING_COMPLETE
- Creative Step 3: Algorithm Design creative phase COMPLETE (performed inline by orchestrator) — Output: `memory-bank/creative/TASK-022-characterization-test-strategy-algorithm.md`; all 3 flagged questions resolved (extraction: yes, extract to `workflow.messages.ts`; notification/recipient mapping confirmed with explicit interpretation caveat; DB seeding: repo-direct fixtures, no new abstraction)
- Creative Step 5: Status set to CREATIVE_COMPLETE
