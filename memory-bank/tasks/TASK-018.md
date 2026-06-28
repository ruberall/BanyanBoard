# TASK-018: Delete Card UI

**Complexity**: Level 2
**Status**: PLANNING_COMPLETE
**Roadmap Link**: FEAT-015
**Branch**: feature/FEAT-015-delete-card-ui
**Worktree**: N/A

## Task Description

Enable users to delete a card by clicking an X icon next to the card label. The backend `DELETE /cards/:id` endpoint already exists (FEAT-003). This task adds the frontend: a `useDeleteCard` mutation hook, an X delete button on each `KanbanCard`, and the wiring in `KanbanColumn` to handle the deletion.

---

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Individual Developer — IC contributor who needs to remove cards that are no longer relevant without navigating away from the board.
**Creative Exploration Needed**: No

### Invocation Method

- **Location**: `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — inside `.cardHeader`, right-aligned after the color-picker button and card title
- **Element**: A `<button type="button">` rendering an `×` character (or equivalent close glyph), with `aria-label={`Delete card: ${card.title}`}` and `className={styles.deleteButton}`
- **Visibility**: Always visible on each card — no hover-only trigger. Cards are compact and the X sits flush right in the header row alongside the existing drag handle (left) and color picker (inline)
- **Navigation**: User is already on `/boards/:boardId` (the `BoardPage`). No navigation required — the button is present on every rendered `KanbanCard`.
- **Confidence**: HIGH — `KanbanCard.tsx` line 79 establishes a `.cardHeader` flex row that already holds `dragHandle`, `labelBadge` buttons, `colorButton`, and `title`. The delete button slots into that row at the far right using `margin-left: auto` CSS, matching the established flex pattern in `KanbanCard.module.css`.

### Success Criteria

- **User sees**: The card disappears from the column immediately (optimistic removal). No toast or confirmation dialog is shown — the deletion is instantaneous and the column re-renders without the card.
- **Verifiable at**: The column that previously contained the card — it is absent from the rendered card list. The card is also absent after a full page reload (server confirmed deletion).
- **Data persisted**: `cards` table row deleted (CASCADE DELETE propagates to `card_events.card_id → SET NULL`, preserving activity feed history). No `workflow_rule_triggers` or `workflow_action_deliveries` rows are affected directly (those reference `cards` via SET NULL FK).
- **Observable within**: Immediate — optimistic removal removes the card from the `queryKeys.cards.byColumn(columnId)` cache before the network round-trip completes.

### Tradeoff: No Confirmation Dialog

The task description says "clicking an X icon" with no mention of a confirmation step. For an MVP kanban tool competing on simplicity (productBrief: "no bloat"), skipping confirmation keeps the interaction fast and matches the immediate-delete pattern used for boards (`useDeleteBoard` in `hooks.ts` line 49 — no confirmation). The risk of accidental deletion is accepted; undo is out of scope.

If the team later decides to add confirmation, the pattern to follow is: show a browser `confirm()` dialog or an inline "Are you sure? [Delete] [Cancel]" toggle within the card header row — do not add a full modal dialog for a Level 2 change.

### Optimistic Update Strategy

Mirror the `useDeleteBoard` shape (`hooks.ts` lines 49–55) but add optimistic cache removal:

1. `onMutate`: snapshot `queryKeys.cards.byColumn(columnId)`, then `setQueryData` to filter out the deleted card id
2. `onError`: restore the snapshot via `setQueryData`
3. `onSettled`: `invalidateQueries({ queryKey: queryKeys.cards.byColumn(columnId) })`

The `columnId` is a required closure variable because the card cache is keyed by column (`queryKeys.cards.byColumn`). `KanbanColumn` owns the `columnId` and passes `onDelete` down to `KanbanCard`, so `useDeleteCard(columnId)` is called inside `KanbanColumn` — matching the identical pattern used by `useUpdateCard(columnId)` (`hooks.ts` line 68).

### Activity Feed / card_events FK Behavior

The `card_events` table has `card_id FK → cards SET NULL` (see `systemPatterns.md` Database Schema). Deleting a card sets `card_events.card_id = NULL` on existing event rows. The activity feed history is preserved but the card reference becomes null — `projectEventRow` in `backend/src/routes/feed.ts` reads `cardTitle` from `payload` jsonb, not from a FK join, so feed display is unaffected. No frontend or backend changes are needed for the activity feed on this task.

---

## Acceptance Criteria

### AC-ENTRY-1: Delete button is visible on every card
**Priority**: MUST

**Given** a logged-in user on `/boards/:boardId` with at least one card in any column
**When** the board page finishes loading and columns render
**Then** each `KanbanCard` renders a button with `aria-label` matching `Delete card: <card title>` in the card header row, positioned at the far right

**Verification**:
- [ ] Unit/component test: render `<KanbanCard>` with a mock card and assert the delete button is present with correct `aria-label`
- [ ] E2E test: `page.getByRole('button', { name: /^Delete card:/ })` is visible for a known card title

---

### AC-HAPPY-1: User deletes a card and it disappears immediately
**Priority**: MUST

**Given** a logged-in user on a board page with a card titled "Buy milk" in the "To Do" column
**When** they click the button with `aria-label="Delete card: Buy milk"`
**Then**:
  - The card "Buy milk" is removed from the column immediately (optimistic update — no loading spinner or delay visible)
  - The column renders without "Buy milk" after the server confirms deletion (204 response from `DELETE /cards/:id`)
  - After a full page reload, "Buy milk" is still absent from the column
  - No confirmation dialog appears before or after deletion

**Verification**:
- [ ] E2E test: create a card via API helper, navigate to board, click delete button, assert card is absent from the DOM, reload page, assert card still absent
- [ ] Integration test: `DELETE /cards/:id` returns `204` for an existing card (already covered by FEAT-003 backend; verify it is still true)

---

### AC-ERROR-1: User sees an error banner when deletion fails, and the card is restored
**Priority**: MUST

**Given** a logged-in user on a board page with a card visible in a column
**When** the delete button is clicked and the `DELETE /cards/:id` request fails with a network error or 5xx response
**Then**:
  - The card reappears in the column (optimistic rollback restores the `queryKeys.cards.byColumn(columnId)` cache snapshot)
  - An `<ErrorBanner>` with `role="alert"` is visible, showing the error message from the server response (or a fallback like "Failed to delete card")
  - The user can attempt to delete again (the delete button is still present and interactive)

**Verification**:
- [ ] Component test: mock `deleteCard` to reject, fire the delete button click, assert card is still in the rendered list and an error message is shown
- [ ] Confirm `onError` in `useDeleteCard` restores the `prevCards` snapshot and surfaces the error (not silently swallowed)

---

### AC-A11Y-1: Delete button is keyboard accessible and screen-reader labelled
**Priority**: MUST

**Given** a logged-in user navigating the board by keyboard
**When** they tab to a `KanbanCard` and then to the delete button within it
**Then**:
  - The delete button receives visible focus (focus ring, matching existing button focus styles in the codebase)
  - A screen reader announces "Delete card: [card title]" (the `aria-label` value)
  - Pressing Enter or Space triggers the deletion (standard `<button>` behavior — no extra key handler needed)

**Verification**:
- [ ] Component test: button has `aria-label` containing the card title
- [ ] E2E accessibility scan (axe-core via `/banyan-uat`) — no critical violations on the card component
- [ ] Manual keyboard test: Tab → button focused, Enter → card deleted

---

### AC-OPTIMISTIC-1: Deleted card is not visible during the in-flight request
**Priority**: MUST

**Given** the `DELETE /cards/:id` request is slow (network latency)
**When** the user clicks the delete button
**Then**:
  - The card is removed from the column list immediately (before the server responds)
  - If the request succeeds (204), the column remains without the card after `onSettled` invalidation
  - If the request fails, the card reappears (see AC-ERROR-1)

**Verification**:
- [ ] Component test: mock `deleteCard` to return a never-resolving promise, click delete button, assert card is immediately absent from rendered output

---

## Scope Boundaries

**In scope**:
- `useDeleteCard(columnId)` mutation hook in `frontend/src/api/hooks.ts` — follows `useUpdateCard(columnId)` signature pattern; calls `deleteCard(cardId)` from `endpoints.ts` (line 48–50, already implemented)
- `onDelete` prop added to `KanbanCardProps` in `KanbanCard.tsx`
- Delete button (`<button type="button">`) added inside `.cardHeader` div in `KanbanCard.tsx`, far right, with `aria-label={`Delete card: ${card.title}`}`
- `.deleteButton` CSS class added to `KanbanCard.module.css` — small, unobtrusive, uses existing button reset styles matching `.colorButton`
- `handleCardDelete(cardId)` handler in `KanbanColumn.tsx` that calls `deleteCard.mutate(cardId)` and an `onDelete` prop passed down to each `KanbanCard`
- Error state surfaced via `ErrorBanner` in `KanbanColumn` (same pattern as existing `isError` branch, lines 37–41 of `KanbanColumn.tsx`)

**Out of scope**:
- Confirmation dialog before deletion
- Undo / restore deleted card
- Deleting an entire column
- Backend changes (endpoint exists; no migration, service, or repository changes needed)
- Activity feed changes (SET NULL FK handles this automatically)
- Any changes to board-level delete (`useDeleteBoard` is unchanged)
- `deleteCard` import added to `hooks.ts` (it is in `endpoints.ts` but not yet imported by `hooks.ts` — adding the import is in scope; no new endpoint file changes needed)

**Dependencies**:
- `deleteCard` function in `frontend/src/api/endpoints.ts` (line 48) — confirmed present
- `queryKeys.cards.byColumn(columnId)` in `queryKeys.ts` — confirmed present (`systemPatterns.md` Frontend API Client section)
- `ErrorBanner` component at `frontend/src/components/common/ErrorBanner/ErrorBanner.tsx` — confirmed used in `KanbanColumn.tsx`

**NFR implications**:
- Accessibility (WCAG 2.1 AA): `aria-label` on delete button is mandatory (productBrief NFR — screen reader compatible labels on all interactive elements)
- Performance: optimistic removal is instantaneous — no perceived latency for the user; p95 < 200ms NFR applies to the backend DELETE endpoint (already implemented)
- Security: `requireAuth` group middleware in `backend/src/routes/index.ts` already protects `DELETE /cards/:id`; no additional auth changes needed

---

## Creative Exploration Needed

Specification is concrete — proceed to implementation planning.

The one design decision that might prompt review: the delete button is **always visible** (not hover-only). This is a deliberate choice for keyboard/touch accessibility and matches the pattern of other always-visible card controls (drag handle, color picker). If the product owner prefers hover-only visibility to reduce visual clutter, that is a CSS-only change (`opacity: 0` on `.card:not(:hover) .deleteButton`, `opacity: 1` on `:focus-visible`) and does not affect the AC or implementation plan.

---

## Test Strategy

### Approach
- **Emphasis**: Unit/component — this is a pure frontend wiring task; no new backend logic to integration-test
- **Target test count**: 8 tests across 1 phase

### File Organization
- **Extend existing**: `frontend/src/components/board/KanbanCard/KanbanCard.test.tsx` — add delete button render and aria-label tests
- **Extend existing**: `frontend/src/components/board/KanbanColumn/KanbanColumn.test.tsx` — add delete wiring and error banner tests
- **New test file**: `frontend/src/api/__tests__/useDeleteCard.test.ts` — unit tests for the hook (mutationFn, onMutate optimistic removal, onError snapshot restore)

### What NOT to Test
- The `DELETE /cards/:id` backend endpoint — covered by FEAT-003/TASK-007 tests; no backend changes in this task
- CSS styling of `.deleteButton` — visual; not a behaviour test
- Activity feed after deletion — FK SET NULL is DB-level behaviour, not application logic

### Per-Phase Test Guidance
- Phase 1 (8 tests total):
  - `useDeleteCard` hook: 3 tests — mutationFn calls `deleteCard(cardId)`, onMutate removes card from cache + returns snapshot, onError restores snapshot
  - `KanbanCard` component: 3 tests — delete button renders with `aria-label="Delete card: [title]"`, clicking button calls `onDelete(cardId)`, button absent when `onDelete` prop is undefined (no broken no-op button)
  - `KanbanColumn` integration: 2 tests — delete wires through to `useDeleteCard.mutate`, error banner appears when delete mutation errors

---

## Implementation Roadmap

### [x] Phase 1 — Mutation Hook + Endpoint Wiring (backend-free, pure frontend) — COMPLETE

1. Add `deleteCard` to the import list in `frontend/src/api/hooks.ts`
2. Implement `useDeleteCard(columnId: string)` in `hooks.ts`:
   - `useMutation<void, ApiError, string, { prevCards: Card[] | undefined }>`
   - `mutationFn`: `(cardId) => deleteCard(cardId)`
   - `onMutate`: cancel queries, snapshot `prevCards`, remove card from cache
   - `onError`: restore `prevCards` snapshot
   - `onSettled`: invalidate `queryKeys.cards.byColumn(columnId)`
3. Add `onDelete?: (cardId: string) => void` prop to `KanbanCardProps` in `KanbanCard.tsx`
4. Add delete button to `.cardHeader` in `KanbanCard.tsx` render
5. Add `.deleteButton` style in `KanbanCard.module.css`
6. Wire `useDeleteCard` in `KanbanColumn.tsx`: instantiate hook, define `handleCardDelete`, pass as `onDelete` prop to each `KanbanCard`
7. Add error display for delete failures in `KanbanColumn.tsx`

**Estimated effort**: Small — 4 files touched, no new files required, no backend changes.

---

## Execution State

**Build Status**: BUILD_COMPLETE
**Current Build**: Phase 1: Mutation Hook + Endpoint Wiring (TASK-018)
**Build Started**: 2026-06-28
**Build Completed**: 2026-06-28
**Phase Number**: 1 of 1
**Is Multi-Phase**: NO

### Completed Steps
- Planning: COMPLETE — spec approved, PLANNING_COMPLETE
- Step 0: Parse task ID — COMPLETE
- Step 0.1: No interrupted build — NEW BUILD
- Step 0.6: Phase gate — PASSED
- Step 1: Git setup — COMPLETE
- Step 2: Implementation (Phase 1) — COMPLETE
- Step 3: Tests — COMPLETE (useDeleteCard.test.ts new; KanbanCard.test.tsx, KanbanColumn.test.tsx, BoardPage.test.tsx, KanbanBoard.test.tsx extended)
- Step 4: Documentation — COMPLETE

### Sub-Agents
- coding-agent: Phase 1 implementation — COMPLETE
- test-writer-agent: Phase 1 tests — COMPLETE
- documentation-agent: Memory bank updates — COMPLETE

### Resumption Notes
**Can Resume**: NO
**Notes**: Phase 1 complete. Ready for /banyan-reflect.
