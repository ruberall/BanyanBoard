# TASK-011: User Authentication

**Complexity**: Level 3 (inherited from FEAT-006)
**Status**: CREATIVE_COMPLETE
**Roadmap**: FEAT-006
**Branch**: feature/FEAT-006-user-authentication
**Worktree**: N/A

## Task Description

Session-based auth for the Express API. Register and login with email + password (bcrypt). Express-session with PostgreSQL session store. Auth middleware protecting all board/card routes. React login/register pages and session state management on the frontend. Users DB schema and migration.

---

## Specification

**Feature Type**: End-User Feature (with NFR/Infrastructure layer — session store, auth middleware)
**Primary Persona**: Dev Team Lead / Individual Developer — any authenticated user who needs to access their boards
**Creative Exploration Needed**: Yes — see "Creative Phases Needed" section below

---

### Invocation Method

#### Registration
- **Location**: New page `/register` — `frontend/src/pages/RegisterPage/RegisterPage.tsx` (to be created, following `BoardListPage` pattern)
- **Element**: Email input + Password input + "Create Account" submit button
- **Visibility**: Public — accessible without a session; redirect to `/` if already logged in
- **Navigation**: Link from `/login` page ("Don't have an account? Register")
- **Confidence**: MEDIUM — page structure inferred from existing `BoardListPage` and `NotFoundPage` patterns; exact component markup needs creative exploration for form layout and error display

#### Login
- **Location**: New page `/login` — `frontend/src/pages/LoginPage/LoginPage.tsx` (to be created)
- **Element**: Email input + Password input + "Log in" submit button
- **Visibility**: Public — redirect to `/` if already logged in; unauthenticated users on protected routes redirect here
- **Navigation**: App entry point when no session exists (redirect from `/`); direct URL `/login`
- **Confidence**: MEDIUM — same rationale as Register

#### Logout
- **Location**: Persistent in the app shell — top of every page once authenticated
- **Element**: "Log out" button or link (exact placement: LOW confidence — needs creative decision on header/nav vs. board list page)
- **Visibility**: Authenticated users only
- **Confidence**: LOW — no shared app shell / nav component currently exists in `frontend/src/`; this is a new architectural element

#### Protected Routes
- **Behavior**: All routes except `/login` and `/register` redirect unauthenticated users to `/login`
- **Implementation**: `PrivateRoute` wrapper component or `AuthGuard` around the `<Routes>` in `App.tsx`
- **Confidence**: MEDIUM — React Router v6 pattern is well-established; exact component name / placement needs creative decision

---

### Success Criteria

#### Registration
- **User sees**: Redirect to `/` (board list) immediately after successful registration; user is logged in automatically
- **Verifiable at**: Browser URL bar (`/`), board list renders with no "Not logged in" banner
- **Data persisted**: `users` table — `id` (uuid), `email` (unique), `password_hash` (bcrypt), `created_at`; session row in `sessions` table (connect-pg-simple)
- **Observable within**: Immediate (synchronous HTTP round-trip)

#### Login
- **User sees**: Redirect to `/` (board list) on success; `ErrorBanner` with "Invalid email or password" on failure
- **Verifiable at**: Browser URL bar (`/`) on success; `role="alert"` message on failure
- **Data persisted**: Session row in `sessions` table
- **Observable within**: Immediate

#### Logout
- **User sees**: Redirect to `/login` immediately; subsequent navigation to `/` redirects back to `/login`
- **Verifiable at**: Browser URL bar (`/login`)
- **Data persisted**: Session row deleted from `sessions` table
- **Observable within**: Immediate

#### Auth Protection
- **User sees**: Redirect to `/login?next=<original-path>` when navigating to a protected route unauthenticated (LOW confidence: `?next=` param is optional for MVP — flag for creative)
- **API behavior**: `GET /boards`, `GET /boards/:id`, `POST /boards`, `DELETE /boards/:id`, all `/columns/*` and `/cards/*` routes return `401 { error: "UNAUTHORIZED", message: "Unauthorized" }` when no valid session cookie is present

---

### Acceptance Criteria

#### AC-ENTRY-1: Unauthenticated user is redirected to login
**Priority**: MUST
**Given** the user has no active session
**When** they navigate to `/` or `/boards/:boardId`
**Then** the app redirects them to `/login` and they see the login form

#### AC-ENTRY-2: Authenticated user can navigate to the app
**Priority**: MUST
**Given** the user has an active session cookie
**When** they navigate to `/`
**Then** the board list renders without a redirect

