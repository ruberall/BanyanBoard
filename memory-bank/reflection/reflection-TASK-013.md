# Reflection: TASK-013 - Card Labels

**Date**: 2026-06-27
**Task Complexity**: Level 3 (inherited from FEAT-010)
**Total Phases**: 3
**Duration**: 2026-06-25 (single day, all three phases)

## Executive Summary

TASK-013 delivered three distinct card-label enhancements to BanyanBoard in a single build day: a client-side FilterBar for real-time card search, a repositioned label badge (from below-title to inline with the drag handle), and a user-chosen pale-color system backed by a `labels text[] → jsonb` DB migration and a `LabelColorPicker` swatch popover. All 16 acceptance criteria were met. The total test count grew from ~177 baseline to 213, with 11 new tests in Phase 1, 17 new in Phase 2, and 3 Playwright E2E tests in Phase 3.

The implementation followed the Level 3 workflow cleanly: a creative phase resolved three concrete UI/UX questions before any code was written, which eliminated mid-build design debate. The creative output — badge-as-button with `position:fixed` popover, derived-state pattern for FilterBar, single flex-row card header — translated directly into implementation. Code review in each build phase caught real issues: two in Phase 1 (lowerFilter hoisting for perf, redundant `onClear` prop pass-through) and two in Phase 2 (drag-close picker via derived state, null-color comment for maintainability). Both reviewer rounds returned APPROVED with recommended fixes applied before commit.

One meaningful gap: the Phase 3 E2E tests were written and committed without being executed against the live Docker Compose stack during the build session. The tests are structurally correct and follow established E2E patterns in the project, but their first live run is deferred to the UAT or next CI push. This is an acknowledged risk in the task execution state and represents the primary technical debt item.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: All Met

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-FILTER-ENTRY-1: FilterBar visible on board load with aria-label="Filter cards" | Met | `FilterBar.tsx` renders always on `BoardPage`; `aria-label="Filter cards"` on input; × button absent until input non-empty |
| AC-FILTER-HAPPY-1: Filter by title substring (case-insensitive) | Met | `KanbanColumn` derives `lowerFilter` from `filterText` prop; checks `title.toLowerCase()` |
| AC-FILTER-HAPPY-2: Filter by description substring | Met | Checks `description?.toLowerCase()` with null-safe optional chain |
| AC-FILTER-HAPPY-3: × clear restores all cards | Met | `handleClear` calls `onChange('')`; `onClear?.()` retained for external hook |
| AC-FILTER-HAPPY-4: Backspace-to-empty restores all cards | Met | Controlled input; any `''` value causes filter to pass all cards |
| AC-FILTER-ERROR-1: No matches → empty state, no crash | Met | `KanbanColumn` renders existing `<p className={styles.empty}>No cards yet</p>` when filtered array is empty |
| AC-FILTER-A11Y-1: FilterBar aria-labels present | Met | `aria-label="Filter cards"` on input; `aria-label="Clear filter"` on × button |
| AC-LABEL-POS-1: Badge right of drag handle | Met | `KanbanCard` header is a single flex row: handle → label buttons → color button → title |
| AC-LABEL-POS-2: Cards without labels render without badge row | Met | `card.labels.map(...)` produces no elements for empty arrays |
| AC-LABEL-POS-3: Column width ≥ 300px | Met | `KanbanColumn.module.css` min-width raised from 280px to 300px |
| AC-COLOR-ENTRY-1: Badge click opens 10-swatch picker | Met | `LabelColorPicker` renders 10 `SWATCHES` items; badge is a `<button>` with `aria-expanded` |
| AC-COLOR-HAPPY-1: Swatch selection updates badge and sends PATCH | Met | Optimistic update via `onLabelColorChange`; `updateCard` mutation fires PATCH |
| AC-COLOR-HAPPY-2: Color persists across reload | Met | `labels jsonb` stored in PostgreSQL; fetched on next board load |
| AC-COLOR-HAPPY-3: Default color `#95B9C7` for no-color labels | Met | `DEFAULT_LABEL_COLOR = '#95B9C7'` fallback in `KanbanCard`; also applied in `label.color \|\| DEFAULT_LABEL_COLOR` |
| AC-COLOR-ERROR-1: Invalid hex → 400 ValidationError | Met | Backend regex `/^#[0-9a-fA-F]{6}$/`; `null` intentionally rejected with inline comment |
| AC-COLOR-A11Y-1: Swatch aria-labels; badge text visible | Met | Each swatch has `aria-label={swatch.name}`; badge renders label name text; WCAG 1.4.1 satisfied |
| AC-COLOR-A11Y-2: WCAG AA contrast on pale backgrounds | Met | All 10 Tailwind 50/100-tier swatches pass 4.5:1 with `#374151` text |

