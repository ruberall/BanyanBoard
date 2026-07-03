# TASK-021: Add edit card title capability

**Complexity**: Level 1
**Status**: REFLECTION_COMPLETE
**Roadmap**: N/A
**Branch**: task/021-add-edit-card-title
**Worktree**: C:\Users\uberallr\projects\BanyanBoard (Level 1 uses direct branch on main checkout, not a separate worktree)
**Reflection**: memory-bank/reflection/reflection-TASK-021.md

## Task Description

Add edit card title capability. Backend `PATCH /cards/:id` already supports title updates (`VALID_PATCH_FIELDS` includes `'title'` in `backend/src/routes/cards.ts:13`; `CardService.updateCard`/`CardRepository` already persist it) and the frontend already has a generic `updateCard` endpoint + hook wired to that route (used today by the label/card color pickers). Add an edit-title UI affordance inside `CardDetailModal` (click title to edit, input field, Save/Cancel) that calls the existing update mutation. No new backend or repository work needed.

## Implementation Notes

- No new backend/repository code — `PATCH /cards/:id` and `CardService.updateCard` already handle `title`.
- Frontend: reuse the existing generic `updateCard` endpoint/hook (see `frontend/src/api/endpoints.ts`, `frontend/src/api/hooks.ts`) already used by label/card-color pickers in `KanbanColumn.tsx`.
- Scope is UI-only, inside `CardDetailModal` (`frontend/src/components/board/CardDetailModal/`): click-to-edit title, Save/Cancel affordance, following existing inline-edit/loading/error conventions in the codebase (e.g. `DeliveryHistoryPanel.tsx`, `ErrorBanner`).
- Likely files: `CardDetailModal.tsx`, `CardDetailModal.module.css`, `CardDetailModal.test.tsx`.

## Implementation Roadmap

- [x] Phase 1: Add click-to-edit title UI in `CardDetailModal` (input + Save/Cancel), wired to the existing `updateCard` mutation — no backend/repository changes

## Completed Bug Fixes / Changes

- [X] [Level 1] Added: Edit card title capability (Completed: 2026-07-03)
  - Issue: No way to edit a card's title from the UI, despite the backend (`PATCH /cards/:id`) and the generic frontend `updateCard` endpoint already fully supporting it.
  - Solution: Added a new `useUpdateCardTitle(cardId)` hook (`frontend/src/api/hooks.ts`) reusing the existing `updateCard` endpoint, invalidating `queryKeys.cards.all` on success. Added click-to-edit UI in `CardDetailModal`: an "Edit title" button swaps the heading for an input with Save/Cancel; Save validates non-empty (trimmed) title, shows inline `role="alert"` errors for both validation and mutation failures (mirrors `CreateCardForm`'s pattern), and disables while pending; Cancel discards the draft with no mutation call.
  - Files changed:
    - `frontend/src/api/hooks.ts` — new `useUpdateCardTitle`
    - `frontend/src/api/__tests__/hooks.test.ts` — 3 new tests
    - `frontend/src/components/board/CardDetailModal/CardDetailModal.tsx` — edit-title UI
    - `frontend/src/components/board/CardDetailModal/CardDetailModal.module.css` — new styles
    - `frontend/src/components/board/CardDetailModal/__tests__/CardDetailModal.test.tsx` — 8 new tests
  - Verification: 297/297 frontend tests passing (was 286), `tsc -b` clean, `eslint src` clean. No backend/repository changes needed or made.

## Creative Phases

(none required — Level 1)

---

## Execution State

**Build Status**: IDLE
**Current Phase**: REFLECT → ARCHIVE
**Can Resume**: NO

### Active Sub-Agents
(none)

### Completed Steps
- Phase 1: COMPLETE — tests written first (TDD), implementation added, 297/297 frontend tests passing, `tsc -b` clean, `eslint src` clean
- Reflection: COMPLETE — reflection-TASK-021.md written, both dimensions evaluated; 1 learning extracted (api-design.md amended, evidence_count 4→5)