#### AC-HAPPY-1: User registers with a new email
**Priority**: MUST
**Given** the user is on `/register`
**When** they:
  1. Enter a valid email (e.g., `user@example.com`) in the email field
  2. Enter a password of at least 8 characters
  3. Submit the "Create Account" form
**Then**:
  - A new row exists in the `users` table with the provided email and a bcrypt hash
  - The user's session is created (row in `sessions` table, `Set-Cookie` header with `HttpOnly` session cookie)
  - The frontend redirects to `/` and the board list renders

#### AC-HAPPY-2: Registered user can log in
**Priority**: MUST
**Given** the user has an existing account and is on `/login`
**When** they:
  1. Enter their registered email
  2. Enter their correct password
  3. Submit the "Log in" form
**Then**:
  - The API returns `200` with `{ id, email }` (no password hash)
  - A session cookie is set
  - The frontend redirects to `/`

#### AC-HAPPY-3: Authenticated user can log out
**Priority**: MUST
**Given** the user is authenticated and the logout control is visible
**When** they activate the logout control
**Then**:
  - `POST /auth/logout` is called
  - The session is destroyed server-side (row removed from `sessions` table)
  - The session cookie is cleared (`Set-Cookie: sid=; Max-Age=0`)
  - The frontend redirects to `/login`

#### AC-HAPPY-4: Authenticated user can access board/card routes
**Priority**: MUST
**Given** the user is authenticated (valid session cookie)
**When** they call `GET /boards`
**Then** the API returns `200` with the boards list (not `401`)

#### AC-ERROR-1: Registration with duplicate email
**Priority**: MUST
**Given** the user is on `/register` and the email is already registered
**When** they submit the registration form with the duplicate email
**Then**:
  - The API returns `409 { error: "CONFLICT", message: "Email already registered" }`
  - The frontend displays `ErrorBanner` with message "Email already registered"
  - The form remains filled; user can correct and resubmit

#### AC-ERROR-2: Login with wrong credentials
**Priority**: MUST
**Given** the user is on `/login`
**When** they submit with an email that does not exist or a wrong password
**Then**:
  - The API returns `401 { error: "UNAUTHORIZED", message: "Invalid email or password" }` (same message for both cases — no email enumeration)
  - The frontend displays `ErrorBanner` with message "Invalid email or password"

#### AC-ERROR-3: Registration with invalid password
**Priority**: MUST
**Given** the user is on `/register`
**When** they submit a password shorter than 8 characters
**Then**:
  - The API returns `400 { error: "VALIDATION_ERROR", message: "password must be at least 8 characters" }`
  - The frontend displays `ErrorBanner` with the validation message

#### AC-ERROR-4: Registration with invalid email format
**Priority**: MUST
**Given** the user is on `/register`
**When** they submit an invalid email (e.g., `notanemail`)
**Then**:
  - The API returns `400 { error: "VALIDATION_ERROR", message: "email must be a valid email address" }`
  - The frontend displays `ErrorBanner` with the validation message

#### AC-AUTH-1: Unauthenticated request to protected API route
**Priority**: MUST
**Given** no session cookie is present
**When** the client calls `GET /boards`, `POST /boards`, `DELETE /boards/:id`, `GET /boards/:id`, `GET /columns/:id/cards`, `POST /columns/:id/cards`, `GET /cards/:id`, `PATCH /cards/:id`, `PATCH /cards/:id/move`, or `DELETE /cards/:id`
**Then** the API returns `401 { error: "UNAUTHORIZED", message: "Unauthorized" }`

#### AC-AUTH-2: Session persists across page reload
**Priority**: MUST
**Given** the user has logged in and the browser holds the session cookie
**When** they reload the page
**Then** they remain on the board list (not redirected to `/login`)

#### AC-AUTH-3: Session expiry redirects to login
**Priority**: SHOULD
**Given** the server session has expired or been manually deleted
**When** the frontend makes a request that receives `401`
**Then** the `request<T>()` client in `frontend/src/api/client.ts` redirects to `/login` (or surfaces an auth-specific error)
**Confidence**: LOW — exact 401-intercept pattern in the fetch client needs creative decision (global interceptor vs. per-query error handler)

---

### Scope Boundaries

