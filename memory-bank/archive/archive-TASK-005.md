# Archive: TASK-005 — Add CORS Configuration

**Task ID**: TASK-005
**Complexity**: Level 1
**Status**: COMPLETE
**Branch**: task/005-add-cors-configuration
**Completed**: 2026-06-16
**Commit**: 6be5fe0

---

## Summary

Added CORS middleware to the Express app using the `cors` npm package. All allowed origins, methods, and headers are configurable via environment variables — no hardcoded values, consistent with the project's 12-factor app approach. Safe default: when `CORS_ORIGINS` is unset, all cross-origin requests are denied.

---

## What Was Built

### `backend/src/middleware/cors.ts` (new)

```typescript
export function corsMiddleware() {
  const rawOrigins = process.env.CORS_ORIGINS ?? '';
  const methods = process.env.CORS_METHODS ?? 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
  const allowedHeaders = process.env.CORS_HEADERS ?? 'Content-Type,Authorization';

  let origin: cors.CorsOptions['origin'];

  if (!rawOrigins) {
    origin = false;                          // deny all cross-origin (safe default)
  } else if (rawOrigins === '*') {
    origin = '*';                            // explicit wildcard opt-in
  } else {
    const allowList = rawOrigins.split(',').map((o) => o.trim());
    origin = (requestOrigin, callback) => {
      if (!requestOrigin || allowList.includes(requestOrigin)) {
        callback(null, requestOrigin ?? true);
      } else {
        callback(null, false);
      }
    };
  }

  return cors({ origin, methods, allowedHeaders });
}
```

### `backend/src/app.ts` (modified)

- `corsMiddleware()` mounted first — before `express.json()` and routes
- Also incorporated `createRequestLogger` from TASK-004 (branch was cut from master pre-merge)

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CORS_ORIGINS` | *(unset = deny all)* | Comma-separated allowed origins, or `*` for wildcard |
| `CORS_METHODS` | `GET,POST,PUT,PATCH,DELETE,OPTIONS` | Allowed HTTP methods |
| `CORS_HEADERS` | `Content-Type,Authorization` | Allowed request headers |

---

## Tests

**File**: `backend/src/middleware/__tests__/cors.test.ts`
**Count**: 9 tests, all passing

| Test | Result |
|------|--------|
| exports a factory function | ✅ |
| returns an Express middleware function | ✅ |
| blocks cross-origin requests when CORS_ORIGINS is not set (safe default) | ✅ |
| allows a configured origin and echoes it in response header | ✅ |
| allows multiple configured origins | ✅ |
| rejects an origin not in the allow-list | ✅ |
| allows wildcard origin when CORS_ORIGINS=* | ✅ |
| responds to preflight OPTIONS with 204 and allowed methods | ✅ |
| includes custom CORS_HEADERS in allowed headers | ✅ |

**Full suite**: 45/45 passing (7 integration skipped — no DATABASE_URL, expected)

---

## Dependency Audit

- `cors` 2.x: clean, no vulnerabilities
- `@types/cors`: dev dependency, no runtime impact
- 21 pre-existing vulnerabilities in `node-pg-migrate` (glob CLI command injection) and Jest/`ts-jest` tooling (js-yaml DoS) — neither introduced by this task; deferred to a dedicated security upgrade task

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/middleware/cors.ts` | Created |
| `backend/src/middleware/__tests__/cors.test.ts` | Created (9 tests) |
| `backend/src/middleware/requestLogger.ts` | Created (TASK-004 carry-forward) |
| `backend/src/app.ts` | Updated: corsMiddleware first, requestLogger replaces createHttpLogger |
| `backend/package.json` | Added `cors`, `@types/cors` |
| `backend/package-lock.json` | Updated |
| `memory-bank/tasks/TASK-005.md` | Created |
| `memory-bank/tasks.md` | Updated registry |
| `memory-bank/progress.md` | Updated |