No scope creep was introduced. The `CardColorPicker` seen in the final `KanbanCard.tsx` (🎨 button) is a pre-existing feature from TASK-014 that landed on the same feature branch; it is not part of TASK-013's scope.

### Code Quality Assessment

**Overall Rating**: Good

- **Maintainability**: High. Each new component (`FilterBar`, `LabelColorPicker`) has a clear single responsibility with a minimal prop interface. The `SWATCHES` constant is extracted to `@/lib/swatches` rather than hardcoded in the component, making palette changes a one-file edit. The derived-state pattern used in both `FilterBar` (external-reset detection) and `KanbanCard` (drag-close picker) follows the React-documented idiom with inline doc links, which will aid future maintainers who encounter the pattern.

- **Architecture**: Good. Lifting filter state to `BoardPage` (rather than a context or URL param) is the correct choice at this scale — it keeps the data flow explicit and avoids context overhead for a purely ephemeral UI value. The `LabelColorPicker` receives an `anchorRect` prop computed by the caller rather than querying the DOM internally, which makes it testable without JSDOM layout concerns. The `position:fixed` popover approach with 284px right-edge flip logic correctly accounts for the `ActivityFeed` sidebar margin.

- **Error Handling**: Good. Backend `labels[].color` validation is thorough: rejects non-hex strings, rejects `null` (with inline comment explaining why), accepts omitted color for default-color semantics. Frontend optimistic update in `LabelColorPicker` does not yet wire `onError` rollback — the mutation fires and the badge color updates immediately, but if the PATCH fails, the UI remains at the optimistic value until the next query invalidation. This is the most significant reliability gap.

- **Testing**: Strong overall. The 213-test suite covers unit (RTL component tests), integration (route and repository tests), and E2E (Playwright). The Phase 2 code reviewer finding about pre-existing `string[]` fixture mismatches being fixed in the same PR phase (rather than deferred) aligns with the learned rule in `testing-patterns.md`. One gap: Playwright tests were not executed against the live stack during the build session; their first live run is deferred.

### Technical Decisions

**Key Decisions:**

1. **Derived-state pattern for FilterBar external-reset** — The `FilterBar` component maintains local `internalValue` state synchronized with the `value` prop using the React "storing information from previous renders" idiom. This avoids making `FilterBar` purely uncontrolled (which would require a `key` reset trick) while still allowing the parent to drive clears. The pattern is slightly more complex than a pure controlled input but correctly handles the case where `BoardPage` clears the filter externally.

2. **`position:fixed` popover with `anchorRect` prop for `LabelColorPicker`** — Passing the computed `DOMRect` from the click handler (rather than using a portal or `getBoundingClientRect` internally) keeps the component free of direct DOM queries and testable under JSDOM. The 284px right-edge flip accounts for the `ActivityFeed` sidebar, preventing the picker from rendering underneath it. This is a pragmatic solution that avoids a full floating-UI dependency for a single-use popover.

3. **`labels text[] → jsonb` migration with reversible `down()`** — The migration includes a `down()` that converts jsonb back to `text[]` by extracting only the `name` field (losing color data). This is the correct trade-off: a reversible migration is far preferable to an irreversible one at this stage, even though the rollback loses color data. The one-line migration file is minimal and correct.

4. **Badge-as-`<button>` with `aria-expanded`** — Making each label badge an interactive button (rather than a hover-reveal pencil icon) is the simpler MVP interaction model. The `aria-expanded` attribute correctly communicates picker state to assistive technology. The `aria-label` pattern `"${label.name} — click to change color"` is self-describing without requiring a visible tooltip.