#### In Scope
- `users` DB table + migration (email, password_hash, created_at, updated_at)
- `sessions` DB table managed by `connect-pg-simple` (auto-created on startup)
- `POST /auth/register` — create user, auto-login, return `{ id, email }`
- `POST /auth/login` — verify credentials, create session, return `{ id, email }`
- `POST /auth/logout` — destroy session
- `GET /auth/me` — return current user from session (for frontend session hydration on page load)
- Auth middleware `requireAuth` applied to all `/boards`, `/columns`, `/cards` routes
- `SESSION_SECRET` env var added to `config.ts` and `docker-compose.yml`
- `SESSION_COOKIE_MAX_AGE_MS` env var (optional, default 7 days)
- `frontend/src/pages/LoginPage/` — new page component
- `frontend/src/pages/RegisterPage/` — new page component
- `frontend/src/context/AuthContext.tsx` (or equivalent) — session state (currentUser, loading, login, logout, register)
- `PrivateRoute` wrapper protecting all routes except `/login` and `/register`
- 401 intercept in `frontend/src/api/client.ts` — redirect to `/login` on auth failure
- New query key `queryKeys.auth.me` in `frontend/src/api/queryKeys.ts`

#### Out of Scope
- OAuth / social login (not in MVP)
- "Forgot password" / password reset flow
- Email verification
- Board-level member permissions (invite/share) — separate future feature
- Remember-me / "keep me logged in" toggle
- CSRF protection (acceptable risk for MVP self-hosted on localhost; flag as future hardening)
- Rate limiting on auth endpoints
- HTTPS / TLS (handled at reverse proxy, not in Express app)

#### Dependencies
- `express-session` npm package (backend)
- `connect-pg-simple` npm package (backend) — PostgreSQL session store
- `bcrypt` npm package (backend) — password hashing
- `@types/express-session`, `@types/connect-pg-simple`, `@types/bcrypt` (dev deps)
- Existing `pg.Pool` from `backend/src/db/pool.ts` — reused for session store connection
- Existing `AppError` hierarchy (`UnauthorizedError`, `ConflictError`, `ValidationError`) in `backend/src/errors.ts`
- Existing `asyncHandler` in `backend/src/lib/asyncHandler.ts`
- Existing `ErrorBanner` component in `frontend/src/components/common/ErrorBanner/`
- Existing `request<T>()` transport in `frontend/src/api/client.ts`

#### NFR Implications
- **Security**: Passwords hashed with bcrypt (cost factor ≥ 10). Session cookie `HttpOnly: true`, `SameSite: lax`, `Secure: true` in production (`NODE_ENV === 'production'`). No password hash ever returned in API responses.
- **Performance**: bcrypt comparison adds ~100ms per login — p95 login < 500ms is acceptable (not subject to the 200ms general CRUD target)
- **Accessibility**: Login and register forms must have proper `<label>` elements, focus management on error, and `role="alert"` on error banners (already provided by `ErrorBanner`)
- **Privacy**: No PII logged — email must not appear in structured log fields (`req.log`)

---

### Creative Phases Needed

This is a Level 3 feature. Two creative phases are required before implementation:

#### 1. User Journey Design
Questions requiring creative exploration:
- **Logout placement**: No shared app shell exists. Options: (a) add a persistent `AppHeader` component wrapping all pages; (b) add logout to `BoardListPage` header only; (c) floating logout button. Which aligns with the minimal BanyanBoard aesthetic?
- **Post-login redirect**: After login, redirect to `/` (always) or to the original `?next=` URL the user was trying to reach? `?next=` is friendlier UX but adds implementation complexity.
- **Auto-login after register**: Register → auto-login → redirect to `/` is the smoothest flow. Any reason to require a separate login step after registration?
- **Session hydration on load**: `GET /auth/me` called on app startup (in `main.tsx` or `AuthContext`) to check if the user is already logged in — this prevents a flash-of-login-redirect. What loading state should the app show while this check is in flight?
- **401 intercept strategy**: When any API call returns 401 (expired session), should we: (a) add a global response interceptor in `client.ts`; (b) add `onError` in `QueryClient` defaults; or (c) handle per-page? Option (a) is cleanest but needs careful implementation to avoid redirect loops.

#### 2. Architecture Design
Questions requiring creative exploration:
- **Session state storage on frontend**: Options: (a) React Context (`AuthContext`) with `useReducer`; (b) Zustand store; (c) TanStack Query `useQuery` for `GET /auth/me` as the single source of truth. The project already uses TanStack Query — option (c) avoids a separate state layer but has subtle invalidation implications.
- **`requireAuth` middleware placement**: Apply in `routes/index.ts` as a group middleware before all domain routers, OR apply per-router inside each router factory. Group placement in `index.ts` is simpler and less error-prone.
- **Session store initialization**: `connect-pg-simple` needs the same `pg.Pool`. It should receive the pool from `createApp` deps — confirm `AppDeps` interface extension needed.
- **Config additions**: `SESSION_SECRET` (required, fail-fast at startup), `SESSION_COOKIE_MAX_AGE_MS` (optional, default `604800000` — 7 days), `SESSION_SECURE` (optional, default `NODE_ENV === 'production'`). All must go through `config.ts` zod schema.

