# User Journey Design: React Frontend Scaffold (Board Flow)

**Created**: 2026-06-17
**Status**: DECIDED
**Decision Type**: User Journey (documenting EXISTING, shipped implementation)
**Task**: TASK-009

> This document describes the journey of the **already-built** BanyanBoard kanban
> frontend (TASK-009, complete). It doubles as the `/banyan-uat` walkthrough script.
> There is **NO authentication** in the current build (auth is FEAT-006), so the
> happy path starts directly at the app root with no login step.

## Journey Overview

**Feature**: A React 19 + TanStack Query v5 SPA for managing kanban boards — list/create boards, view a board's columns and cards, create cards inline, and drag cards between/within columns with optimistic updates.
**Primary Persona**: Dev Team Lead (and Individual Developer)
**Journey Type**: Synchronous (no async background jobs; drag uses optimistic UI with revert-on-error)
**Orchestration Pattern**: Dashboard + Detail (board list → board detail), with Inline Editing for create-board and create-card forms.

### Success Statement
> A user opens BanyanBoard, creates a board, opens it, adds a card to a column, and drags that card from one column to another — seeing it persist in its new column after the page settles.

## Persona Context

### Primary User
- **Who**: Dev Team Lead (engineering lead on a small team)
- **Goal**: Keep the team's work visible; move cards through columns predictably; no stale cards.
- **Context**: Desktop browser during standup / planning; quick check-ins throughout the day.
- **Proficiency**: High technical proficiency; expects keyboard support and fast page loads (< 2s on localhost).

### Secondary User
- **Who**: Individual Developer (IC contributor)
- **Different needs**: Wants a clear queue of "what's next" — scans columns left-to-right, drags their card into In Progress / Done. Same UI, lighter create-board usage.

## Environment & Base URL

| Item | Value |
|------|-------|
| App base URL (Vite dev server) | `http://localhost:5173` |
| Backend API base URL | `http://localhost:3000` (via `VITE_API_URL`) |
| Routes | `/` (board list), `/boards/:boardId` (board), `*` (404) |
| Start command | `npm --prefix frontend run dev` (frontend) + `docker compose up` (backend + Postgres) |

## Journey Map

### Entry Points
| Entry | Context | User Intent |
|-------|---------|-------------|
| `http://localhost:5173/` | App root | See all boards / create a board |
| `Link` on a board name | Board list page | Open a specific board |
| `http://localhost:5173/boards/:boardId` | Direct/deep link | Jump straight into a board |

### State Diagram
```
[Entry: GET / ]
    │
    ├─ no boards ──▶ [Empty State: "No boards yet" + Create Board form]
    │
    ▼
[Board List: <ul> of boards + Create Board form]
    │  (type name, click "Create Board")
    ▼
[Board created → list re-fetches → new board appears]
    │  (click board name Link)
    ▼
[Board Page: heading + columns side-by-side, cards in position order]
    │  (type card title in column, click "Add card")
    ▼
[Card created → that column's card list re-fetches → card appears at bottom]
    │  (drag card handle ⠿ to another column / dnd-kit)
    ▼
[Optimistic move: card immediately shown in dest column]
    │
    ├─ API ok ───▶ [Settled: columns invalidated + re-fetched; card persists]
    └─ API fails ▶ [Revert: card snaps back; ErrorBanner role="alert" shown]
    │
    ▼
[Success: card sits in its new column after settle]
```

### Step-by-Step Journey

#### Step 1: Land on Board List
- **System**: `BoardListPage` + `useBoards()` (TanStack Query → `GET /boards`)
- **User Sees**: `<h1>My Boards</h1>`; while loading a `role="status"` spinner ("Loading boards"). Then either a `<ul>` of boards or `<p>No boards yet</p>`. Always: the Create Board form at the bottom.
- **User Actions**: Type a board name; click "Create Board"; click a board link.
- **Feedback**: New board appears in the list after the query invalidates and re-fetches.
- **Transitions**: Clicking a board name `<Link>` navigates to `/boards/:boardId`.

#### Step 2: Create a Board
- **System**: `useCreateBoard()` → `POST /boards { name }`; on success invalidates `queryKeys.boards.all`.
- **User Sees**: The input clears (`setName('')`) on success; the new board appears in the `<ul>`.
- **User Actions**: Submitting with a blank/whitespace name is a no-op (`if (!name.trim()) return`) — no request fires.

