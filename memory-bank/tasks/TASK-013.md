# TASK-013: Card Labels

**Complexity**: Level 3
**Status**: PLANNING_COMPLETE
**Roadmap**: FEAT-010
**Branch**: feature/FEAT-010-card-labels
**Worktree**: .claude-worktrees/FEAT-010

## Task Description

Add a single color-coded label and a description field to each card, with a substring filter across both. Each card has at most one label (a free-text, multi-word string with a chosen color) and an optional description (free-text, multi-line). A filter bar on the board page performs a case-insensitive substring search across label text OR description text — cards whose label or description contains the search string remain visible; others are hidden. On the kanban board, each card shows its full label badge and a truncated description (one line, ellipsed); hovering the card shows the complete description in a tooltip. Covers: DB migration to add label_text, label_color, and description columns to cards (replacing the old free-form labels array), updated card API (PATCH accepts label_text, label_color, description), React LabelBadge component, card description display with truncation and tooltip, and FilterBar with controlled text input.

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Individual Developer — knows what to work on next; track personal tasks; context is lost when switching tasks (needs label + description visible on the card)
**Creative Exploration Needed**: No — both design decisions resolved during planning (see Design Decisions below)

---

### Invocation Method — Setting a Label and Description

- **Location**: Card edit flow — triggered by clicking a card in `frontend/src/components/board/KanbanCard/KanbanCard.tsx`. No card detail modal/panel currently exists; one must be created.
- **Element**: Clicking anywhere on the card body (excluding the drag handle button) opens a card detail panel or modal. Inside that panel the user sees: a label text input, a color picker / color swatch selector, and a description textarea.
- **Visibility**: Label badge and truncated description are always visible on the card face when set. The edit panel opens on click.
- **Navigation**: Board page (`/boards/:boardId`) → click card → card detail panel opens inline or as an overlay → edit label text / choose color / edit description → save.
- **Confidence**: HIGH — form factor resolved: **inline expand**. Clicking the card expands it in place within the column (no overlay, no modal). The `KanbanCard` component gains `isExpanded` state and renders a `CardDetailPanel` inline when open. No existing modal/drawer component needed.

### Invocation Method — Filtering Cards

- **Location**: `frontend/src/pages/BoardPage/BoardPage.tsx` — a `FilterBar` component rendered between the board heading (`<h1>`) and the `<DndContext>` / `<KanbanBoard>`.
- **Element**: A labeled text input (`<label htmlFor="filter-input">Filter cards</label>` + `<input id="filter-input" type="search" …>`). Clears via a clear button or native browser clear.
- **Visibility**: Always visible on the board page. Empty by default.
- **Navigation**: Already on the board page — filter bar is in the persistent board layout.
- **Confidence**: HIGH — location is concrete and unambiguous; the controlled-input filtering pattern is straightforward React state.

---

### Success Criteria

#### Setting a label and description
- **User sees**: After saving, the card face shows a colored `LabelBadge` (colored background + label text) and a one-line truncated description with ellipsis. A tooltip containing the full description text appears on hover.
- **Verifiable at**: `KanbanCard` in each column of `BoardPage`; data survives a page refresh (persisted to DB).
- **Data persisted**: `cards` table — `label_text varchar`, `label_color varchar` (e.g. CSS hex or named token), `description text`. `labels text[]` column is removed or ignored after migration.
- **Observable within**: Immediate (optimistic update via TanStack Query mutation + cache invalidation, consistent with existing `useMoveCard` pattern in `frontend/src/api/hooks.ts`).

#### Filtering
- **User sees**: As the user types in the filter input, cards whose `label_text` OR `description` contain the search string (case-insensitive substring) remain visible; all other cards are hidden in place (column structure and card order are preserved). Clearing the input restores all cards.
- **Verifiable at**: The board columns on `BoardPage` — hidden cards are not rendered (or are rendered but hidden via CSS display:none, consistent with chosen implementation). The column header card count does NOT need to update (out of scope).
- **Data persisted**: N/A — filter is pure client-side UI state; no API call.
- **Observable within**: Immediate (synchronous React state update on each keystroke).

---

### Acceptance Criteria

#### AC-ENTRY-1: User can open the card detail panel
**Priority**: MUST
**Given** the user is on the board page (`/boards/:boardId`) with at least one card visible
**When** they click the card body (not the drag handle)
**Then** a card detail panel or modal opens, showing editable fields for label text, label color, and description

#### AC-HAPPY-1: User sets a label on a card
**Priority**: MUST
**Given** the user has the card detail panel open for a card
**When** they:
  1. Type a label string (e.g. "backend bug") into the label text input
  2. Select a color from the color picker / swatch selector
  3. Click Save (or equivalent commit action)
**Then**:
  - The panel closes (or reflects saved state)
  - The card face shows a `LabelBadge` rendered with the chosen background color and the label text
  - `PATCH /cards/:id` is called with `{ label_text, label_color }` and returns `200` with the updated card
  - On page refresh, the label badge still appears (data is persisted in the DB)

