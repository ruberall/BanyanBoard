# TASK-013: Card Labels

**Complexity**: Level 3 (inherited from FEAT-010)
**Status**: CREATIVE_COMPLETE
**Roadmap**: FEAT-010
**Branch**: feature/FEAT-010-card-labels
**Worktree**: C:\Users\uberallr\projects\BanyanBoard\.claude-worktrees\FEAT-010

## Task Description

Three enhancements to the card label system:

1. **FilterBar** — a text input in the upper-right of the board screen that filters the visible card list to only cards whose title or description contains the entered string; includes an × clear button that restores all cards.

2. **Label placement** — move the label badge to the right of the drag handle (not below it); widen columns slightly to accommodate.

3. **User-chosen pale color** — replace any fixed palette with a swatch grid of very pale colors the user selects per label; chosen color stored per card in the DB.

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Individual Developer — "Know what to work on next; track personal tasks. Unclear priorities." (productBrief.md) and Dev Team Lead — "Keep the team's work visible, unblock people, ship features."
**Creative Exploration Needed**: Yes — see Creative Exploration Needed section below.

---

### Sub-Feature 1: FilterBar

#### Invocation Method
- **Location**: `BoardPage` (`/boards/:boardId`) — `frontend/src/pages/BoardPage/BoardPage.tsx`. The FilterBar lives in the board page header area, rendered between the board name `<h1>` and the `<DndContext>` wrapper. The current header area is a `<div className={styles.page}>` with `padding: 24px 284px 24px 24px` (right-padding reserves space for the `ActivityFeed` sidebar — `BoardPage.module.css` line 1).
- **Element**: `<input type="search">` (or `type="text"`) with an `aria-label="Filter cards"`, and an `×` clear `<button>` visible only when the input is non-empty. These are encapsulated in a new `FilterBar` component at `frontend/src/components/board/FilterBar/FilterBar.tsx`.
- **Visibility**: Always visible on the board screen when a board is loaded. Absent on `BoardListPage`, `LoginPage`, `RegisterPage`.
- **Navigation**: Log in → open any board → FilterBar is immediately visible in the upper-right area of the board heading row.
- **Confidence**: MEDIUM — the position "upper-right of the board heading row" is derived from the task description and the existing `BoardPage` layout. The exact CSS placement relative to the board name heading and the ActivityFeed sidebar needs creative confirmation. See Creative Exploration Needed.

#### Success Criteria
- **User sees**: As they type, the kanban columns re-render showing only cards whose `title` or `description` (case-insensitive substring) includes the filter string. Cards that do not match are hidden. When input is non-empty an `×` button appears inline in the input. Clicking `×` or clearing the input restores all cards.
- **Verifiable at**: The board screen — columns show reduced card counts while filter is active; all cards return on clear.
- **Data persisted**: Filter state is purely client-side (`useState` in `BoardPage` or `FilterBar`). Nothing is written to the DB. Filter resets on page reload.
- **Observable within**: Immediate — filtering is synchronous client-side. No network request triggered.

#### Acceptance Criteria

##### AC-FILTER-ENTRY-1: FilterBar is present and accessible on every board page load
**Priority**: MUST
**Given** an authenticated user navigates to `/boards/:boardId` and the board loads successfully
**When** the board columns are rendered
**Then** a search input with `aria-label="Filter cards"` is visible in the upper-right of the board heading row, and the `×` clear button is not visible (input is empty)

##### AC-FILTER-HAPPY-1: Typing filters cards by title substring (case-insensitive)
**Priority**: MUST
**Given** the user is on a board that has at least two cards with different titles
**When** the user types a substring that matches one card's title but not the other (e.g. "auth" matches "Add auth" but not "Write tests")
**Then** only the matching card is visible in its column; the non-matching card is hidden; column structure (headings) remains visible; columns with zero matching cards show the existing "No cards yet" empty state (`KanbanColumn.module.css` `.empty`)

