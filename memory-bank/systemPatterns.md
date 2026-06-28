# System Patterns

**Last updated**: 2026-06-28 (TASK-017 Phase 4: added frontend WorkflowWarning mirror type contract, optimistic Done-color cross-slice cache pattern)

## Guiding Principles

These principles are enforced by the Code Reviewer Agent. Violations are **BLOCKING**.

| # | Principle | Rule |
|---|-----------|------|
| 1 | **3-Layer Architecture** | Routes → Services → Repositories only. No layer reaches "up". No SQL in services or routes. No HTTP in services or repositories. |
| 2 | **Dependency Injection** | All dependencies injected via constructor. No module-level singletons except logger. No `new Foo()` inside business logic. |
| 3 | **Config via `config.ts` Only** | `process.env` read in exactly one place: `src/config.ts`. All other files receive a typed `Config` object. No hardcoded URLs, ports, or secrets anywhere. |
| 4 | **No `console.log`** | All logging via pino. Use `req.log` in route handlers, module `logger` elsewhere. `console.error` permitted only in `server.ts` fatal startup error. |
| 5 | **Parameterized SQL Only** | `$1, $2, ...` placeholders everywhere. No string interpolation into SQL. |
| 6 | **`RETURNING` on INSERTs** | All INSERT statements return the created row directly. No separate SELECT after write. |
| 7 | **`asyncHandler` on Async Routes** | Every async route handler is wrapped in `asyncHandler()` to forward rejections to Express error middleware. |
| 8 | **`AppError` for Domain Errors** | Use `ValidationError`, `NotFoundError`, `UnauthorizedError`, etc. from `src/errors.ts`. Never throw plain `Error` from route or service layer. |
| 9 | **No Sensitive Data in Logs** | `email`, `password`, credential hashes, session tokens, and PII must never appear in log entries. |
| 10 | **Test Against Real Behaviour** | Repository tests use mock `Queryable`. Integration tests use a real DB (skip if `DATABASE_URL` absent). Never mock the full DB stack for integration tests. |
| 11 | **Domain Types at Repository Layer** | Entity types defined at the top of the repository file that owns them. No shared `models/` folder unless a type crosses repository boundaries. |
| 12 | **SSE / Streaming: Always Clean Up** | Long-lived connections (SSE, WebSocket) must register a `close` handler that cancels subscriptions, clears intervals, and releases resources to prevent memory leaks. |
| 13 | **Cursor Pagination** | All list endpoints use cursor, limit, hasMore. No offset pagination.

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
- Extended optional fields: `MIGRATIONS_DIR`, `RUN_MIGRATIONS_ON_START`, `OTEL_SDK_DISABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `SESSION_SECRET`, `SESSION_COOKIE_MAX_AGE_MS`, `SESSION_SECURE`
- In tests: use stub config object, never import config module (it triggers dotenv + process.exit)

## Error Handling

- `asyncHandler(fn)` wraps async route handlers to forward rejections to `next(err)`
- `AppError` hierarchy in `src/errors.ts`: `ValidationError`(400), `UnauthorizedError`(401), `ForbiddenError`(403), `NotFoundError`(404), `ConflictError`(409), `WorkflowError`(400)
- Terminal `errorHandler` middleware (last in `app.ts`): maps `AppError` to status + `{ error, message }` JSON; when the error carries a `details` array (duck-typed via `'details' in err`), serializes it into the response body; unknown to 500 with no detail leaked

### WorkflowError Pattern (TASK-017 Phase 1)

`WorkflowError` extends `AppError` for structured workflow rule failures:

```typescript
export class WorkflowError extends AppError {
  constructor(
    message: string,
    public readonly details: Array<{ field: string; error: string }> = [],
  ) {
    super(400, 'WORKFLOW_ACTION_FAILED', message);
  }
}
```

- **HTTP status**: 400
- **Error code**: `WORKFLOW_ACTION_FAILED`
- **Response shape**: `{ error: 'WORKFLOW_ACTION_FAILED', message: string, details: [{ field, error }] }`
- **Details field**: each entry identifies which field triggered the failure and the underlying error message
- **Serialization**: `errorHandler` detects `details` via duck-typing (`'details' in err && Array.isArray(...)`) so no `instanceof WorkflowError` check is needed; any future `AppError` subclass with a `details` array gets the same treatment automatically
- **Implementation**: `backend/src/errors.ts`

## Retry Pattern (TASK-017 Phase 1)

`retryWithBackoff<T>` (`backend/src/utils/retry.ts`) is a generic exponential-backoff retry harness for async operations:

```typescript
retryWithBackoff<T>(fn: () => Promise<T>, maxAttempts: number, baseDelayMs: number): Promise<T>
```

- **Attempt 1**: runs immediately (no initial delay)
- **Subsequent attempts**: wait `baseDelayMs * 2^(attempt-1)` ms before retrying (attempt 2: `baseDelayMs`, attempt 3: `baseDelayMs * 2`, etc.)
- **On exhaustion**: throws the error from the final attempt
- **Use case**: suitable when callers need the final rejection and per-attempt persistence is not required

**Node 26 + Jest fake-timer guard**: the function returns an outer promise that has `.catch(() => {})` attached synchronously before returning to the caller. This prevents Node from emitting `UnhandledPromiseRejectionWarning` / `PromiseRejectionHandledWarning` when `jest.runAllTimersAsync()` resolves the retry loop before `await expect(p).rejects` attaches a handler. Callers that `await` normally are unaffected. Any future async utility that follows the same fire-and-forget-then-await pattern should apply the same pre-rejection guard.

## Rule #2 Manual Retry Loop Pattern (TASK-017 Phase 3)

`WorkflowService.triggerDoneColorRule` uses an **explicit for-loop** rather than `retryWithBackoff` because it must insert an `action_delivery` row per attempt (for per-attempt observability) and insert a single `rule_trigger` row after all attempts with the final outcome. `retryWithBackoff` cannot interleave DB writes between attempts without imperative control flow.

```
triggerDoneColorRule(boardId, cardId): Promise<void>
  1. lastError = null
  2. for attempt = 1 to WORKFLOW_RULE2_MAX_ATTEMPTS:
       a. insertDelivery(triggerId, attempt) → deliveryId
       b. try setCardColor(cardId, 'green')
          on success: updateDeliveryStatus(deliveryId, 'success') → insertTrigger('success') → return
          on failure: updateDeliveryStatus(deliveryId, 'failed', err) → lastError = err
          wait baseDelay * 2^(attempt-1) unless last attempt
  3. insertTrigger('failed', lastError.message)
  4. return (never throws)