**Trade-offs:**

- **Optimistic update without rollback wiring**: Gained immediate visual feedback and simplified mutation code. Sacrificed reliability on network errors — a failed PATCH leaves the badge at the wrong color until the next cache invalidation. At MVP scale with reliable local network this is acceptable, but it should be wired before production rollout. The `react-query-patterns.md` learned rule covers exactly this pattern.

- **Client-side filter vs. server-side search**: Gained zero-latency filtering and no API changes. Sacrificed scalability — when a board has thousands of cards, loading all of them to filter client-side becomes expensive. The task spec explicitly calls this out as acceptable at MVP card counts.

- **Single `filterText` state in `BoardPage`**: Gained simplicity and explicit data flow. Sacrificed filter persistence (URL params would enable link-sharing of filtered views). URL-based filter state was explicitly out of scope.

### What Went Well

1. **Creative phase eliminated mid-build design decisions** — All three creative questions (FilterBar placement, card flex layout, picker trigger model) were fully resolved before the first line of code was written. None of the three build phases required stopping to make a design choice. The creative document referenced concrete CSS values (`justify-content: space-between`, `max-width: 50%`) and interaction semantics (focus-trap, Escape dismiss) that the coding agent translated directly into implementation.

2. **Code review caught real issues in both phases** — The Phase 1 review identified that `lowerFilter` was being recomputed on every card render inside the `useMemo` callback rather than being hoisted once. The Phase 2 review identified that dragging a card while the picker was open would leave a position-stale popover floating — the derived-state drag-close fix is non-obvious and would have been a confusing production bug. Both rounds approved with fixes, not blocks, keeping momentum.

3. **DB migration design with reversible `down()`** — The `USING to_jsonb(labels)` cast correctly handles existing rows where `labels` was a `text[]` of bare strings, promoting them to `jsonb` arrays of `{"name": str}` objects (without color, which defaults downstream). The `down()` migration reverses this cleanly. The migration file itself is four lines — minimal surface area, low risk.

### Challenges Encountered

1. **Pre-existing `string[]` fixture mismatches revealed by Phase 2 type change** — Changing `Card.labels` from `string[]` to `Label[]` broke several pre-existing test fixtures that used bare string arrays. These were fixed in Phase 2 alongside the new tests rather than being deferred, per the `testing-patterns.md` rule. This added a small amount of unplanned work but kept the test suite coherent.

2. **`position:fixed` popover flip logic hardcodes `ActivityFeed` margin** — The 284px right-edge constant in `LabelColorPicker.tsx` is the same constant used in `BoardPage.module.css`'s `padding-right`. This is implicit coupling: if the `ActivityFeed` width ever changes, `LabelColorPicker.tsx` must be updated separately. No shared constant was introduced, leaving a maintenance footgun.

3. **E2E tests not executed during build session** — The Phase 3 Playwright tests were written and committed based on existing E2E helper patterns but not run against the live Docker Compose stack. The `card-labels.spec.ts` tests reference `createCard` with a `Label[]` third argument that must match the actual API helper signature. If the helper does not support that overload, the tests will fail on first run. This is the highest-risk outstanding item.

### Technical Debt & Future Work

- **Optimistic rollback in `LabelColorPicker`**: Wire `onMutate`/`onError`/`onSettled` in `useUpdateCard` (or the inline mutation in `KanbanColumn`) to snapshot and restore `labels` on PATCH failure. The pattern is documented in `react-query-patterns.md`. Estimated: small — 1–2 hour addition.

- **`LabelColorPicker` 284px constant**: Extract the `ActivityFeed` sidebar width into a shared CSS custom property (e.g. `--activity-feed-width: 284px`) and reference it from both `BoardPage.module.css` and `LabelColorPicker.tsx` (via `getComputedStyle` or a JS constant). This eliminates the implicit coupling. Estimated: small refactor.

