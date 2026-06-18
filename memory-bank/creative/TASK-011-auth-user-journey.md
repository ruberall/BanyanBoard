# User Journey Design: User Authentication

**Created**: 2026-06-17
**Status**: DECIDED
**Decision Type**: User Journey

## Journey Overview

**Feature**: Session-based authentication — register, login, logout, protected routes, session hydration, and 401 handling
**Primary Persona**: Individual Developer / Dev Team Lead — small team member accessing their boards
**Journey Type**: Synchronous
**Orchestration Pattern**: Single Screen (login/register forms); Global Shell (logout); Global Interceptor (401 handling)

### Success Statement
> A returning developer navigates to `/`, is seamlessly redirected to `/login` if unauthenticated, logs in with username and password in under 5 seconds, and lands on their board list without any extra steps.

---

## Persona Context

### Primary User
- **Who**: Individual Developer (IC contributor on a small team)
- **Goal**: Get to their boards as quickly as possible; authentication is friction to minimize
- **Context**: Opens BanyanBoard on localhost or team server; may leave a tab open for days
- **Proficiency**: High — comfortable with standard web auth patterns (login/register forms, sessions)

### Secondary Users
- **Who**: Dev Team Lead, Freelancer
- **Different needs**: Same flow; team lead may open multiple boards across tabs, making session expiry more noticeable

---

## Design Questions — Analysis and Decisions

### Q1: Logout Placement

**Options explored:**

**Option A — Persistent AppHeader wrapping all authenticated pages**
Add a `<AppHeader>` component rendered by a `<ProtectedRoute>` wrapper. Contains app name + logout button. All authenticated pages sit inside this shell.
- Pro: Standard web pattern; logout always discoverable; sets up nav for future features (e.g., profile, notifications)
- Pro: Single implementation point; consistent across BoardListPage and BoardPage
- Con: Adds visual chrome to a minimal aesthetic; requires updating both existing pages
- Con: Slightly more implementation — new component + CSS

**Option B — Logout button on BoardListPage only**
Add logout button directly to `BoardListPage` header area. BoardPage has no logout.
- Pro: Minimal; only one page to change
- Con: Logout not available while viewing a board — user must navigate back
- Con: Inconsistent UX; loses logout access mid-workflow

**Option C — Floating logout button (position: fixed)**
Overlay a small logout button (e.g., top-right corner) on all pages via a React portal or fixed-position CSS.
- Pro: Available everywhere without modifying page layouts
- Con: Visually intrusive; hard to style consistently; accessibility concerns with fixed overlays; non-standard pattern

**Decision: Option A — Persistent AppHeader**

Rationale: BanyanBoard is a multi-page app that will grow. Establishing a shared app shell now is the correct architectural move. A minimal `AppHeader` — just app name + logout link — adds very little visual weight and is consistent with the "simple but not broken" aesthetic. Option B creates a confusing hole (no logout on BoardPage). Option C is a hack.

---

### Q2: Post-Login Redirect

**Options explored:**

**Option A — Always redirect to `/` after login**
Simple, predictable, no state required.
- Pro: Zero complexity; no `?next=` param to sanitize or validate
- Con: User navigating to `/boards/42` while unauthenticated lands on `/` after login, not `/boards/42` — extra click

**Option B — Redirect to `?next=` URL after login**
Store the originally-requested path in a `?next=` query param, restore after login.
- Pro: Seamless UX for deep-link bookmarks; important for team-shared board links
- Con: Must validate `next` against same-origin to prevent open redirects
- Con: Marginally more implementation

**Decision: Option B — `?next=` redirect**

Rationale: BanyanBoard's key collaboration pattern is sharing board URLs with teammates. If a teammate clicks a shared `/boards/42` link while unauthenticated, they should land on board 42 after login — not be forced to find it again. The open-redirect risk is low and easily mitigated by validating that `next` starts with `/`. AC-ENTRY-1 validates this.

---

### Q3: Auto-Login After Register

**Options explored:**

**Option A — Register → auto-login → redirect to `/`**
After successful `POST /auth/register`, the server sets a session cookie and returns the user object. No separate login step.
- Pro: Fewer steps; AC-HAPPY-1 explicitly requires this
- Pro: Standard modern pattern (matches Trello, Linear, GitHub)
- Con: Slightly more server-side coupling between register and session creation (acceptable)

