# Reflection: TASK-018 - Delete Card UI

**Date**: 2026-06-28
**Task Complexity**: Level 2
**Total Phases**: 1
**Duration**: 2026-06-28 (single-session build)

## Executive Summary

TASK-018 added the frontend delete-card feature to BanyanBoard: a `useDeleteCard(columnId)` mutation hook in `hooks.ts`, an `onDelete?` prop and X button on `KanbanCard`, and the wiring in `KanbanColumn` including error display. The backend `DELETE /cards/:id` endpoint (FEAT-003) was already in place, so the scope was purely frontend. All five acceptance criteria were met and the full 245-test suite passed clean with 8 new tests added (3 hook, 3 component, 2 integration).

The implementation was textbook for this class of task: a direct mirror of the existing `useUpdateCard(columnId)` pattern, requiring no architectural invention. The plan spec was precise enough to identify the exact files, line ranges, and CSS positioning strategy before implementation began, which meant the coding agent could proceed without ambiguity. The one area that required remediation was a predictable mock-gap pattern: adding a new export to a wholesale-mocked module (`vi.mock('@/api/hooks')`) broke two existing test suites (`BoardPage.test.tsx`, `KanbanBoard.test.tsx`) that auto-mock all exports as `undefined`. Three integration regressions of this type were caught and fixed during the test phase.

The Level 2 workflow (plan → build → reflect) was well-suited to this task. The spec was concrete enough that no creative phase was needed, and the single-phase build aligned naturally with the scope. The proactive additions by the code reviewer — `focus-visible` ring for WCAG 2.4.7 and `removeQueries` for detail-cache eviction — elevated the implementation quality beyond minimum viable without scope creep.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: All Met

| AC | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| AC-ENTRY-1 | Delete button visible on every card with correct `aria-label` | Met | `KanbanCard.tsx` line 112–121; KanbanCard.test.tsx delete button render test |
| AC-HAPPY-1 | Card disappears immediately, server confirms 204, absent after reload | Met | `onSettled` invalidates `queryKeys.cards.byColumn`; server-confirmed by existing `DELETE /cards/:id` test suite |
| AC-ERROR-1 | Card reappears on failure; `ErrorBanner` with `role="alert"` shown | Met | `onError` restores snapshot; `KanbanColumn.tsx` lines 64–68 render `ErrorBanner` when `deleteCard.isError`; KanbanColumn integration test |
| AC-A11Y-1 | Button keyboard accessible, visible focus ring, screen-reader labelled | Met | `aria-label="Delete card: ${card.title}"` present; `focus-visible` CSS ring added by code reviewer (WCAG 2.4.7) |
| AC-OPTIMISTIC-1 | Card removed before server responds | Met | `onMutate` filters card from cache before awaiting fetch; useDeleteCard.test.ts verifies with never-resolving fetch mock |

All five MUSTs were delivered. No scope creep: confirmation dialog, undo, and board-level delete were explicitly excluded and none appeared in the implementation.

### Code Quality Assessment

**Overall Rating**: Excellent

- **Maintainability**: The `useDeleteCard` hook mirrors `useUpdateCard` in structure and naming — same `columnId` closure, same `onMutate`/`onError`/`onSettled` lifecycle, same `ApiError` typing. A developer familiar with `useUpdateCard` can read `useDeleteCard` with no learning curve. The `handleCardDelete` function in `KanbanColumn` is a one-liner delegation, keeping column logic thin.

- **Architecture**: The decision to call `useDeleteCard(columnId)` inside `KanbanColumn` and pass `onDelete` as a prop to `KanbanCard` keeps the card component stateless with respect to server operations. This correctly mirrors how `useUpdateCard` is wired. The card renders the button only when `onDelete` is provided (line 112: `{onDelete && (...)}`) — a thoughtful guard that prevents a broken no-op button in any context where `KanbanCard` is rendered without delete capability (e.g., drag overlays).

- **Error Handling**: The `onError` restoration correctly checks `ctx?.prevCards !== undefined` before calling `setQueryData`, guarding against the edge case where `onMutate` never ran (e.g., if the mutation was cancelled synchronously). The `ErrorBanner` in `KanbanColumn` uses `deleteCard.error?.message ?? 'Failed to delete card'` — a safe fallback that works whether the error has a message or not.

- **Testing**: 8 tests across 3 files covering the full AC surface: mutationFn behavior, optimistic removal, snapshot restore, button render, prop conditionality, error banner display, and delete wiring through to `mutate`. The never-resolving fetch mock for AC-OPTIMISTIC-1 is an especially clean technique for mid-flight assertion.

### Technical Decisions

**Key Decisions:**

