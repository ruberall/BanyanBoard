# Archive: User Profile, Messaging, and Navigation Enhancements

## Metadata
- **Task ID**: TASK-015
- **Feature**: FEAT-012
- **Complexity**: Level 3
- **Started**: 2026-06-27
- **Completed**: 2026-06-27
- **Branch**: feature/FEAT-012-user-profile-messaging
- **Commits**: cd672b9 (Phase 1), 3038503 (Phase 2), a8627a7 (Phase 3)

## Summary

TASK-015 delivered five related enhancements to BanyanBoard: optional first/last name fields on the Register form, a backend schema extension (`first_name`/`last_name` on `users`, new `messages` table), a data seed migration for the existing user, and a Back button on `BoardPage`. Sub-feature 1 (Sign Out button) was already implemented and required no code changes.

All 12 acceptance criteria were met across the five sub-features. The three-phase structure cleanly isolated backend changes (Phase 1), frontend UI changes (Phase 2), and E2E verification (Phase 3), enabling conflict-free parallel type imports across phases.

## Requirements

### Original Requirements
1. Sign Out button in upper-right of Boards screen (pre-existing, no changes required)
2. Extend `users` table with `first_name` and `last_name`; add `messages` table with `message`, `created_at`, `recipient_user_id`
3. Add First name and Last name fields to the Register form; persist on signup
4. Seed existing user (Rebecca Uberall) with first/last name via migration
5. Add Back button to the upper-left of BoardPage; navigate to `/` on click

### Success Criteria
- [✓] `users` table has `first_name VARCHAR(100) NULL` and `last_name VARCHAR(100) NULL`
- [✓] `messages` table created with correct schema and FK to `users`
- [✓] Migrations are reversible (down functions correct)
- [✓] Register form shows First name and Last name inputs before Email
- [✓] Registering with names persists them; `GET /auth/me` returns `first_name`/`last_name`
- [✓] Registering without names succeeds; backend stores NULL (not empty string)
- [✓] Rebecca Uberall's existing record seeded with correct names
- [✓] Back button visible on `BoardPage`, keyboard-accessible, navigates to `/`

## Implementation

### Approach

Three-phase TDD approach. Backend changes first (migrations + service layer) so frontend could import updated types cleanly in Phase 2. E2E tests isolated in Phase 3 for lean test-writing context.

No creative phase was needed — all five sub-features had HIGH confidence from codebase analysis at planning time.

### Key Components

**Phase 1: DB Migrations + Backend Plumbing**

