# TASK-005: Add CORS configuration

**Complexity**: Level 1
**Status**: INITIALIZED
**Roadmap**: N/A
**Branch**: task/005-add-cors-configuration
**Worktree**: N/A (Level 1 uses direct branch, not worktree)

## Task Description

Add CORS middleware to the Express app. Configure allowed origins, methods, and headers via environment variables following 12-factor app principles. No hardcoded values.

## Implementation Notes

- Use the `cors` npm package (industry standard, well-tested)
- Mount in `src/app.ts` early in the middleware chain (before routes, after body-parser)
- Configuration via environment variables:
  - `CORS_ORIGINS` — comma-separated list of allowed origins (e.g. `http://localhost:5173,https://app.example.com`). Empty/unset = deny all cross-origin requests (safe default)
  - `CORS_METHODS` — comma-separated HTTP methods, defaults to `GET,POST,PUT,PATCH,DELETE,OPTIONS`
  - `CORS_HEADERS` — comma-separated allowed request headers, defaults to `Content-Type,Authorization`
- Wildcard `*` origin should be opt-in via `CORS_ORIGINS=*`, never the default
- Tests: unit-test the CORS config factory with mocked env vars
- Check if `cors` is already in package.json before installing

---

## Execution State

**Build Status**: RUNNING
**Current Build**: Single phase — CORS Configuration (TASK-005)
**Build Started**: 2026-06-16
**Phase Number**: 1 of 1
**Is Multi-Phase**: NO

### Current Build Step
**Step**: Step 11 — Git Commit
**Status**: RUNNING
**Started**: 2026-06-16

### Completed Steps
- Step 0 Parse Task ID: COMPLETE
- Step 0.1 Interrupted Build Check: COMPLETE — new build
- Step 0.5 Git Setup: COMPLETE — on task/005-add-cors-configuration
- Step 0.6 Phase Gate: COMPLETE — Level 1, no creative phases required
- Step 1 Read Task Context: COMPLETE — single phase; cors not installed; branch cut from master pre-TASK-004-merge
- Step 2 Load Context: COMPLETE — Level 1 rules loaded
- Step 3 Test Writer: COMPLETE — 9 tests in cors.test.ts
- Step 4 Coding Agent: COMPLETE — cors.ts, requestLogger.ts (backfill from TASK-004), app.ts updated
- Step 6 Test Execution: COMPLETE — 45/45 passing (7 integration skipped)
- Step 7 Integration Verification: COMPLETE — tsc clean, all tests green
- Step 8 Code Review: COMPLETE — APPROVED; pre-existing audit vulns deferred

### Resumption Notes
**Can Resume**: NO