#### Step 3: Open the Board
- **System**: `BoardPage` + `useBoard(boardId)` → `GET /boards/:id` (returns `BoardWithColumns`).
- **User Sees**: `<h1>` board name; columns rendered side-by-side sorted by `position`; each column header `<h2>` inside a `<section aria-label="Column: <name>">`.
- **User Actions**: Scan columns; read cards; add cards; drag cards.

#### Step 4: Add a Card to a Column
- **System**: `CreateCardForm` (one per column) + `useCreateCard(columnId)` → `POST` create card; invalidates that column's card query.
- **User Sees**: Per-column form: label "Add a card", input `placeholder="Card title..."` (`id="add-card-<columnId>"`), button "Add card". New card appears at the bottom of the column on success; input clears.
- **User Actions**: Type a title, click "Add card". Blank title → inline `role="alert"` "Title is required"; no request fires.

#### Step 5: Drag a Card Between Columns
- **System**: `DndContext` (dnd-kit) + `useMoveCard()`. Optimistic update in `onMutate`; revert + `setBannerError` in `onError`; invalidate src+dest in `onSettled`.
- **User Sees**: A `DragOverlay` clone follows the cursor; the card immediately appears in the destination column (optimistic). After settle it persists in the new column.
- **User Actions**: Press/hold the drag handle `⠿` (`aria-label="Reorder card: <title>"`, `aria-roledescription="draggable"`), move over a target column/card, release.
- **Pointer activation**: 5px movement (`activationConstraint: { distance: 5 }`) before a drag starts — a plain click does NOT start a drag.

#### Step 6: Success
- **User Sees**: The dragged card resting in its new column after the network settles (no error banner).
- **Value Delivered**: Team's work is visibly reorganized; card moved predictably.
- **Next Actions**: Move more cards; add more cards; navigate back to `/` (browser back) to pick another board.

## Distributed System Flow

### Responsibility Matrix
| Step | Owner | State Storage | Failure Handling |
|------|-------|---------------|------------------|
| List/Create board | Frontend → `GET/POST /boards` | TanStack Query cache + Postgres | Full-page `ErrorBanner` on list load failure; blank-name submit blocked client-side |
| Load board | Frontend → `GET /boards/:id` | Query cache + Postgres | `ErrorBanner` rendered in place of board on error/404 |
| Load cards per column | Frontend → list cards | Query cache (`cards.byColumn`) | Per-column `ErrorBanner` |
| Create card | Frontend → `POST` create card | Query cache + Postgres | Inline validation `role="alert"`; mutation error `role="alert"` in the form |
| Move card | Frontend → move card endpoint | Optimistic cache, then Postgres | Optimistic apply; on error revert cache + top-of-page `ErrorBanner` (dismissable) |

## Error Handling

### Error States
| Error Type | When | User Sees | Recovery |
|------------|------|-----------|----------|
| Board-list load failure | `GET /boards` non-2xx / network down | Full-page `ErrorBanner` (`role="alert"`) with API message | Reload page once API is back |
| Board load failure / invalid ID | `GET /boards/:id` 404 or error | `ErrorBanner` in place of the board | Navigate back to `/` |
| Card-list load failure | per-column list cards fails | Per-column `ErrorBanner` | Reload |
| Blank board name | Submit with empty/whitespace | Nothing happens (silent no-op; no request) | Type a real name |
| Blank card title | Submit empty card form | Inline `role="alert"` "Title is required" | Type a title |
| Card create failure | create card non-2xx | Inline `role="alert"` (message or "Failed to create card") | Retry |
| Card move failure | move endpoint non-2xx | Card reverts to original column + dismissable top `ErrorBanner` | Retry the drag |
| Unknown route | URL not matching a route | `NotFoundPage`: "Not Found" + "Back to boards" link | Click "Back to boards" |

---

## ## Test Accounts Used

> **NO authentication exists in this build.** The table below is persona context only —
> the walker does NOT log in. Any "credentials" are mock placeholders for future FEAT-006.

| Role | Email (mock) | Password (mock) | Notes |
|------|--------------|-----------------|-------|
| Dev Team Lead | `testuser@banyanboard.local` | `password123` | Persona context only; app has no login screen — walker goes straight to `http://localhost:5173/` |
| Individual Developer | `dev@banyanboard.local` | `password123` | Same — no auth; identical UI |

