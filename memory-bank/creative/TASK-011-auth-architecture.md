# Architecture Decision: User Authentication (TASK-011 / FEAT-006)

**Created**: 2026-06-17
**Status**: DECIDED
**Decision Type**: Architecture

---

## Context

### System Requirements
- Username + password authentication (no OAuth for MVP)
- Session persistence via PostgreSQL (`connect-pg-simple`); session survives server restart
- Password hashing with `bcrypt` (cost factor 12)
- `requireAuth` middleware protects all domain routes; auth routes (`/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`) are public
- Frontend must redirect unauthenticated users to `/login`; 401 responses from any API call must also redirect
- `users` table migration; `sessions` table auto-created by `connect-pg-simple`

### Technical Constraints
- Existing 3-layer clean architecture (routes → services → repositories) must be respected
- `createApp` uses `AppDeps { config, logger, pool }` — the pool is already available
- All env vars through `config.ts` zod schema with fail-fast validation
- TanStack Query v5 is the data-fetching layer on the frontend; `queryKeys` pattern is established
- `client.ts` `request<T>()` is the sole HTTP transport; 401 must be catchable there
- `asyncHandler` wraps all async route handlers
- No `console.log` in production code (pino logging only)

### Non-Functional Requirements
- API p95 < 200ms — session lookup must not add significant latency (PostgreSQL session store has indexed lookup on session ID)
- Security: bcrypt cost 12, `HttpOnly` + `SameSite=Lax` session cookie, `Secure` in production
- No PII leakage in logs (do not log passwords or raw session tokens)
- WCAG 2.1 AA: login form must have proper labels, focus management on redirect
- Self-hosted: session store must not require external Redis (PostgreSQL is already the only dep)

---

## Component Analysis

### Core Components

| Component | Layer | Purpose | Responsibilities |
|-----------|-------|---------|------------------|
| `UserRepository` | Repository | User persistence | `createUser`, `findByEmail`, `findById` — SQL only |
| `AuthService` | Service | Business rules | `register` (hash + create), `login` (verify hash), `getMe` (lookup by session userId) |
| `createAuthRouter` | Route | HTTP auth surface | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| `requireAuth` | Middleware | Route protection | Reads `req.session.userId`; throws `UnauthorizedError` if absent |
| `sessionMiddleware` | Middleware | Session hydration | `express-session` + `connect-pg-simple` wired at app level |
| `Config` additions | Config | Env var management | `SESSION_SECRET`, `SESSION_COOKIE_MAX_AGE_MS`, `SESSION_SECURE` |
| Session type augmentation | Type | TypeScript safety | Augments `express-session` `SessionData` with `userId?: string` |
| `useCurrentUser` hook | Frontend | Auth state | TanStack Query hook wrapping `GET /auth/me` |
| `PrivateRoute` | Frontend | Route protection | Redirects to `/login` if `useCurrentUser` returns no user |
| `ApiError` 401 intercept | Frontend | Global 401 handling | Detects 401 in `client.ts` and triggers redirect |
| `LoginPage` | Frontend | Auth UI | Form calling `POST /auth/login`; redirects on success |

### Component Interactions

```
Browser → LoginPage
  → POST /auth/login → createAuthRouter → AuthService.login()
    → UserRepository.findByEmail() → PostgreSQL
    → bcrypt.compare()
    → req.session.userId = user.id
    → express-session → connect-pg-simple → sessions table
  ← 200 { id, email }
  → frontend invalidates 'auth/me' query
  → PrivateRoute checks useCurrentUser → allowed

Browser → ProtectedPage (e.g. /boards)
  → GET /boards → requireAuth middleware
    → req.session.userId present? → next()
    → absent? → throw UnauthorizedError(401)
  ← 401 JSON
  → client.ts ApiError(401) → redirect to /login
```

---

## Decision 1: Frontend Session State Strategy

### Option A: Dedicated React Context (`AuthContext`) with `useReducer`

Wraps the tree in `<AuthContext.Provider>`. State is `{ user: User | null, status: 'loading' | 'authenticated' | 'unauthenticated' }`. On mount, calls `GET /auth/me` to hydrate. Subsequent auth events dispatch actions.

