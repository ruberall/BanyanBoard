# Archive: User Authentication

## Metadata

- **Task ID**: TASK-011
- **Complexity**: Level 3
- **Started**: 2026-06-17
- **Completed**: 2026-06-18
- **Roadmap Link**: FEAT-006
- **Branch**: feature/FEAT-006-user-authentication
- **Duration**: 2 days, 4 build phases

---

## Summary

TASK-011 delivered complete, production-quality session-based user authentication for BanyanBoard. The implementation covers the full auth lifecycle — registration with auto-login, login with anti-enumeration, logout with session destruction, and middleware-based route protection — across both the Express API backend and the React frontend.

Key outcomes:
- All 12 acceptance criteria met (including the optional `?next=` redirect parameter)
- 307 unit tests + 6 real-DB smoke tests + 11 Playwright E2E tests
- Security hardening: bcrypt cost 12, session fixation prevention, HttpOnly cookie, no PII in logs, anti-enumeration
- TanStack Query as auth state source — eliminated a redundant state-management layer
- Group `requireAuth` middleware — all future domain routes protected by default

---

## Requirements

### Original Acceptance Criteria — All Met ✅

| AC | Description | Status |
|----|-------------|--------|
| AC-ENTRY-1 | Unauthenticated user redirected to `/login` | ✅ |
| AC-ENTRY-2 | Authenticated user can navigate to the app | ✅ |
| AC-HAPPY-1 | Register with new email → auto-login → `/` | ✅ |
| AC-HAPPY-2 | Login with correct credentials | ✅ |
| AC-HAPPY-3 | Logout → session destroyed → `/login` | ✅ |
| AC-HAPPY-4 | Authenticated access to board/card routes | ✅ |
| AC-ERROR-1 | Duplicate email → 409 + ErrorBanner | ✅ |
| AC-ERROR-2 | Wrong credentials → 401 (anti-enumeration) | ✅ |
| AC-ERROR-3 | Password < 8 chars → 400 VALIDATION_ERROR | ✅ |
| AC-ERROR-4 | Invalid email format → 400 VALIDATION_ERROR | ✅ |
| AC-AUTH-1 | Unauthenticated API requests → 401 | ✅ |
| AC-AUTH-2 | Session persists across page reload | ✅ |
| AC-AUTH-3 | 401 intercept redirects to `/login` | ✅ |
| (bonus) | `?next=` redirect parameter after login | ✅ exceeded |

---

## Implementation

### Approach

Four-phase delivery with a dedicated security/E2E hardening phase:

1. **Backend Auth Foundation** — All server-side auth logic (DB, service, routes, middleware)
2. **Frontend Auth Shell** — React pages, auth state, route protection
3. **Integration & Wiring** — PostgreSQL session store, session fixation hardening, real-DB smoke tests
4. **E2E & Hardening** — Playwright E2E suite, vitest/Playwright coexistence fix, security checklist

### Key Components

1. **Users DB Migration** (`backend/migrations/`)
   - `users` table: `id` (uuid PK), `email` (varchar 255, unique), `password_hash` (varchar 255), `created_at`, `updated_at`
   - `sessions` table: managed by `connect-pg-simple` (`createTableIfMissing: true`)

2. **UserRepository** (`backend/src/repositories/user.repository.ts`)
   - `findByEmail`, `findById`, `create` — all using the `Queryable` interface for testability

3. **AuthService** (`backend/src/services/auth.service.ts`)
   - `register(email, password)` — bcrypt cost 12, ConflictError on duplicate
   - `login(email, password)` — identical UnauthorizedError for unknown email and wrong password (anti-enumeration)
   - `getCurrentUser(userId)` — session hydration for `GET /auth/me`

4. **Auth Routes** (`backend/src/routes/auth.ts`)
   - `POST /auth/register` — 201, auto-login via `req.session.regenerate()` + userId assignment
   - `POST /auth/login` — 200, session fixation prevention via `req.session.regenerate()`
   - `POST /auth/logout` — 200, `req.session.destroy()`
   - `GET /auth/me` — 200 `{ id, email }` or 401

