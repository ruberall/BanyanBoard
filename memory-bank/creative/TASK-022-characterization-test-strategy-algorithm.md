# Algorithm Decision: Characterization Test Strategy (Card Workflow + Activity Endpoint)

**Created**: 2026-07-03
**Status**: DECIDED
**Decision Type**: Algorithm (test-architecture, not a runtime algorithm)

## Problem Statement

TASK-022's spec (`memory-bank/tasks/TASK-022.md`) flagged three genuine design questions that couldn't be resolved with HIGH confidence during planning:

1. **Extraction decision**: `WorkflowService.applyBoardRules`/`triggerDoneColorRule` build their warning/message text inline, interleaved with `await this.repo.*` calls. Should this be extracted to a standalone pure function (behavior-preserving refactor) before characterizing it, or characterized only via the DB-backed integration suite?
2. **Notification/recipient mapping**: The task description says "notification text and recipient." No literal notification-recipient mechanism exists in this codebase for workflow warnings — what does this phrase concretely map to?
3. **DB seeding/failure-induction strategy**: How should the two new real-DB integration suites seed fixtures and induce *genuine* failures (not mocked ones) for error-path coverage?

This is a "test-architecture algorithm" — not a runtime performance algorithm — so complexity analysis below is reframed as **coverage completeness and reliability trade-offs** rather than Big-O, per the Algorithm Design methodology's instruction to fit real constraints rather than force an ill-fitting template.

## Inputs & Outputs

### Inputs
| Name | Type | Size/Range | Source |
|------|------|------------|--------|
| `EventRow` fixtures | Object | 1 per event type (`card.moved`, `card.created`, unknown) | `backend/src/repositories/event.repository.ts` |
| Seeded board/column/card rows | DB rows | Small (single-digit rows per test) | Real Postgres via `Pool` |
| Induced failure conditions | Runtime state | 3 known cases (missing Stale column, one-of-many move failure, all-retries-exhausted) | Constructed via real DB state, not mocks |

### Outputs
| Name | Type | Description |
|------|------|-------------|
| Pure-function test assertions | `toBe` string equality | Exact current formatter/projection output |
| DB-backed test assertions | `toEqual`/`toBe` | Exact `WorkflowWarning[]`, DB row shapes, HTTP response bodies |
| Final task report | Markdown (in TASK-022.md Execution State) | Pure vs DB functions covered, cases per function, extracted/skipped + why |

### Edge Cases
1. `card.moved` event with missing `fromColumnName`/`toColumnName` in payload → falls back to literal string `"a column"` (already observed behavior in `projectActivityRow`, `cards.ts:39-40`) — must be characterized, not "fixed"
2. Unknown `event_type` → `projectActivityRow`'s `default` branch returns the raw `event_type` string as `message` (`cards.ts:47-48`) — must be characterized
3. Zero-event card → activity endpoint returns `[]`, not an error
4. Nonexistent card id → activity endpoint 404s via `getCardById` *before* querying events at all (`cards.ts:162-163`) — order matters and must be captured exactly

## Constraints

### Performance Requirements
Not applicable in the traditional sense — this is test-suite authoring, not a runtime code path. The relevant constraint is **test suite runtime**: DB-backed integration tests must not introduce unbounded wall-clock delay. Per `productBrief.md` NFRs, the product's own API target is p95 < 200ms, but that governs the *code under test*, not the test suite itself.

### Scale Requirements
- Current data size: single-digit seeded rows per test case (boards, columns, cards, events)
- No growth/scale projection applies — characterization suites test fixed, small fixtures by design

### Other Constraints
- Zero mocks/stubs/spies/fakes anywhere in the three new files (hard requirement from the task)
- Every string assertion must use `toBe`, never `toContain`
- Must not change product behavior (Phase 1, if extraction happens, must be behavior-preserving)
- Must respect `systemPatterns.md` Guiding Principle #10 ("Test Against Real Behaviour" — real DB for integration tests, no mocking) — already the natural fit here, not a tension
- `WorkflowService.triggerDoneColorRule`'s retry loop uses real `setTimeout` exponential backoff (`workflow.service.ts:127`) — a genuine multi-attempt-exhaustion test will incur real wall-clock delay unless the base delay is reduced for the test run

---

## Decision 1: Extraction Strategy for `WorkflowService`'s Inline Message Logic