- **Pros**: Explicit state machine; `status` field makes loading/auth/unauth states distinguishable at a glance; familiar pattern
- **Cons**: Parallel state layer alongside TanStack Query; must manually invalidate on login/logout; `GET /auth/me` is called outside TanStack Query's cache — no deduplication, no staleTime benefit; two sources of truth for the same network data
- **Technical Fit**: Medium — contradicts the established TanStack Query–first data pattern
- **Complexity**: Medium

### Option B: Zustand Auth Store

Minimal store with `{ user, setUser, clearUser }`. Hydrated by calling `GET /auth/me` in a top-level component on mount.

- **Pros**: Very lightweight; no Context provider ceremony; easy to read anywhere
- **Cons**: Third new state library (project already has React state + TanStack Query); `GET /auth/me` still lives outside Query cache; same dual-source-of-truth problem as Option A; Zustand is not in the project
- **Technical Fit**: Low — adds a dependency not in the project
- **Complexity**: Low–Medium

### Option C: TanStack Query `useQuery` for `GET /auth/me` as single source of truth ✓ CHOSEN

`useCurrentUser()` is a standard `useQuery({ queryKey: queryKeys.auth.me, queryFn: fetchMe, retry: false, staleTime: 5_000 })`. `PrivateRoute` reads the query result. Login/logout mutations call `queryClient.invalidateQueries({ queryKey: queryKeys.auth.me })` to refetch. No separate auth state layer.

- **Pros**: No new state library; consistent with established TanStack Query patterns; automatic deduplication; `staleTime` controls re-fetch frequency; loading/error/success states are TanStack Query's built-in states; single source of truth; `retry: false` ensures 401 surfaces immediately rather than retrying 3×
- **Cons**: Subtle invalidation responsibility — login/logout mutations must remember to invalidate; `queryClient` must be accessible in mutation callbacks (it is, via `useQueryClient()`)
- **Technical Fit**: High — uses existing `queryKeys` factory, `request<T>()` transport, TanStack Query v5 patterns
- **Complexity**: Low

**Decision: Option C.** The project already uses TanStack Query as the canonical server-state layer. Introducing a parallel auth state layer (Context or Zustand) would create dual sources of truth and require manual synchronization. `useCurrentUser()` as a `useQuery` is the natural extension of the existing pattern.

**Trade-off accepted**: On logout the query key must be explicitly cleared (`queryClient.removeQueries`) not merely invalidated, to prevent a stale-cache flash. The `removeQueries` call is one line in the logout mutation's `onSuccess`.

---

## Decision 2: `requireAuth` Middleware Placement

### Option A: Group middleware in `routes/index.ts` (before domain routers) ✓ CHOSEN

```typescript
export function createRouter(db: Queryable): Router {
  const router = Router();
  router.use(createHealthRouter(db));       // public — before requireAuth
  router.use(createAuthRouter(db));         // public — login/register/logout/me
  router.use(requireAuth);                  // all subsequent routes protected
  router.use('/boards', createBoardsRouter(db));
  router.use('/columns', createColumnCardsRouter(db));
  router.use('/cards', createCardsRouter(db));
  return router;
}
```

- **Pros**: Single declaration; no chance of forgetting it on a new router; matches how `errorHandler` is applied globally
- **Cons**: Health route and auth routes must be registered before `requireAuth`; order matters (easy to get right with clear comments)
- **Technical Fit**: High — mirrors how `errorHandler` and `corsMiddleware` are applied at a single point

### Option B: Per-router, inside each router factory

Each `createBoardsRouter`, `createCardsRouter`, etc. calls `router.use(requireAuth)` as their first middleware.

- **Pros**: More explicit; each router self-documents its auth requirement
- **Cons**: Easy to forget on a new router; duplicated boilerplate across 4+ routers; `requireAuth` must be imported in each router file
- **Technical Fit**: Medium

**Decision: Option A.** Group middleware in `routes/index.ts` is the idiomatic Express pattern for cross-cutting concerns. It mirrors `errorHandler` at app level and means new domain routers are protected by default. The only convention required is: register health + auth routers before `requireAuth`.