1. **Mirror `useUpdateCard` pattern exactly** — Rather than inventing a new hook shape, `useDeleteCard` replicates the `useUpdateCard` lifecycle structure. This minimizes cognitive overhead for future maintainers and ensures consistency in error handling and cache invalidation semantics. Outcome: zero ambiguity in implementation, zero divergence from project patterns.

2. **Conditional `onDelete` prop on `KanbanCard`** — The delete button renders only when `onDelete` is provided, not always. This was a deliberate design choice documented in the spec (the button absent when `onDelete` prop is `undefined`). A separate test verifies this absence. Outcome: `KanbanCard` remains reusable in contexts without delete capability without additional prop flags.

3. **`removeQueries` for detail cache eviction in `onMutate`** — Added proactively by the code reviewer, this evicts `queryKeys.cards.detail(cardId)` from the cache during optimistic removal. Without this, a user navigating to a card detail page immediately after deletion would see a stale cache flash. This was not in the original spec but is correct future-proofing. Outcome: detail cache stays consistent with column cache on deletion; no behavior change in the current app (no card detail route exists yet) but prevents a latent bug when one is added.

4. **Always-visible delete button (no hover-only)** — The spec explicitly chose always-visible over hover-only for keyboard and touch accessibility. This matches the existing `dragHandle` and `colorButton` pattern. The CSS comment documents the hover-only alternative for if the product owner prefers it later. Outcome: simpler CSS, better accessibility, visual consistency with the card's other controls.

**Trade-offs:**

- **No confirmation dialog**: Accepted risk of accidental deletion in exchange for a fast, frictionless delete experience matching the "no bloat" product brief. The spec notes `useDeleteBoard` sets the same precedent in the codebase. The undo path is out of scope.
- **`columnId` closure in hook vs. passing columnId to mutate**: Keeping `columnId` as a constructor argument (matching `useUpdateCard`) rather than a per-mutate variable means a single `KanbanColumn` cannot reuse one hook instance across multiple columns. This is not a real constraint since each `KanbanColumn` instance is a separate React component, but it is worth noting as a pattern that becomes awkward if mutation hooks ever need to be lifted above the column boundary.

### What Went Well

1. **Spec precision eliminated ambiguity**: The plan document identified `KanbanCard.tsx` line 79, the existing `.cardHeader` flex layout, and the `margin-left: auto` CSS strategy. The coding agent executed without needing to explore the codebase for context. No spec amendments were needed during implementation.

2. **Proactive code review quality uplift**: Two improvements added by the code reviewer — `focus-visible` ring and detail-cache eviction — were both correct and materially improved accessibility and cache correctness without any scope discussion. The code review phase added tangible value on a task that could have been treated as a rubber-stamp.

3. **Clean test isolation for AC-OPTIMISTIC-1**: The use of a never-resolving `Promise` (`new Promise(() => {})`) to freeze the fetch in-flight and then assert the optimistic cache state is a precise, reliable technique. It avoids time-based assertions entirely.

### Challenges Encountered

1. **`vi` import missing in KanbanCard.test.tsx** — The pre-existing test file imported `{ describe, it, expect }` from vitest but not `vi`. New Phase 5 tests used `vi.fn()`, causing an immediate compile error. Resolved by adding `vi` to the vitest import line. Preventable if the test writer had scanned existing imports before generating new tests — the pattern of missing `vi` in RTL component test files is a known friction point.

2. **`useDeleteCard` not mocked in BoardPage.test.tsx** — `vi.mock('@/api/hooks')` replaces every export with `undefined` by default. When a new hook is added to `hooks.ts`, every test file that wholesale-mocks hooks must add an explicit stub for the new export or that export resolves to `undefined`, causing component render errors. Both `BoardPage.test.tsx` and `KanbanBoard.test.tsx` needed `mockedUseDeleteCard.mockReturnValue(mockMutation())` added to their `beforeEach`. This is a **structural gap** in how wholesale module mocks interact with evolving exports — it is a predictable class of regression, not a one-off error.

3. **`useDeleteCard` not mocked in KanbanBoard.test.tsx** — Identical root cause as #2. Same fix applied. These two regressions could have been caught proactively if the test writer had searched for all files containing `vi.mock('@/api/hooks')` before finalizing the test plan.

### Technical Debt & Future Work

- **Undo / restore**: Deletion is irreversible in the current implementation. If the product roadmap introduces an undo capability, the `onMutate` snapshot is already the right hook point — no architectural change needed, only a UI trigger and a `restoreFromSnapshot` path.
- **Confirmation for destructive actions**: The spec documents the recommended approach (inline toggle, not modal) if the product owner revisits. No code changes needed now.
- **No card detail route yet**: The `removeQueries` for `queryKeys.cards.detail(cardId)` added in the code review is proactive insurance. When a detail route is added, this eviction will prevent stale-cache flashes automatically.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

