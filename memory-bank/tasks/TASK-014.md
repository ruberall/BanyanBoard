# TASK-014: Card Color Picker

**Complexity**: Level 3 (inherited from FEAT-011)
**Status**: COMPLETE
**Roadmap**: FEAT-011
**Branch**: feature/FEAT-011-card-color-picker
**Worktree**: N/A
**Archived**: memory-bank/archive/archive-TASK-014.md
**Completed**: 2026-06-27

## Task Description

A palette button on each card opens a modal with ~10 pale color swatches. Selecting a swatch sets the card's background color and persists it to the DB. Requires a new `color` column on the `cards` table (migration), backend validation on `PATCH /cards/:id`, and a new `CardColorPicker` modal component on the frontend.

## Specification

**Feature Type**: End-User Feature
**Primary Persona**: Individual Developer (IC contributor — wants to visually distinguish cards at a glance; relies on card background color as a personal triage signal alongside labels and due dates)
**Creative Exploration Needed**: No — design questions resolved inline (see Scope Boundaries)

### Invocation Method
- **Location**: `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — on the `<article>` card element, rendered in every `KanbanColumn` on the board page (`/boards/:boardId`)
- **Element**: A small palette icon button (`🎨` or SVG palette icon) rendered inside `.cardHeader` alongside the drag handle and label badges. Clicking it opens a `CardColorPicker` modal component.
- **Visibility**: Always visible on every card (not behind a hover state or settings menu). The button must have an `aria-label` (e.g., `"Set card color"`) following the existing pattern of the `.dragHandle` button (`aria-label={`Reorder card: ${card.title}`}`).
- **Navigation**: User opens board (`/boards/:boardId`) → scans a column → sees the palette button on any card → clicks it → modal appears.
- **Confidence**: MEDIUM — the exact placement within `.cardHeader` (before drag handle, after drag handle, after labels, in a footer row) needs a creative UX decision. The trigger mechanism itself is HIGH confidence based on the existing label-badge-button pattern.

### Success Criteria
- **User sees**: A modal overlay (`role="dialog"`, `aria-modal="true"`) containing ~10 pale color swatches (the same `SWATCHES` array from `LabelColorPicker.tsx` at `frontend/src/components/board/LabelColorPicker/LabelColorPicker.tsx`) plus a "no color" / clear option. After selecting a swatch, the modal closes and the card's `<article>` background color updates immediately (optimistic UI). After page reload, the color persists.
- **Verifiable at**: The `<article>` element in `KanbanCard.tsx` acquires an inline `style={{ backgroundColor: selectedHex }}` (overriding the `.card { background: #fff }` default in `KanbanCard.module.css`). When `color` is `null`, the default white background is restored.
- **Data persisted**: `cards` table, new `color` column (`VARCHAR(7) NULL` — stores a 7-character hex string like `#fce7f3`, or `NULL` for no color). Returned in the `Card` row from all card-returning queries.
- **Observable within**: Immediate (optimistic UI update on swatch click); round-trip persistence confirmed on next page load.

### Acceptance Criteria

#### AC-ENTRY-1: Palette button is visible on every card
**Priority**: MUST
**Given** a logged-in user is viewing a board at `/boards/:boardId` with at least one card
**When** they look at any card in any column
**Then** a palette icon button is visible on the card with `aria-label="Set card color"` (or equivalent descriptive label), keyboard-focusable, and present regardless of whether the card has labels, a due date, or a description

#### AC-HAPPY-1: User sets a card background color
**Priority**: MUST
**Given** the user is on the board page and can see the palette button on a card
**When** they:
  1. Click the palette button on a card
  2. See the `CardColorPicker` modal with ~10 pale color swatches and a "no color" option
  3. Click a swatch (e.g., "Pale rose" `#fce7f3`)
**Then**:
  - The modal closes
  - The card `<article>` background color changes to `#fce7f3` immediately (optimistic update)
  - `PATCH /cards/:id` is called with `{ color: "#fce7f3" }` and returns `200` with the updated card including `color: "#fce7f3"`
  - On page reload, the card still shows the `#fce7f3` background (confirming DB persistence)

#### AC-HAPPY-2: User clears a card color (resets to default white)
**Priority**: MUST
**Given** a card that already has `color: "#fce7f3"` set
**When** the user opens the color picker and clicks the "no color" / clear option
**Then**:
  - The modal closes
  - The card background reverts to the default `#fff` (the `.card` CSS rule in `KanbanCard.module.css`)
  - `PATCH /cards/:id` is called with `{ color: null }` and returns `200` with the updated card including `color: null`
  - On page reload, the card shows the default white background

#### AC-ENTRY-2: Color picker is a modal (not a popover anchored to a position)
**Priority**: MUST
**Given** the user clicks the palette button
**When** the `CardColorPicker` opens
**Then** it renders as a centered modal overlay with a backdrop (not as a position-fixed popover anchored to the button's `getBoundingClientRect()` — that pattern is used by `LabelColorPicker` for label colors and must remain separate). The modal must have `role="dialog"` and `aria-modal="true"`.

#### AC-KEYBOARD-1: Color picker is keyboard accessible
**Priority**: MUST
**Given** the modal is open
**When** the user presses `Escape`
**Then** the modal closes without selecting a color, following the same keyboard-dismiss pattern as `LabelColorPicker` (line 47: `if (e.key === 'Escape') onClose()`)

**Given** the modal is open
**When** focus is managed on open
**Then** focus moves to the first swatch button automatically (same pattern as `LabelColorPicker` `firstSwatchRef.current?.focus()` at line 74)

#### AC-PERSIST-1: Card color survives column moves and drag-and-drop
**Priority**: MUST
**Given** a card with `color: "#fce7f3"` is dragged from one column to another (via `PATCH /cards/:id/move`)
**When** the move completes
**Then** the card still displays the `#fce7f3` background (the move endpoint does not clear `color`)

#### AC-API-1: Backend validates the color field on PATCH /cards/:id
**Priority**: MUST
**Given** a `PATCH /cards/:id` request
**When** the request body includes `{ color: "notahex" }` (an invalid color value)
**Then** the API returns `400` with `{ error: "ValidationError", message: "color must be a valid hex color (#rrggbb)" }` (following the existing `ValidationError` pattern in `backend/src/routes/cards.ts` line 37–38 for label colors)

**When** the request body includes `{ color: null }`
**Then** the API returns `200`, the `color` column is set to `NULL`, and the response card includes `color: null`

**When** the request body includes `{ color: "#fce7f3" }`
**Then** the API returns `200`, the `color` column is set to `"#fce7f3"`, and the response card includes `color: "#fce7f3"`

#### AC-ERROR-1: Network failure on color save does not corrupt card state
**Priority**: MUST
**Given** the user selects a color swatch and the optimistic UI update has applied
**When** the `PATCH /cards/:id` call fails (network error or 5xx)
**Then** the card background color reverts to its previous value (optimistic rollback), and the user sees an error notification (following the existing error-handling pattern in the board page)

### Scope Boundaries
- **In scope**:
  - New `color VARCHAR(7) NULL` column on the `cards` table via a new migration file (naming convention: `YYYYMMDDHHMMSS_add-color-to-cards.js`, e.g., `20260627120000_add-color-to-cards.js` — following the format of recent migrations like `20260625120000_labels-jsonb.js`)
  - Add `color?: string | null` to the `Card` interface in `frontend/src/types/index.ts` and the `Card`/`CardUpdate` interfaces in `backend/src/repositories/card.repository.ts`
  - Add `'color'` to `VALID_PATCH_FIELDS` in `backend/src/routes/cards.ts` (line 11) and add hex validation for the `color` field (parallel to the existing label color validation at lines 37–38)
  - Add `color` to the `RETURNING` clause in all `CardRepository` SQL queries (`createCard`, `findCardsByColumnId`, `findCardById`, `updateCard`, `moveCard`) in `backend/src/repositories/card.repository.ts`
  - New `CardColorPicker` modal component at `frontend/src/components/board/CardColorPicker/CardColorPicker.tsx` — reuses the `SWATCHES` constant (consider extracting to a shared `frontend/src/lib/swatches.ts`) plus adds a "no color" clear option
  - Palette trigger button added to `KanbanCard.tsx` in `.cardHeader`
  - Inline `backgroundColor` style applied to the `<article>` when `card.color` is non-null
  - Optimistic UI update via the existing TanStack Query mutation pattern used for label color changes
- **Out of scope**:
  - Custom hex color input (user types their own hex) — only the predefined ~10 pale swatches
  - Column-level or board-level background colors
  - Changing the color of individual label badges (that is handled by `LabelColorPicker` and is a separate feature)
  - Color theming or dark mode
  - Mobile drag-and-drop color persistence edge cases (nice-to-have, not MVP)
- **Dependencies**:
  - The `cards` table migration must run before the backend serves the `color` field (handled automatically by `RUN_MIGRATIONS_ON_START=true` in Docker Compose)
  - `LabelColorPicker`'s `SWATCHES` array (10 entries at lines 4–15 of `LabelColorPicker.tsx`) is the palette to reuse or extract
- **NFR implications**:
  - **Accessibility (WCAG 2.1 AA)**: The palette button must have a descriptive `aria-label`; the modal must be keyboard-dismissible (Escape); focus must be moved to the first swatch on open. Color must not be the only signal — the card title and labels remain visible regardless of background. Color contrast of card text against pale swatch backgrounds must meet AA (7:1 for normal text). Pale colors like `#fce7f3` should have sufficient contrast with `#4a5568` body text.
  - **Performance**: `PATCH /cards/:id` is a single-field update; p95 < 200ms target applies. The color swatch palette is statically defined (no API call needed to load swatches).
  - **Security**: `color` field validated server-side as `/^#[0-9a-fA-F]{6}$/` or null — no injection risk. Follows existing `HEX_COLOR_RE` pattern already in `cards.ts` at line 38.

### Design Decisions (DECIDED — no creative phase required)

1. **Palette button placement**: After label badges, before the `<h3>` title — i.e., the DOM order in `.cardHeader` is `[drag handle] [label badges...] [palette button] [title]`. This keeps the palette button visually grouped with the label badges (both are card metadata controls) and separated from the title text.

2. **Modal close affordance**: An `×` close button in the top-right corner of the modal. Backdrop click also closes (clicking outside the modal panel). `Escape` key closes (existing keyboard pattern). No separate "Cancel" button — the `×` and Escape are sufficient.

3. **"No color" clear affordance**: A white swatch with a diagonal red slash (`⊘` overlay or CSS `::after` pseudo-element). `aria-label="No color"`. Placed as the first swatch in the grid so it is the natural focus target on open when a card has no color set (otherwise the currently-selected swatch gets focus).

## Test Strategy

### Approach
- **Emphasis**: Unit (RTL for new modal component) + extend-existing (card/route/repository tests); Playwright E2E for the end-to-end color-pick-and-persist flow
- **Target test count**: 18–24 across all phases

### File Organization

**New test files (create):**
- `frontend/src/components/board/CardColorPicker/CardColorPicker.test.tsx` — modal renders 11 swatches (10 pale + no-color), selecting pale swatch calls onColorSelect, selecting no-color swatch calls onColorSelect(null), Escape calls onClose, × button calls onClose, focus moves to first swatch on open, each swatch has aria-label

**Extend existing (add tests to):**
- `frontend/src/components/board/KanbanCard/KanbanCard.test.tsx` — palette button present with aria-label; clicking palette button opens CardColorPicker; card article has backgroundColor style when card.color is set; card article has no backgroundColor style when card.color is null
- `frontend/src/pages/BoardPage/BoardPage.test.tsx` — card renders with color applied (integration smoke test)
- `backend/src/routes/__tests__/cards.routes.test.ts` — PATCH with valid hex color → 200; PATCH with null color → 200 clears; PATCH with invalid color string → 400 ValidationError
- `backend/src/repositories/__tests__/card.repository.test.ts` — createCard returns color field; updateCard persists color; findCardsByColumnId includes color in result

### What NOT to Test
- CSS pixel-exact swatch layout — reason: visual regression; DOM/aria checks are sufficient
- Browser backdrop-click behavior — reason: jsdom does not simulate real pointer events outside modal; cover in Playwright E2E instead
- `SWATCHES` constant contents — reason: covered by aria-label assertions; palette is static config not logic

### Per-Phase Test Guidance
- **Phase 1** (DB + Backend): 4–6 tests extending `cards.routes.test.ts` + `card.repository.test.ts`
  - PATCH valid hex → 200 with color in response
  - PATCH null → 200 with color: null in response
  - PATCH invalid string → 400 ValidationError
  - Repository createCard includes color; updateCard persists color
- **Phase 2** (Frontend modal + card integration): 7–10 tests in `CardColorPicker.test.tsx` + 3–4 extensions to `KanbanCard.test.tsx`
  - Modal renders 11 swatches (10 pale + no-color)
  - Swatch click fires onColorSelect with correct hex
  - No-color swatch fires onColorSelect(null)
  - × button fires onClose
  - Escape fires onClose
  - Focus on first swatch on open
  - aria-labels present on all swatches
  - KanbanCard palette button visible with aria-label
  - KanbanCard with color prop applies backgroundColor inline style
  - KanbanCard with null color has no inline backgroundColor
- **Phase 3** (E2E): 2 Playwright tests
  - AC-HAPPY-1: set color → reload → color persists
  - AC-HAPPY-2: clear color → reload → default white

## Implementation Roadmap

- [x] Phase 1: DB migration + backend — add `color VARCHAR(7) NULL` migration; add `color` to `VALID_PATCH_FIELDS` and hex validation in `cards.ts`; add `color` to all `RETURNING` clauses in `CardRepository`; add `color?: string | null` to backend `Card`/`CardUpdate` types
- [x] Phase 2: Frontend modal + card integration — `CardColorPicker` modal component (11 swatches: no-color + 10 pale, × close button, Escape/backdrop dismiss, focus management); palette trigger button in `KanbanCard.tsx` after label badges; inline `backgroundColor` style on `<article>`; `updateCardColor` TanStack Query mutation with optimistic update + rollback; extract shared `swatches.ts` constant
- [x] Phase 3: E2E tests — Playwright tests covering AC-HAPPY-1 (set color + reload) and AC-HAPPY-2 (clear color + reload)

## Creative Phases

- [x] UI/UX Design → RESOLVED INLINE (no /banyan-creative needed)
  - Q1: Palette button after label badges, before `<h3>` title in `.cardHeader`
  - Q2: × button in modal top-right + backdrop click + Escape to close
  - Q3: White swatch with diagonal red slash as "no color" option, `aria-label="No color"`, placed first in the grid

---

## Execution State

**Build Status**: IDLE
**Current Phase**: COMPLETE
**Can Resume**: NO

### Current Build Step
**Step**: Phase 3 — COMPLETE
**Status**: COMPLETE
**Completed**: 2026-06-27

### Completed Steps
- Step 0: TASK-014 auto-provisioned for FEAT-011 — COMPLETE
- Step 0.2: Phase gate passed — COMPLETE
- Step 3 (plan): Spec Writer Agent — COMPLETE (2026-06-27)
- Step 3.2 (plan): Human review — APPROVED (2026-06-27)
- Step 6 (plan): Planning finalized — COMPLETE (2026-06-27)
- Step 0.5 Git Setup: COMPLETE (2026-06-27) — branch feature/FEAT-011-card-color-picker created
- Phase 1 Step 3 Test Writer: COMPLETE (2026-06-27) — 7 tests across 2 files
- Phase 1 Step 4 Coding Agent: COMPLETE (2026-06-27) — migration + Card type + RETURNING clauses + route validation
- Phase 1 Step 7 Integration Verification: COMPLETE (2026-06-27) — 169 backend / 195 frontend tests passing, TS clean
- Phase 1 Step 11 Git Commit: COMPLETE (2026-06-27) — d44307a
- Phase 2 Step 3 Test Writer: COMPLETE (2026-06-27) — 11 CardColorPicker tests + 6 KanbanCard extensions
- Phase 2 Step 4 Coding Agent: COMPLETE (2026-06-27) — CardColorPicker modal, swatches.ts, KanbanCard integration, hooks/endpoints/types
- Phase 2 Step 7 Integration Verification: COMPLETE (2026-06-27) — 213/213 tests passing
- Phase 2 Step 11 Git Commit: COMPLETE (2026-06-27) — 7efec9b (focus trap + X-slash + 213 tests)
- Phase 3 Step 3 Test Writer: COMPLETE (2026-06-27) — card-color.spec.ts (2 Playwright tests)
- Phase 3 Step 11 Git Commit: COMPLETE (2026-06-27) — 63adbda