---

## Decision 3: Session Store Wiring — Passing `pg.Pool` to `connect-pg-simple`

### Option A: Extend `AppDeps` with a `sessionPool` field

Adds `sessionPool?: Pool` to `AppDeps`. `createApp` receives it separately.

- **Pros**: Explicit separation
- **Cons**: Artificial — the same pool is used; over-engineers a 1-pool app

### Option B: Pass `pool` from `AppDeps` directly to `connect-pg-simple` inside `createApp` ✓ CHOSEN

`connect-pg-simple` accepts a `pool` option in its constructor. `createApp` already receives `deps.pool`. The session store is created inline:

```typescript
import session from 'express-session';
import ConnectPgSimple from 'connect-pg-simple';

export function createApp(deps: AppDeps): Express {
  const PgStore = ConnectPgSimple(session);
  const store = new PgStore({ pool: deps.pool, createTableIfMissing: true });
  app.use(session({
    store,
    secret: deps.config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: deps.config.SESSION_SECURE,
      maxAge: deps.config.SESSION_COOKIE_MAX_AGE_MS,
    },
  }));
  // ...
}
```

`AppDeps` does NOT need to change — `pool` is already there.

- **Pros**: Zero change to `AppDeps`; pool reuse; `createTableIfMissing: true` auto-creates `sessions` table without a migration
- **Cons**: `createApp` grows session wiring logic — acceptable; it already owns cors, requestContext, requestLogger
- **Technical Fit**: High

**Decision: Option B.** `AppDeps` needs no extension. `deps.pool` is passed directly to `connect-pg-simple`. Session middleware is registered in `createApp` alongside the other cross-cutting middleware.

---

## Decision 4: Config Additions Pattern

All new variables follow the established `config.ts` zod schema pattern. **No change to `AppDeps` interface.**

```typescript
// Additions to configSchema in config.ts:
SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
SESSION_COOKIE_MAX_AGE_MS: z.coerce.number().default(7 * 24 * 60 * 60 * 1000), // 7 days
SESSION_SECURE: z.coerce.boolean().default(false), // override to true in production
```

`SESSION_SECRET` is **required with no default** — fail-fast startup. `SESSION_COOKIE_MAX_AGE_MS` and `SESSION_SECURE` have safe defaults for development.

`Config` type additions (parallel to the existing optional fields pattern):
```typescript
SESSION_SECRET: string;        // required
SESSION_COOKIE_MAX_AGE_MS: number;
SESSION_SECURE: boolean;
```

---

## Decision 5: TypeScript Session Augmentation

`express-session` augmentation follows the standard declaration-merging approach. A single file at `backend/src/types/session.d.ts`:

```typescript
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
```

This gives `req.session.userId` strong typing without any runtime overhead. The `?.` (optional) makes it clear the field may not be set (unauthenticated requests).

The `requireAuth` middleware:
```typescript
import { UnauthorizedError } from '../errors';
import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    throw new UnauthorizedError();
  }
  next();
}
```

Because `requireAuth` is synchronous, it does NOT need `asyncHandler`.

---

## Options Explored (Consolidated)

### Frontend Session State

| Criteria | Option A: AuthContext | Option B: Zustand | Option C: TanStack Query |
|----------|-----------------------|-------------------|--------------------------|
| Scalability | Medium | Medium | High |
| Maintainability | Medium | Medium | High |
| Technical Fit | Medium | Low | High |
| New dependency | No | Yes | No |
| Dual source of truth | Yes | Yes | No |
| Implementation Cost | Medium | Low | Low |

### Middleware Placement

| Criteria | Option A: Group in index.ts | Option B: Per-router |
|----------|-----------------------------|----------------------|
| Risk of missing on new router | None | Medium |
| Explicitness | Medium | High |
| Technical Fit | High | Medium |
| Maintenance | Low | Medium |

---

## Observability Architecture

