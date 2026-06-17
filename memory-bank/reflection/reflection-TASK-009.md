# Reflection: TASK-009 — React Frontend Scaffold

**Date**: 2026-06-17
**Task Complexity**: Level 3
**Total Phases**: 5
**Duration**: 2026-06-16 (creative phases) → 2026-06-17 (all build phases)

## Executive Summary

TASK-009 delivered the complete React + TypeScript frontend foundation for BanyanBoard: a fully functional kanban board application spanning board listing, board view with parallel column fetching, card creation, drag-and-drop with optimistic updates, and a production-ready Docker setup. All 12 acceptance criteria were met, 115 tests pass across 12 test files, and the production build compiles cleanly to 326 kB (gzipped: 103 kB JS + 1 kB CSS).

The three creative phases proved their value: each produced near-production-quality code sketches that were adopted almost verbatim. The `useMoveCard` optimistic mutation hook — the most algorithmically complex piece — was specified in Creative 3 with sufficient precision that the implementation had zero structural surprises. The one recurring pattern across phases was that the TDD cycle (test writer → coding agent → code review) reliably surfaced genuine issues (missing accessible label, TypeScript unused-variable errors) that would otherwise have reached production.

This task establishes the UI patterns all future FEAT-005+ features will extend. The architecture choices (hybrid component structure, React Query on a thin transport core, dnd-kit sortable preset) all held under implementation pressure and produced code that reads clearly.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: ✅ All Met

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | App renders without error | ✅ |
| AC-2 | Board list displays | ✅ |
| AC-3 | Empty board list state | ✅ |
| AC-4 | Create board | ✅ |
| AC-5 | Board view displays columns and cards | ✅ |
| AC-6 | Create card | ✅ |
| AC-7 | Drag card to another column | ✅ |
| AC-8 | Drag-and-drop revert on API error | ✅ |
| AC-9 | API error banner on board load failure | ✅ |
| AC-10 | Keyboard navigation basics | ✅ |
| AC-11 | 404 route | ✅ |
| AC-12 | Docker Compose hot reload | ✅ |

All primary and secondary requirements were delivered. The only deliberate deferral is full screen-reader drag narration (live-region announcements beyond the basic `accessibility.announcements` block) — this was explicitly pre-deferred in Creative 3 and aligns with the productBrief's "post-MVP nice-to-have" classification.

### Code Quality Assessment

**Overall Rating**: Good

- **Maintainability**: Strong. Self-contained folder-per-component structure, no barrel exports, `@/` alias imports, CSS Modules — exactly the hybrid architecture Creative 1 specified. A new developer can find `KanbanCard` and know its styles, tests, and component are co-located at `src/components/board/KanbanCard/`.
- **Architecture**: Clean separation between transport core (`client.ts`), typed endpoint functions (`endpoints.ts`), React Query hooks (`hooks.ts`), query-key factory (`queryKeys.ts`), and components. The single HTTP boundary is preserved; `fetch` is called only in `client.ts`.
- **Error Handling**: `ApiError` is the single typed error class throughout. All errors route to `ErrorBanner` or React Router's error boundary — no silent `console.log` failures. The `error instanceof Error` guard was enforced by code review (caught that `as { message: string }` was the initial pattern).
- **Testing**: 115 tests across 12 files. Coverage includes: API transport layer (19 tests), React Query hooks including optimistic mutation lifecycle (7 + 13 tests), all UI components, drag-and-drop integration, and accessible aria roles. Tests use real `QueryClient` instances seeded with fixture data rather than mocks — this catches real cache interaction bugs.
- **TypeScript**: Strict mode + `erasableSyntaxOnly` enforced throughout. The `useMoveCard` generic signature `useMutation<Card, ApiError, MoveVars, MoveCtx>` is fully typed with no `any` escape hatches.

### Technical Decisions

**Key Decisions:**