```

**Key design decisions:**
- **Always resolves**: `triggerDoneColorRule` never throws. Workflow failures are recorded in the DB and observable via `trigger_error`; they do not propagate to the caller.
- **Per-attempt delivery rows**: each attempt gets its own `workflow_action_deliveries` row (`delivery_status`, `delivery_error`) for fine-grained observability, enabling diagnosis of which attempt failed and why.
- **Trigger row inserted after all attempts**: `workflow_rule_triggers` receives one row with `trigger_status = 'failed'` and `trigger_error = lastError.message` only after the retry budget is exhausted — not pre-inserted before attempts.
- **Why not `retryWithBackoff`**: `retryWithBackoff` throws on exhaustion and offers no hook for per-attempt side effects. The manual loop keeps DB writes and retry delay inside a single readable flow.
- **Implementation**: `backend/src/services/workflow.service.ts`

## Fire-and-Forget Trigger Pattern (TASK-017 Phase 3)

`CardService.moveCard` fires Rule #2 without awaiting it:

```typescript
// In moveCard, after confirming destination column name === 'Done':
if (this.workflowService && destinationColumnName === 'Done') {
  this.workflowService.triggerDoneColorRule(boardId, cardId).catch((err) => {
    logger.warn({ err }, 'triggerDoneColorRule unexpected rejection');
  });
}
```

- **Why fire-and-forget**: The Done-color action is a background side effect. The card move response must not be delayed by retry timing (up to ~WORKFLOW_RULE2_BASE_DELAY_MS * 3 seconds).
- **`.catch()` is mandatory**: `triggerDoneColorRule` always resolves, but the `.catch()` guards against any unexpected future regression that causes it to throw. Without it, an unhandled rejection would crash the Node process.
- **Observable outcome**: failures are recorded in `workflow_rule_triggers.trigger_error` and `workflow_action_deliveries.delivery_error` — the card move itself always succeeds.
- **Implementation**: `backend/src/services/card.service.ts`

## `trigger_error` Observability Contract (TASK-017 Phase 3)

`workflow_rule_triggers.trigger_error` is populated with the last delivery error message when a rule's full retry budget is exhausted:

- **On success** (any attempt): `trigger_error = NULL` — row is inserted at first success with `trigger_status = 'success'`
- **On exhaustion**: `trigger_error = lastError.message` — the error from the final failed attempt; earlier attempt errors are visible in `workflow_action_deliveries` rows
- **Purpose**: allows operators to query `WHERE trigger_status = 'failed'` and read `trigger_error` to understand the failure root cause without joining to the deliveries table for the common diagnostic case
- **Implementation**: `backend/src/repositories/workflow.repository.ts` `insertTrigger(ruleId, boardId, cardId, status, error?)`

## Webhook Delivery Pattern

When a trigger with webhook configuration fires:

1. Trigger execution completes first (decoupled from delivery)
2. Webhook delivery queued as separate async job
3. Delivery attempts: max 3, 30-second backoff between attempts
4. Delivery record: `{ rule_id, attempt_count, status, http_response_code, error, created_at }`
5. Status lifecycle: `pending` → `delivered` | `failed` → `exhausted`

## WorkflowService Optional DI Pattern (TASK-017 Phase 2)

`WorkflowService` follows the same optional constructor injection pattern already established by `EventService`. Services that need workflow side effects accept it as an optional parameter so tests that don't exercise workflow logic can skip wiring it up entirely.

```typescript
class BoardService {
  constructor(
    private readonly repo: BoardRepository,
    private readonly workflowService?: WorkflowService,   // optional
  ) {}