### Logging
- **Library**: Existing `pino` logger (`src/logger.ts`); auth routes use `req.log` child logger
- **Format**: Structured JSON (existing config)
- **Auth-specific log events** (info level):
  - `'User registered'` — fields: `{ userId }` (no email in log)
  - `'User logged in'` — fields: `{ userId }`
  - `'User logged out'` — fields: `{ userId }`
  - `'Auth: unauthenticated request'` — fields: `{ path, method }` (warn level)
- **NEVER log**: passwords, session IDs, raw tokens, email addresses

### Distributed Tracing
- Session middleware runs before `requestContext`? No — `requestContext` is mounted first in `createApp`. Session middleware should be mounted AFTER `requestContext` so trace context is available.
- **Mount order in `createApp`**:
  1. `corsMiddleware()`
  2. `express.json()`
  3. `requestContext` (creates traceId/requestId)
  4. `createRequestLogger()` (binds req.log)
  5. `session(...)` (session hydration — after traceId is available)
  6. `createRouter(deps.pool)` (all domain routes)
  7. `errorHandler`
- Auth-related spans: no custom spans needed; existing HTTP spans from `requestContext` + `pino-http` cover the auth endpoints

### Metrics
- No custom auth metrics for MVP; existing `http_requests_total{route=/auth/login, status=200/401}` is sufficient
- Future: add `auth_login_attempts_total{result=success|failure}` if brute-force monitoring is needed

### Configuration Variables Added

| Variable | Purpose | Default |
|----------|---------|---------|
| `SESSION_SECRET` | Signs session cookie | **Required (no default)** |
| `SESSION_COOKIE_MAX_AGE_MS` | Cookie lifetime | `604800000` (7 days) |
| `SESSION_SECURE` | `Secure` flag on cookie | `false` (set `true` in production) |

---

## Concrete Interface Definitions

### Backend Types

```typescript
// backend/src/repositories/user.repository.ts
export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  created_at: Date;
}

export class UserRepository {
  constructor(private readonly db: Queryable) {}
  async createUser(email: string, passwordHash: string): Promise<PublicUser>;
  async findByEmail(email: string): Promise<User | null>;
  async findById(id: string): Promise<PublicUser | null>;
}
```

```typescript
// backend/src/services/auth.service.ts
export class AuthService {
  constructor(private readonly repo: UserRepository) {}
  async register(email: string, password: string): Promise<PublicUser>;   // hashes, creates, returns public user
  async login(email: string, password: string): Promise<PublicUser>;       // verifies, returns public user or throws UnauthorizedError
  async getMe(userId: string): Promise<PublicUser>;                        // lookup by id or throws UnauthorizedError
}
```

```typescript
// backend/src/routes/auth.ts
export function createAuthRouter(db: Queryable): Router;
// Routes:
//   POST /auth/register  body: { email, password }   → 201 PublicUser
//   POST /auth/login     body: { email, password }   → 200 PublicUser  (sets session cookie)
//   POST /auth/logout    (no body)                   → 204             (destroys session)
//   GET  /auth/me        (no body)                   → 200 PublicUser | 401
```

```typescript
// backend/src/middleware/requireAuth.ts
export function requireAuth(req: Request, _res: Response, next: NextFunction): void;
// Reads req.session.userId; calls next() or throws UnauthorizedError
```

### Frontend Types

```typescript
// frontend/src/types/index.ts — additions
export interface CurrentUser {
  id: string;
  email: string;
  created_at: string;
}
```

```typescript
// frontend/src/api/queryKeys.ts — addition
export const queryKeys = {
  // ... existing boards, cards ...
  auth: {
    me: ['auth', 'me'] as const,
  },
}
```

```typescript
// frontend/src/api/endpoints.ts — additions
export async function fetchMe(): Promise<CurrentUser> {
  return request<CurrentUser>('GET', '/auth/me');
}
export async function login(email: string, password: string): Promise<CurrentUser> {
  return request<CurrentUser>('POST', '/auth/login', {
    body: JSON.stringify({ email, password }),
  });
}
export async function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout');
}
export async function register(email: string, password: string): Promise<CurrentUser> {
  return request<CurrentUser>('POST', '/auth/register', {
    body: JSON.stringify({ email, password }),
  });
}
```