---

## ## Happy Path

Viewport: desktop (default, ~1280×800). Base: `http://localhost:5173`.

1. **Navigate to root.**
   - Action: open `http://localhost:5173/`.
   - Expected: `<h1>My Boards</h1>` visible; either a board `<ul>` or `<p>No boards yet</p>`; a Create Board form present.
   - Selector hints: `h1` text "My Boards"; input `[aria-label="Board name"]`; button text "Create Board".
   - Screenshot label: `01-board-list-landing`.

2. **Create a board.**
   - Action: type `UAT Sprint Board` into `[aria-label="Board name"]`, click button "Create Board".
   - Expected: input clears; a new list item link "UAT Sprint Board" appears in the `<ul>`.
   - Selector hints: `input[aria-label="Board name"]`, `button:has-text("Create Board")`, `ul li a:has-text("UAT Sprint Board")`.
   - Screenshot label: `02-board-created`.

3. **Open the board.**
   - Action: click the "UAT Sprint Board" link.
   - Expected: URL becomes `/boards/<uuid>`; `<h1>UAT Sprint Board</h1>`; columns render side-by-side, each as `section[aria-label^="Column: "]` with an `<h2>` header. Empty columns show `No cards yet`.
   - Selector hints: `h1` board name; `section[aria-label="Column: To Do"]`, `[aria-label="Column: In Progress"]`, `[aria-label="Column: Done"]` (default seeded columns).
   - Screenshot label: `03-board-page`.

4. **Add a card to the first column.**
   - Action: in the first column, type `Wire up auth` into the input `[placeholder="Card title..."]` (id `add-card-<columnId>`), click "Add card".
   - Expected: input clears; a card `<article>` with `<h3>Wire up auth</h3>` appears at the bottom of that column.
   - Selector hints: `section[aria-label="Column: To Do"] input[placeholder="Card title..."]`, button "Add card", `article h3:has-text("Wire up auth")`.
   - Screenshot label: `04-card-created`.

5. **Drag the card to another column.**
   - Action: grab the drag handle `button[aria-label="Reorder card: Wire up auth"]` (glyph `⠿`), move > 5px into the "In Progress" column, release.
   - Expected: a `DragOverlay` clone follows the pointer during drag; on drop the card appears under `section[aria-label="Column: In Progress"]`; no error banner; after settle the card remains there (re-fetch confirms persistence).
   - Selector hints: handle `button[aria-label="Reorder card: Wire up auth"]`; drop target `section[aria-label="Column: In Progress"]`.
   - Screenshot label: `05-card-moved`.

6. **Verify persistence.**
   - Action: reload `/boards/<uuid>`.
   - Expected: "Wire up auth" still under "In Progress".
   - Screenshot label: `06-move-persisted`.

## ## Mobile Path

Viewport: **375×667 (iPhone SE)**. Same steps 1–6 as Happy Path. Differences to note (current build uses CSS Modules with no documented breakpoints — capture actual behavior):

1. Board list at 375px — confirm `h1`, the board links, and the Create Board form (input + button) are all reachable and not clipped. Screenshot: `m01-board-list-375`.
2. Create board (same selectors) — confirm input/button usable at narrow width. Screenshot: `m02-board-created-375`.
3. Open board — columns are laid out side-by-side; at 375px expect **horizontal overflow / scrolling** to reach later columns. Note whether the column container scrolls horizontally or columns wrap. Screenshot: `m03-board-page-375`.
4. Add card — confirm the per-column input + "Add card" button are tappable inside a possibly-scrolled column. Screenshot: `m04-card-created-375`.
5. Drag card on touch — pointer/touch drag via `⠿` handle (5px activation). Confirm a touch-drag between columns works given horizontal scroll; if it is impractical on a narrow viewport, record it as a **Recommended** finding (responsive DnD), not a hard fail. Screenshot: `m05-card-move-375`.
6. Reload to verify persistence. Screenshot: `m06-persisted-375`.

## ## Negative / Access-Denied Paths

> No auth/RBAC exists, so there are no true "access-denied" paths. These are the input-rejection and not-found paths that stand in for negatives.

1. **Blank board name submit**
   - Steps: on `/`, leave `[aria-label="Board name"]` empty (or whitespace only), click "Create Board".
   - Expected rejection: no network request fires; no new list item; no error text (silent no-op by design).
   - Verification: confirm board count unchanged; confirm no `POST /boards` in network log.