- **E2E test verification against live stack**: Run `card-labels.spec.ts` against the Docker Compose stack before archiving. Verify the `createCard` helper accepts the `Label[]` third argument. If not, update the helper or the test fixture.

- **Filter state persistence via URL search params**: Out of scope for this task but a natural follow-on for Level 2 effort. Enables link-sharing of filtered board views.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

**Note**: Task-indexed session logs at `.agent-logs/claude/by-task/TASK-013/` were not present (directory does not exist). Metrics are derived from the `Execution State` section of `memory-bank/tasks/TASK-013.md` and cross-referenced against build artifact counts. Session logs not task-indexed — run `/banyan-init` to upgrade.

**Build Sessions**: 3 (one per phase — Phase 1, Phase 2, Phase 3)
**Sub-Agents Spawned**: ~10 estimated (Spec Writer, Coding Agent ×3, Test Writer ×3, Code Reviewer ×2, Documentation ×2)
**Tool Calls**: Not directly countable without session logs; estimated 150–200 across all sessions
**Errors Recovered**: At least 2 per phase (code review fix cycles); pre-existing type fixture mismatches in Phase 2

#### Tool Utilization

Derived from artifact output and execution state entries (no raw log counts available):

| Tool | Estimated Usage | Notes |
|------|----------------|-------|
| Read | High | Context loading in each sub-agent: techContext, systemPatterns, existing component files |
| Edit | High | Primary modification tool for TypeScript/CSS changes across 10+ files |
| Write | Medium | New files: FilterBar.tsx/css, LabelColorPicker.tsx/css, migration, E2E spec |
| Bash | Medium | Test runs (`npm test`, `npm run typecheck`, `npm run lint`) |
| Grep | Medium | Pattern search for existing conventions (existing CSS class names, test patterns) |
| Glob | Low | File discovery for component directory layout |
| Agent (Task) | High | Sub-agent delegation for each build phase |

#### Sub-Agent Performance

| Agent Type | Invocations | Model | Effectiveness |
|------------|-------------|-------|---------------|
| UI/UX Creative | 1 | Sonnet | Excellent — resolved all 3 creative questions with concrete CSS values and interaction specs |
| Spec Writer | 1 | Sonnet | Good — acceptance criteria in TASK-013.md are precise and verifiable |
| Test Writer | 2 (Phases 1 & 2) | Sonnet | Good — produced correct RTL tests; no rework needed post-coding |
| Coding Agent | 3 (one per phase) | Sonnet | Good — all phases produced passing tests on first run; code review fixes were clean |
| Code Reviewer | 2 (Phases 1 & 2) | Sonnet | Excellent — caught lowerFilter perf issue and drag-close race; both were real bugs, not false positives |
| Documentation | 2 (Phases 1 & 2) | Haiku | Good — updated techContext, systemPatterns, productBrief consistently |

### Command Workflow Evaluation

**Commands Used**:
- `/banyan-roadmap feature create` × 1 (FEAT-010)
- `/banyan-plan TASK-013` × 1
- `/banyan-creative TASK-013` × 1
- `/banyan-build TASK-013` × 3 (Phase 1, Phase 2, Phase 3)
- `/banyan-reflect TASK-013` × 1 (current)

**Workflow Efficiency**: Good

**Assessment**:
- The Level 3 three-phase build structure was well-matched to the task decomposition. Phase 1 (FilterBar only) kept the first build session focused on a single component and its data-flow lift. Phase 2 (label enhancements + color picker + DB migration + type changes) was the heaviest phase — in hindsight, the DB migration could have been a separate sub-phase to reduce the blast radius of the `string[]` → `Label[]` type change across fixtures.
- The code review gate after each phase (before git commit) is the single highest-value step in the workflow. Both rounds caught issues that would have been harder to diagnose post-merge.
- Phase 3 E2E was a lightweight phase — its only output was `card-labels.spec.ts`. A gap in the workflow: there is no step that actually executes the E2E tests against a running stack. The build agent writes and commits the spec, but validation against the live application is not part of any sub-agent's mandate. This is a known limitation.
- The `/banyan-uat` command would be the natural next step to exercise Phase 3 E2E tests against the live stack. The task context (status `BUILD_COMPLETE`) did not include a UAT run.