```typescript
// frontend/src/hooks/useCurrentUser.ts
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5_000,
  });
}
```

```typescript
// frontend/src/hooks/useLogin.ts
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      login(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });
}

// frontend/src/hooks/useLogout.ts
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.auth.me }); // removeQueries, not invalidate
    },
  });
}
```

```typescript
// frontend/src/components/PrivateRoute/PrivateRoute.tsx
export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, error } = useCurrentUser();
  if (isLoading) return <LoadingSpinner />;
  if (!user || (error instanceof ApiError && error.status === 401)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
```

### 401 Global Intercept in `client.ts`

The `request<T>()` function already throws `ApiError(401, ...)` when the server returns 401. `PrivateRoute` handles the redirect for page-level protection. For non-route contexts (e.g., mutations on an already-loaded page where session expired mid-session), the `QueryClient` global `onError` handler is the right interception point:

```typescript
// frontend/src/main.tsx — QueryClient config addition
const queryClient = new QueryClient({
  defaultOptions: { ... },
  // Global 401 handler for mutations/queries that fire after session expires
});
// Register a query cache listener:
queryClient.getQueryCache().subscribe((event) => {
  if (
    event.type === 'observerResultsUpdated' &&
    event.query.state.error instanceof ApiError &&
    event.query.state.error.status === 401
  ) {
    queryClient.removeQueries({ queryKey: queryKeys.auth.me });
    // React Router navigate('/login') — use a module-level navigate ref
  }
});
```

**Simpler alternative** (preferred for MVP): Components that call mutations include an `onError` guard checking `error instanceof ApiError && error.status === 401` and navigate. The `PrivateRoute` + `useCurrentUser` staleTime of 5s catches most session-expired cases on navigation.

**Decision**: Use the simpler per-component `onError` pattern for MVP; no global cache subscription needed. If session expiry mid-session becomes a UX complaint post-MVP, add the global intercept.

### Routing changes in `App.tsx`

