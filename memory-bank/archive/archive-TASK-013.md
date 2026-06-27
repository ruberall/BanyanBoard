# Archive: Card Labels (TASK-013)

## Metadata

- **Task ID**: TASK-013
- **Complexity**: Level 3 (inherited from FEAT-010)
- **Feature**: FEAT-010 — Card Labels
- **Branch**: feature/FEAT-010-card-labels
- **Started**: 2026-06-25
- **Completed**: 2026-06-27
- **Roadmap Link**: FEAT-010

## Summary

TASK-013 delivered three distinct card-label enhancements to BanyanBoard in a single build day:

1. **FilterBar** — a real-time client-side card search input in the board page heading row, with case-insensitive substring match on title and description, and an × clear button.
2. **Label badge repositioning** — moved the label badge from below the card title to inline with the drag handle (single flex row: handle → badge → title), with column min-width increased from 280px to 300px.
3. **User-chosen pale label color** — a 10-swatch `LabelColorPicker` popover opened by clicking a label badge; colors stored per-card in PostgreSQL via a `labels text[] → jsonb` migration; `Label` type `{ name: string; color: string }`.

All 16 acceptance criteria were met. The total test count grew from ~177 baseline to 213 (11 new in Phase 1, 17 new in Phase 2, 3 Playwright E2E in Phase 3). All 3 Playwright E2E tests verified against the live Docker Compose stack on 2026-06-27.

## Acceptance Criteria

| AC | Description | Status |
|----|-------------|--------|
| AC-FILTER-ENTRY-1 | FilterBar visible on board load with `aria-label="Filter cards"` | ✅ Met |
| AC-FILTER-HAPPY-1 | Filter by title substring (case-insensitive) | ✅ Met |
| AC-FILTER-HAPPY-2 | Filter by description substring | ✅ Met |
| AC-FILTER-HAPPY-3 | × clear restores all cards | ✅ Met |
| AC-FILTER-HAPPY-4 | Backspace-to-empty restores all cards | ✅ Met |
| AC-FILTER-ERROR-1 | No matches → empty state, no crash | ✅ Met |
| AC-FILTER-A11Y-1 | FilterBar aria-labels on input and × button | ✅ Met |
| AC-LABEL-POS-1 | Badge right of drag handle in flex row | ✅ Met |
| AC-LABEL-POS-2 | Cards without labels render without badge row | ✅ Met |
| AC-LABEL-POS-3 | Column min-width ≥ 300px | ✅ Met |
| AC-COLOR-ENTRY-1 | Badge click opens 10-swatch picker | ✅ Met |
| AC-COLOR-HAPPY-1 | Swatch selection updates badge and sends PATCH | ✅ Met |
| AC-COLOR-HAPPY-2 | Color persists across page reload | ✅ Met |
| AC-COLOR-HAPPY-3 | Default color `#95B9C7` for no-color labels | ✅ Met |
| AC-COLOR-ERROR-1 | Invalid hex → 400 ValidationError | ✅ Met |
| AC-COLOR-A11Y-1 | Swatch aria-labels; badge text visible (WCAG 1.4.1) | ✅ Met |
| AC-COLOR-A11Y-2 | WCAG AA contrast on all 10 pale swatches | ✅ Met |

## Implementation

### Approach

Level 3 three-phase build following a creative phase that resolved all design questions upfront. The creative phase specified concrete CSS values, interaction semantics, and component boundaries before any code was written — this eliminated mid-build design debate entirely.

### Key Components

1. **`FilterBar`** (`frontend/src/components/board/FilterBar/`)
   - Controlled search input with derived-state external-reset detection
   - Emits `onChange(value: string)`; × button with `aria-label="Clear filter"`
   - Filter state lifted to `BoardPage`; passed as `filterText` prop to `KanbanColumn`

2. **`LabelColorPicker`** (`frontend/src/components/board/LabelColorPicker/`)
   - `position:fixed` popover anchored via `anchorRect: DOMRect` prop
   - 10 Tailwind 50/100-tier pale swatches from `@/lib/swatches`
   - Flip logic: if within 284px of right edge, right-anchors instead of left-anchors
   - Focus-trapped; dismissed by Escape, outside click, or swatch selection

3. **`KanbanCard` changes**
   - Single flex header row: drag handle → label `<button>` badges → title
   - Badge renders `label.color` as `backgroundColor` (default `#95B9C7`)
   - Badge `aria-label`: `"${label.name} — click to change color"`

4. **DB migration** (`backend/migrations/<epoch>_labels-jsonb.js`)
   - `ALTER TABLE cards ALTER COLUMN labels TYPE jsonb USING to_jsonb(labels)`
   - Reversible `down()` that extracts `name` field back to `text[]`