### Context File Effectiveness

**Files Loaded** (inferred from sub-agent behavior and task complexity):
- `memory-bank/tasks/TASK-013.md` — primary task context
- `memory-bank/techContext.md` — component structure, test commands
- `memory-bank/systemPatterns.md` — architecture patterns
- `memory-bank/productBrief.md` — persona context, NFRs
- `memory-bank/agent-rules/_learned/frontend-accessibility.md` — aria-label requirements
- `memory-bank/agent-rules/_learned/react-query-patterns.md` — optimistic update patterns
- `memory-bank/agent-rules/_learned/testing-patterns.md` — test fixture patterns

**Assessment**:
- **Helpful**: `frontend-accessibility.md` directly informed the `aria-label="Filter cards"` and per-swatch `aria-label` requirements. `testing-patterns.md`'s rule on pre-existing fixture mismatches guided the Phase 2 fix-in-place decision. The creative document's concrete CSS values and interaction specs were load-bearing — without them, the coding agent would have had to make layout decisions inline.
- **Gaps**: No context file covers the specific risk of E2E tests written but not executed during a build session. The build agent methodology does not distinguish between "spec written" and "spec verified against live stack" — these are treated as equivalent completion states. A rule or context note covering this distinction would prevent the current ambiguity.
- **Redundancy**: None observed. The two-tier system (command routing vs. context detail) worked cleanly for this task.

### Memory Bank Organization

**Assessment**:
- **Structure**: Clean. The `creative/TASK-013-card-labels-uiux.md` file was referenced throughout the build phases but was not found at the expected path during this reflection (the creative file path in git status shows `memory-bank/creative/TASK-013-activity-feed-architecture.md` and `TASK-013-activity-feed-uiux.md`, suggesting the actual TASK-013 label creative file may be under `.claude-worktrees/FEAT-010` rather than the main worktree). This is a worktree isolation artifact — creative files produced in the feature worktree are not visible from main until the PR merges.
- **Navigation**: The `tasks/TASK-013.md` Execution State section was comprehensive and accurate. Phase-by-phase step tracking made resumption straightforward.
- **Completeness**: The `learning-log.md` pattern for continuous learning is well-structured. The absence of task-indexed agent logs is the most significant gap — without `.agent-logs/claude/by-task/TASK-013/`, exact tool call counts and session durations cannot be derived for this reflection.

### Suggested Improvements to Claude Code System

**High Priority**:
1. **E2E test execution gate in Phase 3 (or any E2E phase)** — When a build phase produces only E2E spec files, the build agent should attempt to run them via a test runner sub-agent against the live stack (if reachable) rather than committing unverified specs. If the stack is not reachable, the phase should produce an explicit "E2E UNVERIFIED — requires live run" warning in the execution state. Currently there is no distinction between "spec committed" and "spec passing."

2. **Shared constant extraction reminder in code review** — The code reviewer agent caught logic bugs and perf issues in both phases, but did not flag the hardcoded `284px` ActivityFeed constant in `LabelColorPicker.tsx` as an implicit coupling risk. Adding a coupling-detection heuristic to the reviewer prompt (e.g., "flag numeric literals that appear in both CSS and TypeScript without a shared constant") would catch this class of maintainability issue.

**Medium Priority**:
3. **`position:fixed` popover as a project-level UI pattern** — The flip logic in `LabelColorPicker` (anchor rect → compute position → flip on right edge) is the second `position:fixed` popover in the project (after `CardColorPicker`). This pattern should be extracted to a shared `usePopoverPosition` hook and documented in `ux-patterns.md` so future popovers reuse it rather than re-implementing it. The `/banyan-build` coding agent prompt could reference `ux-patterns.md` to catch this earlier.

4. **Worktree creative file visibility** — Creative files produced in a feature worktree are invisible from the main worktree until the PR merges. The reflection agent (and any agent running from main) cannot read them. Either creative files should be committed to the main branch path during the creative phase, or the reflection prompt should explicitly note the worktree path for creative file lookups.