1. **Schema Migration** — `backend/migrations/20260627140000_add-user-profile-and-messages.js`
   - `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)` (NULL)
   - `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)` (NULL)
   - Creates `messages` table: `id UUID PK`, `message VARCHAR(255) NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `recipient_user_id UUID FK→users ON DELETE CASCADE`
   - Down: drops `messages`, drops columns in reverse order

2. **Seed Migration** — `backend/migrations/20260627140001_seed-existing-user-name.js`
   - `UPDATE users SET first_name = 'Rebecca', last_name = 'Uberall' WHERE email = 'rebecca.uberall@gmail.com'`
   - Down: resets to NULL

3. **Backend service + repository** — `backend/src/auth/user.repository.ts`, `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.routes.ts`
   - `createUser` extended with optional `firstName?`, `lastName?` parameters
   - All three query sites (`createUser`, `findByEmail`, `findById`) select `first_name`, `last_name`
   - `PublicUser` type extended: `first_name: string | null`, `last_name: string | null`
   - Registration Zod schema: `first_name: z.string().max(100).optional()`, `last_name: z.string().max(100).optional()`

**Phase 2: Frontend — Register Form + Back Button**

4. **Frontend types** — `frontend/src/types/index.ts`
   - `User` type: `first_name: string | null`, `last_name: string | null`

5. **RegisterPage** — `frontend/src/pages/RegisterPage/RegisterPage.tsx`
   - Added `<label htmlFor="first_name">First name</label>` + `<input>` before email field
   - Added `<label htmlFor="last_name">Last name</label>` + `<input>` before email field
   - Conditional spread: `...(firstName ? { first_name: firstName } : {})` to send NULL not `""`

6. **API + hook** — `frontend/src/api/endpoints.ts`, `frontend/src/hooks/useRegister.ts`
   - `registerUser` payload includes optional `first_name`/`last_name`

7. **BoardPage back button** — `frontend/src/pages/BoardPage/BoardPage.tsx`
   - `<button type="button" onClick={() => navigate('/')}>Back</button>` in `headingRow`
   - Uses existing `useNavigate` hook; native `<button>` for WCAG keyboard compliance

**Phase 3: E2E Tests**

8. **`frontend/e2e/auth.spec.ts`** — Added `Registration with name fields (AC-S3)` describe block
   - AC-S3-HAPPY-1: Register with names → `GET /auth/me` via `page.request` verifies persistence end-to-end
   - AC-S3-HAPPY-2: Register without names → succeeds, no `[role="alert"]`

9. **`frontend/e2e/board-page.spec.ts`** — Added AC-S5-HAPPY-1 inside existing `Board Page` describe block
   - Back button visible on `/boards/:boardId` → click → `toHaveURL('/')` → `My boards` heading visible

### Design Decisions

- **Conditional spread over empty-string send**: `...(firstName ? { first_name: firstName } : {})` stores NULL not `""` — caught by code review in Phase 2.
- **`IF NOT EXISTS` guards**: Migration re-runnable safely; follows established project pattern.
- **`<button>` over `<Link>` for Back**: Reuses existing `useNavigate` import; native keyboard semantics; acceptable tradeoff (no right-click "open in new tab").
- **`page.request.get()` for E2E name assertion**: Uses session cookies shared from the `page` object; more thorough than UI-only assertion since it validates the full persistence chain.

## Testing

- **Backend unit/integration**: 174 tests passing (no regressions; `auth.service.test.ts` assertion updated from 2-arg to 4-arg `createUser` call signature)
- **Frontend unit**: 52 tests passing (8 new: Back button renders + click navigates; Register form fields visible; submit flows)
- **E2E**: 26/28 passing — 3 new tests (all pass); 2 pre-existing failures (`AC-LOGOUT-1/2` use `/log out/i` but AppHeader renders "Sign out" — TASK-011 bug, not this task)

## Files Changed

**Backend:**
- `backend/migrations/20260627140000_add-user-profile-and-messages.js` — new schema migration
- `backend/migrations/20260627140001_seed-existing-user-name.js` — new data seed migration
- `backend/src/auth/user.repository.ts` — `createUser` 4-arg signature; all three queries select name columns
- `backend/src/auth/auth.service.ts` — passes `firstName`/`lastName` through to `createUser`
- `backend/src/auth/auth.routes.ts` — registration Zod schema adds `first_name`/`last_name` optional fields
- `backend/src/auth/auth.service.test.ts` — updated mock assertion arity

**Frontend:**
- `frontend/src/types/index.ts` — `User` type extended with name fields
- `frontend/src/api/endpoints.ts` — `registerUser` payload extended
- `frontend/src/hooks/useRegister.ts` — threads name fields to API call
- `frontend/src/pages/RegisterPage/RegisterPage.tsx` — First name + Last name inputs; conditional spread
- `frontend/src/pages/RegisterPage/RegisterPage.test.tsx` — form field render tests
- `frontend/src/pages/BoardPage/BoardPage.tsx` — Back button added to heading row
- `frontend/src/pages/BoardPage/BoardPage.test.tsx` — Back button render + click tests
- `frontend/e2e/auth.spec.ts` — AC-S3 E2E tests
- `frontend/e2e/board-page.spec.ts` — AC-S5 E2E test

## Lessons Learned

See full analysis: `memory-bank/reflection/reflection-TASK-015.md`

**Key takeaways:**
1. **Code review effectiveness** — Caught real defects in 2 of 3 phases: PII in seed migration, duplicate `__tests__/` directory, unused imports, empty-string-vs-NULL bug.
2. **Conditional spread pattern** — Always use `...(value ? { field: value } : {})` for optional nullable DB fields. Never send `field: ""` and expect the backend to coerce.
3. **Co-located frontend tests** — Test writer created `__tests__/` subdirectories; convention (co-located `ComponentName.test.tsx`) should be in `techContext.md` to prevent recurrence.
4. **Mock arity on signature extension** — When extending a function with optional params, update all mock assertions to include the new arguments (as `undefined` for optional).
5. **`page.request` for E2E persistence checks** — Shares session cookies; verifies the full DB→API→client chain without a separate auth step.

## Technical Debt

- **PII in seed migration** (`backend/migrations/20260627140001_seed-existing-user-name.js`): Hard-coded `'Rebecca'`, `'Uberall'` are in git history. Recommend: rewrite migration to use `process.env.SEED_FIRST_NAME` / `process.env.SEED_LAST_NAME`, or move to an operations script outside version control. Team decision required before branch merge.
- **RegisterPage unit test gap**: `RegisterPage.test.tsx` does not cover First/Last name field rendering or name-inclusive submit payload. E2E coverage exists; unit-level coverage recommended for faster regression detection.
- **Back button styling**: `<button>Back</button>` renders with default browser styling (no CSS module class). Cosmetic polish item.
- **Pre-existing E2E failures**: `AC-LOGOUT-1/2` time out on `/log out/i`; AppHeader renders "Sign out" (TASK-011 bug). Not introduced by this task.

## References

- **Reflection**: `memory-bank/reflection/reflection-TASK-015.md`
- **Task plan**: `memory-bank/tasks/TASK-015.md`
- **Roadmap feature**: FEAT-012 in `memory-bank/roadmap.md`
- No creative phase documents (task correctly skipped creative phase)

## Follow-up

- Address PII in seed migration before PR merge (team decision)
- Extend `RegisterPage.test.tsx` with unit-level name field coverage
- Fix pre-existing `AC-LOGOUT-1/2` E2E failures (TASK-011 bug: "Sign out" vs "Log out")
- Style the Back button in `BoardPage.module.css`