### Option 1: Extract to a pure `formatWorkflowWarning`-style util
- **Approach**: Pull the string-building expressions (`` `Stale rule failed for card ${cardId}: ${err.message}` ``, the `WORKFLOW_STALE_COL_MISSING` message text, and the `WorkflowWarning` object construction) into standalone exported functions in a new `backend/src/services/workflow.messages.ts` (or similar), imported by both `WorkflowService` and the new pure characterization test.
- **Coverage completeness**: HIGH — every message variant can be directly called and asserted with `toBe`, independent of DB/timing flakiness.
- **Reliability**: HIGH — pure-function tests are deterministic and fast; no DB, no `setTimeout`.
- **Pros**:
  - Exact-equality characterization of message text becomes trivial and instant (no DB, no retry delay)
  - Matches the task's own stated preference: "Pure (no I/O)... if private, extract it to a util"
  - Small, behavior-preserving, easily verified refactor (existing full backend suite must pass unchanged)
- **Cons**:
  - Touches production source (`workflow.service.ts`) for a test-only task — some risk, however small, of a copy-paste slip changing behavior
  - `applyBoardRules`'s per-card warning (`Stale rule failed for card ${cardId}: ${err.message}`) depends on a real `Error` object's `.message` from a real repo failure — the extracted function would take `(cardId, errMessage)` as plain strings, which is a faithful but not 100% "as found in situ" extraction (the DB-backed suite still needs to verify the *real* error message text flows through correctly)
- **Best For**: Message-text characterization where the string-building logic is nontrivial enough to be worth isolating (multiple branches, interpolation) — true here (stale-column-missing message, per-card failure message)
- **Worst For**: Cases where the "pure" logic is a single trivial literal with no branching (not the case here — both messages have interpolation)

### Option 2: No extraction — characterize entirely via the DB-backed integration suite
- **Approach**: Skip Phase 1 entirely. Capture `WorkflowService`'s messages only by observing the real `WorkflowWarning[]` returned by `applyBoardRules` and the real trigger/delivery rows from `triggerDoneColorRule`, run against a seeded real DB.
- **Coverage completeness**: MEDIUM — every message variant is still reachable and assertable, but only through the full DB-backed path, which requires seeding a specific failure condition (e.g., missing Stale column, or a real repo failure) for *each* message variant rather than a direct function call.
- **Reliability**: MEDIUM — DB-backed tests are inherently slower and carry more moving parts (seed → act → assert → cleanup) per message variant; inducing the "one card among several fails" branch of `Promise.allSettled` (`workflow.service.ts:78-93`) genuinely (not mocked) requires deliberate fixture construction (e.g., a card whose `column_id` FK will violate a constraint on move).
- **Pros**:
  - Zero production source changes — purely additive test authoring, no refactor risk at all
  - Every assertion is against the *actual* integrated behavior, including the real DB round-trip, which is arguably a more faithful characterization of "what currently happens" than a function extracted from it
- **Cons**:
  - Slower suite (each message variant requires a full DB round-trip + fixture setup)
  - Harder to enumerate every string-formatting edge case (e.g., what if `err.message` itself contains unusual characters?) without contriving increasingly artificial DB failure scenarios
- **Best For**: Message logic that's inseparable from its I/O context, or where extraction risk outweighs benefit
- **Worst For**: Message logic complex enough that isolating it for exhaustive edge-case coverage (many branches, interpolation) is clearly cheaper as a pure function

### Option 3: Hybrid — extract only the `applyBoardRules` "no Stale column" message; leave `triggerDoneColorRule`'s tracking-row assembly untouched
- **Approach**: The `WORKFLOW_STALE_COL_MISSING` message (`workflow.service.ts:54-57`) is a static string with no interpolation — trivially extractable with zero risk. The per-card failure message and `triggerDoneColorRule`'s delivery-record assembly are more deeply interleaved with `Promise.allSettled`/retry-loop control flow — leave these to the DB-backed suite.
- **Coverage completeness**: MEDIUM-HIGH — the one static message gets pure, instant coverage; the two dynamic/interleaved messages get DB-backed coverage.
- **Reliability**: HIGH — minimizes refactor surface to the lowest-risk case only.
- **Pros**: Lowest-risk extraction (a literal string constant has no logic to get wrong); still gets *some* Phase 1 benefit
- **Cons**: Partial solution — doesn't resolve the harder case (interpolated messages), so most of the coverage-completeness work still happens in the slower DB-backed suite anyway

