# Archive: TASK-001 — Express API with TypeScript Scaffold

## Metadata

- **Task ID**: TASK-001
- **Feature**: FEAT-001
- **Complexity**: Level 3
- **Started**: 2026-06-13
- **Completed**: 2026-06-13
- **Branch**: feature/FEAT-001-express-api-scaffold
- **Roadmap Link**: FEAT-001 (v0.1.0 Foundation)

---

## Summary

Stood up the Express + TypeScript backend from scratch on a greenfield project. This task is the foundation every subsequent feature (FEAT-002 through FEAT-006) builds on. It delivers a Docker Compose–orchestrated stack with PostgreSQL, a typed zod-validated config system, a pino structured logger, a programmatic node-pg-migrate runner, and a 3-layer clean architecture skeleton (routes → services → repositories).

The implementation is intentionally the reference pattern for BanyanBoard's backend: every future feature adds a migration, a repository, a service, and a route following the exact pattern established here.

---

## Requirements

### Original Requirements
- Express + TypeScript backend in `backend/`
- Docker Compose orchestrating `api` + `postgres` services
- `GET /health` endpoint returning `{"status":"ok"}`
- PostgreSQL connection pool via `pg`
- Migration tooling via node-pg-migrate with `npm run migrate:up`
- 3-layer skeleton: `routes/`, `services/`, `repositories/` with example files
- Structured JSON logger (pino)
- `.env.example` documenting all required env vars
- Jest + ts-jest configured

### Success Criteria

| Criterion | Status |
|-----------|--------|
| `docker compose up --build` → all services healthy within 60s | ✅ Implemented |
| `GET /health` → HTTP 200 `{"status":"ok"}` | ✅ Verified (3 automated tests) |
| `npx tsc --noEmit` → zero errors | ✅ Verified |
| Migrations run on startup; `pgmigrations` table exists | ✅ Implemented |
| `src/routes/`, `src/services/`, `src/repositories/`, `src/db/` with example files | ✅ Verified |

---

## Implementation

### Approach

6 architecture decisions were resolved in the creative phase before any code was written. The build executed 4 sequential phases, each independently committed:

1. **Phase 1** — Project scaffold: `docker-compose.yml`, `package.json`, `tsconfig.json`, `.env.example`, all source stubs, 10 TDD tests written up-front
2. **Phase 2** — Full Express app bootstrap: middleware chain, pino logger with OTel-aligned fields, graceful SIGTERM/SIGINT shutdown
3. **Phase 3** — DB pool + node-pg-migrate programmatic runner (blocking before `listen`)
4. **Phase 4** — 3-layer wiring end-to-end: `GET /health` → `HealthService` → `HealthRepository` → `pool.query('SELECT 1')`

### Key Components