5. **`Label` type** (`frontend/src/types/index.ts`, `backend/src/repositories/card.repository.ts`)
   - `{ name: string; color: string }`; replaces `string[]` everywhere

6. **`PATCH /cards/:id` validation** (`backend/src/routes/cards.ts`)
   - Each `Label.color` validated against `/^#[0-9a-fA-F]{6}$/`; `null` rejected explicitly

### Design Decisions

Reference: `memory-bank/creative/TASK-013-card-labels-uiux.md` (in feature worktree — merged to main with this task)

Key decisions:
- **FilterBar placement**: Inline in heading row as flex sibling of `<h1>` (justify-content: space-between; board name max-width: 50% ellipsis; right margin accounts for ActivityFeed sidebar)
- **Card header layout**: Single flex row: `[handle] [badge(s)] [title flex:1 ellipsis]`
- **Color picker trigger**: Badge-as-`<button>` with `aria-expanded`; `position:fixed` popover (no portal dependency)

## Testing

- **Unit/integration tests added**: 28 across 6 files (Phase 1: 11, Phase 2: 17)
- **E2E tests added**: 3 Playwright tests in `frontend/e2e/card-labels.spec.ts`
- **E2E verification**: All 3 passed against live Docker Compose stack (2026-06-27, 3.1s)
- **Final test count**: 213 (up from ~177 baseline)
- **All tests passing**: ✅

## Files Changed

**New files:**
- `frontend/src/components/board/FilterBar/FilterBar.tsx`
- `frontend/src/components/board/FilterBar/FilterBar.module.css`
- `frontend/src/components/board/FilterBar/FilterBar.test.tsx`
- `frontend/src/components/board/LabelColorPicker/LabelColorPicker.tsx`
- `frontend/src/components/board/LabelColorPicker/LabelColorPicker.module.css`
- `frontend/src/components/board/LabelColorPicker/LabelColorPicker.test.tsx`
- `frontend/src/lib/swatches.ts` — 10-swatch palette constant
- `backend/migrations/<epoch>_labels-jsonb.js` — DB schema migration
- `frontend/e2e/card-labels.spec.ts` — Playwright E2E tests

**Modified files:**
- `frontend/src/types/index.ts` — `Label` interface; `Card.labels: Label[]`
- `frontend/src/pages/BoardPage/BoardPage.tsx` — filter state lift; `FilterBar` render
- `frontend/src/pages/BoardPage/BoardPage.module.css` — heading flex layout
- `frontend/src/components/board/KanbanColumn/KanbanColumn.tsx` — `filterText` prop
- `frontend/src/components/board/KanbanColumn/KanbanColumn.module.css` — min-width 300px
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — badge layout; color; `LabelColorPicker` integration
- `frontend/src/components/board/KanbanCard/KanbanCard.module.css` — flex header row
- `backend/src/repositories/card.repository.ts` — `Label[]` type; `::jsonb` SQL
- `backend/src/routes/cards.ts` — `labels[].color` hex validation
- Various test files extended: `KanbanColumn.test.tsx`, `KanbanCard.test.tsx`, `BoardPage.test.tsx`, `cards.routes.test.ts`, `card.repository.test.ts`

## Technical Debt

| Item | Severity | Estimated Effort |
|------|----------|-----------------|
| Wire `onMutate`/`onError` rollback in `LabelColorPicker` optimistic mutation | Medium | 1–2 hours |
| Extract `ActivityFeed` 284px constant to shared CSS custom property / JS module | Low | 30 min |

## Lessons Learned

1. **Creative phase eliminates mid-build design decisions** — All three creative questions were fully resolved before the first line of code was written. None of the three build phases required stopping for a design choice.
2. **Code review catches real issues, not just style** — Phase 1: `lowerFilter` hoisting (perf). Phase 2: drag-close race condition (correctness). Both were bugs that would have reached production without the review gate.
3. **Fix pre-existing type mismatches in the same phase** — `string[]` → `Label[]` broke existing test fixtures; fixing them in Phase 2 (not deferred) kept the test suite coherent.
4. **E2E tests need live-stack verification** — Phase 3 committed `card-labels.spec.ts` without running it; first verified on 2026-06-27 (all 3 passed). The PLAYWRIGHT_UNVERIFIED pattern should trigger a live-stack run before archiving.

## References

- **Reflection**: `memory-bank/reflection/reflection-TASK-013.md`
- **Feature**: FEAT-010 in `memory-bank/roadmap.md`
- **Branch merged**: `feature/FEAT-010-card-labels` → `main` (local-merge, 2026-06-27)

## Follow-up

- Wire optimistic rollback in `LabelColorPicker` (technical debt — see above)
- Extract `ActivityFeed` width constant to shared module
- Filter state persistence via URL search params (natural Level 2 follow-on — enables link-sharing filtered board views)