Session logs are not indexed in `.agent-logs/claude/by-task/TASK-018/`. The `.agent-logs/` directory does not exist in this project. Metrics below are reconstructed from the task execution state in `tasks/TASK-018.md` and the implementation artifacts.

**Note**: Session logs not task-indexed. Run /banyan-init to upgrade.

**Build Sessions**: 1 (Phase 1, single-phase task)
**Sub-Agents Spawned**: 4 (coding-agent, test-writer-agent, code-reviewer, documentation-agent)
**Test Fix Cycles**: 1 (3 regressions caught and fixed in the test phase; no second test run needed)
**Errors Recovered**: 3 integration regressions

#### Tool Utilization (estimated from artifacts)

| Tool | Estimated Count | Notes |
|------|-----------------|-------|
| Read | ~15 | hooks.ts, KanbanCard.tsx, KanbanColumn.tsx, KanbanCard.module.css, existing tests, systemPatterns.md |
| Edit | ~8 | hooks.ts (useDeleteCard + import), KanbanCard.tsx, KanbanCard.module.css, KanbanColumn.tsx, BoardPage.test.tsx, KanbanBoard.test.tsx |
| Write | ~1 | useDeleteCard.test.ts (new file) |
| Bash | ~4 | npm test run(s) |
| Grep | ~3 | Finding vi.mock usage, locating existing test patterns |
| Glob | ~2 | Test file discovery |

#### Sub-Agent Performance

| Agent Type | Invocations | Model | Effectiveness |
|------------|-------------|-------|---------------|
| Coding Agent | 1 | Sonnet | High — executed 7-step implementation roadmap with no plan deviations |
| Test Writer | 1 | Sonnet | Good — 8 tests correctly specified; missed `vi` import gap and wholesale-mock gap in two files |
| Code Reviewer | 1 | Sonnet | High — identified 2 genuine improvements (WCAG focus ring, detail cache eviction), both applied proactively |
| Documentation Agent | 1 | Haiku | Good — memory bank updated; systemPatterns.md and productBrief.md refreshed |

### Command Workflow Evaluation

**Commands Used**: `/banyan-plan` (1x), `/banyan-build` (1x), `/banyan-reflect` (1x)

**Workflow Efficiency**: Excellent

The Level 2 workflow (plan → build → reflect, no creative phase) was exactly right for this task. The spec was self-contained: it identified the implementation location, the exact CSS pattern, the existing hook to mirror, and the test count by file. Skipping the creative phase was correct — there was no design ambiguity worth a dedicated exploration session.

**What worked well:**
- The plan document served as a complete implementation contract. The coding agent required no exploratory reads beyond what the plan specified.
- The single-phase build matched the task scope — there was no natural midpoint for a phase gate, and treating the entire frontend wiring as one atomic phase was correct.
- The code review phase added value disproportionate to its cost by catching both a WCAG gap and a cache consistency gap that the original spec did not surface.

**What could be improved:**
- The test writer did not search for all files containing `vi.mock('@/api/hooks')` before generating the test plan. Adding a step to the test-writer-agent prompt — "when adding a hook export, grep for `vi.mock` on the module file and add stubs to each match" — would prevent this class of regression systematically.
- The build agent could check the existing test imports for the files it is modifying (`vi` missing from KanbanCard.test.tsx import) as a pre-flight step.

### Context File Effectiveness

**Files loaded by agents**: `tasks/TASK-018.md`, `techContext.md`, `systemPatterns.md`, `productBrief.md`, build agent context files

**Assessment:**
- **Helpful**: `tasks/TASK-018.md` was the primary source of truth. The spec sections (Invocation Method, Optimistic Update Strategy, Scope Boundaries) eliminated exploration time. The explicit line reference to `KanbanCard.tsx` line 79 was precise enough that the coding agent could execute the plan without codebase exploration beyond confirmation reads.
- **Gaps**: The test-writer context does not include a directive to audit `vi.mock` usages in adjacent test files when a new module export is introduced. This is the most actionable gap to address.
- **Redundancy**: None observed. Context files are well-scoped.

### Memory Bank Organization

**Assessment:**
- **Structure**: Clear and navigable. The per-task file in `tasks/TASK-018.md` functioned as intended — a single document holding the full plan, spec, acceptance criteria, and execution state. Reflection and archive files follow a consistent naming convention.
- **Navigation**: Efficient. The task file's dependency list (`endpoints.ts line 48`, `queryKeys.ts`, `ErrorBanner`) was precise enough to drive implementation without exploratory searches.
- **Completeness**: The `_learned/` rules collection is now mature enough (14 topic files) that relevant patterns were available for this task. The `react-query-patterns.md` and `testing-patterns.md` rules were directly applicable.

