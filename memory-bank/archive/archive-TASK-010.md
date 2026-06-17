# Archive: TASK-010 — E2E Test Suite for Board Flow

## Metadata
- **Task ID**: TASK-010
- **Feature**: FEAT-008
- **Complexity**: Level 2
- **Completed**: 2026-06-17
- **Branch**: feature/FEAT-008-e2e-test-suite-board-flow
- **Reflection**: memory-bank/reflection/reflection-TASK-010.md

## Summary

Implemented a 9-test Playwright E2E suite for BanyanBoard's board flow, translating the UAT-validated spec (`memory-bank/uat/spec-TASK-009-e2e.md`) into runnable tests. All 9 tests passed on the first run (15.4s). The suite covers the full happy path, 4 negative paths, keyboard DnD with persistence, and both error page scenarios.

## Implementation Phases

### Phase 1: Playwright Setup
- Installed `@playwright/test` as devDependency
- Created `frontend/playwright.config.ts` — headless Chromium, `testDir: ./e2e`, `workers: 1`, `baseURL` from `BASE_URL` env
- Created `frontend/e2e/helpers/api.ts` — `createBoard()` / `deleteBoard()` REST helpers for test isolation
- Added `"test:e2e": "playwright test"` script to `frontend/package.json`

### Phase 2: Spec Files (9 tests)
- `frontend/e2e/board-list.spec.ts` — 3 tests: renders form, creates board + clears input, blank name no-op
- `frontend/e2e/board-page.spec.ts` — 4 tests: renders 3 columns, adds card, blank title validation, keyboard DnD + reload persist
- `frontend/e2e/error-pages.spec.ts` — 2 tests: unknown route → NotFoundPage, invalid UUID → ErrorBanner

## Files Changed

| File | Change |
|------|--------|
| `frontend/playwright.config.ts` | **Created** — Playwright configuration |
| `frontend/e2e/helpers/api.ts` | **Created** — REST fixture helpers |
| `frontend/e2e/board-list.spec.ts` | **Created** — 3 board list tests |
| `frontend/e2e/board-page.spec.ts` | **Created** — 4 board page tests |
| `frontend/e2e/error-pages.spec.ts` | **Created** — 2 error page tests |
| `frontend/package.json` | **Modified** — added `@playwright/test` devDep + `test:e2e` script |
| `frontend/package-lock.json` | **Modified** — lockfile update |

## Test Results

- **Total**: 9/9 passing
- **Duration**: 15.4s (all serial, `workers: 1`)
- **First-run pass rate**: 100% — no fix iterations needed

## Key Technical Decisions

1. **`workers: 1`** — Prevents isolation race conditions when tests share a live backend DB without per-worker namespacing.
2. **Scoped locators** — `section[aria-label="Column: To Do"]` scoping prevents false positives during card move transitions.
3. **TanStack Query retry wait** — Wait for `[role="status"]` disappear before asserting `[role="alert"]` on the invalid-UUID test (handles the 3-retry cycle, ~4-7s).

## Notes

- Run with `npm run test:e2e` from `frontend/`. Requires docker compose stack running (`docker compose up`).
- `BASE_URL` and `API_URL` env vars allow targeting any environment.
- Out of scope (follow-on tasks): mobile viewport tests, CI pipeline wiring, optimistic-revert test (needs `page.route()` mocking).
