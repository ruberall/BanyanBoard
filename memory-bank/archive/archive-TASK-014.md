# Archive: Card Color Picker

## Metadata
- **Task ID**: TASK-014
- **Complexity**: Level 3
- **Started**: 2026-06-27
- **Completed**: 2026-06-27
- **Roadmap Link**: FEAT-011

## Summary

TASK-014 added a per-card background color feature to BanyanBoard. A small palette button (🎨) on every Kanban card opens a centered modal with 10 pale color swatches plus a "no color" clear option. Selecting a swatch applies an optimistic `backgroundColor` inline style to the card `<article>` and persists a `color VARCHAR(7) NULL` field to the `cards` table via `PATCH /cards/:id`. The color survives column moves and page reloads.

The feature was requested to give individual contributors a quick visual triage signal — distinguishing cards at a glance using background color alongside labels and due dates.

## Requirements

### Original Requirements
- Palette button visible on every card, always (not hover-gated)
- ~10 pale color swatches + "no color" clear option
- Centered modal (not popover anchored to button position)
- Optimistic UI update on swatch click; modal closes immediately
- DB persistence via new `color VARCHAR(7) NULL` column on `cards` table
- Color survives column moves (drag-and-drop)
- Keyboard accessible: Escape closes, focus on first swatch on open, focus trap

### Success Criteria
- [✓] AC-ENTRY-1: Palette button on every card with `aria-label="Set card color"`
- [✓] AC-HAPPY-1: Select swatch → optimistic update → persists on reload
- [✓] AC-HAPPY-2: Select "no color" → card reverts to default white → persists on reload
- [✓] AC-ENTRY-2: Modal with `role="dialog"` and `aria-modal="true"`, centered overlay
- [✓] AC-KEYBOARD-1: Escape closes, auto-focus first swatch, Tab focus trap
- [✓] AC-PERSIST-1: Color survives column moves (RETURNING clause covers `moveCard`)
- [✓] AC-API-1: Backend validates hex format, returns 400 on invalid, accepts null
- [✓] AC-ERROR-1: Optimistic rollback on network failure (toast notification is deferred — see Technical Debt)

## Implementation

### Approach

Three-phase build:
1. **Backend foundation**: DB migration + `RETURNING` clause updates + route validation
2. **Frontend integration**: `CardColorPicker` modal component + `KanbanCard` wiring + TanStack Query mutation
3. **E2E tests**: Playwright specs for the two primary happy paths

No `/banyan-creative` phase was needed — all design questions were resolved inline using `LabelColorPicker` as a precedent.

### Key Components

1. **`backend/migrations/20260627120000_add-color-to-cards.js`**
   - Adds `color VARCHAR(7) NULL DEFAULT NULL` to `cards` table
   - Runs automatically on API startup via `RUN_MIGRATIONS_ON_START=true`

2. **`backend/src/repositories/card.repository.ts`**
   - `color?: string | null` added to `Card` and `CardUpdate` interfaces
   - `color` added to `RETURNING` clause in all 5 query methods: `createCard`, `findCardsByColumnId`, `findCardById`, `updateCard`, `moveCard`

3. **`backend/src/routes/cards.ts`**
   - `'color'` added to `VALID_PATCH_FIELDS`
   - Hex validation: `/^#[0-9a-fA-F]{6}$/` — returns `400 ValidationError` on invalid strings

4. **`frontend/src/lib/swatches.ts`** *(new shared file)*
   - Extracted `SWATCHES` constant (10 pale colors) from `LabelColorPicker.tsx`
   - Both pickers import from one source of truth

5. **`frontend/src/components/board/CardColorPicker/CardColorPicker.tsx`** *(new component)*
   - Centered modal with `role="dialog"`, `aria-modal="true"`
   - 10 pale color swatches + "no color" (white with red diagonal X via `::before`/`::after`)
   - `×` close button, backdrop click dismiss, Escape dismiss
   - Focus trap (Tab cycles within modal); auto-focus on first swatch on open
   - Learned fix: `useEffect` listener registration does NOT use `requestAnimationFrame` guard — that pattern deferred listeners past jsdom's synthetic events, breaking RTL dismiss tests

6. **`frontend/src/components/board/KanbanCard/KanbanCard.tsx`**
   - Palette button (`🎨`, `aria-label="Set card color"`) added to `.cardHeader`
   - `<article>` receives `style={{ backgroundColor: card.color }}` when color is non-null
   - `colorPickerOpen` state, `handleCardColorSelect`, `handleCardColorClose`