2. **Blank card title submit**
   - Steps: on a board, focus a column's `[placeholder="Card title..."]`, leave empty, click "Add card".
   - Expected rejection: inline `span[role="alert"]` "Title is required"; no card created; no create request fires.
   - Verification: assert text "Title is required" present; column card count unchanged.

3. **Unknown route (404)**
   - Steps: navigate to `http://localhost:5173/this-route-does-not-exist`.
   - Expected rejection: `NotFoundPage` renders `<h1>Not Found</h1>`, "The page you were looking for does not exist.", and a "Back to boards" link.
   - Verification: assert "Not Found" heading; click "Back to boards" → lands on `/` board list.

4. **Invalid board ID**
   - Steps: navigate to `http://localhost:5173/boards/00000000-0000-0000-0000-000000000000` (well-formed UUID, no such board).
   - Expected rejection: `useBoard` errors (404) → `ErrorBanner` (`role="alert"`) shown in place of the board; no crash.
   - Verification: assert an `[role="alert"]` is present; board heading/columns are NOT rendered.

## ## Error Scenarios

1. **API down on board-list load**
   - Setup: stop the backend (or block `GET /boards`), then load `/`.
   - Expected: full-page `ErrorBanner` (`role="alert"`) with the error message; no board list, no crash.
   - Verification: `[role="alert"]` present; console shows the failed request; recovery = restart API + reload.

2. **API down on board load**
   - Setup: backend down, navigate to `/boards/<known-uuid>`.
   - Expected: `ErrorBanner` in place of the board.
   - Verification: `[role="alert"]` present; no columns rendered.

3. **Card move fails (optimistic revert)**
   - Setup: force the move endpoint to fail (e.g., backend returns 500 or kill API between drag start and drop), then drag a card to another column.
   - Expected: card briefly shows in destination (optimistic) then **reverts** to its original column; a **dismissable** top-of-page `ErrorBanner` appears with the API message.
   - Verification: after settle the card is back in the source column; `[role="alert"]` present; clicking its `[aria-label="Dismiss"]` (`×`) clears the banner.

4. **Card create fails**
   - Setup: force create-card endpoint to fail, submit a valid title.
   - Expected: inline `span[role="alert"]` with the error message (or "Failed to create card"); input retains/clears per state; no card added.
   - Verification: `[role="alert"]` in the form; column card count unchanged.

5. **Per-column card-list load failure**
   - Setup: force one column's card list request to fail.
   - Expected: that column shows an `ErrorBanner`; other columns still render their cards.
   - Verification: at least one `[role="alert"]` scoped under a column `section`.

## ## Verify Checklist

**Happy Path (all MUST pass):**
- [ ] `/` renders `h1` "My Boards" and a Create Board form.
- [ ] Creating a board with a valid name adds it to the list and clears the input.
- [ ] Clicking a board navigates to `/boards/:id` and renders `h1` board name + columns.
- [ ] Adding a card with a valid title shows the card and clears the input.
- [ ] Dragging a card to another column moves it; it persists after reload.

**Mobile (Recommended unless a blocker):**
- [ ] All interactive elements reachable and operable at 375×667.
- [ ] Columns reachable via horizontal scroll/wrap; DnD usable (or documented as Recommended finding).

**Negatives (all MUST pass):**
- [ ] Blank board name = silent no-op, no request.
- [ ] Blank card title = "Title is required" alert, no card.
- [ ] Unknown route = 404 page with working "Back to boards".
- [ ] Invalid board ID = `ErrorBanner`, no crash.

**Errors (all MUST pass):**
- [ ] API-down on list/board load shows `ErrorBanner`, no crash.
- [ ] Failed move reverts card AND shows dismissable banner.
- [ ] Failed card create shows inline alert, no card added.

**Accessibility (AC-10, WCAG 2.1 AA):**
- [ ] Full flow operable by keyboard: Tab to inputs/buttons, Enter to submit forms.
- [ ] Drag handle is a real `<button>` with `aria-label="Reorder card: <title>"` and `aria-roledescription="draggable"`; `KeyboardSensor` enables keyboard drag (focus handle, Space to lift, arrow keys to move, Space to drop).
- [ ] Loading states announced via `role="status"`; error states via `role="alert"`.
- [ ] axe-core scan on `/` and `/boards/:id`: no `critical` violations (Required); `serious`/`moderate` recorded as Recommended.