### Suggested Improvements to Claude Code System

**High Priority:**

1. **Test writer: audit wholesale vi.mock callsites when adding new exports** — When the test-writer-agent adds a new export to a module that is already the subject of `vi.mock('path/to/module')` in any test file, it should grep for all files using that mock and add an explicit stub for the new export in each. This is a deterministic, low-cost check that would prevent the BoardPage + KanbanBoard regressions from TASK-018, and the same pattern has almost certainly recurred across multiple prior tasks.

2. **Test writer: pre-flight import audit for modified test files** — Before generating new tests for an existing file, the test writer should scan the current import block to verify `vi` (and any other required testing utilities) are already imported. A missing `vi` in a file that uses `describe/it/expect` but not mocks is a one-line fix that should never surface as a test failure.

**Medium Priority:**

3. **Build coding agent: check for `vi` import in existing test files before adding vi.fn() usage** — Since the coding agent also modifies existing test files (when extending them during implementation), it could perform the same import-scan pre-flight. Duplicates the test-writer check but provides defense in depth.

4. **Plan spec template: add a "Affected mock callsites" section** — For tasks that add new exports to existing modules (hooks.ts, endpoints.ts, etc.), the plan template could prompt the spec writer to list which existing test files use `vi.mock` on that module. This turns a runtime discovery into a planning-time checklist item.

**Low Priority / Nice to Have:**

5. **Automatically promote `testing-patterns` rules with evidence_count >= 5 to high priority** — The `testing-patterns.md` rule file now has 13 entries and evidence_count 13. Rules that have been reinforced this many times across distinct tasks have proven their generalizability and should be loaded by default, not just when `*.test.*` files are in scope.

**Note**: These are suggestions only. Do NOT implement these changes — they are recommendations for future system enhancements.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

1. **testing-patterns** (`*.test.*`, `src/api/hooks.ts`): When adding a new export to a wholesale-mocked module (`vi.mock('@/api/module')`), grep for all test files using that mock and add an explicit stub for the new export in each — auto-mocked undefined exports silently break component renders.

2. **testing-patterns** (`*.test.tsx`, `*.test.ts`): Before adding `vi.fn()` or `vi.spyOn` calls to an existing test file, verify `vi` is included in the vitest import statement — component test files often import only `{ describe, it, expect }` and lack `vi`.

### Learned Rules Applied

- **react-query-patterns.md**: The `onMutate` snapshot / `onError` restore pattern was applied exactly as documented. The rule "snapshot both keys for two-key mutations; single key for single-key mutations" correctly oriented the hook toward a single-key pattern (only `byColumn` cache, not a detail cache, is the mutation target). Applied directly.
- **testing-patterns.md** (co-located test placement): New hook tests were placed in `src/api/__tests__/useDeleteCard.test.ts` following the `__tests__/` convention for API-layer files (vs. co-located for component files). No violation.
- **testing-patterns.md** (pre-existing fixture type mismatches): No pre-existing fixture mismatches were found in the files modified for this task — rule not triggered.

### For Claude Code Workflow

1. **Wholesale mock callsite audit belongs in the test plan** — Before writing tests for a task that adds new exports, the test writer should emit a list of all files containing `vi.mock` on the modified module as a pre-test-plan step. This is a two-line grep that turns a predictable runtime failure into a planning-time checklist item.

2. **Code review phase earned its keep** — The code review on a Level 2 task added two improvements (WCAG focus ring, detail cache eviction) that were not in the original spec. For tasks touching accessibility-sensitive components, the code review phase should be non-negotiable even at Level 2.

3. **Single-phase Level 2 builds are efficient and low-risk** — For purely frontend wiring tasks that mirror an existing pattern, the single-phase Level 2 workflow (plan → build → reflect) delivered a clean result with no architectural detours. The complexity classification was accurate.

---

## Conclusion

TASK-018 delivered a complete, well-tested delete-card feature that meets all five acceptance criteria with clean TypeScript, lint, and a 245/245 test suite. The implementation is a faithful extension of the established `useUpdateCard` mutation pattern, introducing no new architectural patterns and leaving no technical debt. The three integration regressions encountered during testing were all instances of the same wholesale-mock gap pattern — predictable, fixable, and worth encoding as a standing rule.

The Level 2 workflow served this task correctly. The plan spec was precise enough to make the creative phase unnecessary, the single-phase build matched the scope, and the code review phase elevated two accessibility and cache-consistency details that the original spec left unspecified. The primary improvement opportunity for the Claude Code system is a pre-flight check in the test-writer-agent that audits `vi.mock` callsites when a new module export is introduced — this class of regression has now appeared in multiple consecutive tasks and warrants a systematic fix.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Highly Effective

**Recommendation**: Ready to archive