  async getBoardById(id: string): Promise<BoardWithColumnsAndWarnings> {
    const board = await this.repo.findBoardById(id);
    if (this.workflowService) {
      const warnings = await this.workflowService.applyBoardRules(board.id, board.columns);
      if (warnings.length > 0) return { ...board, warnings };
    }
    return board;
  }
}
```

- **Wiring**: `createRouter` (in `routes/index.ts`) constructs a single `WorkflowService` instance and passes it to both `createBoardsRouter` and `createCardsRouter` (Phase 3+)
- **Why optional**: Keeps unit tests for `BoardService`/`CardService` free of workflow infrastructure; the absence of the service is a valid no-op production configuration (e.g., feature-flagged rollout)
- **Implementation files**: `backend/src/services/board.service.ts`, `backend/src/routes/boards.ts`, `backend/src/routes/index.ts`

## Rule #1 Execution Pattern: Promise.allSettled + Warnings (TASK-017 Phase 2)

`WorkflowService.applyBoardRules` applies Rule #1 (stale-move) in parallel across all eligible cards using `Promise.allSettled`. Failures from individual card moves do not block other moves or the board response.

```
applyBoardRules(boardId, columns)
  1. Resolve Stale and Done column IDs from the columns array already in memory
     (no extra DB query — columns are already fetched by BoardRepository.findBoardById)
  2. findStaleCards() — single query for all eligible cards
  3. Promise.allSettled(staleCards.map(moveCardToStale))
  4. Collect rejected results → WorkflowWarning[]
  5. Return warnings (empty array on full success)
```

**Key design decisions:**
- **Name-match column resolution**: `columns.find(c => c.name === 'Stale')` — avoids a separate DB query; board data is already in memory at call site
- **`Promise.allSettled` over `Promise.all`**: one card DB failure does not block the other moves; all settled results are inspected for partial-failure reporting
- **Failures become warnings, never throws**: `applyBoardRules` never throws; callers (`getBoardById`) receive `WorkflowWarning[]` and decide how to surface them
- **`getBoardById` outer try/catch**: if `applyBoardRules` itself throws unexpectedly (e.g., network partition during `findStaleCards`), the board still loads — the catch logs a warn and returns the board without warnings
- **Implementation**: `backend/src/services/workflow.service.ts`

## `warnings[]` Additive Response Field Contract (TASK-017 Phase 2)

`GET /boards/:boardId` response shape is extended from `BoardWithColumns` to `BoardWithColumnsAndWarnings`:

```typescript
export type BoardWithColumnsAndWarnings = BoardWithColumns & { warnings?: WorkflowWarning[] };