## ## Cleanup

Reset state between test runs so re-runs start clean:

1. **Delete boards created during the test.** Any board created by UAT (e.g., "UAT Sprint Board") should be removed. There is no delete-board button wired into `BoardListPage` UI in this build (the `useDeleteBoard` hook exists but is not surfaced), so clean up via the API: `DELETE /boards/:id` for each test-created board, or reset the database.
   - Fastest reset: `docker compose down -v && docker compose up` to drop the Postgres volume and re-run migrations/seed.
2. **Cards** created during the test are removed with their parent board (cascade) or by the DB reset above.
3. **Browser state**: no auth/cookies/localStorage are used by the app — no client state to clear beyond the TanStack Query in-memory cache, which is discarded on tab close.
4. **Artifacts**: screenshots/GIFs follow `projectConfig.md` `## UAT artifact_git_policy` (default `ignore`).

---

## Acceptance Criteria

### AC-ENTRY-1: User can find and start the flow
**Priority**: MUST
**Given** the app is running, **When** the user opens `http://localhost:5173/`, **Then** they see `h1` "My Boards" and a Create Board form (input `[aria-label="Board name"]` + button "Create Board").
**Verification**:
- [ ] E2E: `/` renders the heading and form.
- [ ] E2E: Create Board button is visible and clickable.

### AC-HAPPY-1: User completes the primary journey
**Priority**: MUST
**Given** the board list, **When** the user: (1) creates "UAT Sprint Board", (2) opens it, (3) adds card "Wire up auth" to the first column, (4) drags it to "In Progress",
**Then**: card shows in "In Progress"; persists after reload; no error banner.
**Verification**:
- [ ] E2E: full flow entry → moved card.
- [ ] E2E: persistence after reload.

### AC-ERROR-1: User recovers from validation error
**Priority**: MUST
**Given** a column's create-card form, **When** the user submits a blank title, **Then** an inline `role="alert"` "Title is required" shows and no card is created.
**Verification**:
- [ ] E2E: alert text present; card count unchanged.

### AC-ERROR-2: User recovers from system error (optimistic revert)
**Priority**: MUST
**Given** a card on a board with the move endpoint failing, **When** the user drags it to another column, **Then** the card reverts to its origin and a dismissable `ErrorBanner` (`role="alert"`) appears.
**Verification**:
- [ ] E2E: with mocked move failure, card returns to source column.
- [ ] E2E: banner appears and dismisses via `[aria-label="Dismiss"]`.

### AC-404-1: Unknown route shows a recoverable 404
**Priority**: MUST
**Given** any unknown path, **When** visited, **Then** `NotFoundPage` renders with a working "Back to boards" link.
**Verification**:
- [ ] E2E: "Not Found" heading; link returns to `/`.

### AC-10: Keyboard navigation (WCAG 2.1 AA)
**Priority**: MUST
**Given** the board page, **When** the user navigates by keyboard only, **Then** they can reach the create-card input, submit with Enter, focus a card drag handle, and move a card via the `KeyboardSensor` (Space to lift, arrows to move, Space to drop).
**Verification**:
- [ ] E2E: Tab order reaches all controls; forms submit on Enter.
- [ ] E2E: keyboard-driven card move succeeds.
- [ ] axe-core: no `critical` violations on `/` and `/boards/:id`.

## Accessibility Checklist
- [ ] Keyboard navigation through the entire journey (forms + DnD via KeyboardSensor).
- [ ] `role="status"` loading announcements; `role="alert"` error announcements.
- [ ] Drag handle has descriptive `aria-label` + `aria-roledescription="draggable"`.
- [ ] Form inputs have associated labels (`aria-label="Board name"`; `<label for="add-card-<id>">`).
- [ ] Focus is operable; no time limits.

## Next Steps
1. Run `/banyan-uat TASK-009` against `http://localhost:5173` walking the sections above.
2. On PASS, generate the framework-agnostic E2E spec from the Verify Checklist + ACs.
3. Feed the E2E spec into the next `/banyan-build` to implement runnable tests.

---

USER JOURNEY CREATIVE COMPLETE
Document: memory-bank/creative/TASK-009-board-flow-user-journey.md
Journey: Open / → create board → open board → add card → drag card between columns → persists
Pattern: Dashboard + Detail with Inline Editing (no auth)