## Complexity Comparison (reframed: coverage completeness / reliability / implementation cost)

| Metric | Option 1 (full extract) | Option 2 (no extract) | Option 3 (partial extract) |
|--------|--------------------------|------------------------|------------------------------|
| Coverage completeness | HIGH | MEDIUM | MEDIUM-HIGH |
| Suite reliability/speed | HIGH (instant, deterministic) | MEDIUM (DB round-trips, retry delay) | HIGH for the static message; MEDIUM for the rest |
| Refactor risk to production code | LOW-MEDIUM (small, verifiable) | NONE | LOW (trivial constant only) |
| Implementation cost | MEDIUM (new util + 2 call-site updates + full-suite regression check) | LOW (no source changes) | LOW (1 call-site update) |

## Decision 1

**Chosen**: **Option 1 — Extract to a pure `workflow.messages.ts` util**

### Rationale
The task's own instruction is explicit and directly on point: "Pure (no I/O, e.g. the formatter): import and call directly; if private, extract it to a util." Both of `WorkflowService`'s message-building call sites have real branching/interpolation logic worth isolating (not just a single literal), so Option 3's "only extract the trivial one" leaves most of the actual coverage-completeness benefit on the table. Option 2's DB-backed-only approach can absolutely still verify the *real* end-to-end message flow (and MUST — see Decision 3), but relying on it as the *only* source of message-text characterization makes exhaustive edge-case coverage (e.g., varying `err.message` content) needlessly slow and fragile to construct as DB scenarios. Extraction is small (two message-building expressions), mechanical (copy the exact string template, no logic change), and independently verifiable via the full existing backend suite passing unchanged — the standard bar for a safe characterization-supporting refactor.

### Trade-offs Accepted
- Production source (`workflow.service.ts`) is touched for a nominally "test-only" task — mitigated by keeping the extraction purely mechanical (identical string output, verified by the full existing suite) and treating it as Phase 1's sole deliverable, reviewed in isolation before any new test authoring begins.
- The extracted pure function characterizes message *shape*, not the full integrated flow — Decision 3 below ensures the DB-backed suite ALSO verifies the real message appears correctly in the real `WorkflowWarning[]`/DB rows, so nothing is lost.

---

## Decision 2: "Notification Text and Recipient" Mapping

### Option 1: Map "notification text" → `WorkflowWarning.message`; "recipient" → `card_id`/`board_id` on tracking rows (this spec's working assumption from planning)
- **Approach**: Treat "recipient" as "which entity this outcome is about" rather than "who receives a push/email/webhook notification" — since no such delivery mechanism exists for `WorkflowWarning`s (they're returned synchronously in the `GET /boards/:id` response body's `warnings[]` array).
- **Pros**: Directly maps onto real, existing fields (`WorkflowWarning.message`, `workflow_rule_triggers.card_id`/`.board_id`, `workflow_action_deliveries.trigger_id`) — fully testable with concrete assertions
- **Cons**: Requires interpreting the task's phrasing rather than finding a literal match in the code

### Option 2: Treat "notification" as referring to the frontend's optimistic-update/rollback UX (per `techContext.md`'s `useMoveCard.onMutate` applying optimistic color `#d4edda` when destination is 'Done') and "recipient" as the frontend consumer of the API response
- **Pros**: Plausible alternate reading — the Done-color rule's *visible effect* to a user is the card turning green
- **Cons**: This is frontend behavior, explicitly out of scope per TASK-022's Scope Boundaries ("Frontend behavior — out of scope; this task is backend-only"); pursuing this reading would require re-scoping the task, which is not this creative phase's authority

### Option 3: Treat "recipient" as literally undefined/not-applicable and drop the requirement
- **Pros**: Simplest — avoids guessing
- **Cons**: Silently drops part of the task's explicit instruction rather than giving it a good-faith, testable interpretation; worse than Option 1 for a characterization task where "capture everything asked for" is the point

## Decision 2

**Chosen**: **Option 1 — `WorkflowWarning.message` = notification text; `card_id`/`board_id` on tracking rows = recipient**