export interface WorkflowWarning {
  code: string;
  message: string;
  details?: Array<{ field: string; error: string }>;
}
```

**API stability contract:**
- `warnings` is **optional** in the type but the board route returns it as `[]` when rules run with no failures — consumers can safely always read it as an array
- Existing consumers that do not read `warnings` are unaffected (additive, not breaking)
- The field is present in the response body even when empty so frontend code can rely on `board.warnings?.length ?? 0` without extra nil guards
- **Implementation**: `backend/src/services/board.service.ts` (type definition + population), `backend/src/routes/boards.ts` (passes through from service)

## CardRepository Cross-Table Query Pattern (TASK-017 Phase 2)

When a service needs a value from a related table (e.g., a card's current column name), the lookup belongs in the repository layer — not as raw SQL in the service. Phase 2 added two canonical methods to `CardRepository`:

```typescript
// Look up the name of the column that currently owns a card.
// Used by CardService.moveCard to detect moves out of the Stale column
// without the service layer touching SQL directly.
async getColumnName(columnId: string): Promise<string | null>

// Set the stale_suppressed flag for a card.
// Called when a user manually moves a card out of Stale, permanently
// overriding the automatic stale-move rule for that card.
async setSuppressed(cardId: string, suppressed: boolean): Promise<void>
```

**Why these methods exist:**
- `getColumnName` allows `CardService.moveCard` to detect "source is Stale column" by name without embedding SQL or joining tables in the service layer — preserving Guiding Principle #1 (no SQL in services)
- `setSuppressed` keeps the `stale_suppressed` update isolated in a single, testable repository method rather than duplicating an UPDATE statement across callers
- **Implementation**: `backend/src/repositories/card.repository.ts` (lines 146–159)

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

## Authentication Patterns

### Auth Protection via Group Middleware

All domain routes are protected by applying `requireAuth` as a single group middleware in `routes/index.ts`, **between** the public routes (health, auth) and the protected routers:

```typescript
router.use('/auth', createAuthRouter(db));  // public
router.use(requireAuth);                    // gate
router.use('/boards', createBoardsRouter(db)); // protected
```

- **Why**: One insertion point protects all current and future domain routes. Individual route guards are not needed.
- **Order matters**: Public routes MUST be registered before `requireAuth`; otherwise the middleware fires before the public handlers can respond.
- **Implementation**: `backend/src/routes/index.ts`

### Session Type Augmentation Pattern

`express-session`'s `SessionData` interface is extended in `backend/src/types/session.d.ts` using TypeScript module augmentation:

```typescript
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
```

- **Why**: Avoids casting `req.session` to `any`; provides type safety on `req.session.userId` throughout the codebase.
- **Pickup**: TypeScript auto-discovers `.d.ts` files included in `tsconfig.json`; no explicit import needed.

### Auth-Safe Logging Pattern

Auth event logs MUST include `userId` and MUST NOT include `email`, `password`, or any credential hash:

```typescript
// Correct
req.log.info({ event: 'user.login', userId: user.id }, 'User logged in');