**Option B — Register → redirect to login → manual login**
User sees "Account created! Please log in." and is redirected to `/login`.
- Pro: Slightly simpler server implementation (register and login are fully separate)
- Con: Unnecessary friction; user just proved their identity by creating the account
- Con: Contradicts AC-HAPPY-1

**Decision: Option A — Auto-login after register**

Rationale: AC-HAPPY-1 mandates this. It is also the correct UX — requiring a second login after registration is pointless friction for a developer tool.

---

### Q4: Session Hydration Loading State

**Options explored:**

**Option A — Full-page spinner while `GET /auth/me` is in flight**
App renders a centered `<LoadingSpinner>` until session check resolves. Then either renders the route or redirects to `/login`.
- Pro: Simple; no partial renders; matches existing `LoadingSpinner` usage in `BoardListPage`
- Pro: Prevents flash of unauthenticated content (board list flashing then disappearing)
- Con: Adds ~50–200ms perceived latency on every app load

**Option B — Render nothing (null) while hydrating**
Return `null` from `ProtectedRoute` during the in-flight check.
- Pro: No spinner flash on fast connections
- Con: App appears frozen; worse on slow connections; screen readers see empty page

**Option C — Skeleton/placeholder content**
Show a skeleton of the page being loaded.
- Pro: Feels faster
- Con: Overcomplicated for MVP; not worth implementing before we have a design system

**Decision: Option A — Full-page spinner**

Rationale: The existing codebase already uses `<LoadingSpinner label="..." />` for async states (`BoardListPage` uses it for board loading). Consistency beats micro-optimization for MVP. The hydration check is a localhost API call — p95 < 200ms — so the spinner will rarely be visible. This also prevents unauthenticated content flash.

---

### Q5: 401 Intercept Strategy

**Options explored:**