---

### Implementation Roadmap

**Phase 1 — Backend Auth Foundation** ✅ COMPLETE (2026-06-17)
- `users` DB migration: `id` (uuid PK), `email` (varchar 255, unique, not null), `password_hash` (varchar 255, not null), `created_at`, `updated_at`
- `UserRepository` (`backend/src/repositories/user.repository.ts`): `findByEmail`, `create`, `findById`
- `AuthService` (`backend/src/services/auth.service.ts`): `register(email, password)`, `login(email, password)`, `getCurrentUser(userId)`
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` routes (`backend/src/routes/auth.ts`)
- `SESSION_SECRET` + session config added to `config.ts` and `docker-compose.yml`
- `express-session` + `connect-pg-simple` wired into `createApp` in `app.ts`
- `requireAuth` middleware (`backend/src/middleware/requireAuth.ts`) applied in `routes/index.ts` before domain routers
- Tests: `UserRepository` unit tests (mock `Queryable`), `AuthService` unit tests, auth route integration tests (supertest)

**Phase 2 — Frontend Auth Shell** ✅ COMPLETE (2026-06-17)
- `AuthContext` (`frontend/src/context/AuthContext.tsx`) with `currentUser`, `isLoading`, `login`, `logout`, `register` — backed by `GET /auth/me` via TanStack Query
- `LoginPage` (`frontend/src/pages/LoginPage/`)
- `RegisterPage` (`frontend/src/pages/RegisterPage/`)
- `PrivateRoute` component protecting all existing routes in `App.tsx`
- Auth API endpoints in `frontend/src/api/endpoints.ts`: `loginUser`, `registerUser`, `logoutUser`, `getCurrentUser`
- `queryKeys.auth` added to `frontend/src/api/queryKeys.ts`
- 401 intercept in `frontend/src/api/client.ts`
- New route entries in `App.tsx`: `/login`, `/register`
- Tests: `LoginPage` and `RegisterPage` component tests (form submit, error display), `AuthContext` unit tests

**Phase 3 — Integration & Docker Compose Wiring**
- `SESSION_SECRET` env var added to `docker-compose.yml` `api` service
- Verify `connect-pg-simple` creates `sessions` table on first startup (schema auto-creation via `createTableIfMissing: true`)
- End-to-end smoke test: full register → login → access `/boards` → logout flow
- Update `backend/src/config.ts` `Config` type and zod schema with new session fields
- Update `frontend/src/types/index.ts` with `User` type (`{ id: string; email: string }`)
- `CORS_ORIGINS` already set in `docker-compose.yml`; add `credentials: true` to `corsMiddleware` in `backend/src/middleware/cors.ts`

**Phase 4 — E2E & Hardening**
- Playwright E2E tests covering: register → redirect to boards, login → access boards, logout → redirect to login, unauthenticated access → redirect to login, API returns 401 without session
- Security checklist: bcrypt cost factor 10+, `HttpOnly` cookie, no hash in response, no email in logs
- Accessibility: label/input associations on auth forms, focus on error, axe-core clean

---

### Test Strategy

**Emphasis**: Auth is security-critical. Every happy path and error path must have a test. No untested code paths in auth middleware or session handling.

**Target count**: ~30–40 backend tests, ~15–20 frontend component tests

**File Organization**:
```
backend/src/
├── repositories/__tests__/user.repository.test.ts   (unit — mock Queryable)
├── services/__tests__/auth.service.test.ts           (unit — mock UserRepository)
├── middleware/__tests__/requireAuth.test.ts          (unit — mock req/res/next)
├── routes/__tests__/auth.routes.test.ts              (supertest integration — mock pool)
└── __tests__/auth.integration.test.ts               (real DB — register/login/logout lifecycle)