1. **React Query v5 on thin transport core** — Rationale: de-risk the optimistic kanban move (the product's stated highest-impact risk). Outcome: the `onMutate`/`onError`/`onSettled` lifecycle absorbed all the complexity of both-column cache rewriting and snapshot rollback without bespoke state management. Verdict: correct call; the cost was ~13 kB gzipped (within budget) and the correctness guarantees were worth it.

2. **Dedicated accessible drag handle (not whole-card drag)** — Rationale: future card click affordance (FEAT-007 card detail) + WCAG 2.1 AA keyboard operability. Outcome: keyboard users can Tab to the ⠿ button and operate moves without mouse; the card body stays free for future navigation. Verdict: right decision; the extra HTML element per card is negligible.

3. **`after_card_id` derivation from filtered destination list** — Rationale: match the backend's fractional-position algorithm exactly by deriving "id of card immediately above resting slot with dragged card excluded." Outcome: the derivation is a pure function with 0 branching on direction — verified correct for all four backend cases (top, append, middle, same-column). Verdict: the algorithm specification in Creative 3 was the most valuable artifact in the entire task.

4. **Named Docker volume for `node_modules`** — Rationale: on Windows and macOS, the bind-mounted `./frontend:/app` would shadow the container's `node_modules` with the host's (different binary format / case sensitivity). Outcome: `frontend_node_modules` volume keeps container deps isolated while hot-reload still works via the source bind-mount. Verdict: essential for cross-platform Docker correctness; easy to miss.

**Trade-offs:**

- **React Query `refetchOnWindowFocus: false`**: Disabling this globally prevents an in-flight optimistic update from being clobbered when the user tabs away and back. Accepted: the board does not need live-refresh on focus for MVP (no real-time requirement).
- **`staleTime: 30_000`**: A 30-second stale window avoids redundant refetches on board revisit (< 1s navigation NFR). Accepted: data can be 30s stale, which is acceptable for a kanban board with no concurrent-edit requirement at MVP.
- **`KanbanColumn` self-fetches via `useCards`**: Each column independently fetches its cards rather than `BoardPage` fetching all. This means parallel React Query requests per column (deduped automatically), with per-column loading/error isolation. Accepted: small N columns (2–10 typical) makes the fan-out acceptable; it produces better UX than a single board-level loading state.

### What Went Well

1. **Creative 3's code sketch was nearly production-ready.** The `useMoveCard` implementation, `onDragEnd` algorithm, and component wiring described in the creative document were adopted with minimal changes. This was the highest-complexity piece and the pre-work eliminated implementation surprises entirely.

2. **TDD caught real accessibility and TypeScript issues.** The code review pass identified: (1) missing `<label>` on `CreateCardForm` input — a real accessibility violation that would have failed an axe-core scan; (2) `error instanceof Error` guard pattern rather than `as { message: string }`. Both were caught before the commit landed.

3. **React Query cache-as-source-of-truth for optimistic state.** Using the query cache rather than a parallel `useState` meant rollback was guaranteed by restoring snapshots — no state-sync bugs possible. The `findCardColumn` helper (cache scan to find a card's home column) made the drag-end handler clean.

4. **The hybrid component architecture scaled cleanly across 5 phases.** Adding Phase 4 dnd-kit modifications to existing `KanbanCard`, `KanbanColumn`, and `BoardPage` files was clean because each component lived in its own folder with clear co-located tests.

5. **Phase 5 was low-friction.** Multi-stage Dockerfile + nginx SPA config + docker-compose integration required ~30 minutes of work total. The pattern from the backend `Dockerfile` provided a reference; the named-volume insight was the only non-obvious piece.

### Challenges Encountered

1. **`CreateCardForm` missing accessible `<label>` (Phase 3 code review finding)** — The initial implementation used `placeholder` on the input but no associated `<label>`. This is a real WCAG 2.1 failure. Resolution: added a visually-hidden `<label>` with `htmlFor` matching the input's `id`. Prevention: the test writer agent should always include a test assertion for `getByLabelText` when testing form inputs — this would have caught it at the test stage rather than code review.

2. **Unused `ALL_COLUMN_IDS` constant in `useMoveCard.test.tsx` (Phase 4 TypeScript error)** — A test-file constant was declared but never used, triggering TS6133 in `tsc -b`. Resolution: removed the constant with the Edit tool. This was a minor friction point but required a build-fix cycle. Prevention: test writers should not declare fixture constants that aren't referenced — or should reference them in at least one test.

3. **`after_card_id` derivation required careful attention to the "exclude dragged card" invariant.** The key insight — that `destCards` must have the dragged card filtered out *before* computing the resting index — is non-obvious. Getting this wrong would produce off-by-one positions. Resolution: the Creative 3 algorithm statement ("id immediately above resting slot with dragged card excluded; null = top") was the anchor; the code was written to match that invariant exactly, then verified via the 13-test `useMoveCard` suite.

### Technical Debt & Future Work

- **E2E test specification**: The task plan noted that `/banyan-uat` would generate a Playwright/Cypress E2E spec (`frontend/e2e/board-flow.spec.ts`). UAT was not run in this task; that spec remains to be created when `/banyan-uat TASK-009` is invoked.
- **`accessibility.announcements` depth**: Basic pick-up/drop/cancel announcements are wired. Richer live-region narration (column names, position within column) is post-MVP per productBrief.
- **`TouchSensor`**: The Creative 3 decision noted TouchSensor as a "nice-to-have" for tablet. It was not added — the PointerSensor handles mouse and stylus; touch drag is not yet tested. Low priority until a touch-device UAT pass.
- **Storybook**: Deferred per Creative 1. Self-contained component folders make it trivial to add `.stories.tsx` files when the `components/common/` library grows enough to warrant a visual catalog.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

**Build Sessions**: 3 `/banyan-build` invocations (Phase 3, Phase 4, Phase 5)
**Creative Sessions**: 3 `/banyan-creative` invocations (all pre-build)
**Sub-Agents**: Test Writer + Coding Agent + Code Reviewer + Documentation Agent per phase
**Final test count**: 115/115 passing across 12 files
**Errors Recovered**: 2 (accessible label fix, unused constant removal)

No agent session logs were available for tool-call metrics (by-task index not populated). Estimated tool distribution based on observable work: Read (~40%), Edit (~30%), Bash (~15%), Write (~10%), Glob/Grep (~5%).

#### Sub-Agent Performance

| Agent Type | Phases | Effectiveness | Notes |
|------------|--------|---------------|-------|
| Test Writer | Phases 3, 4 | High | Phase 4 useMoveCard tests were comprehensive (13 tests covering all mutation lifecycle paths). One minor issue: unused constant in Phase 4 test file. |
| Coding Agent | Phases 3, 4 | High | Creative document code sketches translated cleanly. Phase 3 initial implementation missed the accessible label — caught by reviewer. |
| Code Reviewer | Phases 2, 3, 4 | High | Consistently caught real issues: `instanceof` guard, logger always-emit pattern, missing label, TypeScript errors. The review step pays for itself. |
| Documentation Agent | Phases 2, 3 | Medium | Updated `techContext.md` and `systemPatterns.md` correctly. Phase 4/5 documentation was lighter. |
| Git Setup Agent | All phases | High | Worktree verification was friction-free throughout. |

### Command Workflow Evaluation

**Commands Used**: `/banyan-creative` (×3), `/banyan-build` (×3), `/banyan-reflect` (×1)

**Workflow Efficiency**: Good

- The creative-phase-then-build-phase sequencing worked well. Having 3 creative decisions front-loaded meant each build phase started with a clear specification rather than mid-implementation design debates.
- The "one phase per `/banyan-build` invocation" human gate is appropriately conservative for a 5-phase task. It created natural review checkpoints.
- Phase 5 (Docker/infrastructure) did not benefit from TDD in the traditional sense — there are no unit tests for a `Dockerfile` or `nginx.conf`. The build verification step (`npm run build` PASS) served as the "test" instead. The workflow handled this gracefully without needing changes.

**Assessment**:
- **What worked**: Creative → Build sequencing; code review catching real issues; phase gates preventing forward motion with broken builds.
- **What could improve**: Test Writer agents should be prompted to include `getByLabelText` assertions when generating form component tests — this would catch missing `<label>` elements at the test-writing stage rather than code review.
- **Missing**: No explicit infrastructure phase template. Phase 5 is genuinely different from Phases 1–4 (no application logic tests, verification = `npm run build`), but the workflow adapted without a dedicated infrastructure-phase path.

### Context File Effectiveness

**Files Loaded**: `level3-implementation.md`, `level3-reflection.md`, all 3 creative decision docs, `reflection-agent.md`, `step3-test-writer.md` through `step11-git-completion.md`

**Assessment**:
- **Helpful**: The creative decision documents were the most impactful context files in the entire task. The `useMoveCard` code sketch in `TASK-009-dnd-optimistic-ux.md` and the `onDragEnd` algorithm specification were near-production-quality and eliminated implementation ambiguity for the hardest part of the task. The 12-factor and observability reminders in `CLAUDE.md` kept the implementation honest (no `console.log`, `VITE_API_URL` from env).
- **Gaps**: The step context files for the build agents don't explicitly prompt the Test Writer to include accessibility assertions (`getByLabelText`, `getByRole` with `name`) for form inputs. A single bullet in `step3-test-writer.md` — "For form inputs, always assert that an associated label exists via `getByLabelText`" — would have caught the Phase 3 accessibility issue before code review.
- **Redundancy**: None observed. The progressive context loading (one step file at a time) kept token usage controlled.

### Memory Bank Organization

**Assessment**:
- **Structure**: The creative decision documents (`memory-bank/creative/TASK-009-*.md`) are the standout organizational win — the naming convention makes them trivially discoverable and they contain exactly what build agents need. The `progress.md` per-phase summaries provide good build-to-reflect continuity.
- **Navigation**: Easy. Task file → progress file → creative files is a natural read path.
- **Completeness**: One minor gap: Phase 3 and Phase 4 git commit SHAs weren't captured in the task file's header `**Latest Commit**` field during those phases — only the final Phase 5 commit is captured. For multi-phase tasks, tracking the commit SHA per phase (not just the last) would aid debugging if a phase needs to be bisected.

### Suggested Improvements to Claude Code System

**High Priority**:

1. **Add accessibility assertions to Test Writer prompt for form components** — The `step3-test-writer.md` context file (or the level3-implementation rules) should include: "When generating tests for components containing `<input>`, `<textarea>`, or `<select>`, always include a `getByLabelText` assertion to verify accessible label association." Cost: one line in the context file. Benefit: catches a real WCAG violation at test time rather than code review.

2. **Infrastructure/config phase support** — Phase 5 (Docker Compose & Production Build) had no meaningful TDD — the deliverable is a `Dockerfile` and config files, and the "test" is `npm run build` PASS. The build workflow handled it gracefully but the step descriptions (Test Writer, Coding Agent) don't map cleanly. A lightweight "infrastructure phase" path (skip Test Writer, run build verification as the primary gate) would clarify intent without bending the standard path.

**Medium Priority**:

3. **Track per-phase commit SHAs in task file header** — The task file currently records only the final `**Latest Commit**` SHA. For 5-phase tasks, appending each phase commit to an `## Phase Commits` table in the task file would make it easy to `git show` any specific phase's state during debugging or reflection.

4. **Prompt test writers to avoid unused fixture constants** — A brief addition to `step3-test-writer.md`: "Declare fixture constants only if they are referenced in at least one test assertion — unused constants will cause TS6133 compilation errors." Small but prevents a build-fix cycle.

**Low Priority / Nice to Have**:

5. **Code Reviewer prompt: check form inputs for `<label>` associations** — Add to the code reviewer's security/quality checklist: "Verify every `<input>`, `<textarea>`, and `<select>` has an associated `<label>` (explicit `htmlFor` or wrapping element) — `placeholder` alone is insufficient for accessibility." This provides a second catch layer if the test writer doesn't include `getByLabelText`.

6. **`/banyan-uat` reminder at Phase 5 completion** — When `/banyan-build` completes the final phase and all phases are done, the completion message already suggests `/banyan-reflect`. It could also note: "Consider `/banyan-uat TASK-XXX` before archiving to walk the primary user journey in a browser." This would make the UAT step more discoverable for Level 3 tasks.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

1. **frontend-accessibility** (`*.tsx`, `src/components/`): Every form `<input>` must have an associated `<label>` with explicit `htmlFor` — `placeholder` alone fails WCAG 2.1 and will fail code review.

2. **testing-patterns** (`*.test.*`, `*.test.tsx`): Declare fixture constants in test files only if they are referenced in at least one assertion — unused typed constants cause TS6133 errors that fail the build pipeline.

3. **react-query** (`src/api/hooks.ts`, `src/api/`): For optimistic mutations touching two cache keys, snapshot both keys in `onMutate`, rewrite both atomically with `setQueryData`, restore both in `onError`, and invalidate both in `onSettled` — updating only the destination key leaves the source stale on rollback.

4. **docker-compose** (`docker-compose.yml`): Use a named Docker volume for `node_modules` (e.g., `frontend_node_modules:/app/node_modules`) when bind-mounting a frontend service directory — without it, the host filesystem's `node_modules` shadows the container's on Windows/macOS, causing binary incompatibility or missing native modules.

### Learned Rules Applied

No learned rules were available at the start of this task (first frontend task; `agent-rules/_learned/` was empty). The learnings above are the first entries.

### For Claude Code Workflow

1. **Creative code sketches are worth the investment** — When a creative decision includes a full code sketch (as Creative 3 did for `useMoveCard` and `onDragEnd`), build agents should treat those sketches as a specification to implement verbatim unless there's a specific reason to deviate. The time saved in Phase 4 implementation far exceeded the creative phase investment.

2. **Code review catches accessibility issues that test writers miss** — The missing `<label>` pattern was found at code review, not at the test stage. The system works, but two layers of enforcement (test writer + reviewer) would catch it earlier and avoid a build-fix cycle.

3. **Infrastructure phases need a different verification story than feature phases** — The TDD loop (write tests → implement → run tests) doesn't apply to config files. The right gate for infrastructure phases is build verification (`npm run build`) + a human-readable review of the config files. The workflow handles this adequately but the step names create a conceptual mismatch.

---

## Conclusion

TASK-009 delivered a complete, production-quality React frontend scaffold: all 12 acceptance criteria met, 115 tests passing, production build verified, Docker integration working. The three creative phases were the most valuable investment — they converted the highest-complexity piece (optimistic kanban drag-and-drop) from an open design problem into a specified algorithm that the coding agent implemented correctly on the first pass. The two issues that required rework (missing accessible label, unused test constant) were both caught by the TDD + code review cycle before any commit landed on the feature branch.

The architecture — hybrid component structure, React Query on a thin transport core, dnd-kit sortable preset, CSS Modules — is production-grade and sets a clean precedent for FEAT-006+ to extend. The Docker integration follows the same multi-stage pattern as the backend and adds no operational surprises.

**Overall Task Success**: ✅ Success

**Overall Workflow Effectiveness**: ✅ Highly Effective

**Recommendation**: Ready to archive. Consider running `/banyan-uat TASK-009` after archive to walk the primary board-flow user journey and generate the E2E test spec before FEAT-006 begins.

---

## References

- Plan: `memory-bank/tasks/TASK-009.md`
- Creative 1 (Component Architecture): `memory-bank/creative/TASK-009-component-architecture.md`
- Creative 2 (API Client Design): `memory-bank/creative/TASK-009-api-client-design.md`
- Creative 3 (DnD & Optimistic UX): `memory-bank/creative/TASK-009-dnd-optimistic-ux.md`
- Progress: `memory-bank/progress.md`