**Option A — Global interceptor in `client.ts`**
In the `request<T>()` function, detect `res.status === 401` and call a global `onUnauthorized()` handler (navigating to `/login`).
- Pro: Single implementation point; all API calls covered automatically
- Pro: No per-page handling needed
- Con: `client.ts` must gain a dependency on navigation (React Router's `navigate`); this is a slight architecture concern (non-React module importing React Router)
- Mitigation: Use a module-level callback registered at app startup (`setUnauthorizedHandler(fn)`), or use `window.location.href` as a simple escape hatch

**Option B — `onError` in QueryClient defaults**
Configure TanStack Query's `QueryClient` with a global `onError` handler that checks for `ApiError` with `status === 401`.
- Pro: React-idiomatic; handler runs in React context; easy access to navigation hooks
- Pro: Covers all query and mutation errors in one place
- Con: Only covers TanStack Query calls; if `request()` is ever called outside Query, it won't be caught
- Con: TanStack Query v5 changed global `onError` handling (moved to `MutationCache`/`QueryCache` callbacks)

**Option C — Handle per-page**
Each page's `useQuery`/`useMutation` error handler checks for 401 and navigates.
- Pro: Explicit and easy to test per-page
- Con: Repetitive; easy to miss; inconsistent behavior across pages

**Decision: Option B — `onError` in QueryClient defaults (QueryCache + MutationCache)**

Rationale: For an app that uses TanStack Query for all data fetching, the QueryClient's cache-level error handlers are the most idiomatic and complete solution. In TanStack Query v5, `QueryCache` and `MutationCache` constructors accept an `onError` callback with full access to the error. Registering a single 401 handler here covers all queries and mutations. The client.ts fetch wrapper throws `ApiError` with the status code, so detection is clean: `if (error instanceof ApiError && error.status === 401)`. Navigation is achieved by calling `router.navigate('/login')` — the `router` instance is created before `QueryClient` in `main.tsx` and can be passed in.

---

## Journey Map

### Entry Points

| Entry | Context | User Intent |
|-------|---------|-------------|
| Direct URL `/` | Bookmark, team link, app startup | Open board list |
| Direct URL `/boards/:id` | Shared board link from a teammate | View a specific board |
| `/login` direct nav | Explicit login intent | Sign in |
| `/register` link | New user | Create account |

### State Diagram

```
[App Startup: ProtectedRoute mounts]
    │
    ├──[GET /auth/me in flight]──▶ [Loading: Full-page spinner]
    │
    ▼
[Auth Check Result]
    │
    ├──[Authenticated]──────────────▶ [Render requested route]
    │
    └──[Unauthenticated / 401]──────▶ [Redirect to /login?next=<original-path>]
                                            │
                                            ▼
                               ┌────────────────────────┐
                               │     /login page         │
                               │  Email + Password form  │
                               └────────────────────────┘
                                            │
                               ┌────────────┴────────────┐
                               │                         │
                    [Login success]             [Register link clicked]
                               │                         │
                               ▼                         ▼
                    [Redirect to ?next or /]     /register page
                               │              (Name + Email + Password)
                    [AppHeader + page renders]           │
                                              [POST /auth/register]
                                                         │
                                              [Auto-login: session set]
                                                         │
                                              [Redirect to /]
                                                         │
                                              [AppHeader + BoardListPage]


[Any page: API call returns 401 (expired session)]
    │
    ▼
[QueryCache/MutationCache onError fires]
    │
    ▼
[Navigate to /login (no ?next= preservation — simplicity)]
    │
    ▼
[User logs in → redirect to /]


[Authenticated user clicks Logout in AppHeader]
    │
    ▼
[POST /auth/logout]
    │
    ▼
[Clear query cache]
    │
    ▼
[Navigate to /login]
```

---

## Step-by-Step Journeys

### Journey 1: Unauthenticated User Accessing a Protected Route

#### Step 1: Route Resolution
- **System**: React Router + `ProtectedRoute` wrapper
- **User Sees**: Full-page spinner with accessible label "Loading…"
- **User Actions**: None (automatic)
- **Feedback**: Spinner visible immediately
- **Transitions**: `GET /auth/me` completes → either render route or redirect
- **Data Flow**: `useAuthSession()` hook fires `GET /auth/me`

#### Step 2: Session Check Returns 401/Unauthenticated
- **System**: `ProtectedRoute` receives `isAuthenticated: false`
- **User Sees**: Redirect — browser navigates to `/login?next=/boards/42`
- **User Actions**: None (automatic redirect)
- **Feedback**: URL changes; login page appears
- **Data Flow**: `?next=` param captures the originally-requested path

#### Step 3: Login Page
- **System**: `LoginPage` component
- **User Sees**: Centered card with BanyanBoard name, email/username field, password field, "Sign in" button, "Don't have an account? Register" link
- **User Actions**: Enter credentials, submit form
- **Feedback**: Submit button shows loading state while `POST /auth/login` is in flight; inline error shown on failure
- **Transitions**: Successful login → redirect to `?next` path (or `/` if no `?next`)
- **Data Flow**: `POST /auth/login { username, password }` → `{ user: {...} }` + session cookie

#### Step 4: Authenticated Route Renders
- **System**: `ProtectedRoute` confirms authenticated; renders `AppHeader` + requested page
- **User Sees**: AppHeader (app name + logout) + board list or board page
- **Value Delivered**: User can work with boards

---

### Journey 2: New User Registration

#### Step 1: Register Link
- **System**: `LoginPage`
- **User Sees**: "Don't have an account? Register" link
- **User Actions**: Clicks link
- **Transitions**: Navigate to `/register`

#### Step 2: Register Page
- **System**: `RegisterPage` component
- **User Sees**: Centered card with username field, email field, password field, confirm-password field, "Create account" button, "Already have an account? Sign in" link
- **User Actions**: Fill form, submit
- **Feedback**: Submit button loading state; inline validation errors (password mismatch, required fields); server-side errors (username taken) shown via `ErrorBanner`
- **Transitions**: Successful `POST /auth/register` → auto-login → redirect to `/`
- **Data Flow**: `POST /auth/register { username, email, password }` → server creates user + sets session → returns `{ user: {...} }`

#### Step 3: Auto-Login Redirect
- **System**: `RegisterPage` on success
- **User Sees**: Transition to `/` — AppHeader + empty board list with "No boards yet"
- **Value Delivered**: User is in; can create their first board immediately

---

### Journey 3: Returning User Login (Happy Path)

#### Step 1: Navigate to `/login`
- **User Sees**: Login form (centered card)

#### Step 2: Enter Credentials and Submit
- **User Sees**: Loading state on "Sign in" button
- **Data Flow**: `POST /auth/login { username, password }`

#### Step 3: Redirect to `/` (or `?next`)
- **User Sees**: AppHeader + board list (their boards)
- **Value Delivered**: User is back at their workspace in < 5 seconds

---

### Journey 4: Logout

#### Step 1: Click "Sign out" in AppHeader
- **System**: `AppHeader`
- **User Sees**: AppHeader with "Sign out" button/link (right side)
- **User Actions**: Clicks "Sign out"
- **Feedback**: Immediate — no confirmation dialog needed (data is not deleted; session only)

#### Step 2: Session Cleared
- **System**: `POST /auth/logout` fires; QueryClient cache is cleared via `queryClient.clear()`
- **User Sees**: Brief loading or immediate redirect
- **Transitions**: Navigate to `/login`

#### Step 3: Login Page
- **User Sees**: Login form — clean state, no pre-filled credentials
- **Value Delivered**: Session is cleanly terminated; no stale data accessible

---

### Journey 5: Session Expiry (401 Mid-Session)

#### Step 1: User Performs an Action
- **System**: Any page making an API call (e.g., loading board, creating card)
- **User Sees**: Normal page; action initiated

#### Step 2: API Returns 401
- **System**: `request<T>()` throws `ApiError(401, ...)`; TanStack Query `QueryCache.onError` fires

#### Step 3: Redirect to Login
- **System**: 401 handler calls `router.navigate('/login')`
- **User Sees**: Login page — no `?next=` preservation (session expired mid-action; restoring partial state is unsafe)
- **Feedback**: No error toast needed — the redirect to login is self-explanatory. If desired, a brief banner can say "Your session has expired."

#### Step 4: Re-Login
- Same as Journey 3, Step 2 onward
- After re-login, user lands on `/` and navigates back to where they were

---

## System Architecture

### New Components / Modules

| Component | Type | Purpose |
|-----------|------|---------|
| `ProtectedRoute` | React component | Wraps authenticated routes; checks session; redirects to `/login?next=` if not |
| `AppHeader` | React component | Persistent header with app name + Sign out button; rendered inside `ProtectedRoute` |
| `LoginPage` | React page | `/login` route — username/password form |
| `RegisterPage` | React page | `/register` route — registration form |
| `useAuthSession` | TanStack Query hook | `GET /auth/me` — hydrates session on startup |
| `useLogin` | TanStack Query mutation | `POST /auth/login` |
| `useLogout` | TanStack Query mutation | `POST /auth/logout` |
| `useRegister` | TanStack Query mutation | `POST /auth/register` |
| `AuthContext` | React context | Provides `{ user, isAuthenticated, isLoading }` to the tree |

### Routing Structure (After Implementation)

```tsx
// App.tsx
<Routes>
  {/* Public routes */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  {/* Protected routes — wrapped in ProtectedRoute */}
  <Route element={<ProtectedRoute />}>
    <Route path="/" element={<BoardListPage />} />
    <Route path="/boards/:boardId" element={<BoardPage />} />
  </Route>

  <Route path="*" element={<NotFoundPage />} />
</Routes>
```

`ProtectedRoute` uses React Router's `<Outlet>` pattern and renders `<AppHeader>` above the outlet.

### 401 Intercept Implementation

```tsx
// In main.tsx (pseudo-code, not final)
const router = createBrowserRouter(...)  // or use BrowserRouter navigate ref

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.clear()
        router.navigate('/login')
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.clear()
        router.navigate('/login')
      }
    },
  }),
})
```

Note: React Router v6's `createBrowserRouter` returns a router with a `.navigate()` method accessible outside React, which avoids the hook-in-non-component problem.

### Responsibility Matrix

| Step | Owner | State Storage | Failure Handling |
|------|-------|---------------|------------------|
| Session hydration | `useAuthSession` + `ProtectedRoute` | React context + server session | 401 → redirect to login |
| Login | `LoginPage` + `useLogin` | Server session cookie | 401/403 → inline error message |
| Register | `RegisterPage` + `useRegister` | Server session cookie | 400 (conflict) → inline "Username taken" |
| Logout | `AppHeader` + `useLogout` | Client clears query cache | Error → still clear cache + redirect |
| 401 mid-session | QueryCache/MutationCache onError | — | Clear cache + navigate to /login |
| Protected route | `ProtectedRoute` | `AuthContext` | Loading → spinner; unauthenticated → redirect |

---

## Error Handling

| Error Type | When | User Sees | Recovery |
|------------|------|-----------|----------|
| Wrong credentials (401) | POST /auth/login | Inline: "Invalid username or password" | Re-enter credentials |
| Username taken (409) | POST /auth/register | Inline via ErrorBanner: "Username already taken" | Change username |
| Password mismatch | Register form validation | Inline field error: "Passwords do not match" | Fix before submit |
| Required field empty | Login/Register submit | Inline field error: "This field is required" (HTML5 `required` attribute sufficient for MVP) | Fill field |
| Network error (status 0) | Any API call | ErrorBanner: "Cannot reach server. Check your connection." | Retry |
| Expired session (401) | Any authenticated API call | Redirect to /login (session expired message optional) | Re-login |
| Logout fails | POST /auth/logout | Silently clear client state + redirect regardless — server-side session expiry is acceptable | User lands on login page; session will expire naturally |

---

## Options Explored (Summary Matrix)

For reference — the five design questions and their evaluated options:

| Question | Option A | Option B | Option C | Decision |
|----------|----------|----------|----------|----------|
| Logout placement | AppHeader (shell) ✓ | BoardListPage only | Floating button | **A** |
| Post-login redirect | Always `/` | `?next=` URL ✓ | — | **B** |
| Auto-login after register | Auto-login ✓ | Require separate login | — | **A** |
| Session hydration state | Full-page spinner ✓ | null/empty | Skeleton | **A** |
| 401 intercept | client.ts global | QueryClient cache ✓ | Per-page | **B** |

---

## Evaluation Matrix

| Criterion | Chosen Design | Notes |
|-----------|---------------|-------|
| Discoverability | H | Logout always in AppHeader; login/register linked |
| Learnability | H | Standard web auth patterns; no novelty |
| Efficiency | H | `?next=` redirect; auto-login after register |
| Error Prevention | H | Inline validation; required fields |
| Error Recovery | H | Clear inline errors; retry always available |
| Feedback | H | Spinner during hydration; loading on submit buttons |
| Consistency | H | AppHeader consistent across all pages; spinner matches existing usage |
| Accessibility | M | WCAG 2.1 AA target; keyboard nav; focus management on redirect (to verify in UAT) |
| Delight | M | Minimal; functional; matches BanyanBoard's no-bloat ethos |

---

## Acceptance Criteria

### AC-ENTRY-1: Unauthenticated user is redirected to login
**Priority**: MUST

**Given** an unauthenticated user (no valid session cookie)
**When** they navigate to `/` or `/boards/:id`
**Then**:
- Browser redirects to `/login?next=<original-path>`
- Login page is displayed
- Original path is preserved in the `?next=` query param

**Verification**:
- [ ] E2E: GET `/` without session → 302 to `/login?next=/`
- [ ] E2E: GET `/boards/42` without session → 302 to `/login?next=/boards/42`
- [ ] E2E: `?next=` param visible in URL

---

### AC-ENTRY-2: Authenticated user accesses board list
**Priority**: MUST

**Given** an authenticated user with a valid session
**When** they navigate to `/`
**Then**:
- Board list renders (AppHeader + BoardListPage)
- No redirect to `/login`

**Verification**:
- [ ] E2E: GET `/` with valid session → board list renders
- [ ] E2E: AppHeader with Sign out visible

---

### AC-HAPPY-1: New user registers and is auto-logged in
**Priority**: MUST

**Given** a user on `/register`
**When** they:
1. Enter a unique username
2. Enter an email address
3. Enter a password (and confirm it)
4. Click "Create account"
**Then**:
- User is automatically logged in (session cookie set)
- User is redirected to `/`
- Board list renders (empty: "No boards yet")
- AppHeader shows Sign out

**Verification**:
- [ ] E2E: Complete registration flow → lands on `/`
- [ ] Integration: Session cookie present after register
- [ ] E2E: AppHeader visible after register

---

### AC-HAPPY-2: Returning user logs in and reaches board list
**Priority**: MUST

**Given** a registered user on `/login`
**When** they enter valid credentials and click "Sign in"
**Then**:
- User is redirected to `/` (or `?next=` path)
- Board list (or the `?next=` page) renders
- AppHeader visible

**Verification**:
- [ ] E2E: Login with valid credentials → `/`
- [ ] E2E: Login with `?next=/boards/42` → `/boards/42`
- [ ] Integration: Session cookie present

---

### AC-HAPPY-3: Authenticated user logs out
**Priority**: MUST

**Given** an authenticated user on any page
**When** they click "Sign out" in AppHeader
**Then**:
- User is redirected to `/login`
- Session cookie is cleared
- Navigating to `/` redirects back to `/login` (session gone)

**Verification**:
- [ ] E2E: Click Sign out → `/login`
- [ ] E2E: After logout, GET `/` redirects to `/login`
- [ ] Integration: Session cookie absent after logout

---

### AC-AUTH-3: Expired session (401) redirects to login
**Priority**: MUST

**Given** an authenticated user with an expired or invalidated session
**When** any API call returns 401
**Then**:
- User is redirected to `/login`
- Query cache is cleared (no stale data shown)

**Verification**:
- [ ] E2E: Mock 401 from API → redirect to `/login`
- [ ] Unit: QueryCache onError fires navigate('/login') on ApiError(401)

---

### AC-ERROR-1: Invalid login credentials
**Priority**: MUST

**Given** a user on `/login`
**When** they submit with wrong username or password
**Then**:
- Error message appears: "Invalid username or password"
- Form is not cleared (user can correct credentials)
- User remains on `/login`

**Verification**:
- [ ] E2E: Submit wrong credentials → error message visible
- [ ] E2E: Form fields retain entered values

---

### AC-ERROR-2: Duplicate username on register
**Priority**: MUST

**Given** a user on `/register`
**When** they submit with a username that already exists
**Then**:
- ErrorBanner shows: "Username already taken. Please choose another."
- User remains on `/register`
- Form fields retain entered values (except password)

**Verification**:
- [ ] E2E: Register with existing username → ErrorBanner visible
- [ ] E2E: Form not cleared

---

### AC-ERROR-3: Network error during login
**Priority**: MUST

**Given** a user on `/login`
**When** the API is unreachable (network error / `ApiError(0, ...)`)
**Then**:
- ErrorBanner shows: "Cannot reach server. Check your connection."
- User can retry without page refresh

**Verification**:
- [ ] E2E: Mock network failure → ErrorBanner visible
- [ ] E2E: Retry submitting works when network is restored

---

## Test Scenarios

### Happy Path Tests
1. **AC-ENTRY-1**: Unauthenticated nav to `/` → redirect to `/login?next=/`
2. **AC-ENTRY-1**: Unauthenticated nav to `/boards/42` → redirect to `/login?next=/boards/42`
3. **AC-ENTRY-2**: Authenticated nav to `/` → board list renders
4. **AC-HAPPY-1**: Full registration flow → auto-login → `/`
5. **AC-HAPPY-2**: Login → `/`
6. **AC-HAPPY-2**: Login with `?next=/boards/42` → `/boards/42`
7. **AC-HAPPY-3**: Logout → `/login` → subsequent nav to `/` redirects again

### Error Scenario Tests
1. **AC-ERROR-1**: Wrong password → inline error, form not cleared
2. **AC-ERROR-2**: Duplicate username → ErrorBanner
3. **AC-ERROR-3**: Network error → ErrorBanner
4. **AC-AUTH-3**: Mock 401 from API → redirect to `/login`

### Session / State Tests
1. Session hydration: app startup with valid cookie → no redirect
2. Session hydration: app startup with no cookie → redirect to login
3. Logout clears cache: after logout, query cache is empty

---

## Accessibility Checklist

- [ ] Keyboard navigation: Tab order through login/register forms is logical; submit on Enter
- [ ] Screen reader: Form labels explicitly associated with inputs (`<label htmlFor>` or `aria-label`)
- [ ] Focus management: After redirect to `/login`, focus set to first input field
- [ ] Error announcements: `aria-live="polite"` region for inline errors and ErrorBanner
- [ ] Loading states: Submit button `aria-busy="true"` or `disabled` during in-flight requests
- [ ] AppHeader: Sign out button/link has descriptive label (not just icon)
- [ ] No time limits without extension option (session expiry does not trigger a timer in the UI)

---

## Analytics & Observability

### Key Metrics
| Metric | Purpose | Target |
|--------|---------|--------|
| Login success rate | Auth reliability | > 95% |
| Registration completion rate | Onboarding funnel | > 80% |
| Session expiry redirects per user/day | Session duration signal | < 1/day (sessions are long-lived) |
| Time from login page to board list | Efficiency | < 5 seconds |

### Instrumentation Points
- Login success/failure (structured log on API: `auth.login.success`, `auth.login.failure`)
- Register success/failure (`auth.register.success`, `auth.register.failure`)
- Logout (`auth.logout`)
- 401 redirect (`auth.session_expired`)

---

## Implementation Guidelines

### Frontend Requirements
1. **`AuthContext`** — React context providing `{ user: User | null, isAuthenticated: boolean, isLoading: boolean, refetchSession: () => void }`
2. **`useAuthSession`** — `useQuery` wrapping `GET /auth/me`; `staleTime: Infinity`, `retry: false`
3. **`ProtectedRoute`** — reads from `AuthContext`; renders spinner while `isLoading`; redirects with `?next=` when `!isAuthenticated`; renders `<AppHeader><Outlet /></AppHeader>` when authenticated
4. **`AppHeader`** — minimal: BanyanBoard wordmark (left) + "Sign out" button (right); fixed height ~48px; no nav links for MVP
5. **`LoginPage`** — username + password form; `useLogin` mutation; reads `?next=` from `useSearchParams`; links to `/register`
6. **`RegisterPage`** — username + email + password + confirm-password form; `useRegister` mutation; client-side password-match validation; links to `/login`
7. **`useLogin` / `useLogout` / `useRegister`** — TanStack Query mutations; on success, call `queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })` to refresh `AuthContext`
8. **QueryClient 401 handler** — `QueryCache` + `MutationCache` `onError` callbacks in `main.tsx`; detect `ApiError.status === 401`; call `queryClient.clear()` + navigate to `/login`
9. **`client.ts`** — no changes needed; already throws `ApiError` with status code

### Backend Requirements
1. `POST /auth/register` — creates user, sets session cookie, returns `{ user }`
2. `POST /auth/login` — validates credentials, sets session cookie, returns `{ user }`
3. `POST /auth/logout` — clears session cookie, returns 204
4. `GET /auth/me` — returns `{ user }` if session valid; 401 if not
5. Session middleware applied to all protected routes (all routes except `/auth/*`)
6. Session: use `express-session` with PostgreSQL session store (`connect-pg-simple`)

### Integration Points
| System | Interface | Data Exchanged |
|--------|-----------|----------------|
| Express API | HTTP + session cookie | Credentials on login/register; user object on /auth/me |
| PostgreSQL | pg session store | Session data (via connect-pg-simple) |
| TanStack Query | QueryCache/MutationCache | Error objects (ApiError) triggering 401 handler |
| React Router v6 | createBrowserRouter | router.navigate('/login') from 401 handler |

---

## Validation Checklist

- [x] Journey delivers stated value (users can access their boards after authentication)
- [x] All personas can complete journey (standard form-based auth; no specialist knowledge required)
- [x] Errors are recoverable (inline errors, retry available)
- [x] Async states are clear (spinner during session hydration; loading on submit buttons)
- [x] Consistent with existing patterns (uses `LoadingSpinner`, `ErrorBanner`; matches page structure of `BoardListPage`)
- [x] Accessible per requirements (checklist above targets WCAG 2.1 AA)
- [x] Testable with defined scenarios (acceptance criteria cover all critical paths)

---

## Next Steps

1. **Build Phase 1 — Backend auth endpoints**: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` with session middleware and PostgreSQL session store
2. **Build Phase 2 — Frontend auth infrastructure**: `AuthContext`, `useAuthSession`, `ProtectedRoute`, `AppHeader`, QueryClient 401 handler wired in `main.tsx`
3. **Build Phase 3 — Login and Register pages**: `LoginPage`, `RegisterPage` with form handling and mutation hooks
4. **Build Phase 4 — Integration and routing**: Update `App.tsx` with public/protected route split; wire `?next=` redirect on login
5. **UAT**: Walk all six journeys in a real browser; verify redirect flows, session cookie behavior, error states