### Rationale
This is the only option that (a) stays within TASK-022's explicit backend-only scope, (b) maps onto real, already-existing, directly-testable fields, and (c) honors the task's instruction rather than dropping it. Option 2 is a legitimate alternate reading but requires touching frontend code, which is explicitly out of scope — pursuing it would be scope creep, not a test-architecture decision this phase should make unilaterally. This mapping should be called out plainly in the final report's coverage documentation, since it's an interpretation, not a literal match — full transparency here is part of what makes the report trustworthy per the task's own emphasis on capturing "what CURRENTLY does, exactly."

### Trade-offs Accepted
- If the task author meant something else by "recipient" (e.g., a future webhook/email delivery not yet built), that gap will only surface when they read the final report's explicit callout of this interpretation — mitigated by making the callout prominent and unambiguous rather than burying the assumption.

---

## Decision 3: DB Seeding & Failure-Induction Strategy for the Two Integration Suites

### Option 1: Direct repository-method fixture builders (mirrors `workflow-foundation.integration.test.ts`)
- **Approach**: Use `BoardRepository`/`CardRepository`/`EventRepository` directly (already-real code, not test-only helpers) to create boards/columns/cards/events, exactly as `workflow-foundation.integration.test.ts` already does (`new BoardRepository(pool)`, direct method calls). For timestamp-dependent fixtures (e.g., a stale-eligible card), either backdate `created_at` via a direct `UPDATE` (since no repository method exists for setting `created_at` retroactively) or seed via raw SQL where a repository method genuinely doesn't cover the need.
- **Time Complexity**: N/A (fixture setup, not an algorithm) — but operationally: O(1) DB round-trips per fixture entity, small fixed count per test
- **Space Complexity**: N/A — single-digit rows per test, cleaned up in `afterEach`
- **Pros**: Reuses real, already-tested repository code (exercises the same code paths as production) rather than inventing parallel test-only seeding logic; matches the established convention exactly, so no new pattern to learn or maintain
- **Cons**: Repositories don't expose every knob needed for some scenarios (e.g., backdating `created_at` for stale-card eligibility) — requires occasional direct SQL alongside repository calls, same as the existing convention already does implicitly (real column/board creation still needs SQL somewhere under the hood)

### Option 2: A dedicated test-fixture factory module (e.g., `tests/characterization/fixtures.ts`) wrapping repository calls with named builders (`seedStaleEligibleCard()`, `seedCardMovedToDone()`, etc.)
- **Pros**: Reduces duplication across the ~20-25 DB-backed test cases; named builders make test intent more readable
- **Cons**: Introduces a new abstraction layer for what is otherwise a one-task, non-recurring need; risks the fixture builder itself drifting from "what the test actually needs" over time, and is arguably over-engineering for a single task's test suite (violates the project's "no clever abstractions" ethos noted in `techContext.md`'s Architecture Approach)

### Option 3: Raw SQL inserts for all fixtures, bypassing repositories entirely
- **Pros**: Maximum control over exact row state (e.g., precise `created_at` backdating) without any repository-method limitations
- **Cons**: Duplicates schema knowledge already encoded in the repositories; more brittle to schema changes; doesn't exercise the actual repository code paths the way Option 1 does, which slightly undercuts "characterize the REAL code" for the seeding side (though the *assertions* are still against real service/route code either way, since seeding is Arrange, not Act)

## Complexity Comparison (reframed: reuse / maintainability / fidelity)

| Metric | Option 1 (repo-direct) | Option 2 (fixture factory) | Option 3 (raw SQL) |
|--------|--------------------------|------------------------------|----------------------|
| Reuses real repository code | HIGH | HIGH (wraps Option 1) | NONE |
| New abstraction surface | NONE | MEDIUM (new module to maintain) | NONE |
| Fixture setup readability | MEDIUM | HIGH | LOW |
| Fidelity to "characterize real code" | HIGH | HIGH | MEDIUM (seeding bypasses real repo writes) |
| Matches existing project convention | Exact match | Novel | Partial (existing tests already mix SQL + repo calls when needed) |

## Decision 3

**Chosen**: **Option 1 — Direct repository-method fixture builders, matching `workflow-foundation.integration.test.ts`'s existing convention, with targeted raw SQL only where no repository method exists (e.g., backdating `created_at`)**

