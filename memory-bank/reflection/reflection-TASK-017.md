# Reflection: TASK-017 — Workflow Automation

**Date**: 2026-06-28
**Task Complexity**: Level 4
**Total Phases**: 4 (DB Foundation, WorkflowService + Rule #1, Rule #2 + Retry Harness, Frontend)
**Duration**: 2026-06-27 (planning + creative) to 2026-06-28 (4 build phases)

## Executive Summary

TASK-017 implemented a two-rule workflow automation engine for BanyanBoard: a synchronous stale-card-mover (Rule #1) that fires on every board load, and an asynchronous fire-and-forget color rule (Rule #2) that fires when a card reaches Done. The feature adds a Stale column to every board, introduces two tracking tables (`workflow_rule_triggers`, `workflow_action_deliveries`), and delivers an optimistic pale-green done-card experience on the frontend. Final test count reached 460 passing (223 backend, 237 frontend), with TypeScript clean across both. All 15 acceptance criteria were met.

The Level 4 classification proved accurate. The task crossed all four architectural layers — DB schema, repository, service, and frontend state management — and introduced novel patterns (fire-and-forget async rule with per-attempt tracking, cross-slice cache reads in TanStack Query `onMutate`, pre-rejection guard for Node 26 + Jest fake timers) that required creative-phase architecture to prevent ad-hoc decisions in the build. The four-phase build structure effectively isolated concerns and gave each phase a clear verification gate.

One significant creative-to-build translation gap occurred: the creative doc specified `retryWithBackoff` for Rule #2, but the build correctly deviated to a manual retry loop to enable per-attempt delivery row tracking. The creative doc was not wrong about the utility — it was right that `retryWithBackoff` is the right abstraction for generic retry — but the audit-table requirement meant Rule #2 needed to control the retry loop directly. This gap was resolved at build time by the coding agent with good reasoning, but it reveals a class of design decision that requires more specificity in the creative phase when per-attempt side effects are part of the contract. A second notable incident: the Test Writer agent invented a mismatched `WorkflowWarning` shape in Phase 4 rather than reading the existing backend contract, demonstrating that sub-agents do not automatically cross-reference sibling layer contracts.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: All Met

Every acceptance criterion from the task specification was satisfied:

- **AC-STALE-COL-1/2**: Stale column seeded for new boards via `DEFAULT_COLUMNS` change; existing boards backfilled by migration `20260628120000_add-workflow-foundation.js` (inserts Stale at position 3, updates Done to position 4). Integration tests confirmed.
- **AC-ENTRY-1**: Stale column rendered between In Progress and Done — handled naturally by existing `KanbanBoard` position-sort rendering; no special column config needed. Amber header + `⏰` icon implemented in `KanbanColumn.tsx`.
- **AC-HAPPY-1**: Rule #1 stale-move fires via `WorkflowService.applyBoardRules` on `GET /boards/:boardId`. Cards with `created_at < NOW() - INTERVAL '2 days'`, not in Done, not stale_suppressed, not already in Stale, are moved via `Promise.allSettled`.
- **AC-HAPPY-2/3**: Cards < 2 days old and cards in Done are excluded by the `findStaleCards` SQL query. Tests confirmed.
- **AC-HAPPY-4**: Done-color rule sets `cards.color = '#d4edda'` via `triggerDoneColorRule`; HTTP 200 returned before rule fires; within 2 seconds for attempt 1 (base delay 200ms).
- **AC-ASYNC-1**: Frontend `useMoveCard.onMutate` reads board query cache via `getQueriesData<BoardWithColumns>` to find destination column name; sets `color: '#d4edda'` optimistically when target is 'Done'. Named constants `DONE_COLUMN_NAME`/`DONE_CARD_COLOR` at module scope.
- **AC-STALE-SUPPRESS-1**: `CardRepository.setSuppressed` called in `CardService.moveCard` when `isFromStale` is true (source column name matched via `CardRepository.getColumnName`). Best-effort; failure logged at warn, does not block move.
- **AC-ERROR-1**: Rule #1 failures captured per-card in `Promise.allSettled`; converted to `WorkflowWarning[]` returned in board GET response. Board always returns HTTP 200.
- **AC-ERROR-2**: Rule #2 retries 3 times with exponential backoff (200ms → 400ms → 800ms). All delivery rows recorded. trigger_status = 'failed' after exhaustion. Card move returns HTTP 200 regardless.
- **AC-ERROR-3/4**: Pre-existing structured error responses on invalid UUID and board-not-found — tested, unchanged.

No scope creep. All out-of-scope items (user-configurable rules, rule UI, external webhook delivery) were correctly excluded.

### Code Quality Assessment

**Overall Rating**: Good

- **Maintainability**: The `WorkflowService` class (189 lines) is well-organized: `applyBoardRules` handles Rule #1 with `Promise.allSettled`, `triggerDoneColorRule` handles Rule #2 with a manual retry loop and always-resolves contract. Both methods are clearly separated and independently testable. The `moveCardToStale` private method correctly isolates per-card move + tracking insertion. The `WorkflowRepository` separation from `WorkflowService` follows the established 3-layer pattern. Named constants (`STALE_RULE_ID`, `DONE_COLOR_RULE_ID`, `DONE_COLOR_HEX`) prevent magic strings.

- **Architecture**: Optional constructor injection (following `EventService` pattern) correctly avoids tight coupling. WorkflowService is absent in tests that do not need it. Column ID resolution via name match on the already-fetched `columns[]` array avoids extra DB round-trips. The `CardRepository.getColumnName` and `setSuppressed` methods correctly eliminate SQL from the service layer — this was a code-review catch in Phase 2 that improved the architecture.

- **Error Handling**: The always-resolves contract on `triggerDoneColorRule` is implemented with dual try-catch (inner for retry loop, outer for tracking insert failure). The `deliveries.at(-1)?.delivery_error` propagation to `trigger_error` (a code-review catch in Phase 3) ensures the trigger table is a self-sufficient audit trail — the root cause of failure is readable without joining to the deliveries table. Rule #1 uses `Promise.allSettled` so a single stale-card failure does not abort other moves.

- **Testing**: 460 total tests is a strong count for a 4-phase Level 4 feature. Coverage spans: unit tests for `WorkflowService` rule logic (retry exhaustion, never-throws contract, config-driven thresholds), repository mock tests, BoardService integration tests with WorkflowService injection, card move integration tests for stale suppression, and frontend unit tests for optimistic color update and `WorkflowWarning` type. The frontend E2E spec (`workflow.spec.ts`) was not verified against a running stack — this is the main coverage gap.

- **Code Organization**: All new files follow established co-location conventions. Migration naming matches the project's timestamp convention. Config variables in `config.ts` with sensible defaults follow 12-factor. No `console.log` in production code.

### Technical Decisions

**Key Decisions:**

1. **Manual retry loop for Rule #2, not `retryWithBackoff`** — The creative phase specified `retryWithBackoff` as the retry utility. At build time the coding agent correctly recognized that `retryWithBackoff` wraps a single `fn` call and does not expose the attempt number to the caller. Per-attempt delivery row insertion requires knowing the attempt number inside the loop. The manual loop (lines 114-130 of `workflow.service.ts`) collects `DeliveryRecord` objects per attempt and inserts them after the trigger row is created. This was the right call. The utility `retryWithBackoff` still ships in `retry.ts` (used by Phase 1 tests to validate the utility in isolation) and remains available for future rules that do not need per-attempt tracking. Outcome: correct behavior, correct audit trail, no creative-phase violation since the underlying pattern (backoff) is preserved.

2. **`insertDelivery` with `RETURNING id`** — The Phase 2 code review caught that the initial `insertDelivery` implementation did not use `RETURNING id`. Since deliveries are linked to triggers via `trigger_id` and future updates may need the delivery row ID (e.g., `updateDeliveryStatus`), this was a correctness blocker. Adding `RETURNING id` to the INSERT was minimal surgery and aligns with the project's Guiding Principle: "All INSERTs must use `RETURNING`." Outcome: the principle was applied consistently.

3. **`trigger_error` populated from last delivery's error** — The initial Phase 3 implementation left `trigger_error` null even on exhaustion, requiring a join with `workflow_action_deliveries` to find the root cause. The code review identified this as an observability gap. The fix (`deliveries.at(-1)?.delivery_error`) means the trigger table alone is sufficient for failure diagnosis. Outcome: significant diagnostic improvement at near-zero implementation cost.

4. **`WorkflowWarning` shape matched backend contract in frontend** — The backend defines `WorkflowWarning { code, message, details? }`. The frontend `types/index.ts` mirrors this exactly. This alignment is correct but required manual intervention in Phase 4 when the Test Writer agent invented a different shape.

5. **Cross-slice cache read in `useMoveCard.onMutate`** — The optimistic color update reads the board query cache using `getQueriesData<BoardWithColumns>` to find the destination column name, then applies the color. This avoids adding a `doneColumnId` parameter to the mutation hook and keeps the hook self-contained. The pattern is consistent with the existing TanStack Query onMutate approach for card moves.

**Trade-offs:**

- **Manual retry loop vs. `retryWithBackoff` reuse**: What was gained — per-attempt delivery row tracking, self-contained audit trail per trigger, no external API coupling. What was sacrificed — code reuse of the utility function for Rule #2 specifically. The utility itself is not wasted; it remains available for future rules that do not need per-attempt callbacks.

- **Best-effort stale suppression vs. blocking**: Stale suppression (`setSuppressed`) runs after the card move succeeds. If the suppression write fails, the card will be moved back to Stale on the next board load. What was gained — the card move is never blocked by a suppression failure. What was sacrificed — rare cases where the move succeeds but suppression fails leave the user confused on next load. Acceptable at MVP scale; logged at warn for operator visibility.

- **Always-resolves on `triggerDoneColorRule`**: What was gained — fire-and-forget invocation from `CardService.moveCard` is safe with no unhandled rejection risk; the outer `.catch()` is belt-and-suspenders only. What was sacrificed — tracking failures inside `triggerDoneColorRule` are swallowed and only visible in logs, not in the delivery rows.

### What Went Well

1. **Code review agent stopped two blocking issues in Phase 2** — SQL directly in `CardService.moveCard` (should be in `CardRepository`) and missing `RETURNING id` on `insertDelivery` were both caught before commit. Zero blocking issues in Phases 3 and 4. The trend (2 → 0 → 0) reflects genuine quality improvement across phases, not just luck.

2. **4-phase decomposition matched the architectural layers exactly** — DB (Phase 1), backend service layer (Phase 2), async rule + retry harness (Phase 3), frontend (Phase 4). Each phase had a clear verification gate and the phases did not bleed into each other. The stale suppression logic was correctly identified as Phase 2 work (it depends on the WorkflowService being wired) rather than Phase 3.

3. **Creative phase architecture was load-bearing** — The `Promise.allSettled` approach for Rule #1, the name-match column resolution, the optional DI pattern, and the `warnings[]` additive response shape were all decided in the creative phase and followed exactly in the build. Without the creative phase, these decisions would have been ad-hoc during implementation and likely inconsistent.

4. **Configuration-driven thresholds** — `WORKFLOW_STALE_AGE_DAYS`, `WORKFLOW_RULE2_BASE_DELAY_MS`, and `WORKFLOW_RULE2_MAX_ATTEMPTS` follow 12-factor. The build agent applied these correctly. Tests use the config values rather than hardcoding the 2-day threshold.

5. **Test count growth was proportional** — 193 → 214 → 223 (backend) and 227 → 237 (frontend) across phases. No phase required removing existing tests. The regression preservation rate was 100%.

### Challenges Encountered

1. **Node 26 + Jest 29 fake timer pre-rejection guard** — `retryWithBackoff` tests using `jest.useFakeTimers()` and `jest.runAllTimersAsync()` caused `UnhandledPromiseRejectionWarning` because `runAllTimersAsync()` drives the retry loop to completion (and thus to rejection) before the test's `await expect(p).rejects` attaches its handler. Resolved by: (a) extracting the outer promise using `new Promise<T>((res, rej) => { resolveOuter = res; rejectOuter = rej })`, (b) attaching a no-op `.catch()` synchronously to the outer promise before returning it, and (c) using `Promise.allSettled([fn()])` inside the retry loop so each attempt's rejection is consumed immediately. This took 5 test iterations across the build. The guard is documented in `retry.ts` comments. Not systemic — only affects code that: (a) uses `retryWithBackoff` that rejects, AND (b) is tested with Jest fake timers that advance asynchronously.

2. **Code review Phase 2: SQL in service layer** — The initial `CardService.moveCard` implementation queried the source column name with raw SQL inline in the service method. Corrected by moving it to `CardRepository.getColumnName(columnId)` and `CardRepository.setSuppressed(cardId, bool)`. This is the correct fix per the 3-layer architecture Guiding Principle. The regression was caught before commit.

3. **Test Writer invented wrong `WorkflowWarning` shape in Phase 4** — The Test Writer agent wrote tests asserting a `WorkflowWarning { code, message, severity }` shape (with a `severity` field) rather than the actual `{ code, message, details? }` shape defined in the backend and the task spec. This was caught before commit when the Phase 4 progress notes documented "Test Writer initially invented a mismatched shape; corrected before commit." Root cause: the Test Writer agent did not cross-reference the backend types or the task specification's `WorkflowWarning` definition. It invented the shape from context alone.

4. **`insertDelivery` missing `RETURNING id`** — The initial Phase 2 implementation inserted delivery rows without `RETURNING id`. This was a Guiding Principle violation caught by the code review agent. The fix required adding `RETURNING id` to the SQL and updating the method signature. Minimal change with significant correctness implication.

### Technical Debt & Future Work

- **Frontend E2E spec not verified against running stack**: `frontend/e2e/workflow.spec.ts` was committed with TypeScript verified clean but without live-stack Playwright execution. The spec is structurally correct (follows established E2E patterns), but completion of UAT would validate the stale column rendering, done-color appearance, and stale suppression flows in a real browser. This remains open until UAT runs.

- **`retryWithBackoff` utility not used by Rule #2**: The utility ships in `retry.ts` and is tested in isolation (Phase 1), but Rule #2 uses a manual loop. Future rules that do not need per-attempt side effects should use `retryWithBackoff` directly. A note in `retry.ts` or `systemPatterns.md` should document when to prefer the utility vs. a manual loop.

- **Stale suppression race condition on double board load**: If two users load the same board simultaneously, both `applyBoardRules` calls find the same stale cards and both attempt to move them. The second UPDATE is idempotent (card is already in Stale), but both calls insert tracking rows, producing duplicate `workflow_rule_triggers` rows for the same card. Not a data integrity issue (card position is correct) but creates noise in the audit table. Acceptable at MVP scale.

- **`warnings[]` UI in board response**: The frontend parses `warnings[]` into the TypeScript type but renders nothing. The architecture decision was explicitly to parse-but-not-render for this iteration. A future admin panel or developer overlay can surface the field without a data model change.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

**Build Sessions**: 4 total (one per phase)
**Sub-Agents Spawned**: Estimated 16-20 across all phases (Test Writer, Coding Agent, Code Reviewer, Documentation per phase; Test Runner/Fixer for iteration cycles)
**Session Logs**: Not task-indexed. The `.agent-logs/claude/by-task/` directory was not present. Run `/banyan-init` to upgrade session indexing. Metrics below are derived from `progress.md` phase summaries and task execution state.

**Tool Calls**: Estimated 200-300 across all phases (inferred from 5 test iteration cycles in Phase 1, 3 code-review-fix cycles in Phase 2, 1 fix cycle in Phase 3, 1 fix cycle in Phase 4)
**Errors Recovered**: 3 blocking code review issues (2 Phase 2, 1 Phase 4 shape mismatch caught pre-commit), 5 test iteration cycles for Node 26 fake timer issue

#### Tool Utilization

| Tool | Estimated Count | Notes |
|------|----------------|-------|
| Read | High (~80-100) | Migration files, existing services, task spec, creative docs at phase start |
| Edit | High (~60-80) | Per-file changes across 4 phases; multiple edit cycles per phase for fixes |
| Write | Medium (~20-30) | New files: workflow.service.ts, workflow.repository.ts, retry.ts, migration files, test files |
| Bash | Medium (~40-60) | `npm test`, `tsc --noEmit`, migration verify commands |
| Grep | Medium (~30-40) | Cross-reference existing patterns (EventService, asyncHandler usage) |
| Glob | Low (~10-15) | File discovery at phase start |

Note: Tool counts are estimated from phase summaries; exact counts unavailable without task-indexed session logs.

#### Sub-Agent Performance

| Agent Type | Invocations | Model | Effectiveness |
|------------|-------------|-------|---------------|
| Coding Agent | ~4 (one/phase) | Sonnet | High — implemented all 4 phases correctly on first pass at the logic level; issues were caught by code review or test execution |
| Test Writer | ~4 (one/phase) | Sonnet | Good overall; Phase 4 incident (invented `WorkflowWarning` shape) is a recurring pattern — see below |
| Code Reviewer | ~4 (one/phase) | Sonnet | High — caught 2 blocking issues in Phase 2 (SQL in service layer, missing RETURNING), 1 semantic issue in Phase 3 (trigger_error null on exhaustion), 0 blocking in Phase 4 (PASS). Demonstrates reliable GP enforcement |
| Test Runner/Fixer | ~6-8 (multiple in Phase 1) | Sonnet/Opus | Phase 1 Node 26 fake timer issue required 5 iterations — high iteration count for a test infrastructure issue; correct eventual resolution |
| Documentation | ~3 (Phases 1-3) | Haiku | Appropriate for documentation updates; `techContext.md` and `systemPatterns.md` updated correctly across phases |

### Command Workflow Evaluation

**Commands Used**: `/banyan-roadmap feature create` (1), `/banyan-plan` (1), `/banyan-creative` (2 — architecture + UI/UX), `/banyan-build` (4 — one per phase), `/banyan-reflect` (1)

**Workflow Efficiency**: Good

**Assessment**:

- The 4-phase `/banyan-build` decomposition was appropriate for a Level 4 task. Each phase had a clear scope boundary and verification gate. The creative phase preceded all build phases and was referenced at each phase's start — this is the correct Level 4 pattern.

- The creative-to-build translation gap on Rule #2 (`retryWithBackoff` specified, manual loop implemented) is partly a workflow gap. The creative phase correctly chose `retryWithBackoff` as the right abstraction but did not specify the per-attempt delivery row insertion requirement in enough detail to make the deviation obvious. The Implementation Guidelines section of the creative doc (section 6, `retryWithBackoff` code snippet) shows the generic utility — but the build agent correctly recognized the conflict and deviated. A more explicit creative phase constraint ("Rule #2 must insert one `workflow_action_deliveries` row per retry attempt, with the attempt number available inside the loop") would have made this deviation explicit in the creative doc rather than a silent build-time decision.

- The UAT step was not run after Phase 4 — this is the correct point in the Level 4 workflow for it. The frontend E2E spec exists but was not verified against a running stack. `/banyan-uat` should be run before `/banyan-archive` for this task.

- No unnecessary steps were present. The creative phase's two sessions (architecture + UI/UX) were both load-bearing — the architecture creative drove the build directly; the UI/UX creative specified the amber column header, optimistic color strategy, and warning-silent treatment that Phase 4 implemented.

### Context File Effectiveness

**Files Loaded**: Task spec (`TASK-017.md`), creative docs (architecture + UI/UX), `techContext.md`, `systemPatterns.md`, `productBrief.md`, observability requirements, agent-rules `_learned/` files

**Assessment**:

- **Helpful**: The architecture creative doc was the most load-bearing context file. The `Promise.allSettled` approach, DI pattern, name-match column resolution, and `warnings[]` additive shape were all specified precisely and implemented exactly. The `systemPatterns.md` "No transactions" pattern was correctly applied to tracking writes. The observability requirements produced correct pino logging with structured fields.

- **Gaps**: The creative doc did not specify that per-attempt delivery row insertion was a hard requirement for Rule #2's retry harness. This made the build-time deviation from `retryWithBackoff` a judgment call rather than an explicit architectural note. The creative phase's observability architecture (metrics, custom Prometheus counters) was not implemented — the plan specifies these as stretch goals, but no build phase picked them up. Metrics are the main observability gap.

- **Redundancy**: The `WorkflowWarning` shape was defined in the task spec, in the architecture creative doc, and in the UI/UX creative doc. The Test Writer agent nevertheless invented a different shape in Phase 4. Redundancy in the specs did not prevent the drift — the agent needed to read the existing implementation, not just the specs.

### Memory Bank Organization

**Assessment**:

- **Structure**: The per-task creative file naming convention (`TASK-017-workflow-automation-architecture.md`, `TASK-017-workflow-automation-uiux.md`) worked well. The progress.md file served as a reliable phase-completion ledger — all four phase summaries are crisp and reference specific files. The task file's `## Execution State` section was kept current through all phases.

- **Navigation**: The `memory-bank/tasks/TASK-017.md` file is the correct single source of truth for the task. The execution state at the bottom correctly shows the current build step. The creative references at the top of the implementation roadmap give build agents a clear "also read these" signal.

- **Completeness**: The main organizational gap is the missing task-indexed agent logs. Without `by-task/TASK-017/` symlinks, reflection agents cannot derive precise tool call counts or per-session timing. This is a systemic gap across the project, not specific to TASK-017.

### Suggested Improvements to Claude Code System

**High Priority**:

1. **Test Writer agent should read existing type contracts before writing tests** — In Phase 4, the Test Writer invented a `WorkflowWarning` shape that differed from the backend contract already committed to `workflow.service.ts` and the task spec. The agent prompt for the Test Writer should include: "Before writing frontend type tests, read `backend/src/services/workflow.service.ts` (or equivalent) to verify the actual API contract." A more systematic fix: the Test Writer prompt should require it to locate and read any interface definition for types it plans to test before writing assertions. This pattern is valuable beyond TASK-017 — any time a frontend test touches an interface that has a backend definition, the Test Writer should cross-reference both.

2. **Creative phase: require explicit annotation when a spec utility has per-attempt side effects** — When the architecture creative specifies a retry utility (`retryWithBackoff`) and the acceptance criteria require per-attempt tracking rows, the creative should explicitly note: "Note: Rule #2 cannot use `retryWithBackoff` directly because per-attempt delivery row insertion requires access to the attempt number inside the loop. Implement as a manual `for` loop that collects `DeliveryRecord[]` and inserts tracking rows after the loop." This prevents a silent build-time deviation that the build agent resolved correctly by judgment but that could have gone wrong.

**Medium Priority**:

3. **Enable task-indexed session logs** — The `.agent-logs/claude/by-task/` directory was not created for TASK-017. Reflection agents fall back to prose from `progress.md` rather than quantitative tool-call metrics. Running `/banyan-init` to upgrade session indexing would enable precise tool utilization analysis in future reflections and would improve the evidence base for ecosystem effectiveness evaluation.

4. **Add a cross-layer contract verification step to build phases** — When a Phase N build produces a new TypeScript interface (e.g., `WorkflowWarning` in Phase 2), subsequent phases that consume it (Phase 4 frontend) should include an explicit "verify the interface in the source layer before testing" step in the build agent instructions. This formalizes what the human code review currently catches informally.

**Low Priority / Nice to Have**:

5. **Creative phase: mark implementation details that deviate from a specified utility as explicit notes** — The creative architecture doc's Implementation Guidelines (Section 6) shows the `retryWithBackoff` code snippet for Rule #2. A one-line annotation ("Rule #2 requires per-attempt delivery rows — implement as a manual loop, not this utility") would have documented the deviation and its reason in the creative doc, making it visible to future developers reading the creative doc without needing to trace the build session.

**Note**: These are suggestions only. Do NOT implement these changes — they are recommendations for future system enhancements.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

- **testing-patterns** (`*.test.*`, `*.test.tsx`): Before writing frontend type assertions for a backend-sourced interface, read the backend type definition at its canonical source — do not infer the shape from context alone or task spec only.

- **architecture-patterns** (`src/services/workflow.service.ts`, retry harnesses): When a creative phase specifies a generic retry utility, annotate whether the call site requires per-attempt callbacks (delivery rows, logging, counters); if it does, the retry loop must be a manual `for` loop, not the generic utility, to maintain per-attempt control.

- **error-handling** (`src/repositories/workflow.repository.ts`, tracking tables): Populate the parent trigger row's `trigger_error` field from the last delivery's `delivery_error` on exhaustion — this makes the trigger table alone sufficient for failure root-cause analysis without a join.

- **api-design** (`src/services/`, `frontend/src/api/`): When a response type extends an existing shape with an additive optional field (e.g., `warnings?: WorkflowWarning[]`), define the new field as optional so existing consumers that do not read it remain unaffected and do not require type updates.

### Learned Rules Applied

- **react-query-patterns.md**: The rule "Wire `onMutate` snapshot and `onError` restore in every optimistic mutation" was applied correctly — Phase 4's `useMoveCard.onMutate` includes the color cache update, and the existing `onError` snapshot restore covers the rollback. No new rollback logic was needed because the prior implementation already had it.

- **service-design.md**: "When a service's constructor depends on a new repository, always update every construction site in the same commit" — applied correctly. Phase 2 wired `WorkflowService` through `createBoardsRouter` and `createCardsRouter` in the same phase commit as the service itself. No missed construction sites.

- **testing-patterns.md**: "Place frontend component tests co-located alongside the component file" — `useMoveCard.test.tsx` and `workflowWarning.test.ts` were placed correctly (co-located, not in `__tests__/` subdirectories).

- **testing-patterns.md**: "Pre-existing test fixture type mismatches should be fixed in the same PR phase" — the Test Writer's `WorkflowWarning` shape mismatch was corrected before commit in Phase 4, consistent with this rule.

### For Claude Code Workflow

1. **Creative phase spec precision matters most for utility vs. custom-loop decisions** — When a creative phase specifies a utility function but the acceptance criteria impose per-attempt side effects, the creative doc must make this conflict explicit. Build agents resolve it correctly by judgment (as in Phase 3), but documenting the deviation in the creative doc prevents confusion for future readers and reduces the chance of a build agent reverting to the utility unnecessarily.

2. **Test Writer agents need enforced cross-layer contract reading** — The Phase 4 shape mismatch (invented `WorkflowWarning.severity` field) was caught before commit, but only because the progress notes document the correction. In a faster-moving codebase or with less attentive review, an invented interface shape could slip through. The build prompt should include a mandatory step: "Read the backend type definition for any interface you plan to test from the frontend."

3. **Node 26 + Jest fake timer pre-rejection guard is a project-level known issue** — The 5-iteration resolution for `retryWithBackoff` tests is primarily a runtime environment issue (Node 26 emits `UnhandledPromiseRejectionWarning` for promises that reject before a `.catch()` handler attaches). The solution (`outerPromise` wrapper + no-op `.catch()`) is documented in `retry.ts` comments. Future tasks that introduce async utilities tested with fake timers should reference this pattern from day one rather than discovering it mid-build.

---

## Conclusion

TASK-017 delivered a complete, working workflow automation engine for BanyanBoard in four well-structured phases. All 15 acceptance criteria are met, 460 tests pass, and TypeScript is clean across both layers. The Level 4 classification was accurate — the cross-layer scope, the novel async retry pattern with per-attempt tracking, and the non-trivial TanStack Query cross-slice cache read all required the creative phase design work that preceded the build.

The two most instructive incidents — the manual retry loop deviation from `retryWithBackoff` (resolved correctly at build time) and the Test Writer's invented `WorkflowWarning` shape (caught and corrected before commit) — point to the same root gap: sub-agents operating on one layer of the stack do not automatically read contracts established by other layers. The creative phase partially addresses this for architecture-level decisions, but the Test Writer agent needs an explicit cross-reference step for interface definitions. The trigger_error observability fix (carry last delivery error to trigger row) is the cleanest improvement of the task — a one-line change that eliminates the need for a join to diagnose any Rule #2 failure.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Moderately Effective — the 4-phase structure and code review sub-agent performance were strong; session log indexing gap and creative-to-build translation gap on per-attempt side effects are the two areas for improvement.

**Recommendation**: Ready to archive after `/banyan-uat` runs to verify the frontend E2E spec against a running stack.