#### AC-HAPPY-2: User sets a description on a card
**Priority**: MUST
**Given** the user has the card detail panel open
**When** they:
  1. Type a multi-line description into the description textarea
  2. Click Save
**Then**:
  - The card face shows the first line of the description, truncated with ellipsis if it overflows one line
  - `PATCH /cards/:id` is called with `{ description }` and returns `200`
  - On page refresh, the truncated description still appears

#### AC-HAPPY-3: User sees full description on hover
**Priority**: MUST
**Given** a card has a non-null description
**When** the user hovers over the card
**Then** a tooltip appears containing the complete description text (not truncated)
**Note**: Tooltip must be keyboard-accessible (visible on focus) per WCAG 2.1 AA — productBrief.md accessibility NFR

#### AC-HAPPY-4: User filters cards by label text
**Priority**: MUST
**Given** the board page has cards with mixed labels (some cards have label "backend bug", others have "frontend", others have no label)
**When** the user types "back" into the filter input
**Then**:
  - Only cards whose `label_text` contains "back" (case-insensitive) remain visible
  - Cards with no label and no description matching "back" are hidden
  - The column structure (column headers, drop targets) remains visible

#### AC-HAPPY-5: User filters cards by description text
**Priority**: MUST
**Given** a card has description "Fix the database timeout in production"
**When** the user types "timeout" into the filter input
**Then** that card remains visible regardless of its label text

#### AC-HAPPY-6: Clearing the filter restores all cards
**Priority**: MUST
**Given** the user has typed a filter string that hides some cards
**When** they clear the filter input (delete text or click native clear)
**Then** all cards in all columns are visible again

#### AC-HAPPY-7: User removes a label from a card
**Priority**: MUST
**Given** a card has an existing label
**When** the user opens the card detail panel, clears the label text input, and saves
**Then**:
  - No `LabelBadge` appears on the card face
  - `PATCH /cards/:id` is called with `{ label_text: null, label_color: null }`

#### AC-ERROR-1: Saving with label text but no color selected is handled
**Priority**: MUST
**Given** the user typed label text but did not select a color
**When** they attempt to save
**Then** an inline validation error message appears (e.g. "Choose a color for your label") and the save is blocked until a color is selected
**Note**: A default color (aqua) is pre-selected when the panel opens, so the user must actively deselect before saving — implementation may choose to keep default selection to eliminate this error path entirely

#### AC-ERROR-2: PATCH failure is surfaced to the user
**Priority**: MUST
**Given** the `PATCH /cards/:id` call returns a non-2xx response
**When** the save mutation fails
**Then** an `ErrorBanner` (`frontend/src/components/common/ErrorBanner/ErrorBanner.tsx`) is shown with the error message and the panel remains open so the user can retry

#### AC-FILTER-1: Filter is case-insensitive
**Priority**: MUST
**Given** a card with label text "Backend Bug"
**When** the user types "backend bug" (lowercase) into the filter
**Then** the card remains visible

#### AC-FILTER-2: Filter matches substring, not full string
**Priority**: MUST
**Given** a card with description "Fix the database timeout in production"
**When** the user types "data" into the filter
**Then** the card remains visible

#### AC-A11Y-1: Filter input has an accessible label
**Priority**: MUST
**Given** the filter bar is rendered
**When** a screen reader user navigates to the filter input
**Then** the input has an associated `<label>` element (not placeholder-only) per learned rule `frontend-accessibility.md`

#### AC-A11Y-2: LabelBadge does not rely on color alone
**Priority**: MUST
**Given** a card has a colored label badge
**When** a user who cannot distinguish colors views the card
**Then** the label text is always visible within the badge (color is supplementary, not the sole indicator) — per productBrief.md accessibility NFR

---

### Scope Boundaries

**In scope**:
- DB migration: add `label_text varchar(100)`, `label_color varchar(20)`, drop or migrate `labels text[]` column on `cards` table
- `CardRepository` / `CardUpdate` / `CardInput` updated to include `label_text`, `label_color` (replacing `labels`)
- `PATCH /cards/:id` accepts `label_text`, `label_color`, `description`; validation ensures label_color is present when label_text is set
- Frontend `Card` type in `frontend/src/types/index.ts` updated: replace `labels: string[]` with `label_text: string | null`, `label_color: string | null`
- `updateCard` endpoint function in `frontend/src/api/endpoints.ts` updated to include new fields
- New `LabelBadge` component at `frontend/src/components/board/LabelBadge/LabelBadge.tsx`
- `KanbanCard` updated: renders `LabelBadge` (when `label_text` set), renders truncated one-line description with ellipsis, renders tooltip on hover with full description
- New `FilterBar` component at `frontend/src/components/board/FilterBar/FilterBar.tsx` — controlled text input, clear button
- `BoardPage` updated: hosts `filterText` state, passes it down to `KanbanBoard` or filters cards before passing to columns
- Client-side filtering logic: case-insensitive substring match on `label_text` OR `description`
- Card detail panel (new component) for editing label + description — form factor determined in creative phase

