# System Patterns

**Last updated**: 2026-06-17 (TASK-009 Phase 2 — Board List Page)

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

## Frontend API Client Pattern

### 3-Layer API Architecture
```
frontend/src/
├── types/index.ts              Domain types (Board, Column, Card, ApiError)
├── api/
│   ├── client.ts               request<T>() fetch transport with error handling
│   ├── endpoints.ts            10 typed endpoint functions (listBoards, getBoard, createCard, etc.)
│   └── queryKeys.ts            TanStack Query cache keys (boards.all, cards.byColumn, etc.)
└── (pages, components, hooks)  Consume endpoints via useQuery/useMutation
```

- **Types**: Domain types are defined in `src/types/index.ts` and imported by endpoints
- **Transport**: `request<T>()` is a generic fetch wrapper; handles JSON Content-Type, error responses, and 204 No Content
- **Endpoints**: Each endpoint function is a typed wrapper around `request<T>()`; no business logic
- **Cache Keys**: All TanStack Query cache keys centralized in `queryKeys.ts` using a factory pattern with hierarchical keys (`boards.all` → `boards.list()` → `boards.detail(id)`)

**Why this pattern:**
- **Separation of concerns**: Types → Transport → Endpoints keeps dependencies clear
- **Testability**: Each layer can be tested independently; endpoints are pure functions
- **Reusability**: `queryKeys` factory enables broad invalidation (`invalidateQueries({ queryKey: queryKeys.boards.all })`)
- **Type safety**: Generic `request<T>()` maintains end-to-end type safety from endpoint call to response

### TanStack Query Key Factory Pattern
```typescript
export const queryKeys = {
  boards: {
    all: ['boards'] as const,           // Root — enables broad invalidation
    list: () => [...queryKeys.boards.all, 'list'] as const,  // Nested
    detail: (id: string) => [...queryKeys.boards.all, id] as const,
  },
  cards: {
    all: ['cards'] as const,
    byColumn: (columnId: string) => ['cards', 'column', columnId] as const,
    detail: (id: string) => ['cards', id] as const,
  },
}
```

Benefits:
- **Hierarchical structure** — `queryKeys.boards.all` invalidates all board-related queries
- **Type-safe** — `as const` ensures keys are const arrays for TanStack Query
- **Centralized** — All cache keys live in one file; no scattered magic strings
- **Scalable** — Easy to add new domains (e.g., `users`, `comments`)

## Error Display Pattern (Frontend)

- `ApiError` is thrown by `request<T>()` in `api/client.ts` when the server returns a non-2xx status
- TanStack Query catches the thrown error and surfaces it as `query.error`
- Components read `error.message` for display; an `error instanceof Error` guard prevents unsafe casts
- `ErrorBanner` renders the message in a `role="alert"` element; it supports controlled (`onDismiss` prop) and uncontrolled (internal `dismissed` state) usage

## QueryClient Configuration Pattern

- Single `QueryClient` instance created **outside the React tree** in `main.tsx` — survives re-renders and is accessible via `useQueryClient()` anywhere in the tree
- Default query options: `staleTime: 30_000` (30 s), `refetchOnWindowFocus: false` (prevents optimistic-state clobber)
- Default mutation option: `retry: false` (surface errors immediately without silent retries)

## Vite + Vitest Configuration Split Pattern

**Problem**: Vite 8 + Vitest 3 have a version conflict (Vitest bundles an older Vite). Merging them in a single config file can cause import errors.

**Solution**: Split into two files:
- **`vite.config.ts`** — Build-only config (plugins, resolve aliases)
- **`vitest.config.ts`** — Test-only config (environment, setup files); uses `mergeConfig(viteConfig, defineConfig({ test: {...} }))`

This pattern allows each to use its own bundled dependency versions without conflicts. See `frontend/vitest.config.ts` for example.

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
