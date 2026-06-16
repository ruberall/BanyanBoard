# Archive: TASK-004 — Add Request Logging Middleware

**Task ID**: TASK-004
**Complexity**: Level 1
**Status**: COMPLETE
**Branch**: task/004-add-request-logging-middleware
**Completed**: 2026-06-16
**Commit**: ccf7e8d

---

## Summary

Extracted HTTP request logging into a dedicated `src/middleware/requestLogger.ts` module. The functionality already existed via `pino-http` in `logger.ts`; this task reorganised it for consistency with the middleware co-location pattern, removed the mixed concern from `logger.ts`, and added unit test coverage.

---

## What Was Built

### `backend/src/middleware/requestLogger.ts` (new)

```typescript
export function createRequestLogger(logger?: Logger) {
  const log = logger ?? createLogger();
  return pinoHttp({ logger: log });
}
```

- Wraps pino-http; accepts optional pino `Logger` for testability (tests pass a captured-stream logger)
- Falls back to the module-level singleton when called with no args (used in `app.ts`) — avoids passing stub loggers from tests into pino-http's strict validation

### `backend/src/logger.ts` (modified)

- Removed `createHttpLogger()` export and `pino-http` import — concern now lives in the middleware layer

### `backend/src/app.ts` (modified)

- Import updated from `createHttpLogger` → `createRequestLogger`
- Calls `createRequestLogger()` (no args) — uses pino singleton, compatible with test stub loggers
- Removed unused `const { logger: _logger } = deps` destructure

---

## Tests

**File**: `backend/src/middleware/__tests__/requestLogger.test.ts`
**Count**: 5 tests, all passing

| Test | Result |
|------|--------|
| returns a middleware function | ✅ |
| passes requests through to the next handler | ✅ |
| logs method, path, status code, and responseTime | ✅ |
| captures non-2xx status codes accurately | ✅ |
| logs 404 for routes not matched by any handler | ✅ |

**Full suite**: 41/41 passing (7 integration skipped — no DATABASE_URL, expected)

---

## Key Decision

Passing `deps.logger` (a jest stub in tests) to `pinoHttp({ logger })` caused a runtime crash — pino-http validates its logger arg has `levels.values`. Fixed by calling `createRequestLogger()` with no args in `app.ts`, using the always-real module-level pino singleton. The optional logger param remains available for tests that need captured output.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/middleware/requestLogger.ts` | Created |
| `backend/src/middleware/__tests__/requestLogger.test.ts` | Created |
| `backend/src/logger.ts` | Removed createHttpLogger + pino-http import |
| `backend/src/app.ts` | Updated import, removed unused destructure |
| `memory-bank/tasks/TASK-004.md` | Created |
| `memory-bank/tasks.md` | Updated registry |
| `memory-bank/progress.md` | Updated |
