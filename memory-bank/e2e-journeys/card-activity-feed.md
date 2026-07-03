# E2E Journey: Card Activity Feed

**Feature**: Card Activity Feed (FEAT-017 / TASK-020)
**Primary Persona**: `user` (see `uat-config.md` → Persona Map; BanyanBoard has no RBAC, so a single authenticated-user role covers this journey)
**Entry Point**: Board page (`/boards/:boardId`) → click any card's title
**Journey Type**: Synchronous (plain REST GET on modal open — no polling/SSE)

## Success Statement
> A logged-in user clicks a card's title, sees that card's activity history (or an honest empty/error state) in a modal, and can trust that history persists across sessions.

---

## happy

**Actor**: user

### Step 1: User opens a board with at least one card
- **Action**: Navigate to `/`, click a board from "My Boards", land on `/boards/:boardId`
- **Verify**:
  - [ ] Board page loads with columns (To Do, In Progress, Stale, Done) and at least one card visible
  - [ ] Card title is rendered as a clickable element (not a plain heading)

### Step 2: User clicks a card's title (AC-ENTRY-1)
- **Action**: Click the title of a card that has been moved between columns at least once (so `card_events` has ≥1 row for it)
- **Verify**:
  - [ ] `CardDetailModal` opens for that specific card
  - [ ] Modal header shows the card's title
  - [ ] A visible "Activity" heading is present inside the modal

### Step 3: User views the card's activity history (AC-HAPPY-1)
- **Action**: Observe the Activity section immediately after the modal opens
- **Verify**:
  - [ ] A brief loading state is shown before data arrives (or the fetch resolves fast enough that this is not user-visible — do not fail solely on a fast resolve)
  - [ ] `GET /cards/:id/activity` is called (visible in network tab / devtools) and returns entries shaped `{ id, type, message, createdAt }`
  - [ ] Entries render newest-first, each showing its `message` text and a human-readable `createdAt` timestamp
  - [ ] A `card.moved` entry's message names real column names (e.g. "moved this card from To Do to In Progress") — NOT the literal string "a column" (regression check for the bug found 2026-07-02 and fixed in `card.service.ts`)

### Step 4: User sees a freshly created card's empty activity state (AC-EMPTY-1)
- **Action**: Create a new card via the column's "Add card" form, then click its title to open `CardDetailModal`
- **Verify**:
  - [ ] The Activity section shows an explicit empty-state message (e.g. "No activity yet.") — not a blank area
  - [ ] The empty state is NOT styled or worded as an error

### Step 5: Activity persists across sessions/reload (AC-HAPPY-2)
- **Action**: With a card that has activity, close the modal, reload the page (hard refresh), reopen the same card's modal
- **Verify**:
  - [ ] The identical activity history reappears — same entries, same order
  - [ ] This proves DB persistence (`card_events` table), not an in-memory/session cache

### Step 6: Modal dismissal
- **Action**: Click the modal's explicit close button (×)
- **Verify**:
  - [ ] Modal closes
  - [ ] Pressing `Escape` while the modal is open also closes it (confirmed 2026-07-02 via direct DOM state check — native `<dialog>` behavior, reliable)
  - [ ] Clicking outside the modal panel (on the backdrop) does NOT close it (confirmed intentional gap, not a bug — see `ux-patterns.md` "Modals close on ESC, NOT on outside-click")

**Cleanup**: Delete any card created in Step 4 for this test run (via the card's delete button) to avoid polluting the board.

### Step 7: Title-click does not break existing card interactions (regression)
- **Action**: On a card, exercise each of the other pre-existing interactive elements that sit alongside the now-clickable title: drag the card to another column via the drag handle, open the label-color picker and pick a color, open the card-color picker and pick a color, and click the delete (×) button on a different disposable card
- **Verify**:
  - [ ] Dragging the card still works and does not also open `CardDetailModal`
  - [ ] Opening the label-color picker does not also open `CardDetailModal`
  - [ ] Opening the card-color picker does not also open `CardDetailModal`
  - [ ] Clicking delete still deletes the card and does not also open `CardDetailModal`
  - [ ] None of the above actions are blocked or altered by the new title-click handler

### Step 8: Editing the card title does not break the modal or its other actions (regression, TASK-021)
- **Action**: Open a card's `CardDetailModal`, click "Edit title", change the title, click "Save"; then close the modal and, on the same card, open the label-color picker and pick a color
- **Verify**:
  - [ ] After Save, the modal heading immediately shows the new title (no reload needed)
  - [ ] Reopening the card's modal shows the updated title, and the Activity section still loads correctly (loading → populated/empty/error as appropriate) — the title edit did not disturb the Activity fetch
  - [ ] The card's title on the board (`KanbanCard`) reflects the new title after the modal closes
  - [ ] The label-color picker (a separate, pre-existing interaction) still opens and applies a color normally after a title edit — the two features do not interfere with each other

---

## errors

**Actor**: user

### Step 1: User recovers from a failed activity fetch (AC-ERROR-1)
- **Action**: Open a card's `CardDetailModal` while `GET /cards/:id/activity` is forced to fail (e.g. via devtools network throttling/blocking, or a backend restart mid-request)
- **Verify**:
  - [ ] An `ErrorBanner` (`role="alert"`) renders inside the Activity section with an error message
  - [ ] The rest of the modal (header, close button) remains usable
  - [ ] The user is never shown a silently-blank Activity section

---

## mobile

**Actor**: user
**Viewport**: mobile preset from `uat-config.md` (375×667)

### Step 1: Modal is usable at mobile width
- **Action**: At 375px width, open a board, click a card's title
- **Verify**:
  - [ ] `CardDetailModal` renders without horizontal overflow or clipped content
  - [ ] Close button remains reachable and tappable
  - [ ] Activity entries remain legible (no text truncation that hides the message)

---

## negatives

Not applicable for this feature. BanyanBoard has no RBAC or board-level permission boundaries relevant to viewing a card's own activity — any authenticated user who can see a card can see its activity. No negative/authorization path exists to test here.