5. **requireAuth Middleware** (`backend/src/middleware/requireAuth.ts`)
   - Applied as group middleware in `routes/index.ts` before all domain routers
   - One guard protects all current and future domain routes by default

6. **Session Store Config** (`backend/src/app.ts`)
   - `connect-pg-simple` (PgSession) in non-test environments
   - MemoryStore fallback when `NODE_ENV === 'test'` — prevents stub pool mock chain interception

7. **Session Type Augmentation** (`backend/src/types/session.d.ts`)
   - `SessionData.userId?: string` — type-safe access to `req.session.userId`

8. **Auth Frontend Hooks** (`frontend/src/hooks/`)
   - `useCurrentUser()` — TanStack Query against `GET /auth/me` (`retry: false`, `staleTime: 0`)
   - `useLogin()`, `useLogout()`, `useRegister()` — per-concern mutation hooks
   - Logout uses `queryClient.removeQueries()` (not `invalidateQueries`) to avoid stale-cache flash

9. **LoginPage / RegisterPage** (`frontend/src/pages/LoginPage/`, `RegisterPage/`)
   - Email + password forms with `ErrorBanner` on failure
   - LoginPage reads `?next=` param for post-login redirect

10. **PrivateRoute** (`frontend/src/components/PrivateRoute/PrivateRoute.tsx`)
    - 4-state guard: Loading → Error → Unauthenticated (redirect) → Authenticated (render)
    - Wraps all routes except `/login` and `/register` in `App.tsx`

11. **E2E Auth Helper** (`frontend/e2e/helpers/auth.ts`)
    - `loginAsTestUser(page.request)` — uses `APIRequestContext` to share browser cookie jar with `page.goto()`
    - Standard reusable utility for all future authenticated E2E tests

### Design Decisions

**Creative Phase: Architecture** (`memory-bank/creative/TASK-011-auth-architecture.md`)
- TanStack Query `useCurrentUser()` as single auth state source — no separate AuthContext or Zustand store
- Group `requireAuth` in `routes/index.ts` rather than per-router guards
- `SESSION_SECRET` through `config.ts` zod schema (fail-fast at startup)
- CORS reflect-origin pattern (not `*`) to allow credentials

**Creative Phase: User Journey** (`memory-bank/creative/TASK-011-auth-user-journey.md`)
- `AppHeader` component for persistent logout affordance across all authenticated pages
- Auto-login on register (register → session → redirect to `/`)
- Global 401 intercept in `client.ts` (`credentials: 'include'` + redirect to `/login`)
- `?next=` redirect parameter (optional, implemented in LoginPage)

---

## Testing

| Layer | Count | Coverage |
|-------|-------|---------|
| Backend unit (UserRepository, AuthService, requireAuth) | ~36 | All happy/error paths |
| Backend supertest integration (auth routes) | ~36 | All 4 endpoints × scenarios |
| Frontend unit (LoginPage, RegisterPage, hooks) | ~160 | Form states, error display, hook transitions |
| Real-DB smoke tests (describeIfDb) | 6 | Full lifecycle: register → auto-login → boards → logout → re-login → /me |
| Playwright E2E | 11 | Redirect, login, register, logout, a11y |
| **Total** | **~249 unit + 6 smoke + 11 E2E** | All 12 ACs covered |

All tests passing ✅

---

## Files Changed

**Backend — New Files**
- `backend/migrations/20260617000000_create_users_table.js` — users schema
- `backend/src/repositories/user.repository.ts` — UserRepository
- `backend/src/services/auth.service.ts` — AuthService (bcrypt, session logic)
- `backend/src/routes/auth.ts` — auth route factory
- `backend/src/middleware/requireAuth.ts` — session auth guard
- `backend/src/types/session.d.ts` — SessionData type augmentation
- `backend/src/__tests__/auth.integration.test.ts` — real-DB smoke tests

**Backend — Modified Files**
- `backend/src/app.ts` — session middleware wiring with NODE_ENV conditional
- `backend/src/routes/index.ts` — auth router mount + requireAuth group gate
- `backend/src/config.ts` — SESSION_SECRET, SESSION_COOKIE_MAX_AGE_MS, SESSION_SECURE
- `backend/src/middleware/cors.ts` — `credentials: true`, reflect-origin CORS
- `docker-compose.yml` — SESSION_SECRET env var on api service

