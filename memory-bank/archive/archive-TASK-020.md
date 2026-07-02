# Archive: Card Activity Feed

## Metadata
- Task ID: TASK-020
- Feature: FEAT-017
- Complexity: Level 2
- Completed: 2026-07-02

## Summary

Added a per-card activity view to BanyanBoard. Clicking a card's title opens a `CardDetailModal` showing that card's event history (creations, moves) fetched from the existing durable `card_events` table — no new table, no new repository, reusing `EventRepository` throughout. Built in 4 phases: repository read method → REST route + message projection → frontend data layer → UI component + wiring.

During the build's lifecycle, a `/banyan-ux-ingest --live-walk` run discovered a pre-existing bug from TASK-012 (`CardService.moveCard` hardcoded `fromColumnName`/`toColumnName` as `null`) — invisible until this feature rendered those payload fields as human-readable text. Fixed and regression-tested same-day (commit `eebac6e`). A subsequent `/banyan-uat` run confirmed the fix works for new events but correctly flagged that 3 historical event rows (dated 2026-06-22, before the fix) permanently retain their broken message text, since event payloads are immutable once written. This was triaged as an explicit, documented product/data decision (backfill vs. accept) rather than an open code defect, and the task proceeded to reflection/archive on that basis.

## Solution

**Backend**: `EventRepository.findByCardId(cardId, limit)` (mirrors `findRecentByBoard`) → `GET /cards/:id/activity` route on the existing `createCardsRouter`, with a `projectActivityRow` pure projection (mirrors `projectEventRow` in `feed.ts`) deriving human-readable `message` text from existing event payloads.

**Frontend**: `CardActivityEntry` type, `getCardActivity` endpoint, `cardActivity` query key, `useCardActivity` hook (mirrors `useWebhookDeliveries`), and a new `CardDetailModal` component using the established `<dialog>` pattern from `BoardSettingsModal`. `KanbanCard`'s title became a clickable button, with modal-open state kept local to `KanbanCard` (matching the existing `pickerState`/`colorPickerOpen` precedent, overriding the spec's initial suggestion to lift state to `KanbanColumn`).

**Post-build fix**: `card.service.ts`'s `moveCard` now passes real `sourceColumnName`/`destColName` (already fetched elsewhere in the method) to `emitCardMoved` instead of hardcoded `null`, fixing `card.moved` activity messages for all new events going forward.

## Files Changed

- `backend/src/repositories/event.repository.ts` — `findByCardId` method
- `backend/src/routes/cards.ts` — `GET /:id/activity` route + `projectActivityRow`
- `backend/src/services/card.service.ts` — post-build fix: real column names in `emitCardMoved`
- `frontend/src/types/index.ts` — `CardActivityEntry` type
- `frontend/src/api/endpoints.ts`, `queryKeys.ts`, `hooks.ts` — `getCardActivity`/`cardActivity`/`useCardActivity`
- `frontend/src/components/board/CardDetailModal/` (new) — `CardDetailModal.tsx`, `.module.css`, tests
- `frontend/src/components/board/KanbanCard/KanbanCard.tsx` — title-click wiring, local `detailOpen` state
- Test files extended/added across all of the above (repo, route, hook, component layers)
- `memory-bank/e2e-journeys/card-activity-feed.md` (new) — hand-authored UAT journey doc
- `memory-bank/ux-patterns.md`, `memory-bank/uat-config.md` (updated/created this task's lifecycle, brought into this branch)
- `memory-bank/uat/uat-TASK-020.md` — UAT report (FAIL, with orchestrator-verified root-cause context)
- `memory-bank/agent-rules/_learned/data-integrity.md`, `testing-patterns.md` — 2 learnings amended

## Notes

- **Open product decision**: 3 historical `card_events` rows (card "To do item #2" on "First board", dated 2026-06-22) permanently display "Someone moved this card from a column to a column" because event payloads are immutable once written. The underlying code bug is fixed (verified live, commit `eebac6e`) — this is purely a question of whether to backfill/rewrite those 3 rows or accept them as a grandfathered artifact. No further code action is required either way.
- **Journey doc gap**: `memory-bank/e2e-journeys/card-activity-feed.md`'s AC-EMPTY-1 step assumes a freshly created card has zero events, but card creation itself synchronously emits a `card.created` event. The empty-state code path (`"No activity yet."`) is confirmed to exist and render correctly; it's just unreachable via the documented create-card flow. Worth fixing the journey doc if this journey is reused.
- **Recurring ecosystem gap**: axe-core accessibility injection failed in all 4 browser-automation runs across this task's lifecycle (2 `/banyan-ux-ingest --live-walk`, 2 UAT walkers) due to sandboxed-environment restrictions (CDN blocked, `file://` blocked, local server blocked). This product has zero deterministic automated accessibility coverage despite a WCAG 2.1 AA commitment in `productBrief.md`. Flagged as a High Priority infrastructure follow-up in the reflection document, not specific to this task's code.
- **Out-of-scope findings surfaced by UAT, tracked but not addressed this task**: board page has severe horizontal overflow at 375px mobile width (Activity sidebar squeezes columns to ~127px); `CardDetailModal`'s close button touch target is slightly under 44×44px mobile guidance; `techContext.md` is missing a "Design Tokens" section that `ux-patterns.md` references four times.
- Full detail in `memory-bank/reflection/reflection-TASK-020.md` and `memory-bank/uat/uat-TASK-020.md`.