**Out of scope**:
- Multiple labels per card
- Board-level shared label registry (labels remain card-scoped per productBrief.md)
- Server-side filtering (filter is pure client-side)
- Column card count update when filter is active
- Filtering by title, due date, or other fields
- Free color picker — fixed palette only: **aqua** and **hot pink** (exact hex values chosen at build time to satisfy WCAG 2.1 AA 4.5:1 contrast with label text)
- Drag-and-drop behavior for hidden (filtered-out) cards — hidden cards simply do not participate in drop targets
- Export or URL-persisted filter state

**Dependencies**:
- Existing `PATCH /cards/:id` route in `backend/src/routes/cards.ts` is extended (not replaced)
- TanStack Query `useUpdateCard` mutation hook (to be created in `frontend/src/api/hooks.ts`, following `useMoveCard` pattern)
- `queryKeys.cards.byColumn` invalidation after successful update (existing pattern)

**NFR implications**:
- Accessibility: label badge must show text (not color alone); filter input must have explicit `<label>`; tooltip must be keyboard-accessible (focus-visible trigger)
- Performance: client-side filter is O(n) on card count — acceptable for small teams (hundreds of cards per board per productBrief.md)
- p95 < 200ms for `PATCH /cards/:id` — no change expected from existing update path

---

### Design Decisions Resolved

Both design questions were resolved during planning — no creative phase required:

1. **Card detail panel form factor**: **Inline expand** — clicking the card body expands it in place within the column. No modal, no overlay. `KanbanCard` gains `isExpanded: boolean` state; when true, a `CardDetailPanel` is rendered inline below the card title (before the drag handle area). The drag handle remains operational; expanding does not interfere with DnD.

2. **Color palette**: **Fixed two-color palette — aqua and hot pink**. Stored as string tokens `'aqua' | 'hotpink'` in the DB (`label_color varchar(20)`). The frontend maps each token to a CSS hex color chosen to pass WCAG 2.1 AA 4.5:1 contrast with the text color used on the badge (black text on aqua, white text on hot pink). Exact hex values confirmed at build time.

## Test Strategy

### Approach
- **Emphasis**: Integration + unit balanced (backend route tests; frontend component unit tests)
- **Target test count**: 23–28 total across 3 phases

### File Organization
- **New test files**:
  - `backend/src/routes/__tests__/cards.routes.test.ts` — extend (label PATCH validation, allowed colors, clear label)
  - `frontend/src/components/board/LabelBadge/__tests__/LabelBadge.test.tsx` — new (renders text, applies color, WCAG text visible)
  - `frontend/src/components/board/CardDetailPanel/__tests__/CardDetailPanel.test.tsx` — new (renders fields, saves correct values, closes on Cancel)
  - `frontend/src/components/board/FilterBar/__tests__/FilterBar.test.tsx` — new (renders, onChange, clear button)
- **Extend existing**:
  - `frontend/src/components/board/KanbanCard/KanbanCard.test.tsx` — LabelBadge renders, description truncation, click-to-expand, CardDetailPanel appears
  - `frontend/src/components/board/KanbanColumn/KanbanColumn.test.tsx` — filterText prop hides non-matching cards
  - `frontend/src/pages/BoardPage/BoardPage.test.tsx` — FilterBar rendered, filter state flows to columns

### What NOT to Test
- CSS truncation/ellipsis rendering — covered by visual inspection; CSS property correctness is not a unit-test concern
- DnD behavior during expanded card — dnd-kit internals; covered by existing DnD tests
- PostgreSQL `ALTER TABLE` migration correctness — node-pg-migrate handles execution; test at the route/service layer
- The two specific hex color values — visual/design correctness, not a unit test

### Per-Phase Test Guidance
- Phase 1 (Backend): 5–6 tests — PATCH with label_text+color → 200; label_text without color → 400; color not in allowed list → 400; null label clears badge; old `labels` field → 400
- Phase 2 (Frontend Core): 10–12 tests — LabelBadge renders text+color; CardDetailPanel fields, save, cancel; KanbanCard shows badge+truncated desc+tooltip+expand
- Phase 3 (Frontend Filter): 8–10 tests — FilterBar renders+onChange+clear; BoardPage filter state; KanbanColumn hides non-matching; case-insensitive; substring match

## Implementation Roadmap

- [ ] Phase 1: Backend — DB migration + card repository + API validation
- [ ] Phase 2: Frontend Core — Card type + LabelBadge + CardDetailPanel (inline expand) + useUpdateCard hook
- [ ] Phase 3: Frontend Filter — FilterBar + BoardPage filter state + KanbanColumn/KanbanBoard filter propagation

## Creative Phases

None required — both design decisions resolved during planning.

---

## Execution State

**Build Status**: IDLE
**Current Phase**: BUILD
**Can Resume**: NO

### Active Sub-Agents
(none)

### Completed Steps
- Step 0.1: TASK-013 provisioned for FEAT-010 (2026-06-22)
- Step 3: Spec Writer Agent COMPLETE (2026-06-22) — 12 ACs, 3-phase plan, no creative phase required
- Step 6: Planning COMPLETE (2026-06-22) — design decisions resolved by human; spec approved