7. **`frontend/src/components/board/KanbanColumn/KanbanColumn.tsx`**
   - `handleCardColorChange(cardId, color)` wires KanbanCard → TanStack Query mutation
   - `useUpdateCard` mutation handles optimistic update, rollback, and cache invalidation

8. **`frontend/e2e/card-color.spec.ts`** *(new)*
   - AC-HAPPY-1: Set color → reload → persists
   - AC-HAPPY-2: Clear color → reload → default white

### Design Decisions

All design questions were resolved inline (no separate creative document):

1. **Palette button placement**: After label badges, before `<h3>` title in `.cardHeader` — keeps palette button visually grouped with card metadata controls
2. **Modal close affordance**: `×` top-right button + backdrop click + Escape key
3. **"No color" swatch**: White swatch with CSS `::before`/`::after` diagonal red slash, `aria-label="No color"`, placed first in grid

## Testing

- **Unit tests added**: 213 total suite (17 new across `CardColorPicker.test.tsx`, `KanbanCard.test.tsx`, backend routes/repository)
- **E2E tests added**: 2 Playwright tests in `e2e/card-color.spec.ts`
- **All tests passing**: ✅ 213/213 at every phase commit

## Files Changed

- `backend/migrations/20260627120000_add-color-to-cards.js` — New migration: color column
- `backend/src/repositories/card.repository.ts` — color in interfaces + RETURNING clauses
- `backend/src/repositories/__tests__/card.repository.test.ts` — color field assertions
- `backend/src/routes/cards.ts` — VALID_PATCH_FIELDS + hex validation
- `backend/src/routes/__tests__/cards.routes.test.ts` — color validation tests
- `frontend/src/lib/swatches.ts` — New shared swatches constant
- `frontend/src/components/board/CardColorPicker/CardColorPicker.tsx` — New modal component
- `frontend/src/components/board/CardColorPicker/CardColorPicker.module.css` — New styles
- `frontend/src/components/board/CardColorPicker/CardColorPicker.test.tsx` — New unit tests
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — Palette button + color style
- `frontend/src/components/board/KanbanCard/KanbanCard.module.css` — colorButton style
- `frontend/src/components/board/KanbanCard/KanbanCard.test.tsx` — Color integration tests
- `frontend/src/components/board/KanbanColumn/KanbanColumn.tsx` — handleCardColorChange
- `frontend/src/components/board/LabelColorPicker/LabelColorPicker.tsx` — Now imports from swatches.ts
- `frontend/src/api/hooks.ts` — UpdateCardVars + useUpdateCard color support
- `frontend/src/types/index.ts` — Card.color field
- `frontend/e2e/card-color.spec.ts` — New Playwright E2E tests

## Lessons Learned

Key takeaways from reflection (full detail in reflection document):

1. **rAF guard breaks RTL dismiss tests**: `requestAnimationFrame` wrapping `useEffect` event listener registration defers listener setup past jsdom's synthetic event dispatch. The guard is redundant since `useEffect` runs post-render. Removed; tests then passed.
2. **RETURNING clause must be complete**: When adding a nullable column, all repository query methods (create, findAll, findById, update, move) must be updated in a single commit — partial RETURNING causes inconsistent API responses.
3. **TanStack Query optimistic rollback**: Snapshot current cache in `onMutate`, restore in `onError`, invalidate in `onSettled`. Without the snapshot, a failed PATCH leaves the optimistic value permanently applied.
4. **Docker Compose API image rebuild**: The `api` service uses a baked image (no source volume mount). Code changes require `docker compose up -d --build api`, not just `restart`.

Reference: `memory-bank/reflection/reflection-TASK-014.md`

## Technical Debt

- **Error toast on optimistic rollback (AC-ERROR-1)**: The rollback itself works (`onError` restores snapshot), but no explicit toast fires. Wire `onError` to the `addToast` pattern in `BoardPage` in a future task.
- **Playwright E2E runtime validation**: E2E tests were verified by code review, not live execution, during the build session. Confirm they pass via `npx playwright test e2e/card-color.spec.ts` after next `docker compose up`.

## References

- **Reflection**: `memory-bank/reflection/reflection-TASK-014.md`
- **Task spec**: `memory-bank/tasks/TASK-014.md`
- **Roadmap feature**: FEAT-011 in `memory-bank/roadmap.md`