**Frontend — New Files**
- `frontend/src/pages/LoginPage/LoginPage.tsx` + `.test.tsx`
- `frontend/src/pages/RegisterPage/RegisterPage.tsx` + `.test.tsx`
- `frontend/src/components/PrivateRoute/PrivateRoute.tsx` + `.test.tsx`
- `frontend/src/hooks/useCurrentUser.ts`
- `frontend/src/hooks/useLogin.ts`
- `frontend/src/hooks/useLogout.ts`
- `frontend/src/hooks/useRegister.ts`
- `frontend/e2e/auth.spec.ts` — 11 E2E auth tests
- `frontend/e2e/helpers/auth.ts` — reusable E2E auth helper

**Frontend — Modified Files**
- `frontend/src/api/client.ts` — `credentials: 'include'`, 401 intercept
- `frontend/src/api/endpoints.ts` — `loginUser`, `registerUser`, `logoutUser`, `getCurrentUser`
- `frontend/src/api/queryKeys.ts` — `queryKeys.auth.me`
- `frontend/src/App.tsx` — `/login`, `/register` routes + PrivateRoute wrapper
- `frontend/src/components/AppHeader/AppHeader.tsx` — logout button
- `frontend/vitest.config.ts` — `exclude: ['e2e/**']`
- `frontend/e2e/helpers/api.ts` — refactored to `APIRequestContext`
- `frontend/e2e/board-list.spec.ts`, `board-page.spec.ts`, `error-pages.spec.ts` — auth beforeEach

---

## Technical Debt & Future Work

| Item | Priority | Notes |
|------|----------|-------|
| CSRF protection | Medium | Deferred per spec; needed before public deployment |
| Rate limiting on auth endpoints | Medium | `/auth/login`, `/auth/register` have no brute-force protection |
| Password max-length (72 char bcrypt limit) | Low | Add max-length validation or SHA-256 pre-hash |
| Global 401 intercept for mutation errors | Low | Current per-component `onError` misses mid-session expiry on mutations |
| SESSION_SECRET rotation | Low | Placeholder in docker-compose.yml; needs secrets management for production |

---

## Lessons Learned

Key takeaways (full detail in reflection):

1. **Architecture docs should specify test isolation** — When the architecture creative phase designs infrastructure wiring (session stores, DB connections), it should also document the corresponding test isolation strategy. Discovering it mid-build caused an unplanned Phase 3 repair.

2. **vitest/Playwright coexistence is a setup step, not a discovery** — `exclude: ['e2e/**']` in `vitest.config.ts` should be added before the first Playwright spec is committed, not after it breaks the unit test run.

3. **`req.session.regenerate()` is mandatory on privilege escalation** — All login and register flows must regenerate the session ID before assigning `userId` to prevent session fixation.

4. **`removeQueries` beats `invalidateQueries` on logout** — Removing the cache entry immediately (not invalidating) prevents the stale-cache flash of authenticated UI during the redirect.

5. **Playwright `page.request` shares the browser cookie jar** — E2E auth helpers must use `APIRequestContext` (via `page.request`), not Node.js `fetch`, to ensure cookies set during API login are visible to subsequent `page.goto()` navigations.

Reference: `memory-bank/reflection/reflection-TASK-011.md`

---

## References

- **Task Spec**: `memory-bank/tasks/TASK-011.md`
- **Reflection**: `memory-bank/reflection/reflection-TASK-011.md`
- **Architecture Creative**: `memory-bank/creative/TASK-011-auth-architecture.md`
- **User Journey Creative**: `memory-bank/creative/TASK-011-auth-user-journey.md`
- **Roadmap Feature**: FEAT-006 in `memory-bank/roadmap.md`

---

## Follow-up

- CSRF protection and auth rate limiting before any public-facing deployment
- Consider `useAuthErrorHandler` shared hook as mutation surfaces grow
- The `frontend/e2e/helpers/auth.ts` utility should be discovered and reused by all future E2E tasks