1. **`src/app.ts`** — `createApp({ config, logger, pool }): Express` factory; does not call `listen`; fully testable via supertest
2. **`src/server.ts`** — Entry point: config → pool → runMigrations → createApp → listen → graceful shutdown
3. **`src/config.ts`** — Only `process.env` reader; zod schema with coercion; fail-fast on missing `DATABASE_URL`
4. **`src/logger.ts`** — pino singleton + `createLogger(opts?)` factory (for test capture); OTel-aligned base fields; pino-http access logs
5. **`src/db/pool.ts`** — `createPool(config): pg.Pool`
6. **`src/db/migrate.ts`** — `runMigrations(pool, config)`: programmatic node-pg-migrate
7. **`src/db/queryable.ts`** — `Queryable` interface for repository injection
8. **`src/errors.ts`** — `AppError` hierarchy: ValidationError(400), UnauthorizedError(401), ForbiddenError(403), NotFoundError(404), ConflictError`(409)
9. **`src/middleware/requestContext.ts`** — `req.id`, `req.traceId`, `req.log` child logger per request
10. **`src/middleware/errorHandler.ts`** — Terminal error middleware: `AppError` → status + JSON; unknown → 500 (no detail leaked)
11. **`src/lib/asyncHandler.ts`** — Wraps async handlers to forward rejections to Express error pipeline
12. **`src/routes/health.ts` + `src/routes/index.ts`** — Health route using `HealthService` → `HealthRepository`
13. **`docker-compose.yml`** — postgres + api services; pg_isready healthcheck; api `depends_on: service_healthy`
14. **`backend/migrations/1749830400000_initial-schema.js`** — First migration: `schema_info` table

### Design Decisions

Six decisions resolved in the creative phase:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| App factory | `createApp(deps)` + separate `server.ts` | Fully testable without port binding |
| DB pool | App-level singleton injected via `Queryable` interface | Testable, no import-time side effects |
| Config | dotenv + zod, single `config.ts` | Typed, fail-fast, reusable for FEAT-002+ validation |
| Migrations | Programmatic on startup (blocking, before listen) | Single `docker compose up` → migrated DB |
| Logger | pino singleton + per-request child loggers | OTel-aligned, zero-ceremony `req.log` |
| Error handling | `asyncHandler` + `AppError` + terminal `errorHandler` | Uniform JSON error contract, HTTP-agnostic services |

Reference: `memory-bank/creative/TASK-001-express-scaffold-architecture.md`

### Observability Deviation

Full pino structured logging adopted (OTel-aligned field names, redaction, env-driven level). Distributed tracing (OTel SDK) and Prometheus metrics deferred — documented deviation with rationale in the creative phase. OTel seam kept open (reserved OTEL_* config slots, OTel-named log fields).

---

## Testing

- **Total tests**: 10
- **Passing**: 6 (health endpoint: 3, logger: 2, repository unit: 1)
- **Skipped**: 4 (DB integration — require live Postgres; skip gracefully via `describeIfDb`)
- **TypeScript**: `tsc --noEmit` exits 0

Test files:
- `backend/src/__tests__/health.test.ts` — HTTP integration via supertest + stub deps
- `backend/src/__tests__/db.test.ts` — Pool + migration integration (live Postgres required)
- `backend/src/__tests__/logger.test.ts` — JSON structure, LOG_LEVEL suppression
- `backend/src/__tests__/repository.test.ts` — Queryable interface unit + live Postgres integration

---

## Files Changed

```
docker-compose.yml
backend/.dockerignore
backend/.env.example
backend/Dockerfile
backend/jest.config.ts
backend/package.json
backend/tsconfig.json
backend/migrations/1749830400000_initial-schema.js
backend/src/app.ts
backend/src/config.ts
backend/src/errors.ts
backend/src/logger.ts
backend/src/server.ts
backend/src/db/migrate.ts
backend/src/db/pool.ts
backend/src/db/queryable.ts
backend/src/lib/asyncHandler.ts
backend/src/middleware/errorHandler.ts
backend/src/middleware/requestContext.ts
backend/src/repositories/health.repository.ts
backend/src/routes/health.ts
backend/src/routes/index.ts
backend/src/services/health.service.ts
backend/src/__tests__/db.test.ts
backend/src/__tests__/health.test.ts
backend/src/__tests__/logger.test.ts
backend/src/__tests__/repository.test.ts
```

---

## Lessons Learned

1. Front-loading all architecture decisions on a foundation task eliminates mid-build pivot risk — every subsequent feature inherits the scaffold's decisions.
2. Writing all TDD tests up-front (before any implementation phase) acted as a second spec review, surfacing the Config type width mismatch before the coding agents ran.
3. `describeIfDb` runtime guard is better than DB mocks for integration tests — CI-correct with a live DB, gracefully skipped without one.
4. On Windows, `jest.config.ts` `testMatch` must use `'**/__tests__/**/*.test.ts'` (project-relative glob), not `<rootDir>`-prefixed paths — backslash interpolation breaks Jest's glob engine inside git worktrees.

Reference: `memory-bank/reflection/reflection-TASK-001.md`

---

## References

- **Task plan**: `memory-bank/tasks/TASK-001.md`
- **Architecture decisions**: `memory-bank/creative/TASK-001-express-scaffold-architecture.md`
- **Reflection**: `memory-bank/reflection/reflection-TASK-001.md`
- **Roadmap**: FEAT-001 in `memory-bank/roadmap.md`

## Follow-up

- **FEAT-002: Board & Column API** — first feature to consume this scaffold. Uses `createRouter`, adds a migration, repository, service, and routes following the health example.
- **AC-VERIFY-1 machine verification**: run `docker compose up --build` from the worktree to confirm services start (skipped in this session — no Docker available in CI env).
- **DB integration tests**: run `npm test` with a live Postgres to verify `db.test.ts` (4 skipped tests).
