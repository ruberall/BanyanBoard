# TASK-010: E2E Test Suite for Board Flow

**Complexity**: Level 2 (inherited from FEAT-008)
**Status**: PLANNING_COMPLETE
**Roadmap**: FEAT-008
**Branch**: feature/FEAT-008-e2e-test-suite-board-flow
**Worktree**: N/A

## Task Description

Implement runnable E2E tests for the BanyanBoard board flow using Playwright. The UAT run (task-009-20260617-001) produced a fully-specified test suite in `memory-bank/uat/spec-TASK-009-e2e.md` with confirmed selectors, wait conditions, and infrastructure notes. This task implements that spec as executable Playwright tests.

Covers:
- Happy path: create board → open → add card → keyboard-drag to another column → persist on reload
- Negative paths: blank board name (silent no-op), blank card title ("Title is required"), unknown route (404), invalid board UUID (ErrorBanner)
- Accessibility: keyboard DnD via Space/Arrow/Space; role="alert" and role="status" assertions

## Specification

**Feature Type**: NFR/Infrastructure (E2E test suite)
**Primary Persona**: Dev Team (engineers running CI)
**Creative Exploration Needed**: No — spec fully defined in `memory-bank/uat/spec-TASK-009-e2e.md`

### NFR Verification
- **Test method**: `npx playwright test` (or `npm run test:e2e` once script added to `frontend/package.json`)
- **Success metrics**: All specs pass green; no flaky tests; CI-compatible (headless)
- **Observable at**: Playwright HTML report (`playwright-report/`) + terminal output

### Acceptance Criteria

- **AC-E2E-1**: `playwright test` runs and all board-flow specs pass (0 failures)
- **AC-E2E-2**: Happy path spec covers the full create-board → add-card → keyboard-drag → reload-persist flow
- **AC-E2E-3**: Negative path specs cover all 4 rejection cases from the UAT spec
- **AC-E2E-4**: Tests are CI-compatible (headless Chromium, no manual browser required)
- **AC-E2E-5**: `afterEach` cleanup deletes test boards via API so tests are isolated and re-runnable

### Scope Boundaries

**In scope:**
- Playwright setup and `playwright.config.ts`
- 3 spec files: `board-list.spec.ts`, `board-page.spec.ts`, `error-pages.spec.ts`
- `npm run test:e2e` script in `frontend/package.json`
- Test utilities: API helper for board create/delete

**Out of scope:**
- Mobile viewport E2E (noted as infrastructure gap in UAT REC-2 — requires CDP device emulation, separate task)
- CI pipeline wiring (separate ops task)
- Error scenario specs requiring backend mocking (AC-ERROR-2 optimistic revert — deferred, needs MSW or Playwright route intercept)

## Test Strategy

### Approach
- **Emphasis**: E2E (this IS the test suite — no unit/integration tests in this task)
- **Target test count**: 9 tests across 3 spec files (matches UAT spec exactly)

### File Organization
- **New test files**:
  - `frontend/e2e/board-list.spec.ts` — 3 tests (render, create, blank-name no-op)
  - `frontend/e2e/board-page.spec.ts` — 4 tests (render columns, add card, blank title, keyboard drag + persist)
  - `frontend/e2e/error-pages.spec.ts` — 2 tests (unknown route, invalid UUID)
- **New config**: `frontend/playwright.config.ts`
- **New helper**: `frontend/e2e/helpers/api.ts` — board create/delete via REST

### What NOT to Test
- Unit-level component logic — covered by existing Vitest suite
- Backend API correctness — covered by backend tests
- Mobile layout — out of scope (UAT REC-2; requires separate task)
- Optimistic revert on move failure — requires route mocking, deferred

### Per-Phase Test Guidance
- Phase 1 (Setup): 0 new tests — config + helper only
- Phase 2 (Specs): 9 tests — all 3 spec files

## Implementation Roadmap

- [ ] Phase 1: Playwright setup (install, config, test script, API helper)
- [ ] Phase 2: Implement all 3 spec files from UAT spec

## Creative Phases

(none — Level 2, spec fully pre-defined)

---

## Execution State

**Build Status**: IDLE
**Current Phase**: INITIALIZED → BUILD
**Can Resume**: NO

### Active Sub-Agents
(none)

### Completed Steps
(none)