// Never do this
req.log.info({ email, password }, 'Login attempt'); // leaks credentials
```

- **Events**: `user.registered`, `user.login`, `user.logout`, `auth.unauthorized`
- **Rationale**: Log aggregation pipelines may ship to third-party observability tools; credentials in logs are an incident waiting to happen.

### Email Enumeration Prevention

`AuthService.login` uses an identical error message for both "unknown email" and "wrong password":

```typescript
throw new UnauthorizedError('Invalid email or password');
```

- **Why**: Returning distinct messages lets an attacker probe for valid accounts. The uniform message prevents distinguishing the two failure modes.
- **Implementation**: `backend/src/services/auth.service.ts`

### Frontend Auth Patterns

#### PrivateRoute: 4-State Guard
`frontend/src/components/PrivateRoute/PrivateRoute.tsx` handles four states in order:
1. **Loading** → render `<LoadingSpinner>` (session check in flight)
2. **Error (401)** → `<Navigate to="/login?next=<current-path>" replace>` (not logged in — treat as unauthenticated, not a fault)
3. **Error (other)** → render `<ErrorBanner>` (unexpected `/auth/me` failure)
4. **Unauthenticated** → `<Navigate to="/login?next=<current-path>" replace>`
5. **Authenticated** → `<AppHeader> + <Outlet>`

#### Auth State via TanStack Query
`useCurrentUser()` (`frontend/src/hooks/useCurrentUser.ts`) wraps `useQuery` against `GET /auth/me` with `retry: false` and `staleTime: 0`. This is the single source of truth for session state — no AuthContext or global store needed.

#### Logout: removeQueries Avoids Stale-Cache Flash
`useLogout` calls `queryClient.removeQueries({ queryKey: queryKeys.auth.me })` (not `invalidateQueries`). Invalidation triggers a background refetch that could briefly re-render authenticated UI before the redirect. Removing the entry immediately cuts the cache, preventing the flash.

#### CORS Credentials: Reflect Origin Instead of Wildcard
When `credentials: true`, browsers reject `Access-Control-Allow-Origin: *`. `backend/src/middleware/cors.ts` reflects the incoming request's `Origin` header back in the response rather than echoing `*`. This preserves broad dev-mode permissiveness while satisfying the credentials constraint.

## Database Schema

| Table | Key Columns |
|-------|-------------|
| `users` | `id` uuid PK, `email` varchar UNIQUE, `password_hash` text, `first_name` varchar(100)?, `last_name` varchar(100)?, `created_at` timestamptz |
| `boards` | `id` uuid PK, `name` varchar, `created_at` timestamptz |
| `columns` | `id` uuid PK, `board_id` FK → boards CASCADE DELETE, `name` varchar, `position` int, `created_at` timestamptz |
| `cards` | `id` uuid PK, `column_id` FK → columns CASCADE DELETE, `title` varchar, `description` text?, `due_date` timestamptz?, `labels` text[]?, `position` float8 DEFAULT 1.0, `stale_suppressed` boolean NOT NULL DEFAULT false, `created_at`/`updated_at` timestamptz |
| `card_events` | `id` uuid PK, `board_id` FK → boards CASCADE DELETE, `card_id` FK → cards SET NULL, `actor_id` FK → users SET NULL, `event_type` varchar, `payload` jsonb, `occurred_at` timestamptz DEFAULT now() |
| `messages` | `id` uuid PK gen_random_uuid(), `message` varchar(255) NOT NULL, `created_at` timestamptz DEFAULT now(), `recipient_user_id` uuid FK → users CASCADE DELETE |
| `workflow_rule_triggers` | `id` uuid PK, `rule_id` varchar NOT NULL, `board_id` FK → boards CASCADE DELETE, `card_id` FK → cards SET NULL, `triggered_at` timestamptz DEFAULT now(), `trigger_status` varchar CHECK IN ('success','failed'), `trigger_error` text |
| `workflow_action_deliveries` | `id` uuid PK, `trigger_id` FK → workflow_rule_triggers CASCADE DELETE, `attempt` int NOT NULL, `attempted_at` timestamptz DEFAULT now(), `delivery_status` varchar CHECK IN ('pending','success','failed'), `delivery_error` text |

## Query Patterns

- **Parameterized SQL** — `$1, $2, ...` placeholders everywhere; no string interpolation
- **`RETURNING`** — INSERTs return the created row directly; no separate SELECT after write
- **Two-query over JOIN** — board + columns fetched as separate queries, not a JOIN (handles zero-column boards cleanly)
- **`Promise.all`** — independent queries run concurrently (e.g. COUNT + data in paginated list; seeding columns on board create)
- **No transactions** — multi-step writes use parallel independent inserts
- **Type projection** — `password_hash` never appears in public return types; `RETURNING` lists safe columns explicitly
- **Domain types at repo layer** — entity types defined at the top of each repository file, not in a shared `models/` folder

## Domain Event Pattern

Card actions (create, move, label, assign, delete) emit domain events. Consumers subscribe to event streams rather than polling. Events carry: timestamp, actor, action type, card ID, before/after state. In-process emitter for v1; designed for future message bus extraction.

### Concrete Implementation (Phase 1 — TASK-012)

**Interface** (`backend/src/events/domain-event-bus.ts`):
- `DomainEventBus` — `publish(event): void | Promise<void>` and `subscribe(boardId, handler): () => void` (returns unsubscribe)
- `DomainEvent` union type — currently `CardMovedEvent | CardCreatedEvent`; new event types extend the union
- `CardMovedEvent` carries: `type`, `boardId`, `cardId`, `cardTitle?`, `actorId`, `actorEmail?`, `actorDisplayName?`, `fromColumnId/Name?`, `toColumnId/Name?`, `occurredAt`
- `CardCreatedEvent` carries: `type`, `boardId`, `cardId`, `cardTitle`, `actorId`, `actorDisplayName`, `columnId`, `columnName?`, `occurredAt`

**In-process implementation** (`backend/src/events/in-process-event-bus.ts`):
- `InProcessEventBus` — `Map<boardId, Set<handler>>` for O(1) fan-out per board
- Unsubscribe removes the handler from the Set; deletes the Map entry when the last subscriber for a board departs (prevents unbounded memory growth)
- `_subscribers` is `readonly` but exposed for test memory-leak assertions

**Service layer** (`backend/src/services/event.service.ts`):
- `EventService(bus, db, userRepo?)` — `userRepo` is an optional constructor injection; when present, `resolveDisplayName()` looks up the user and returns `"First Last"`, falling back to email then null
- `EventService.emitCardMoved(input)` — resolves actor display name, persists to `card_events` via `EventRepository`, then publishes on the bus
- `EventService.emitCardCreated(input)` — same resolve-persist-publish flow for `card.created` events; `fromColumnId`/`toColumnId` stored as `null` in the event row (not applicable for card creation)
- Display name is snapshotted at emit time into the `payload` jsonb — no JOIN to `users` needed when reading events back

**`projectEventRow` pure projection** (`backend/src/routes/feed.ts`):
- `projectEventRow(row: EventRow): ActivityEvent` — normalizes a raw DB row to the `ActivityEvent` shape used by SSE frames and history replay
- Reads `actor_display_name` from `row.payload` jsonb rather than querying `users`; works uniformly for both `card.moved` and `card.created` rows

**Wiring** (`backend/src/routes/index.ts`):
- `UserRepository` constructed once in `createRouter`; injected into `EventService` as the optional third argument
- `eventService` instance passed to both `createColumnCardsRouter` (for card creation) and `createCardsRouter` (for card moves)
- `AppDeps` (in `app.ts`) extended with optional `bus?: DomainEventBus`
- Production entry point constructs `InProcessEventBus` and passes it through `AppDeps`

**DB Schema addition** (`backend/migrations/20260618120000_create-card-events.js`):

| Table | Key Columns |
|-------|-------------|
| `card_events` | `id` uuid PK, `board_id` FK → boards CASCADE DELETE, `card_id` FK → cards SET NULL, `actor_id` FK → users SET NULL, `event_type` varchar, `payload` jsonb, `occurred_at` timestamptz DEFAULT now() |

### SSE Transport Layer (Phase 2 — TASK-012)

**Feed route** (`backend/src/routes/feed.ts`): `GET /boards/:boardId/events`
- Protected by `requireAuth` (applied upstream in `routes/index.ts`)
- Mounted at `router.use('/boards/:boardId/events', createFeedRouter(db, bus, config))`
- Required SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` (last one prevents nginx from buffering frames)

