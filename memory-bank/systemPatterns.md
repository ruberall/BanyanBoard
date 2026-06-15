# System Patterns

**Last updated**: 2026-06-15 (TASK-002 Phase 2 — Board & Column API)

## Architecture

### 3-Layer Clean Architecture
```
routes/ → services/ → repositories/ → db/pool.ts → PostgreSQL
```
- **Routes**: parse/validate HTTP request, call service, shape HTTP response. No business logic, no SQL.
- **Services**: business rules and orchestration. No HTTP, no SQL.
- **Repositories**: SQL via the pool. No business logic, no HTTP.
- Dependencies flow strictly inward — no layer reaches "up".

### App Factory Pattern
- `src/app.ts` exports `createApp({ config, logger, pool }): Express`
- `createApp` does NOT call `listen` — fully testable via supertest without port binding
- `src/server.ts` is the only entry point: builds deps (config → logger → pool → runMigrations → createApp → listen)
- FEAT-002+ routes: extend `createRouter(db)` in `src/routes/index.ts` and pass `db` to new routers

### Dependency Injection
- Single `pg.Pool` created in `server.ts`, injected as `Queryable` into repositories
- `Queryable` interface (`src/db/queryable.ts`): `query(text, values?)` — any object satisfying this works (Pool, PoolClient, or test mock)
- Logger: module-level singleton from `src/logger.ts`; per-request child via `req.log`

## Testing Patterns

### Framework
- **Jest + ts-jest** (`backend/jest.config.ts`)
- **supertest** for HTTP integration tests against `createApp()`
- **Real DB** for integration tests — no mocking the database (mock/prod divergence causes failures)

### File Organization
- Infrastructure/cross-cutting tests in `backend/src/__tests__/` (e.g., `health.test.ts`, `db.test.ts`, `logger.test.ts`)
- Domain tests co-located under `backend/src/[module]/__tests__/` (e.g., `repositories/__tests__/board.repository.test.ts`)
- One test file per concern; co-location is preferred for domain modules to keep tests close to the code they cover

### Test Structure
- Arrange / Act / Assert pattern
- One behavior per test (multiple assertions for same behavior are fine)
- DB integration tests: conditional `describe.skip` when `DATABASE_URL` is absent — graceful CI skip

### Test Examples (reference for FEAT-002+)

**HTTP integration test**:
```typescript
import request from 'supertest';
import { createApp } from '../app';
// inject stub pool: { query: jest.fn().mockResolvedValue({ rows: [...] }) }
// inject stub logger: { info/error/etc: () => {}, child: () => stubLogger }
const app = createApp({ config: stubConfig, logger: stubLogger, pool: stubPool });
const response = await request(app).get('/health');
expect(response.status).toBe(200);
```

**Repository unit test (mock Queryable)**:
```typescript
const mockDb = { query: jest.fn().mockResolvedValue({ rows: [...] }) };
const repo = new MyRepository(mockDb);
const result = await repo.myMethod();
expect(result).toEqual(expected);
```

**DB integration test (real Postgres)**:
```typescript
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
describeIfDb('MyRepo (integration)', () => {
  let pool: Pool;
  beforeAll(() => { pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool.end(); });
  it('does the thing', async () => { ... });
});
```

## Configuration

- **Single source**: `src/config.ts` is the ONLY file that reads `process.env`
- **Validation**: zod schema with coercion; fails fast at startup with clear error
- **Config type** `Config` (8 required fields): `PORT`, `NODE_ENV`, `DATABASE_URL`, `LOG_LEVEL`, `LOG_FORMAT`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_CONNECTION_TIMEOUT_MS`
- Extended optional fields: `MIGRATIONS_DIR`, `RUN_MIGRATIONS_ON_START`, `OTEL_SDK_DISABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- In tests: use stub config object, never import config module (it triggers dotenv + process.exit)

## Error Handling

- `asyncHandler(fn)` wraps async route handlers to forward rejections to `next(err)`
- `AppError` hierarchy in `src/errors.ts`: `ValidationError`(400), `UnauthorizedError`(401), `ForbiddenError`(403), `NotFoundError`(404), `ConflictError`(409)
- Terminal `errorHandler` middleware (last in `app.ts`): maps `AppError` to status + `{ error, message }` JSON; unknown to 500 with no detail leaked

## Logging

- **Library**: pino (+ pino-http for access logs, pino-pretty for dev console)
- **Singleton**: `src/logger.ts` exports `logger` (module-level) and `createLogger(opts?)` (for tests with custom destination)
- **Per-request**: `requestContext` middleware creates child logger with `{ requestId, traceId }` on `req.log`
- **Fields**: OTel-aligned — `service`, `version`, `environment` on base; `requestId`, `traceId` in request scope
- **NEVER** use `console.log` in production code (only allowed in config.ts startup validation and server.ts fatal error before logger is ready)

## Adding a New Feature (proven pattern — first used in FEAT-002 Board API)

1. Create migration in `backend/migrations/` (node-pg-migrate JS format)
2. Create repository in `src/repositories/` using `Queryable` interface
3. Create service in `src/services/` using repository type
4. Create route factory in `src/routes/` using `asyncHandler` + `AppError`; export as `createXyzRouter(db: Queryable)`
5. Mount router in `src/routes/index.ts` extending `createRouter(db: Queryable)`
6. Write tests: service unit tests (mock repo), route integration tests (mock pool via supertest)

### Domain Type Placement

Types for a domain (entity, aggregate, projection) are defined at the top of the repository file that owns them — **not** in a separate `models/` file. This keeps the type and the queries that produce it co-located and avoids an extra indirection layer for a small codebase.

Example: `Board`, `Column`, and `BoardWithColumns` interfaces are all exported from `board.repository.ts`.

Use a dedicated `models/` or `types/` file only if a type needs to be shared across multiple repositories without creating a circular dependency.
