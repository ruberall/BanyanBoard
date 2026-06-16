# TASK-003: Add input validation middleware

**Complexity**: Level 1
**Status**: COMPLETE
**Archived**: memory-bank/archive/archive-TASK-003.md
**Completed**: 2026-06-16
**Roadmap**: N/A
**Branch**: task/003-input-validation-middleware
**Worktree**: N/A (Level 1 uses direct branch, not worktree)

## Task Description

Add input validation middleware to the Express backend:
1. Handle malformed JSON — catch `SyntaxError` thrown by `body-parser` and return 400 `{ error: "Bad Request", message: "Malformed JSON" }`
2. Validate required fields — Express middleware that rejects requests missing declared required body fields, returning 400 `{ error: "Validation Error", message: "Missing required field: <name>" }`

## Implementation Notes

- `src/middleware/validate.ts` (NEW): `requireFields(...fields)` factory — checks `req.body` for field presence, calls `next(new ValidationError('Missing required field: <name>'))` on first missing field
- `src/middleware/errorHandler.ts` (MODIFIED): added `SyntaxError && 'body' in err` branch → 400 `BAD_REQUEST` before the generic 500 fallback
- `src/routes/boards.ts` (MODIFIED): `requireFields('name')` applied as first middleware on `POST /`
- The service-layer `ValidationError` for empty/trimmed name remains — middleware is an earlier, cheaper guard for missing fields vs service handling blank/whitespace

## Completed

- [x] [Level 1] Input validation middleware (Completed: 2026-06-16)
  - Issue: Malformed JSON returned 500; missing required fields reached service layer before validation
  - Solution: `requireFields` middleware factory + SyntaxError branch in errorHandler
  - Files changed: `src/middleware/validate.ts` (new), `src/middleware/errorHandler.ts`, `src/routes/boards.ts`

---

## Execution State

**Build Status**: IDLE
**Current Phase**: COMPLETE
**Can Resume**: NO
**Build Started**: 2026-06-16
**Can Resume**: YES

### Active Sub-Agents
(none)

### Completed Steps
- Step 0.5 Git Setup: COMPLETE (2026-06-16) - branch task/003-input-validation-middleware created
- Step 1 Read Task Context: COMPLETE (2026-06-16) - single-phase Level 1
- Step 2 Load Context: COMPLETE (2026-06-16) - level1-implementation.md loaded