**SSE frame format**:
```
id: <eventId>\ndata: <json>\n\n
```
Each frame carries the full `EventRow` serialized as JSON; the `id` field enables browser-native reconnection tracking via `Last-Event-ID`.

**Connect sequence**:
1. Set SSE headers and flush
2. If `Last-Event-ID` header present → `EventRepository.findAfterById(boardId, lastEventId)` and replay missed events oldest-first
3. Otherwise → `EventRepository.findRecentByBoard(boardId, FEED_MAX_HISTORY)` reversed to oldest-first, then flush as initial history
4. Subscribe to `DomainEventBus` for live events
5. Start heartbeat interval (comment frame `": heartbeat\n\n"` every `FEED_SSE_HEARTBEAT_MS`)

**Cleanup on disconnect** (`req.on('close')`): `clearInterval(heartbeat)` + call `unsubscribe()` from bus — implements Guiding Principle 12.

**Subscribe-before-flush ordering (Phase 4 — TASK-012)**: The bus subscription must be registered _before_ flushing historical events to the client. A request-scoped buffer accumulates live events that arrive during the history flush; once the flush completes, buffered events are drained (with dedup against already-flushed IDs) before handing off to the normal live-publish path. Reversing the order (flush then subscribe) leaves a window between the last historical event and the first live event where events are silently lost — a race condition that only manifests under concurrent write load. Client-side, `useActivityFeed` maintains a `Set<string>` of seen `eventId`s scoped to the `useEffect` lifetime so that duplicate frames from SSE reconnection do not re-render.