frontend/src/
├── pages/LoginPage/LoginPage.test.tsx               (Vitest/jsdom — form render, submit, error)
├── pages/RegisterPage/RegisterPage.test.tsx         (Vitest/jsdom — form render, submit, error)
└── context/__tests__/AuthContext.test.tsx           (Vitest/jsdom — state transitions)
```

**Key test scenarios (must-have)**:
- `UserRepository.findByEmail` returns null for unknown email
- `AuthService.register` throws `ConflictError` on duplicate email
- `AuthService.login` throws `UnauthorizedError` for wrong password (same message for missing user)
- `requireAuth` calls `next(UnauthorizedError)` when `req.session.userId` is absent
- `requireAuth` calls `next()` (passes) when `req.session.userId` is present
- `POST /auth/register` with duplicate email returns `409`
- `POST /auth/login` with wrong password returns `401` with generic message (no email enumeration)
- `POST /auth/logout` destroys session and returns `200`
- `GET /boards` without session returns `401`
- `GET /boards` with session returns `200`
- `LoginPage`: shows `ErrorBanner` with "Invalid email or password" on 401 response
- `RegisterPage`: shows `ErrorBanner` with "Email already registered" on 409 response
- `PrivateRoute`: renders children when authenticated, redirects to `/login` when not

**Patterns to follow**:
- Backend: existing supertest pattern in `backend/src/routes/__tests__/boards.routes.test.ts` (inject stub pool, create app via `createApp`)
- Frontend: existing component test pattern in `frontend/src/pages/BoardListPage/BoardListPage.test.tsx`
- DB integration tests: `describeIfDb` pattern from `systemPatterns.md`

---

### Observability Requirements

Following CLAUDE.md observability standards:

- **No `console.log`** in auth routes, service, or middleware — use `req.log` (pino child logger)
- **No sensitive data in logs**: email address must NOT appear in any log field; password/hash must NEVER be logged
- **Structured log events**:
  - `info` on successful register: `{ event: "user.registered", userId }` (no email)
  - `info` on successful login: `{ event: "user.login", userId }` (no email)
  - `info` on logout: `{ event: "user.logout", userId }`
  - `warn` on failed login attempt: `{ event: "auth.failed" }` (no email — prevents log-based enumeration)
  - `warn` in `requireAuth` when rejecting: `{ event: "auth.unauthorized", path: req.path }`
- **Trace context**: `requestId` and `traceId` already injected via `requestContext` middleware — no additional work needed for auth routes

---

### API Requirements

New endpoints (all under `/auth` prefix, mounted in `routes/index.ts`):

| Method | Path | Auth Required | Request Body | Success Response | Error Responses |
|--------|------|---------------|--------------|------------------|-----------------|
| `POST` | `/auth/register` | No | `{ email: string, password: string }` | `201 { id, email }` | `400` (validation), `409` (duplicate email) |
| `POST` | `/auth/login` | No | `{ email: string, password: string }` | `200 { id, email }` | `401` (invalid credentials) |
| `POST` | `/auth/logout` | Yes (no-op if not logged in) | (none) | `200 {}` | — |
| `GET` | `/auth/me` | Yes | (none) | `200 { id, email }` | `401` (no session) |

**Session cookie behavior**:
- Name: `sid` (configurable via `SESSION_COOKIE_NAME` env var — LOW confidence, may simplify to hardcoded `sid` for MVP)
- `HttpOnly: true`
- `SameSite: lax`
- `Secure`: `true` when `NODE_ENV === 'production'`
- `maxAge`: `SESSION_COOKIE_MAX_AGE_MS` (default 7 days)

**CORS change required**:
- `backend/src/middleware/cors.ts` must add `credentials: true` to allow cookies cross-origin (frontend on `:5173` calling API on `:3000`)
- `frontend/src/api/client.ts` `fetch` call must include `credentials: 'include'`

---

## Execution State

**Build Status**: RUNNING
**Current Build**: Phase 2: Frontend Auth Shell (TASK-011)
**Build Started**: 2026-06-17
**Phase Number**: 1 of 4
**Is Multi-Phase**: YES

### Current Build Step
**Step**: Phase 2 COMPLETE
**Status**: COMPLETE
**Completed**: 2026-06-17

### Completed Steps
- Creative: User Journey Design COMPLETE (2026-06-17)
- Creative: Architecture Design COMPLETE (2026-06-17)
- Step 0.5 Git Setup: COMPLETE (2026-06-17) - On branch feature/FEAT-006-user-authentication
- Step 1 Read Task Context: COMPLETE (2026-06-17) - Phase 1: Backend Auth Foundation (1 of 4)
- Step 2 Load Context: COMPLETE (2026-06-17) - Level 3 rules loaded

### Sub-Agents
- Test Writer Agent: COMPLETE (2026-06-17) - 36 tests in 4 files
- Coding Agent: COMPLETE (2026-06-17) - All 36 auth tests passing
- Code Reviewer: COMPLETE (2026-06-17) - APPROVED after fixes
- Documentation Agent: COMPLETE (2026-06-17) - techContext, systemPatterns, productBrief updated

### Resumption Notes
**Can Resume**: YES
**Resume From**: Step 3 - Test Writer Agent