##### AC-FILTER-HAPPY-2: Typing filters cards by description substring (case-insensitive)
**Priority**: MUST
**Given** a card has a non-null `description` containing the word "postgres"
**When** the user types "postgres" in the FilterBar
**Then** that card is visible; cards whose title and description do not contain "postgres" are hidden

##### AC-FILTER-HAPPY-3: × clear button restores all cards
**Priority**: MUST
**Given** the FilterBar has a non-empty value and some cards are hidden
**When** the user clicks the `×` clear button
**Then** the input clears, the `×` button disappears, and all cards are restored to their columns

##### AC-FILTER-HAPPY-4: Clearing the input by selecting all and deleting restores all cards
**Priority**: MUST
**Given** the FilterBar has a non-empty value
**When** the user manually deletes all characters from the input (backspace to empty string)
**Then** all cards are restored and the `×` button disappears

##### AC-FILTER-ERROR-1: Filter with no matches renders empty columns, not a crash
**Priority**: MUST
**Given** the FilterBar contains a string that matches zero cards across all columns
**When** the filter is applied
**Then** every column shows the "No cards yet" empty-state paragraph (existing `<p className={styles.empty}>No cards yet</p>` in `KanbanColumn`); no JavaScript error is thrown; the FilterBar input remains interactive

##### AC-FILTER-A11Y-1: FilterBar input has an associated visible or screen-reader label
**Priority**: MUST
**Given** the FilterBar is rendered
**Then** the `<input>` has `aria-label="Filter cards"` (or an explicit `<label htmlFor=...>` per the project's accessibility rule in `agent-rules/_learned/frontend-accessibility.md`); the `×` button has `aria-label="Clear filter"`

---

### Sub-Feature 2: Label Placement (badge right of drag handle)

#### Invocation Method
- **Location**: `KanbanCard` component — `frontend/src/components/board/KanbanCard/KanbanCard.tsx`. Currently the card layout is: `dragHandle` button → `<h3 className={styles.title}>` → `<div className={styles.labels}>` (below title). The new layout places the label badge(s) **to the right of the drag handle**, on the same row, before the title or as part of a flex row.
- **Element**: The existing `<span className={styles.label}>` badges inside `<div className={styles.labels}>`. No new interactive element; this is a CSS layout change.
- **Visibility**: Always visible on cards that have at least one label. Cards with zero labels show no badge (unchanged).
- **Navigation**: Open any board with labeled cards.
- **Confidence**: MEDIUM — "right of the drag handle" is stated in the task description. The exact flex layout (drag handle + labels in a row, then title below; or drag handle + labels + title all in one row) needs creative confirmation. See Creative Exploration Needed.

#### Success Criteria
- **User sees**: Label badge(s) appear horizontally adjacent to (right of) the drag handle `⠿` button on the card, not below the title. Columns are slightly wider to accommodate the badge beside the handle without wrapping.
- **Verifiable at**: The board page — any card with labels shows the badge in the heading row.
- **Data persisted**: None — this is a pure CSS/layout change. No DB or API changes.
- **Observable within**: Immediate on page render.

#### Acceptance Criteria

##### AC-LABEL-POS-1: Label badge renders to the right of the drag handle
**Priority**: MUST
**Given** a card has at least one label
**When** `KanbanCard` renders
**Then** in the DOM, the `<div className={styles.labels}>` (or equivalent container) appears as a sibling after the drag handle `<button>` within the same flex row, not as a child of a separate row below the title

##### AC-LABEL-POS-2: Cards without labels render without the badge row
**Priority**: MUST
**Given** a card has an empty `labels` array
**When** `KanbanCard` renders
**Then** no label container element is rendered (unchanged from current behavior: `{card.labels.length > 0 && ...}`)

##### AC-LABEL-POS-3: Column width is sufficient to avoid badge wrapping on single-label cards
**Priority**: MUST
**Given** a column has cards with single short labels (e.g. "bug", "feat")
**When** the board renders at desktop viewport width (≥ 1280px)
**Then** the drag handle and label badge appear on the same line without wrapping; the column `min-width` in `KanbanColumn.module.css` (currently `280px`) is increased to at least `300px`

---

### Sub-Feature 3: User-Chosen Pale Label Color

#### Invocation Method
- **Location**: `KanbanCard` component — clicking (or activating via keyboard) a label `<span>` badge opens a color-swatch popover/dropdown anchored to the badge.
- **Element**: A `LabelColorPicker` component (`frontend/src/components/board/LabelColorPicker/LabelColorPicker.tsx`) — a small popover containing a grid of ~10 pale-color swatches. Each swatch is a `<button>` with `aria-label` describing the color. Clicking a swatch calls `PATCH /cards/:id` with updated `labels` array (each label carries its own `color`) and closes the picker.
- **Visibility**: Swatch grid appears on click/Enter of a label badge. Dismissed by clicking outside, pressing Escape, or selecting a swatch.
- **Navigation**: Open board → find a card with a label → click the label badge → swatch grid appears.
- **Confidence**: LOW — the interaction model (click badge to open picker vs. a separate edit pencil icon) needs creative confirmation. The label color is per-card (not per-label-string), which may affect interaction design. See Creative Exploration Needed.

#### Pale Color Palette (Proposed — 10 swatches)

These are very pale (low-saturation, high-lightness) colors suitable for small badge backgrounds, meeting WCAG 2.1 AA contrast when combined with dark text (`#374151`):

| Name | Hex |
|------|-----|
| Pale rose | `#fce7f3` |
| Pale amber | `#fef3c7` |
| Pale lime | `#ecfccb` |
| Pale teal | `#ccfbf1` |
| Pale sky | `#e0f2fe` |
| Pale indigo | `#e0e7ff` |
| Pale purple | `#f3e8ff` |
| Pale slate | `#f1f5f9` |
| Pale orange | `#ffedd5` |
| Pale green | `#dcfce7` |

**Confidence**: MEDIUM — these are Tailwind 50/100-level palette values, appropriate for a pale swatch grid. The specific set is proposed; the creative phase may adjust.

#### Label Data Shape (DECIDED 2026-06-25)

Labels carry **per-label color**. The `Label` type is `{ name: string; color: string }`. Default color for any label created without an explicit color: **`#95B9C7`**. The swatch picker offers only pale/pastel colors (Tailwind 50/100 tier — 10 swatches); `#95B9C7` is the automatic default and is **not** offered as a swatch option.

#### DB Schema Change

`cards.labels` changes from `text[]` to `jsonb` to carry per-label color:

```sql
ALTER TABLE cards
  ALTER COLUMN labels TYPE jsonb USING to_jsonb(labels),
  ALTER COLUMN labels SET DEFAULT '[]'::jsonb;
```

- **Migration file**: `backend/migrations/<epoch-ms>_labels-jsonb.js` (node-pg-migrate JS format)
- **Wire format**: `labels` is a JSON array of `{ name: string; color: string }`, e.g. `[{"name":"bug","color":"#fce7f3"}]`
- **Default color**: when a label is added without an explicit color, the backend defaults `color` to `#95B9C7`
- **Repository**: `CardRepository` — `Card.labels` type changes from `string[]` to `Label[]`; SQL uses `$N::jsonb`; no column rename required
- **Service / Route**: `PATCH /cards/:id` — `labels` in `VALID_PATCH_FIELDS`; validate each element has `name: string` and `color` matching `/^#[0-9a-fA-F]{6}$/` (or omitted, defaulting to `#95B9C7`)

#### Frontend Type Change

`frontend/src/types/index.ts` — replace `labels: string[]` with:
```typescript
export interface Label { name: string; color: string; }
// in Card:
labels: Label[]
```

The `updateCard` endpoint in `frontend/src/api/endpoints.ts` accepts `Partial<Pick<Card, ...>>` — updating the `Card` type propagates automatically.

#### Success Criteria
- **User sees**: Label badge renders with the chosen pale color. On re-open or page reload the chosen color is still applied. New labels default to `#95B9C7` until the user picks a different color.
- **Verifiable at**: Board page — badge background matches swatch selected. `PATCH /cards/:id` body contains updated `labels` array with `color` field. Page reload preserves color.
- **Data persisted**: `cards.labels jsonb` in PostgreSQL. API response `Card.labels` is `Label[]` with `color` field.
- **Observable within**: Immediate (optimistic update via TanStack Query mutation) and confirmed after `PATCH` response resolves.

#### Acceptance Criteria

##### AC-COLOR-ENTRY-1: Clicking a label badge opens the color swatch picker
**Priority**: MUST
**Given** a card has at least one label and is rendered on the board
**When** the user clicks (or presses Enter on) a label `<span>` badge
**Then** a `LabelColorPicker` popover appears containing exactly 10 swatch buttons, each with a distinct `aria-label` (e.g. "Pale rose")

##### AC-COLOR-HAPPY-1: Selecting a swatch updates the label badge color and persists to DB
**Priority**: MUST
**Given** the `LabelColorPicker` is open for a card
**When** the user clicks a swatch (e.g. "Pale amber" `#fef3c7`)
**Then**:
  1. The picker closes
  2. The label badge background color changes to `#fef3c7`
  3. A `PATCH /cards/:id` request is sent with body `{ "labels": [{"name":"<label>","color":"#fef3c7"}] }`
  4. The server responds `200` with the updated `Card` including `labels: [{"name":"<label>","color":"#fef3c7"}]`
  5. After page reload the badge still shows `#fef3c7`

##### AC-COLOR-HAPPY-2: Color persists across page reload
**Priority**: MUST
**Given** a label color has been saved (AC-COLOR-HAPPY-1 passed)
**When** the user reloads the board page
**Then** the card's label badge still renders with the saved color background

##### AC-COLOR-HAPPY-3: Label with no explicit color falls back to the default
**Priority**: MUST
**Given** a card has labels where no color was explicitly chosen
**When** `KanbanCard` renders
**Then** the label badge renders with the default background color `#95B9C7`

##### AC-COLOR-ERROR-1: Invalid hex value in labels array rejected by the API
**Priority**: MUST
**Given** a PATCH request is sent to `/cards/:id` with `{ "labels": [{"name":"bug","color":"red"}] }` (not a valid 7-char hex)
**When** the route handler processes the request
**Then** the API returns `400 { error: "ValidationError", message: "labels[].color must be a valid hex color (#rrggbb)" }`

##### AC-COLOR-A11Y-1: Swatch buttons have accessible labels; badge color is not the sole differentiator
**Priority**: MUST
**Given** the `LabelColorPicker` is rendered
**Then** each swatch `<button>` has `aria-label` naming the color (e.g. `aria-label="Pale rose"`); the label badge also shows the label text string, so color is supplementary (WCAG 1.4.1 — use of color)

##### AC-COLOR-A11Y-2: Text on label badge meets WCAG AA contrast
**Priority**: MUST
**Given** any of the 10 pale swatches is applied as a label color
**Then** badge text color `#374151` on the pale background achieves a contrast ratio ≥ 4.5:1 (all proposed pale hex values satisfy this with dark text)

---

### Scope Boundaries

- **In scope**:
  - `FilterBar` component: client-side text filter by card `title` and `description`; `×` clear button; real-time filtering (no debounce required for MVP scale)
  - Label badge repositioned right of drag handle in `KanbanCard`; `KanbanColumn` `min-width` increased from `280px` to `≥ 300px`
  - `cards.labels` migrated from `text[]` to `jsonb`; `Label` type `{ name: string; color: string }` added; `PATCH /cards/:id` extended to accept `labels: Label[]`; label badge renders with per-label chosen color (default `#95B9C7`)
  - `LabelColorPicker` swatch grid component with 10 fixed pale colors

- **Out of scope**:
  - Filtering by label text, due date, or assignee — title/description only for this feature
  - Saving filter state across page reload or sessions
  - Per-board or shared label registry — labels remain card-scoped free-form strings (productBrief.md constraint)
  - Custom hex input — only the fixed 10-swatch grid (duplicate of next bullet, left for clarity)
  - Custom hex input — only the fixed 10-swatch grid
  - Real-time filter updates when other users create cards (filter is purely local state; SSE card-creation events are out of scope)
  - Mobile drag-and-drop — not in scope per productBrief.md

- **Dependencies**:
  - FilterBar requires `useCards` data already loaded per column (`KanbanColumn` fetches cards via `useCards(column.id)` in `frontend/src/api/hooks.ts`) — filter state must be lifted to `BoardPage` or a shared context so all columns react to the same filter string
  - `labels` jsonb migration must run before the backend can return `Label[]`; migration must complete before `CardRepository` queries reference the jsonb column
  - `PATCH /cards/:id` for `labels` reuses the existing `updateCard` endpoint and `createCardsRouter` — no new route factory needed

- **NFR implications**:
  - **Performance**: FilterBar filtering is synchronous in-memory — no API call, no debounce required for MVP-scale card counts (hundreds per board). No performance concern.
  - **Accessibility**: FilterBar input requires `<label>` or `aria-label` (project rule from `agent-rules/_learned/frontend-accessibility.md`). Swatch buttons require `aria-label`. Label badge must not rely on color alone (WCAG 1.4.1) — label text string remains visible.
  - **Security**: `labels` is user-supplied data stored as jsonb. Backend validates each `Label.color` against `/^#[0-9a-fA-F]{6}$/`; name is a short string. SQL uses `$N::jsonb` placeholders (existing pattern — `CardRepository.updateCard`).
  - **Browser support**: `<input type="search">` renders as text input in all supported browsers; × clear is implemented as an explicit React button (not relying on browser-native search clear UI, which varies).

---

### Creative Exploration Needed

Yes. Three specific questions require UI/UX design decisions before implementation:

1. **FilterBar exact placement**: "Upper-right of the board screen" — options include (a) inline in the `<h1>` heading row as a flex sibling, (b) a separate toolbar row between the heading and the columns, or (c) inside `AppHeader`. The current `BoardPage.module.css` has `padding-right: 284px` to accommodate the `ActivityFeed` sidebar — the FilterBar must not overlap it. Creative phase should specify the exact CSS positioning.

2. **Label badge + drag handle row layout**: The task says "right of the drag handle." Options are (a) drag handle | badge(s) | title in a single flex row, or (b) a top row with drag handle + badge(s) and a second row with title. The current card has handle as a standalone `<button>` then `<h3>` then `<div class=labels>`. Restructuring the flex layout needs design confirmation to avoid awkward wrapping on long titles or multiple badges.

3. **Color-picker trigger interaction**: Options are (a) click the badge itself to open the picker (ambiguous — user may think badge is non-interactive), (b) a small pencil/edit icon that appears on badge hover, or (c) clicking anywhere on the card opens a card-detail modal that includes the picker. Given MVP simplicity, option (a) or (b) is preferred but needs UX decision. The creative phase should also confirm whether the picker is a floating popover (requires position anchoring logic) or an inline expansion below the badge.

## Implementation Plan

### Component Analysis

**New Components:**
- `frontend/src/components/board/FilterBar/FilterBar.tsx` — search input + × button; emits `onChange(value: string)` and `onClear()` to parent; no internal state beyond controlled input
- `frontend/src/components/board/FilterBar/FilterBar.module.css` — layout styles
- `frontend/src/components/board/LabelColorPicker/LabelColorPicker.tsx` — 10-swatch popover; emits `onColorSelect(hex: string)` and `onClose()`
- `frontend/src/components/board/LabelColorPicker/LabelColorPicker.module.css`
- `backend/migrations/<epoch>_labels-jsonb.js` — `ALTER TABLE cards ALTER COLUMN labels TYPE jsonb USING to_jsonb(labels), ALTER COLUMN labels SET DEFAULT '[]'::jsonb`

**Affected Components (changes required):**
- `frontend/src/pages/BoardPage/BoardPage.tsx` — lift filter state (`filterText`), pass to all `KanbanColumn` instances; render `FilterBar` in heading row
- `frontend/src/pages/BoardPage/BoardPage.module.css` — heading row flex layout for FilterBar
- `frontend/src/components/board/KanbanColumn/KanbanColumn.tsx` — accept `filterText?: string` prop; filter cards before rendering
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — move label badges from below-title to right-of-dragHandle row; use `label.color` (with `#95B9C7` default) for badge background
- `frontend/src/components/board/KanbanCard/KanbanCard.module.css` — flex layout changes
- `frontend/src/components/board/KanbanColumn/KanbanColumn.module.css` — `min-width: 280px` → `min-width: 300px`
- `frontend/src/types/index.ts` — add `Label` interface; change `Card.labels` from `string[]` to `Label[]`
- `backend/src/repositories/card.repository.ts` — change `Card.labels` from `string[]` to `Label[]`; update SQL to use `$N::jsonb`; add `Label` type
- `backend/src/routes/cards.ts` — `labels` already in `VALID_PATCH_FIELDS`; add per-element `color` hex validation

**Component Interactions (data flow):**
```
BoardPage (filterText state)
  ├─> FilterBar (controlled input, fires onChange)
  └─> KanbanColumn (receives filterText prop)
        └─> KanbanCard (receives filtered cards array)
              └─> LabelColorPicker (opens on badge click, fires onColorSelect)
                    └─> updateCard mutation → PATCH /cards/:id { labels: Label[] }
                          └─> invalidate queryKeys.cards.byColumn(columnId)
```

### API Requirements

- **Involves REST API**: Yes — modifying existing endpoint
- **Endpoints Affected**: `PATCH /cards/:id` — `labels` already in `VALID_PATCH_FIELDS`; add per-element `color` validation `/^#[0-9a-fA-F]{6}$/`
- **No new endpoints**: `LabelColorPicker` reuses the existing `updateCard` function from `api/endpoints.ts`
- **Request example**: `PATCH /cards/abc123 { "labels": [{"name":"bug","color":"#fce7f3"}] }`
- **Response**: full `Card` object with `labels: Label[]` field

### Observability Requirements

- **Applies**: Minimal — no new HTTP handlers or background workers
- **Backend**: The existing `PATCH /cards/:id` handler already has pino request logging; `labels` validation errors should use `ValidationError` (existing `AppError` pattern — no new logging)
- **Frontend**: No observability concerns; client-side filter is synchronous

### Dependencies & Risks

- **Risk**: Filter state lifted to `BoardPage` means all columns share one `filterText`. If `KanbanColumn` already memoizes card lists, the re-render from `filterText` change could cause flicker. **Mitigation**: Pass `filterText` as a prop (not context) and let RTL tests verify filtered output is correct; rely on React reconciliation for performance at MVP scale.
- **Risk**: `labels` jsonb migration must run before backend queries use `::jsonb` cast. **Mitigation**: Phase 2 starts with the migration; build agent runs `docker compose up --build` or `npm run migrate` before starting the backend.
- **Risk**: Creative phase delays Phase 1 build start. **Mitigation**: FilterBar placement (creative question 1) is independent of label placement (question 2) and color picker trigger (question 3) — the creative phase should resolve all three and can be done before any build phase.

---

## Test Strategy

### Approach
- **Emphasis**: Unit (RTL for new components) + extend-existing (column/card/API tests); Playwright E2E for the end-to-end flows
- **Target test count**: 20–26 across all phases

### File Organization

**New test files (create):**
- `frontend/src/components/board/FilterBar/FilterBar.test.tsx` — FilterBar unit tests (render, type, clear, accessibility)
- `frontend/src/components/board/LabelColorPicker/LabelColorPicker.test.tsx` — swatch grid render, select, close, a11y

**Extend existing (add tests to):**
- `frontend/src/components/board/KanbanColumn/KanbanColumn.test.tsx` — add filter integration tests (filterText prop hides/shows cards)
- `frontend/src/components/board/KanbanCard/KanbanCard.test.tsx` — add label badge position test + `Label.color` background rendering
- `frontend/src/pages/BoardPage/BoardPage.test.tsx` — add FilterBar present on board load
- `backend/src/routes/__tests__/cards.routes.test.ts` — add labels field: valid `Label[]` accepted, invalid `color` hex rejected 400
- `backend/src/repositories/__tests__/card.repository.test.ts` — update Card mock rows to use `Label[]` instead of `string[]`

**Do NOT create:**
- Separate integration test for `BoardPage` + `KanbanColumn` interaction — covered by extending `BoardPage.test.tsx`

### What NOT to Test
- CSS pixel-exact badge position — reason: visual regression; DOM structure check in KanbanCard.test.tsx is sufficient
- Browser-native `<input type="search">` clear button — reason: we implement our own `×` button; browser native is inconsistent and not tested
- Drag handle rendering itself — reason: existing KanbanCard tests cover it; no change to drag handle code
- `Label.color` propagation through the full React tree — reason: covered by `KanbanCard.test.tsx` + `card.repository.test.ts` independently

### Per-Phase Test Guidance
- **Phase 1** (FilterBar): 7–9 tests in `FilterBar.test.tsx` + 2–3 extensions to `KanbanColumn.test.tsx` + 1 extension to `BoardPage.test.tsx`
  - FilterBar renders input and no × on mount
  - Typing emits onChange
  - × button appears when non-empty, disappears on clear
  - onClear called when × clicked
  - aria-label on input and × button
  - KanbanColumn with filterText shows only matching cards
  - KanbanColumn with filterText showing no matches shows empty state
  - BoardPage renders FilterBar element

- **Phase 2** (Label enhancements + color picker): 6–8 tests in `LabelColorPicker.test.tsx` + 2–3 extensions to `KanbanCard.test.tsx` + 3–4 extensions to `cards.routes.test.ts` + 1 extension to `card.repository.test.ts`
  - LabelColorPicker renders 10 swatches
  - Clicking a swatch calls onColorSelect with correct hex
  - Pressing Escape calls onClose
  - Each swatch has aria-label
  - KanbanCard with `Label.color` applies background style to badge
  - KanbanCard label with no color defaults to `#95B9C7`
  - PATCH /cards/:id with valid `Label[]` → 200
  - PATCH /cards/:id with invalid `color` hex → 400 ValidationError
  - card.repository returns `Label[]` from jsonb column

- **Phase 3** (E2E): 2 Playwright tests in `e2e/` covering AC-FILTER-HAPPY-1 + AC-COLOR-HAPPY-1/2

## Implementation Roadmap

- [x] Phase 1: FilterBar — `FilterBar` component with controlled input + × clear; filter state lifted to `BoardPage`; `KanbanColumn` accepts `filterText` prop and filters cards client-side; real-time case-insensitive substring match on title and description
- [x] Phase 2: Label enhancements + color picker — `KanbanCard` badge repositioned right of drag handle; `KanbanColumn` min-width → 300px; DB migration `labels text[] → jsonb`; `Label` type `{ name, color }`; `CardRepository` + `PATCH /cards/:id` extended; `LabelColorPicker` swatch grid; default color `#95B9C7`
- [x] Phase 3: E2E + polish — Playwright E2E for filter flow (AC-FILTER-HAPPY-1) and color pick-persist flow (AC-COLOR-HAPPY-1/2); any remaining accessibility edge cases

## Creative Phases

- [x] UI/UX Design → COMPLETE (memory-bank/creative/TASK-013-card-labels-uiux.md)
  - Q1: FilterBar inline in heading row as flex sibling of `<h1>` (justify-content: space-between; board name max-width:50% ellipsis)
  - Q2: KanbanCard single flex row: `[handle] [badge(s)] [title flex:1 ellipsis]`; dnd-kit wiring unchanged
  - Q3: Badge is a `<button>` with caret; opens `position:fixed` focus-trapped popover; flips left within 284px of right edge; optimistic update via TanStack Query onMutate/onError

---

## Execution State

**Build Status**: IDLE
**Current Phase**: BUILD (Phase 3 complete — ALL PHASES DONE)
**Phase Number**: 3 of 3 COMPLETE
**Is Multi-Phase**: YES
**Can Resume**: NO

### Current Build Step
**Step**: Step 11 - Git Commit Phase 3
**Status**: COMPLETE
**Completed**: 2026-06-25

### Sub-Agent: Test Writer Agent
**Agent Type**: Test Writer
**Status**: COMPLETE
**Completed**: 2026-06-25
**Output**: 11 new tests across 3 files (FilterBar.test.tsx x6, KanbanColumn.test.tsx +4, BoardPage.test.tsx +1)

### Sub-Agent: Coding Agent
**Agent Type**: Coding Agent
**Status**: COMPLETE
**Completed**: 2026-06-25
**Output**: 2 new files (FilterBar.tsx, FilterBar.module.css), 4 modified files; 188/188 tests passing

### Active Sub-Agents
(none)

### Completed Steps
- Step 0: TASK-013 auto-provisioned for FEAT-010 — COMPLETE
- Step 0.2: Phase gate passed — COMPLETE
- Step 3: Spec Writer Agent — COMPLETE (2026-06-25)
- Step 4: Codebase analysis — COMPLETE (2026-06-25)
- Step 5: Implementation plan — COMPLETE (2026-06-25)
- Step 6: Planning finalized, status → PLANNING_COMPLETE — COMPLETE (2026-06-25)
- Phase 1 Step 3 Test Writer: COMPLETE (2026-06-25) — 11 tests across 3 files
- Phase 1 Step 4 Coding Agent: COMPLETE (2026-06-25) — FilterBar.tsx + module.css created; KanbanColumn/KanbanBoard/BoardPage updated; 188/188 tests passing
- Phase 1 Step 7 Integration Verification: COMPLETE (2026-06-25) — 188/188 tests, TS clean, lint clean (Phase 1 files)
- Phase 1 Step 8 Code Reviewer: COMPLETE (2026-06-25) — APPROVED; 2 recommended fixes applied (lowerFilter hoisting, remove redundant onClear)
- Phase 1 Step 9 Documentation: COMPLETE (2026-06-25) — techContext.md, systemPatterns.md, productBrief.md updated
- Phase 1 Step 11 Git Commit: COMPLETE (2026-06-25)
- UI/UX Design Agent: COMPLETE (2026-06-25) — memory-bank/creative/TASK-013-card-labels-uiux.md
- Phase 2 Step 3 Test Writer: COMPLETE (2026-06-25) — 17 new tests across 4 files
- Phase 2 Step 4 Coding Agent: COMPLETE (2026-06-25) — LabelColorPicker, KanbanCard layout, Label[] types, backend validation, DB migration; 200/200 frontend, 167 backend
- Phase 2 Step 7 Integration Verification: COMPLETE (2026-06-25) — 200/200 tests, TS clean, lint clean
- Phase 2 Step 8 Code Reviewer: COMPLETE (2026-06-25) — APPROVED; 2 recommended fixes applied (drag-close picker, null-color comment)
- Phase 2 Step 9 Documentation: COMPLETE (2026-06-25) — techContext, systemPatterns, productBrief updated
- Phase 2 Step 11 Git Commit: COMPLETE (2026-06-25)