**`EventRepository.findAfterById`** (added in Phase 2): selects events for a board whose `occurred_at` is greater than the anchor event's `occurred_at` (correlated subquery), ordered `ASC` to deliver chronological replay.

### Frontend SSE Type-Guard Discrimination Pattern (Phase 2 — TASK-016)

`useActivityFeed` receives raw SSE frames as `unknown`-ish JSON. Two guards run before the frame is accepted into state:

1. **Discriminant check** — `data.type === 'card.moved'` or `data.type === 'card.created'` (the union discriminant)
2. **Structural property check** — `typeof (data as SpecificEvent).cardId === 'string'` confirms a required field is present

Both guards are needed because the SSE stream is untyped at the network boundary; the discriminant alone would allow malformed frames with the right `type` string but missing required fields to pass into state with incorrect shape.

Frontend `ActivityEvent` types (`frontend/src/types/index.ts`):
- `CardMovedEvent` — `type: 'card.moved'`, includes `fromColumnId/toColumnId`
- `CardCreatedEvent` — `type: 'card.created'`, includes `columnId`
- `ActivityEvent = CardMovedEvent | CardCreatedEvent` — discriminated union; `type` is the discriminant

The `actorDisplayName ?? actorEmail ?? 'Someone'` fallback in `ActivityFeed.tsx` renders a display name from whichever field the backend populated at emit time (snapshot in payload), without any runtime user lookups.


## FilterBar / Client-Side Filter Pattern (FEAT-010, TASK-013)

### State Ownership

Filter text is owned by `BoardPage` (the page-level container), not by `FilterBar` itself:

```
BoardPage (owns filterText state)
  └─ FilterBar (controlled input — value + onChange)
  └─ KanbanBoard (receives filterText prop)
       └─ KanbanColumn (applies filter against sortedCards)
```

- **Why state lives at page level**: The filter must span all columns simultaneously. If state lived inside `FilterBar`, `KanbanColumn` couldn't read it without a shared context or side-channel.
- **FilterBar derived-state pattern**: `FilterBar` uses two `useState` calls — `internalValue` for keystroke buffering (avoids parent re-render on every keypress) and `prevPropValue` to detect parent-driven resets (`value` prop changing to `''`). This is the React "store previous prop value" pattern documented at https://react.dev/reference/react/useState#storing-information-from-previous-renders.

### Client-Side Filtering

Filtering is applied inside `KanbanColumn` against the already-fetched `sortedCards` array:

- Match is case-insensitive `includes()` on `card.title` and `card.description`
- Empty `filterText` skips the filter entirely (shows all cards)
- The `lowerFilter` value is computed once per render, outside the filter predicate, to avoid redundant `.toLowerCase()` calls per card

No server round-trips for filtering — works offline and feels instant for typical board sizes.

### When to Use This Pattern

Use page-level state + prop drilling (not a context) for filter/search state when:
1. The filtered content spans multiple sibling components (columns)
2. The data is already fetched client-side (no server filtering needed)
3. The filter affects only one page subtree

Use a React context instead if the filter state needs to escape the page boundary (e.g., persisted in URL params or shared with a sidebar outside the `BoardPage` tree).

## Playwright E2E Pattern: SSE Attribution Testing (TASK-016 Phase 3)

Testing SSE-based activity feed attribution requires two distinct setups depending on whether the test covers **live push** or **history replay**.

### Live Push Tests (event created after page load)

1. Navigate to the board page and wait for the SSE connection to open (poll the activity feed panel or use `waitForSelector`)
2. Trigger the card action via the API helper **after** the page is loaded and SSE-connected
3. Assert the feed panel shows the attributed text (e.g., `"E2E Attribution moved 'Card Title'"`)

The event arrives as a live frame over the open SSE stream, so no reload is needed.

