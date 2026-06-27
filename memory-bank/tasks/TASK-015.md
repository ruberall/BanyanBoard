# TASK-015: User Profile, Messaging, and Navigation Enhancements

**Complexity**: Level 3
**Status**: COMPLETE
**Archived**: memory-bank/archive/archive-TASK-015.md
**Completed**: 2026-06-27
**Roadmap**: FEAT-012
**Branch**: feature/FEAT-012-user-profile-messaging
**Worktree**: .claude-worktrees/FEAT-012

## Task Description

Five related enhancements to user profile storage, messaging, and navigation:

1. **Sign Out button**: Add a "Sign out" button in the upper-right corner of the initial screen (the Boards screen). When pressed, it calls the existing logout endpoint and navigates to the login page.

2. **User profile + messages schema**: Extend the `users` table with `first_name` (varchar 100) and `last_name` (varchar 100) columns. Add a new `messages` table with: `id` (PK), `message` (varchar 255), `created_at` (timestamptz default now()), `recipient_user_id` (FK → users.id).

3. **Register screen enhancements**: Add "First name" and "Last name" text fields to the existing Register new user form. When the user registers, persist first_name and last_name to the users table alongside email/password.

4. **Data migration**: For the one existing user, set first_name = 'Rebecca' and last_name = 'Uberall' via a one-time migration.

5. **Back button on Cards screen**: Add a "Back" button to the upper-left corner of the Board detail / Cards screen. When pressed, navigate to the Boards list screen.

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Individual Developer / Dev Team Lead — needs to manage sessions, maintain a clear identity in the app, and navigate between boards and cards without friction.
**Creative Exploration Needed**: No — all 5 sub-features have HIGH or MEDIUM confidence from codebase analysis; no novel UX decisions required.

---

### Sub-Feature 1: Sign Out Button

#### Invocation Method
- **Location**: `frontend/src/components/AppHeader/AppHeader.tsx` — the persistent header rendered by `PrivateRoute` around all authenticated routes. A "Sign out" button already exists in the upper-right of `AppHeader`, implemented via `useLogout` and styled with `styles.signOut`. **This sub-feature is already implemented.**
- **Element**: `<button type="button" className={styles.signOut}>Sign out</button>` — currently present at line 17–22 of `AppHeader.tsx`
- **Visibility**: Always visible on all authenticated pages (rendered by `PrivateRoute`)
- **Navigation**: From any authenticated page — header is always present
- **Confidence**: HIGH — `AppHeader.tsx` already renders a Sign out button that calls `useLogout`, which calls `POST /auth/logout` and navigates to `/login`. This sub-feature requires no implementation.

#### Success Criteria
- **User sees**: Header disappears; user is redirected to `/login`
- **Verifiable at**: Browser address bar shows `/login` after clicking Sign out
- **Data persisted**: Session row deleted from the `session` table (PostgreSQL)
- **Observable within**: Immediate (synchronous redirect after `POST /auth/logout` 200 response)

#### Acceptance Criteria

##### AC-S1-ENTRY-1: Sign out button is visible on Boards screen
**Priority**: MUST
**Given** a user is authenticated and on the Boards screen (`/`)
**When** they look at the upper-right of the page header
**Then** they see a "Sign out" button in the `AppHeader` component

##### AC-S1-HAPPY-1: User can sign out
**Priority**: MUST
**Given** a user is authenticated and on any private route
**When** they click the "Sign out" button in `AppHeader`
**Then** `POST /auth/logout` is called, the session is destroyed, and they are navigated to `/login`

##### AC-S1-ERROR-1: Sign out failure shows error
**Priority**: MUST
**Given** a user clicks "Sign out" and the server returns a non-2xx response
**When** the `useLogout` mutation rejects
**Then** an `ErrorBanner` with "Sign out failed. Please try again." is shown below the header, and the user remains on the current page

---

### Sub-Feature 2: User Profile + Messages Schema

#### Verification Method (DB Migration)
- **Migration tool**: node-pg-migrate — JS files in `backend/migrations/` named `<epoch-ms>_<description>.js` (see existing pattern in `backend/migrations/20260627120000_add-color-to-cards.js`)
- **New migration file**: `backend/migrations/<timestamp>_add-user-profile-and-messages.js`
- **Observable at**: PostgreSQL table introspection — `\d users` shows `first_name`, `last_name`; `\d messages` shows full schema
- **Verification frequency**: One-time on first `docker compose up --build` after migration is added
- **Confidence**: HIGH — node-pg-migrate pattern is well-established in the codebase