**Low Priority / Nice to Have**:
5. **Task-indexed agent log symlinks** — The `.agent-logs/claude/by-task/[task_id]/` directory was empty for TASK-013, making precise tool utilization metrics unavailable. If the `/banyan-init` upgrade path creates these symlinks automatically for all future tasks, reflection quality improves meaningfully.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

1. **ui-patterns** (`src/components/**/*.tsx`, `*.module.css`): When a `position:fixed` popover uses a hardcoded layout constant (e.g., sidebar width in pixels), extract that constant to a shared JS module and reference it from both the CSS variable definition and the TypeScript flip logic — do not inline the same number in two places.

2. **testing-patterns** (`e2e/**/*.spec.*`): When a build phase produces only E2E spec files and the live stack is not verified during the build session, add a `PLAYWRIGHT_UNVERIFIED` note to the task execution state and treat it as an open checklist item for UAT — do not treat commit of an unrun spec as equivalent to a passing test.

3. **react-query-patterns** (`src/api/hooks.ts`, `src/components/**/*.tsx`): Wire `onMutate` snapshot and `onError` restore in every optimistic mutation — even single-field patches — before the feature is considered production-ready; deferred rollback wiring is the most common form of silent reliability debt in TanStack Query integrations.

4. **data-migration** (`backend/migrations/*.js`): Always include a reversible `down()` in schema-change migrations even when rollback loses data (e.g., `jsonb → text[]` drops color); the presence of a `down()` is more valuable than its semantic completeness because it preserves the ability to revert the migration runner state.

### Learned Rules Applied

- `frontend-accessibility.md`: Directly applied — `aria-label="Filter cards"` on input and `aria-label="Clear filter"` on × button satisfy the explicit WCAG rule; per-swatch `aria-label` on `LabelColorPicker` swatches satisfies the "not color alone" requirement.
- `react-query-patterns.md`: Partially applied — the single-key optimistic update snapshot/restore pattern was *referenced* in the creative phase decision to use `onMutate`/`onError`, but the rollback path was not fully wired in Phase 2 (noted as technical debt above). Rule was loaded and cited, but only partially implemented.
- `testing-patterns.md`: Applied — the "fix pre-existing fixture type mismatches in same phase" rule was followed when `string[]` fixtures were updated to `Label[]` in Phase 2 alongside the new type tests.

### For Claude Code Workflow

1. **E2E phases need a live-stack execution step** — Phases whose only deliverable is a Playwright spec file should include an explicit "run spec against live stack" sub-step, not just a "write and commit spec" step. The current workflow treats spec authorship as completion, which masks unverified E2E coverage.

2. **Code reviewer should flag cross-file constant duplication** — The reviewer caught logic bugs and performance issues effectively, but did not catch the `284px` coupling between CSS and TypeScript. A heuristic for "magic numbers appearing in both TypeScript and CSS without a shared definition" would make the reviewer more useful for maintainability review beyond correctness.

3. **Creative files should be accessible from the main worktree during reflection** — The reflection agent (running from main) could not read the creative document for TASK-013 because it lives in the feature worktree. Either the `/banyan-creative` command should write a symlink or copy to `memory-bank/creative/` in main, or the reflection prompt should include the worktree path for creative file lookups.

---

## Conclusion

TASK-013 delivered all 16 acceptance criteria across three sub-features in a single build day, with a 213-test suite and clean TypeScript/lint gates. The Level 3 workflow — creative phase followed by three focused build phases, each with a code review gate — worked well and should be the template for similar multi-sub-feature tasks. The creative phase's concrete output (specific CSS values, interaction semantics, component boundaries) was the single biggest enabler of fast, confident coding.

The primary outstanding risk is the Phase 3 Playwright E2E tests being committed but not verified against the live stack. This should be resolved either by running `/banyan-uat` before archiving or by spinning up Docker Compose and running `card-labels.spec.ts` directly. The secondary technical debt items — optimistic rollback wiring and the `284px` constant coupling — are small and well-understood.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Highly Effective

**Recommendation**: Run E2E tests against live stack (or `/banyan-uat`) before archiving. Then ready to archive.