```typescript
// frontend/src/App.tsx
function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<PrivateRoute><BoardListPage /></PrivateRoute>} />
      <Route path="/boards/:boardId" element={<PrivateRoute><BoardPage /></PrivateRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

### Database Migration

```sql
-- backend/migrations/YYYYMMDDHHMMSS_create-users.js (node-pg-migrate JS format)
exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password_hash: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('users', 'email');
};
exports.down = (pgm) => {
  pgm.dropTable('users');
};
```

The `sessions` table is auto-created by `connect-pg-simple` with `createTableIfMissing: true`. No explicit migration needed.

---

## Evaluation Matrix

| Criteria | Final Architecture |
|----------|--------------------|
| Scalability | High — PostgreSQL session store scales with the app; single pool reuse |
| Maintainability | High — follows all existing patterns; no new architectural layers |
| Performance | High — session lookup is indexed by session ID; bcrypt cost 12 adds ~100ms to login only |
| Security | High — bcrypt, HttpOnly, SameSite=Lax, Secure in production, no PII in logs |
| Observability | High — structured logging, existing traceId propagation, no custom spans needed |
| Implementation Cost | Low — all decisions leverage existing patterns |

---

## Decision Summary

**Chosen Architecture:**
- **Frontend**: TanStack Query `useCurrentUser()` as single source of truth for auth state (no separate AuthContext or Zustand); `PrivateRoute` wraps protected routes; `removeQueries` on logout prevents stale-cache flash
- **Backend middleware**: Group `requireAuth` in `routes/index.ts` after health + auth routers (before domain routers)
- **Session store**: `connect-pg-simple` receives `deps.pool` directly inside `createApp`; `AppDeps` interface unchanged
- **Config**: `SESSION_SECRET` (required), `SESSION_COOKIE_MAX_AGE_MS` (default 7d), `SESSION_SECURE` (default false) added to zod schema
- **TypeScript**: `backend/src/types/session.d.ts` augments `SessionData` with `userId?: string`

### Trade-offs Accepted
1. **`retry: false` on `useCurrentUser`**: 401 surfaces immediately without retry. Upside: no 3× retry noise on session expiry. Downside: a transient network error shows a login redirect. Acceptable for MVP (self-hosted on reliable localhost).
2. **`removeQueries` not `invalidateQueries` on logout**: Prevents a window where cached stale user data is visible while the refetch resolves to 401. Upside: clean state. Downside: slightly more code. Acceptable.
3. **`createTableIfMissing: true`**: `sessions` table is created at runtime, not via a migration. This is the recommended `connect-pg-simple` pattern and avoids a parallel migration file for a library-managed table.
4. **No global 401 intercept at QueryClient level for MVP**: Per-component `onError` is simpler. A global handler can be added in a future iteration if session-expiry UX is reported.

---

## Implementation Guidelines

1. **Migrations first**: Create `users` migration before any service/repository work
2. **Session middleware mount order matters**: Mount `session(...)` AFTER `requestContext` and `createRequestLogger` in `createApp` so `req.log` (with traceId) is available inside session lifecycle
3. **`SESSION_SECRET` must be in `.env.example`** with a placeholder value and documented as required
4. **`connect-pg-simple` uses `createTableIfMissing: true`**: no migration needed for `sessions`
5. **`bcrypt` cost factor 12**: balances security vs. latency; do NOT lower in tests — use `bcrypt.compare` against a pre-hashed fixture
6. **Test stubs**: `AuthService` tests mock `UserRepository`; route integration tests mock `pool.query` to avoid hitting the DB; use a pre-hashed bcrypt fixture to keep tests fast
7. **`logout` route must call `req.session.destroy(cb)` not just clear userId**: ensures the session record is deleted from the `sessions` table
8. **`GET /auth/me` returns 401 (not 200 with null)**: This is what makes `retry: false` on `useCurrentUser` work correctly — the query will error, not succeed with empty data

---

## Validation Checklist

- [x] Meets all system requirements (register, login, logout, protected routes)
- [x] Respects technical constraints (3-layer architecture, existing patterns)
- [x] Addresses non-functional requirements (bcrypt, HttpOnly, SameSite, p95 target unaffected)
- [x] Technically feasible with current constraints
- [x] Risks identified and acceptable
- [x] Complies with Guiding Principles in systemPatterns.md — no deviations
- [x] Respects established patterns (router factory, asyncHandler, AppError hierarchy, TanStack Query key factory)
- [x] Observability architecture defined (pino structured logging, no PII, existing traceId propagation)
- [x] Trace context propagation: session mounted after requestContext, so traceId is on req.log during session lifecycle
- [x] Logging strategy: pino only, structured, no PII
- [x] Metrics: existing HTTP metrics sufficient for MVP

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `SESSION_SECRET` not set in production | Medium | High | Fail-fast zod validation; documented in `.env.example`; min-length 32 enforced |
| `bcrypt` slows down test suite | Medium | Low | Use pre-hashed fixture in unit tests; only bcrypt in integration tests |
| `connect-pg-simple` `createTableIfMissing` fails on restricted DB user | Low | Medium | Document that DB user needs `CREATE TABLE` privilege; or provide an opt-in migration |
| Session-expiry mid-session shows stale UI briefly | Low | Low | `staleTime: 5_000` on `useCurrentUser` limits window; `removeQueries` on logout closes the most common path |
| `requireAuth` accidentally protecting health endpoint | Low | High | Health router registered before `requireAuth` in `routes/index.ts`; add a test asserting `/health` returns 200 without a cookie |

---

## Next Steps

1. **Phase 1 — Backend**: Migration → `UserRepository` → `AuthService` → `createAuthRouter` → `requireAuth` → session wiring in `createApp` → config additions
2. **Phase 2 — Frontend**: `CurrentUser` type → `fetchMe/login/logout/register` endpoints → `queryKeys.auth` → `useCurrentUser` / `useLogin` / `useLogout` hooks → `PrivateRoute` → `LoginPage` / `RegisterPage` → wire into `App.tsx`
3. **Phase 3 — Tests**: Backend unit (AuthService with mock repo), backend integration (auth routes via supertest with session cookie), frontend unit (hooks with mock query client), E2E (login flow)
