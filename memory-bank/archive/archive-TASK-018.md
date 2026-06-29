# Archive: TASK-018 - Delete Card UI

## Metadata

- **Task ID**: TASK-018
- **Feature**: FEAT-015
- **Complexity**: Level 2
- **Completed**: 2026-06-28
- **Branch**: feature/FEAT-015-delete-card-ui
- **Reflection**: [reflection-TASK-018.md](../reflection/reflection-TASK-018.md)

## Summary

Added the frontend delete-card feature to BanyanBoard. Users can now delete any card by clicking the × button in the card header. Deletion is optimistic (card disappears immediately), server-confirmed (204 from existing `DELETE /cards/:id` endpoint), and rolls back with an ErrorBanner if the request fails. The backend endpoint (FEAT-003) was already in place; this task was purely frontend wiring.

## Solution

Implemented as a mirror of the existing `useUpdateCard(columnId)` pattern:

1. **`useDeleteCard(columnId)`** — TanStack Query mutation hook in `hooks.ts` with `onMutate` optimistic cache removal, `onError` snapshot restore, and `onSettled` invalidation. Also evicts the card's detail cache entry (`removeQueries`) on delete to prevent stale-cache flashes if a card detail route is added later.

2. **Delete button on `KanbanCard`** — `<button type="button">` rendering `×` with `aria-label="Delete card: ${card.title}"`. Always visible (not hover-only) for keyboard/touch accessibility. Renders only when `onDelete` prop is provided, keeping `KanbanCard` reusable in drag-overlay contexts.

3. **Wiring in `KanbanColumn`** — `useDeleteCard(column.id)` called at the column level, `handleCardDelete` passed as `onDelete` to every `KanbanCard`, `ErrorBanner` shown when `deleteCard.isError` is true.

## Acceptance Criteria Status

| AC | Status |
|----|--------|
| AC-ENTRY-1: Delete button visible with correct `aria-label` | ✅ Met |
| AC-HAPPY-1: Card disappears immediately, server confirms, absent after reload | ✅ Met |
| AC-ERROR-1: Card reappears on failure, ErrorBanner shown | ✅ Met |
| AC-A11Y-1: Keyboard accessible, visible `focus-visible` ring, screen-reader labelled | ✅ Met |
| AC-OPTIMISTIC-1: Card removed before server responds | ✅ Met |

## Files Changed

- `frontend/src/api/hooks.ts` — Added `useDeleteCard(columnId)` mutation hook
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — Added `onDelete?` prop + delete button in `.cardHeader`
- `frontend/src/components/board/KanbanCard/KanbanCard.module.css` — Added `.deleteButton` styles with `hover` + `focus-visible` states
- `frontend/src/components/board/KanbanColumn/KanbanColumn.tsx` — Wired `useDeleteCard`, `handleCardDelete`, `ErrorBanner` on error

## Test Files

- `frontend/src/api/__tests__/useDeleteCard.test.ts` — NEW: 3 tests (mutationFn, optimistic remove, snapshot restore)
- `frontend/src/components/board/KanbanCard/KanbanCard.test.tsx` — +3 tests (button renders, onClick fires, absent when no onDelete)
- `frontend/src/components/board/KanbanColumn/KanbanColumn.test.tsx` — +2 tests (delete wiring, error banner)
- `frontend/src/pages/BoardPage/BoardPage.test.tsx` — Added `useDeleteCard` mock stub (regression fix)
- `frontend/src/components/board/KanbanBoard/KanbanBoard.test.tsx` — Added `useDeleteCard` mock stub (regression fix)

**Final test suite**: 245/245 passing

## Key Learnings

1. **Wholesale `vi.mock` stub gap**: Adding a new export to a module mocked via `vi.mock('@/api/hooks')` breaks every test file that auto-mocks that module unless an explicit stub is added. Affected `BoardPage.test.tsx` and `KanbanBoard.test.tsx`. Fix: add `mockedUseDeleteCard.mockReturnValue(mockMutation())` to their `beforeEach`.

2. **Missing `vi` import**: Existing component test files often import only `{ describe, it, expect }` without `vi`. Before adding `vi.fn()` calls to an existing test file, verify `vi` is in the import.

Both learnings added to `memory-bank/agent-rules/_learned/testing-patterns.md`.

## Notes

- No confirmation dialog — matches the "no bloat" product brief and the existing `useDeleteBoard` precedent. Undo is out of scope.
- The `removeQueries({ queryKey: queryKeys.cards.detail(cardId) })` call in `onMutate` is proactive insurance for when a card detail route is added. No behavior change in the current app.
- `columnId` closure pattern (hook instantiated in `KanbanColumn`) matches `useUpdateCard` exactly — consistent with how all column-scoped mutations are structured.