#### Success Criteria
- **Schema change verifiable at**: `backend/migrations/<timestamp>_add-user-profile-and-messages.js` — `up` function adds columns and creates table; `down` function reverses
- **users table**: `first_name VARCHAR(100) NULL`, `last_name VARCHAR(100) NULL` added via `ALTER TABLE`
- **messages table**: created with `id UUID PK DEFAULT gen_random_uuid()`, `message VARCHAR(255) NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `recipient_user_id UUID NOT NULL REFERENCES users(id)`
- **Observable within**: Immediate — migrations run on startup via `RUN_MIGRATIONS_ON_START=true`

#### Acceptance Criteria

##### AC-S2-VERIFY-1: users table has first_name and last_name columns
**Priority**: MUST
**Given** the migration has been applied
**When** `\d users` is run in psql
**Then** `first_name VARCHAR(100)` and `last_name VARCHAR(100)` columns exist, both nullable

##### AC-S2-VERIFY-2: messages table exists with correct schema
**Priority**: MUST
**Given** the migration has been applied
**When** `\d messages` is run in psql
**Then** columns `id UUID PK`, `message VARCHAR(255) NOT NULL`, `created_at TIMESTAMPTZ DEFAULT now()`, `recipient_user_id UUID NOT NULL FK→users.id` all exist

##### AC-S2-VERIFY-3: Migration is reversible
**Priority**: MUST
**Given** the migration has been applied
**When** the migration's `down` function is run
**Then** `first_name` and `last_name` are dropped from `users`, and the `messages` table is dropped

---

### Sub-Feature 3: Register Screen — First Name / Last Name Fields

#### Invocation Method
- **Location**: `frontend/src/pages/RegisterPage/RegisterPage.tsx` — the "Create Account" form, currently at `/register`. It has `email` and `password` fields using `<label>` + `<input>` with `id` attributes, controlled state via `useState`, and `useRegister` mutation.
- **Element**: Two new `<input type="text">` fields — "First name" (id=`first_name`) and "Last name" (id=`last_name`) — inserted before the email field, following the existing `<label htmlFor>` + `<input id>` pattern in `RegisterPage.tsx`
- **Visibility**: Always visible on the Register page
- **Navigation**: User navigates to `/register` from the login page link "Don't have an account? Register" or directly
- **Confidence**: HIGH — exact pattern found in `RegisterPage.tsx`; existing `<label>/<input>` pairs to follow

#### Backend Changes Required
- `registerSchema` in `backend/src/routes/auth.ts` — add `first_name: z.string().max(100).optional()` and `last_name: z.string().max(100).optional()` fields
- `UserRepository.createUser` in `backend/src/repositories/user.repository.ts` — add `first_name` and `last_name` parameters; update INSERT SQL and RETURNING clause
- `AuthService.register` in `backend/src/services/auth.service.ts` — pass `first_name` and `last_name` through to repository
- `PublicUser` type in `user.repository.ts` — add `first_name: string | null` and `last_name: string | null`
- `User` type in `frontend/src/types/index.ts` — add `first_name: string | null` and `last_name: string | null`
- `register` endpoint function in `frontend/src/api/endpoints.ts` — add `first_name` and `last_name` to the request body type
- **Confidence**: HIGH — all layers follow an established pattern; no novel design

#### Success Criteria
- **User sees**: "First name" and "Last name" text inputs on the Create Account form, above the email field
- **Verifiable at**: `GET /auth/me` response — `first_name` and `last_name` appear in the returned `PublicUser` after registration
- **Data persisted**: `users.first_name` and `users.last_name` columns (from Sub-Feature 2 migration)
- **Observable within**: Immediate — fields are present on form load; persisted synchronously on form submit

#### Acceptance Criteria

##### AC-S3-ENTRY-1: First and Last name fields appear on Register form
**Priority**: MUST
**Given** a user navigates to `/register`
**When** the Create Account form is displayed
**Then** "First name" and "Last name" labeled inputs are visible, with `id="first_name"` and `id="last_name"` respectively

##### AC-S3-HAPPY-1: User registers with first and last name
**Priority**: MUST
**Given** a user is on the Create Account form
**When** they complete:
  1. Enter "Jane" in the First name field
  2. Enter "Doe" in the Last name field
  3. Enter a valid email in the Email field
  4. Enter a valid password (≥ 8 chars) in the Password field
  5. Click "Create Account"
**Then** `POST /auth/register` is called with `{ first_name: "Jane", last_name: "Doe", email, password }`, the request returns `201 PublicUser` with `first_name: "Jane"` and `last_name: "Doe"`, and the user is navigated to `/`

##### AC-S3-HAPPY-2: User can register without first and last name (optional fields)
**Priority**: MUST
**Given** a user is on the Create Account form
**When** they leave First name and Last name blank and submit with only email + password
**Then** registration succeeds; `users.first_name` and `users.last_name` are NULL in the database

##### AC-S3-VERIFY-1: Backend persists first_name and last_name
**Priority**: MUST
**Given** a user registered with first_name = "Jane" and last_name = "Doe"
**When** `GET /auth/me` is called in the same session
**Then** the response includes `{ first_name: "Jane", last_name: "Doe" }`

---

### Sub-Feature 4: Data Migration — Set Rebecca Uberall's Name

#### Verification Method
- **Migration tool**: node-pg-migrate — new JS migration file in `backend/migrations/`
- **New migration file**: `backend/migrations/<timestamp>_seed-existing-user-name.js`
- **Migration logic**: `UPDATE users SET first_name = 'Rebecca', last_name = 'Uberall' WHERE email = 'rebecca.uberall@netcomm.net'`
- **Observable at**: `SELECT first_name, last_name FROM users WHERE email = 'rebecca.uberall@netcomm.net'` returns `Rebecca | Uberall`
- **Verification frequency**: One-time — idempotent if run again (UPDATE WHERE email = X is safe to re-run)
- **Confidence**: HIGH — same migration pattern as `backend/migrations/20260627120000_add-color-to-cards.js` which uses `pgm.sql()`; this migration must run AFTER the Sub-Feature 2 migration that adds the columns

#### Acceptance Criteria

##### AC-S4-VERIFY-1: Existing user has first_name and last_name set
**Priority**: MUST
**Given** both the schema migration (Sub-Feature 2) and the data migration have been applied
**When** `SELECT first_name, last_name FROM users WHERE email = 'rebecca.uberall@netcomm.net'` is run
**Then** the result is `first_name = 'Rebecca'` and `last_name = 'Uberall'`

##### AC-S4-VERIFY-2: Migration is reversible
**Priority**: MUST
**Given** the data migration has been applied
**When** the `down` function is run
**Then** `first_name` and `last_name` are set back to NULL for the affected user

---

### Sub-Feature 5: Back Button on Cards Screen

#### Invocation Method
- **Location**: `frontend/src/pages/BoardPage/BoardPage.tsx` — the `headingRow` div at line 117–120 currently contains `<h1 className={styles.heading}>{board.name}</h1>` and `<FilterBar>`. The Back button will be added to the upper-left of this row, before the `<h1>`.
- **Element**: A `<button>` or `<Link>` labelled "Back" or "← Back" placed at the start (left) of `styles.headingRow` in `BoardPage.tsx`. React Router v6's `useNavigate()` hook (already available in the codebase via `useNavigate` from `react-router-dom`) or a `<Link to="/">` will handle navigation to `/` (Boards list).
- **Visibility**: Always visible on the Board detail / Cards screen (`/boards/:boardId`)
- **Navigation**: User is on `BoardPage` (`/boards/:boardId`); pressing Back navigates to `BoardListPage` (`/`)
- **Confidence**: HIGH — `BoardPage.tsx` layout is clear; React Router `useNavigate` or `<Link>` pattern is used in `RegisterPage.tsx` (line 63: `<Link to="/login">`)

#### Success Criteria
- **User sees**: A "Back" button/link in the upper-left of the board heading row on `BoardPage`
- **Verifiable at**: After clicking Back, browser address bar changes to `/` and `BoardListPage` is rendered
- **Data persisted**: No data change — navigation only
- **Observable within**: Immediate (client-side routing)

#### Acceptance Criteria

##### AC-S5-ENTRY-1: Back button is visible on Cards screen
**Priority**: MUST
**Given** a user is authenticated and on the Board detail page (`/boards/:boardId`)
**When** the page has loaded successfully (board data displayed)
**Then** a "Back" button is visible in the upper-left of the heading row (before the board name `<h1>`)

##### AC-S5-HAPPY-1: Back button navigates to Boards list
**Priority**: MUST
**Given** a user is on the Board detail page (`/boards/:boardId`)
**When** they click the "Back" button
**Then** they are navigated to `/` (the Boards list — `BoardListPage`) via React Router, without a full page reload

##### AC-S5-A11Y-1: Back button is keyboard accessible
**Priority**: MUST
**Given** a user is on the Board detail page
**When** they Tab to the Back button and press Enter
**Then** navigation to `/` occurs (consistent with WCAG 2.1 AA keyboard navigation requirement in productBrief.md)

---

### Scope Boundaries

- **In scope**:
  - Sign out button in `AppHeader` — already implemented; no change needed
  - DB migration: `ALTER TABLE users ADD COLUMN first_name/last_name` + `CREATE TABLE messages`
  - DB migration: `UPDATE users SET first_name/last_name` for the one existing user
  - Register form UI: add First name + Last name fields (optional, not required)
  - Backend register route, auth service, user repository: accept and persist first_name + last_name
  - `PublicUser` type (backend) and `User` type (frontend) extended with `first_name`/`last_name`
  - Back button on `BoardPage` — upper-left of heading row, navigates to `/`

- **Out of scope**:
  - Displaying first_name/last_name anywhere in the UI beyond what is needed for registration (e.g., no profile page, no name shown in header)
  - Any CRUD API for the `messages` table — the schema is created but no routes, services, or repository for messages are required in this task
  - Edit profile / change name flow for existing users
  - Making first_name or last_name required on the Register form
  - Any changes to the Login page
  - Board-level permissions or member invitation (separate feature)

- **Dependencies**:
  - Sub-Feature 3 and Sub-Feature 4 both depend on Sub-Feature 2 migration being applied first (columns must exist before data is inserted/updated)
  - Migration execution order is guaranteed by the `<epoch-ms>` filename prefix — Sub-Feature 4 migration filename must have a later timestamp than Sub-Feature 2

- **NFR implications**:
  - Security: `first_name` and `last_name` are PII — must not appear in log entries (systemPatterns.md Guiding Principle 9)
  - Accessibility: Back button must be keyboard-navigable (WCAG 2.1 AA — productBrief.md)
  - Performance: No impact on p95 API response time; migrations run once on startup

### Creative Exploration Needed

Specification is concrete — proceed to implementation planning.

## Test Strategy

### Approach
- **Emphasis**: Balanced — unit + integration (backend), unit (frontend), E2E (happy paths)
- **Target test count**: 20–24 across all phases

### File Organization
- **New test files**:
  - `backend/src/repositories/__tests__/user.repository.test.ts` — extend with `createUser` first_name/last_name params (or add to existing if present)
  - `backend/src/routes/__tests__/auth.routes.test.ts` — extend with register + /auth/me name tests
  - `frontend/src/pages/RegisterPage/RegisterPage.test.tsx` — new, covers name field visibility and form submit
  - `frontend/src/pages/BoardPage/BoardPage.test.tsx` — extend with Back button visibility and click navigation
  - `frontend/e2e/auth.spec.ts` — extend with register-with-names E2E test
  - `frontend/e2e/board-page.spec.ts` — extend with Back button E2E test
- **Extend existing**: auth routes test, board-page E2E, user repository test

### What NOT to Test
- The `messages` table schema via unit test — covered by migration integration test pattern; no app code touches it in this task
- Sign out button rendering — already tested in existing `AppHeader` tests; AC-S1 is verified by existing E2E auth suite
- React Router internals — trust framework; assert navigation outcome only

### Per-Phase Test Guidance
- Phase 1 (8–10 tests):
  - Repository: `createUser` with first_name/last_name, without (NULL), partial; `getMe` returns names
  - Route: `POST /auth/register` with names persists to DB; `GET /auth/me` returns first_name/last_name; register without names succeeds
- Phase 2 (8–10 tests):
  - RegisterPage: First name and Last name inputs are present; form submit passes names; omitting names still succeeds
  - BoardPage: Back button renders; clicking it calls navigate to `/`
- Phase 3 (4 E2E tests):
  - Register with first_name + last_name → navigate to `/` → GET /auth/me returns correct names
  - Register without names → succeeds (null fields)
  - BoardPage Back button → navigates to Boards list `/`

## Implementation Roadmap

- [x] Phase 1: DB Migrations + Backend Plumbing
- [x] Phase 2: Frontend — Register Form Fields + Back Button
- [x] Phase 3: E2E Tests

### Phase 1: DB Migrations + Backend Plumbing

**Deliverables**:
1. `backend/migrations/<epoch>_add-user-profile-and-messages.js`
   - `up`: `ALTER TABLE users ADD COLUMN first_name VARCHAR(100)`, `ADD COLUMN last_name VARCHAR(100)` (both NULL); `CREATE TABLE messages (id uuid PK, message VARCHAR(255) NOT NULL, created_at timestamptz DEFAULT now(), recipient_user_id uuid NOT NULL FK→users ON DELETE CASCADE)`
   - `down`: `DROP TABLE messages`, `ALTER TABLE users DROP COLUMN first_name, DROP COLUMN last_name`
2. `backend/migrations/<epoch+1>_seed-existing-user-name.js`
   - `up`: `pgm.sql("UPDATE users SET first_name = 'Rebecca', last_name = 'Uberall' WHERE email = 'rebecca.uberall@netcomm.net'")`
   - `down`: `pgm.sql("UPDATE users SET first_name = NULL, last_name = NULL WHERE email = 'rebecca.uberall@netcomm.net'")`
3. `backend/src/repositories/user.repository.ts`
   - `PublicUser` type: add `first_name: string | null`, `last_name: string | null`
   - `UserRepository.createUser(email, passwordHash, firstName?, lastName?)`: update SQL INSERT to include columns conditionally; update `RETURNING` clause
4. `backend/src/services/auth.service.ts`
   - `AuthService.register(email, password, firstName?, lastName?)`: pass through to `createUser`
5. `backend/src/routes/auth.ts`
   - `registerSchema`: add `first_name: z.string().max(100).optional()`, `last_name: z.string().max(100).optional()`
   - Call `authService.register(email, password, first_name, last_name)` in POST /register handler

**Tests (Phase 1)**:
- `user.repository.test.ts`: createUser with names, without names (null), partial
- `auth.routes.test.ts`: register with names → 201 with first_name/last_name; register without → 201 with null; GET /auth/me → returns first_name/last_name

### Phase 2: Frontend — Register Form Fields + Back Button

**Deliverables**:
1. `frontend/src/types/index.ts`
   - `User` type: add `first_name: string | null`, `last_name: string | null`
2. `frontend/src/api/endpoints.ts`
   - `registerUser` function: add optional `first_name?: string`, `last_name?: string` to request body
3. `frontend/src/hooks/useRegister.ts` (if it constructs the payload)
   - Thread `first_name` and `last_name` through to `registerUser`
4. `frontend/src/pages/RegisterPage/RegisterPage.tsx`
   - Add `firstName` and `lastName` controlled state (via `useState`)
   - Add `<label htmlFor="first_name">First name</label>` + `<input type="text" id="first_name">` before the email field
   - Add `<label htmlFor="last_name">Last name</label>` + `<input type="text" id="last_name">` before the email field
   - Pass values to `useRegister` mutation on submit
5. `frontend/src/pages/BoardPage/BoardPage.tsx`
   - Import `useNavigate` from `react-router-dom` (or use `<Link>`)
   - Add `<button onClick={() => navigate('/')}>← Back</button>` (or `<Link to="/">← Back</Link>`) at the start of the `headingRow` div, before the `<h1>`
   - Style in `BoardPage.module.css` — left-aligned, consistent with existing heading row spacing

**Tests (Phase 2)**:
- `RegisterPage.test.tsx`: first_name/last_name inputs visible; submit with values; submit without values (still succeeds)
- `BoardPage.test.tsx`: Back button renders; click triggers navigation to `/`

### Phase 3: E2E Tests

**Deliverables**:
1. Extend `frontend/e2e/auth.spec.ts`:
   - AC-S3-HAPPY-1: Register with first + last name → navigate to `/` → call `GET /auth/me` → assert `first_name`/`last_name` in response
   - AC-S3-HAPPY-2: Register without names → succeeds, no form error
2. Extend `frontend/e2e/board-page.spec.ts`:
   - AC-S5-HAPPY-1: Navigate to `/boards/:boardId` → Back button visible → click → assert on `/`

## Creative Phases

None required — all sub-features have HIGH confidence in codebase analysis.

---

## Execution State

**Build Status**: RUNNING
**Current Build**: REFLECT (TASK-015)
**Build Started**: 2026-06-27
**Phase Number**: 3 of 3
**Is Multi-Phase**: YES
**Latest Commit**: a8627a7
**Can Resume**: NO

### Current Build Step
**Step**: ARCHIVE COMPLETE
**Status**: COMPLETE

### Completed Steps
- Phase 1 COMPLETE (2026-06-27) - Commit cd672b9 - DB migrations + backend plumbing
- Phase 2 COMPLETE (2026-06-27) - Commit 3038503 - Frontend register form fields + back button
- Phase 3 COMPLETE (2026-06-27) - Commit a8627a7 - E2E tests for names + Back button
- Reflect COMPLETE (2026-06-27) - Reflection document + 4 pattern extractions
- Archive COMPLETE (2026-06-27) - Task archived; merged to main

### Active Sub-Agents
- (none)

### Resumption Notes
**Can Resume**: NO
**Build Status**: IDLE
**Current Phase**: COMPLETE