### Rationale
This is the path of least novelty and highest fidelity: it reuses the exact convention already established and documented in `systemPatterns.md` ("DB integration test (real Postgres)" example) and demonstrated in `workflow-foundation.integration.test.ts`. Option 2's fixture-factory module is a reasonable idea in the abstract but is unjustified process overhead for a single task's test suite — `techContext.md`'s own architecture philosophy ("No clever abstractions") argues against introducing one here. Option 3 would work but needlessly bypasses real repository code during Arrange steps, which is a small but real fidelity loss for a task whose entire point is faithfulness to real behavior.

**Failure-induction specifics** (resolving the "how do we induce genuine failures" sub-question):
- **Missing Stale column**: seed a board via direct SQL that skips the Stale column (bypassing `BoardRepository.createBoard`'s `DEFAULT_COLUMNS` seeding, which always includes Stale) — this is a genuine, real code path (`applyBoardRules` checking `columns.find(c => c.name === 'Stale')`), not a mock.
- **One-of-several `moveCardToStale` failures inside `Promise.allSettled`**: seed multiple stale-eligible cards, then delete one of them (via direct SQL) after `findStaleCards` would find it but before `applyBoardRules` runs its `Promise.allSettled` — the resulting `UPDATE cards SET column_id = ... WHERE id = $1` against a deleted row affects zero rows without necessarily throwing (Postgres `UPDATE` on no matching row doesn't error) — **this specific mechanism needs verification during Phase 3 implementation**: if a zero-row `UPDATE` doesn't throw, an alternate genuine-failure trigger is a foreign-key violation (e.g., delete the destination Stale column's row instead, which SHOULD cause `moveCardToStale`'s `UPDATE ... SET column_id = $2` to violate the `columns` FK constraint on `cards.column_id`) — captured here as an open implementation detail, not blocking the decision itself.
- **All `workflowRule2MaxAttempts` retry attempts failing for `triggerDoneColorRule`**: call `setCardColor` against a card id that has been deleted after fetching it — the real `UPDATE cards SET color = $2 WHERE id = $1` against a nonexistent row won't throw either (same zero-row-update non-error behavior) — the more reliable genuine-failure trigger is passing an invalid card id format (non-UUID) to force a real Postgres type-cast error (`invalid input syntax for type uuid`), OR temporarily setting `workflowRule2MaxAttempts`/`workflowRule2BaseDelayMs` low via test-scoped config and inducing a real constraint violation (e.g., a `color` value exceeding a `VARCHAR` length limit, if the schema has one — **to be confirmed against the actual migration during Phase 1**).
- **Base delay for retry tests**: construct `WorkflowService` in the integration suite with a test-scoped `WorkflowConfig` object using a small `workflowRule2BaseDelayMs` (e.g., 5ms) so exhausting 3 attempts with exponential backoff completes in well under a second, avoiding the wall-clock risk flagged in TASK-022's plan.

### Trade-offs Accepted
- The exact SQL-level mechanism for inducing a "genuine" `moveCardToStale`/`setCardColor` failure is not fully nailed down here (flagged above as needing Phase 1/3 verification against actual Postgres constraint behavior) — this is appropriate for a creative-phase decision (which sets *strategy*, not every SQL statement) but is explicitly called out so the build phase doesn't have to re-litigate the *approach* (repo-direct fixtures, no mocks, real constraint violations), only the specific trigger mechanism.

---

## Implementation Details

### Data Structures
| Structure | Purpose | Notes |
|-----------|---------|-------|
| `workflow.messages.ts` (new) | Houses extracted pure message-building functions | Exports e.g. `staleColumnMissingMessage()`, `staleMoveFailedMessage(cardId, errMessage)` |
| Real `Pool`/`Queryable` | DB-backed suite fixture creation + assertion queries | Matches `workflow-foundation.integration.test.ts` |
| Real Express `app` (via `createApp()`) | `card-activity.integration.test.ts`'s supertest target | Matches `systemPatterns.md`'s HTTP integration test example |

### Algorithm Steps (test-authoring sequence)
1. **Phase 1**: Extract `workflow.messages.ts` (Decision 1); confirm notification/recipient mapping is documented in the task report (Decision 2); run full existing backend suite to verify zero behavior change
2. **Phase 2**: `card-workflow.test.ts` — direct-call `projectActivityRow` (no extraction needed) and the new `workflow.messages.ts` functions with representative + edge-case fixtures; `toBe` assertions only
3. **Phase 3**: `card-workflow.integration.test.ts` — seed via repo-direct fixtures (Decision 3); exercise `applyBoardRules` (happy + missing-Stale-column + partial-failure paths) and `triggerDoneColorRule` (success + retry + exhaustion, with reduced test-scoped backoff) and `CardService.moveCard`'s trigger firing; assert exact `WorkflowWarning[]`, exact `workflow_rule_triggers`/`workflow_action_deliveries` rows
4. **Phase 4**: `card-activity.integration.test.ts` — seed populated/empty/nonexistent-card cases via supertest against a real app + real DB; assert exact ordering, JSON shape, timestamp serialization, empty-array shape, 404 body; write the final report

### Edge Case Handling
| Edge Case | Handling |
|-----------|----------|
| `card.moved` payload missing column names | Characterize the existing `"a column"` fallback literally, via `projectActivityRow` direct call |
| Unknown `event_type` | Characterize the `default` branch returning the raw type string, via `projectActivityRow` direct call |
| Zero-event card | DB-backed test asserts exact `[]` response, not a null/undefined/error |
| Nonexistent card id | DB-backed test asserts the 404 fires via `getCardById` before any event query, matching route order |
| Missing Stale column | DB-backed test seeds a board bypassing `DEFAULT_COLUMNS`' Stale entry, asserts the exact `WORKFLOW_STALE_COL_MISSING` warning and early-return (no `findStaleCards` call needed) |
| Retry exhaustion wall-clock cost | Test-scoped `WorkflowConfig` with small `workflowRule2BaseDelayMs` |

### Error Handling
| Error Condition | Response |
|-----------------|----------|
| `DATABASE_URL` absent | Both integration suites skip gracefully via `describeIfDb`, matching existing convention — not a test failure |
| Extraction (Phase 1) breaks existing behavior | Full backend suite (`cd backend && npm test`) must pass unchanged before Phase 2 begins; if it doesn't, extraction is reverted and Decision 1 is revisited (fall back to Option 2/3) |

## Validation Checklist

- [x] Meets latency requirements — N/A (test-authoring), but retry-delay risk mitigated via test-scoped config
- [x] Meets memory requirements — N/A, small fixed fixture sizes
- [x] Handles all edge cases — enumerated above (payload fallbacks, unknown event type, empty feed, 404 ordering, missing Stale column, retry exhaustion)
- [x] Scales to expected data size — N/A, fixed small fixtures by design
- [x] Implementation feasible — yes; one specific SQL-level mechanism (genuine-failure induction for `moveCardToStale`/`setCardColor`) is flagged as needing verification during Phase 1/3, not blocking
- [x] Respects Guiding Principles and data flow patterns in systemPatterns.md — Guiding Principle #10 ("Test Against Real Behaviour") is the core principle this entire task embodies; no violations identified

## Testing Strategy

### Unit Tests (Phase 2 — pure)
- `projectActivityRow`: `card.moved` with full payload, `card.moved` with missing column names (fallback), `card.created`, unknown event type
- Extracted `workflow.messages.ts` functions: stale-column-missing message exact text, per-card failure message exact text with a representative `err.message`

### Integration Tests (Phases 3-4 — DB-backed)
- `applyBoardRules`: happy path (card moves to Stale), no Stale column present, one-of-several cards fails to move (partial failure via `Promise.allSettled`), zero stale-eligible cards (early return, empty warnings)
- `triggerDoneColorRule`: first-attempt success, succeeds after N retries, exhausts all retries (failed final status), verifies exact `workflow_rule_triggers`/`workflow_action_deliveries` row content for each
- `CardService.moveCard`: confirms the fire-and-forget trigger actually fires when destination is Done (observable via the resulting tracking rows), and does NOT fire for non-Done destinations
- `GET /cards/:id/activity`: populated (ordering + shape + timestamp format), empty, 404 for nonexistent card

## Next Steps

1. Build Phase 1: create `backend/src/services/workflow.messages.ts`, update `workflow.service.ts` call sites, verify full existing suite passes unchanged
2. Build Phase 2: author `card-workflow.test.ts`
3. Build Phase 3: author `card-workflow.integration.test.ts`, resolving the flagged genuine-failure-induction SQL mechanism concretely
4. Build Phase 4: author `card-activity.integration.test.ts` and write the final coverage report into TASK-022.md
