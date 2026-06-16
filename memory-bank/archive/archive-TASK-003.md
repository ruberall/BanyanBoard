# Archive: TASK-003 — Input Validation Middleware

## Metadata

- **Task ID**: TASK-003
- **Complexity**: Level 1
- **Branch**: task/003-input-validation-middleware
- **Completed**: 2026-06-16

---

## Summary

Added two layers of input validation to the Express backend:

1. **Malformed JSON** — `errorHandler` now catches the `SyntaxError` that `body-parser` throws when it cannot parse a request body, returning 400 `{ error: "BAD_REQUEST", message: "Malformed JSON in request body" }` instead of a 500.

2. **Required fields** — New `requireFields(...fields)` middleware factory in `src/middleware/validate.ts` that checks `req.body` for declared field presence and calls `next(new ValidationError("Missing required field: <name>"))` on the first missing field. Applied to `POST /boards` as `requireFields('name')`.

---

## Solution

- `src/middleware/validate.ts` (new): `requireFields` factory — presence check only; value/trimming validation stays in the service layer
- `src/middleware/errorHandler.ts` (modified): `SyntaxError && 'body' in err` branch added before the generic 500 fallback
- `src/routes/boards.ts` (modified): `requireFields('name')` wired as first middleware on `POST /`

---

## Files Changed

- `backend/src/middleware/validate.ts` — new
- `backend/src/middleware/__tests__/validate.test.ts` — new (6 tests)
- `backend/src/middleware/errorHandler.ts` — SyntaxError branch
- `backend/src/middleware/__tests__/errorHandler.test.ts` — new (4 tests)
- `backend/src/routes/boards.ts` — requireFields wired on POST /

---

## Test Results

- 10 new tests; 36/36 total passing
- tsc: clean

---

## Notes

The `requireFields` middleware is intentionally a presence-only guard (checks `field in body`). Empty string passes through to the service layer, which trims and validates the value. This separation keeps validation concerns at the right layer: structural presence at the middleware boundary, semantic validity in the service.