### History Replay Tests (event created before page load)

1. Trigger the card action via API helper **before** navigating to the board page
2. Navigate to the board page — the feed route replays the `FEED_MAX_HISTORY` most recent events on SSE connect
3. Assert the attributed text is visible in the feed immediately after load

This verifies that `EventRepository.findRecentByBoard` and `projectEventRow` correctly surface `actor_display_name` from the stored `payload` jsonb without a live user lookup.

### Reconnect / Reload Tests

To test attribution surviving a reconnect:
1. Create an event (live push, assert it appears)
2. Reload the page — the browser sends `Last-Event-ID` and the feed route replays missed events via `EventRepository.findAfterById`
3. Assert the same attributed text reappears

### Attribution Test User Convention

Use a dedicated test account (`e2e-attribution@banyanboard.test`, `first_name: 'E2E'`, `last_name: 'Attribution'`) so display-name assertions (`"E2E Attribution"`) are unambiguous and isolated from the generic `loginAsTestUser` fixture. The helper `loginAsAttributionUser(request)` in `frontend/e2e/helpers/auth.ts` registers and logs in this user.

Board and card fixture data are created/deleted in `beforeEach`/`afterEach` via the `createBoard`, `deleteBoard`, and `moveCard` API helpers so each test starts with a clean state.

## Frontend `WorkflowWarning` Mirror Type Contract (TASK-017 Phase 4)

The backend `WorkflowWarning` shape is mirrored in `frontend/src/types/index.ts` so the frontend type-system tracks the API contract without a shared package:

```typescript
export interface WorkflowWarning {
  code: string
  message: string
  details?: Array<{ field: string; error: string }>
}

export interface BoardWithColumns extends Board {
  columns: Column[]
  warnings?: WorkflowWarning[]   // additive — undefined when no rules ran; [] when rules ran cleanly
}
```

**Contract notes:**
- `warnings` is optional on the frontend type, matching the backend `BoardWithColumnsAndWarnings` contract (field present as `[]` when rules run, absent when WorkflowService is not wired)
- The field is parsed but **not rendered** in Phase 4 — it is available in the query cache for future UI surfacing (e.g., a stale-card banner) without a type-breaking API change
- Consumers can safely read `board.warnings?.length ?? 0` without extra nil guards regardless of whether the field is present
- **Implementation**: `frontend/src/types/index.ts` lines 39-48

## Optimistic Done-Color Cross-Slice Cache Pattern (TASK-017 Phase 4)

`useMoveCard.onMutate` applies a visual Done-color (`#d4edda`) to a card optimistically when the destination column is named 'Done'. Because the card query cache (`queryKeys.cards.byColumn`) does not contain column names, the hook reads the board query cache cross-slice to resolve the column name before mutating card state:

```
onMutate({ cardId, destColumnId, after_card_id })
  1. getQueriesData<BoardWithColumns>({ queryKey: queryKeys.boards.all })
     → iterates all cached board entries
  2. For each board: columns.some(col => col.id === destColumnId && col.name === 'Done')
     → isDoneColumn = true on first match
  3. movedCard = isDoneColumn
       ? { ...moving, column_id: destColumnId, color: '#d4edda' }
       : { ...moving, column_id: destColumnId }
  4. Optimistic card list written to both src and dest column caches
```

**Key design decisions:**
- **Cross-slice read, not a separate query**: `getQueriesData` reads the already-cached board data synchronously — zero network cost. The board cache is populated by `useBoard` when the board page mounts, so it is always warm during a card drag.
- **Rollback is free**: TanStack Query snapshots `prevSrc`/`prevDest` before the optimistic write; `onError` restores them automatically. The Done-color is included in the snapshot and disappears on rollback without any extra cleanup code.
- **Backend is authoritative**: `onSettled` invalidates both column caches, causing a fresh fetch. The server-side `setCardColor` (Rule #2, Phase 3) sets the persistent color; the optimistic color is a UX affordance that minimises lag between drag and visual confirmation.
- **Why '#d4edda'**: Matches the green background applied by the backend Done-color rule — same visual result before and after the server response arrives.
- **Implementation**: `frontend/src/api/hooks.ts` — `useMoveCard`, `onMutate` handler (lines 109-166)

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
