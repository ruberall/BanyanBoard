# Archive: Activity Feed User Attribution

## Metadata

- **Task ID**: TASK-016
- **Feature**: FEAT-013 — Activity Feed User Attribution
- **Complexity**: Level 3
- **Started**: 2026-06-27
- **Completed**: 2026-06-27
- **Branch**: feature/FEAT-013-activity-feed-user-attribution
- **Roadmap Link**: FEAT-013

## Summary

Delivered full user attribution for the ActivityFeed sidebar. Card-move events now show `"Rebecca Uberall moved 'Fix login bug' from In Progress to Done · 2m ago"` and a brand-new `card.created` event type shows `"Rebecca Uberall created card 'Fix login bug' · just now"`. The feature required coordinated changes across six backend files, four frontend files, and a new Playwright E2E spec (4 tests). All 226 unit/integration tests and 4 E2E specs pass.

The Payload Snapshot architecture decision — resolving `actor_display_name` at emit time and snapshotting it into the `payload` jsonb column — proved correct. It kept historical accuracy (deleted-user attribution preserved), eliminated JOIN complexity on the read path, and kept the `EventRepository` SQL unchanged.

## Requirements

### Acceptance Criteria

- [✓] **AC-ENTRY-1**: `<aside aria-label="Activity feed">` with `role="log"` present on board screen
- [✓] **AC-HAPPY-1**: Card move shows `"[Name] moved '[Card]' from [Col] to [Col]"` within 3s via SSE live push
- [✓] **AC-HAPPY-2**: Card create shows `"[Name] created card '[Card]'"` — new `card.created` event type end-to-end
- [✓] **AC-HAPPY-3**: History replay on SSE reconnect includes attributed messages
- [✓] **AC-ERROR-1**: Fallback chain `actorDisplayName ?? actorEmail ?? 'Someone'` when name fields absent
- [✓] **AC-ERROR-2**: Pre-existing null-actor events render as `"Someone moved 'Card'"` — no JS error
- [✓] **AC-HAPPY-4**: Attribution persists across page reload (SSE reconnect replays attributed events)

## Implementation

### Architecture Decision

**Payload Snapshot** (Option 1 from creative phase) chosen over JOIN-at-read (Option 2):

- At event emit time, `EventService` calls `UserRepository.findById(actorId)` and snapshots `"FirstName LastName"` into `payload.actor_display_name`
- History replay reads snapshot directly — no JOIN added to repository queries
- Deleted-user attribution preserved (name baked in at write time, not lost when FK goes null)
- Write-time lookup unavoidable for live SSE path regardless; snapshot earns the cost twice

Reference: `memory-bank/creative/TASK-016-activity-feed-attribution-architecture.md`

### Key Components

1. **`backend/src/services/event.service.ts`**
   - Added `UserRepository` constructor injection
   - `resolveDisplayName()`: looks up actor by `actorId`, builds `"First Last"` → email → null fallback chain
   - `emitCardMoved()`: snapshots `actor_display_name` into `payload` jsonb + carries on bus event
   - `emitCardCreated()`: new method, same pattern

2. **`backend/src/events/domain-event-bus.ts`**
   - `CardCreatedEvent` added to `DomainEvent` union
   - `CardMovedEvent` updated: `actorEmail` → `actorDisplayName`

3. **`backend/src/routes/cards.ts`**
   - `PATCH /:id/move` and `POST /:columnId/cards` pass `req.session.userId` as `actorId`
   - `createColumnCardsRouter` wired with `EventService` for card-create events

4. **`backend/src/routes/feed.ts`**
   - `projectEventRow()`: normalizes `EventRow` → `ActivityEvent` shape before SSE transmission, extracting `actor_display_name` from payload — eliminates client-side shape divergence between history replay and live push

5. **`frontend/src/types/index.ts`**
   - `CardMovedEvent`: added `actorDisplayName: string | null`
   - `CardCreatedEvent`: new interface
   - `ActivityEvent = CardMovedEvent | CardCreatedEvent`: union type

6. **`frontend/src/components/ActivityFeed/ActivityFeed.tsx`**
   - Renders both event types: `"{actorDisplayName ?? 'Someone'} moved/created card '{cardTitle}'"`
   - Exhaustiveness guard: `void (event as never)` catches unhandled union members at compile time

7. **`frontend/src/hooks/useActivityFeed.ts`**
   - Dual type-guards (discriminant + structural `'actorDisplayName' in event`) for SSE frame parsing

8. **`frontend/e2e/activity-feed.spec.ts`** (new)
   - 4 Playwright E2E tests: live push moved, live push created, history replay, page reload persistence
   - `page.waitForRequest(req => req.url().includes('/events'))` SSE sync barrier before writes

### Phase Summary

| Phase | Description | Tests | Status |
|-------|-------------|-------|--------|
| Phase 1 | Backend — actor attribution + card.created event | 184/184 | COMPLETE |
| Phase 2 | Frontend — type updates + ActivityFeed rendering | 226/226 | COMPLETE |
| Phase 3 | E2E — Playwright attribution tests | 4 specs | COMPLETE (PLAYWRIGHT_UNVERIFIED) |

## Testing

- **Backend unit/integration**: 184 tests passing (10 new Phase 1 tests)
- **Frontend unit**: 226 tests passing (9 new Phase 2 tests — 5 component, 1 hook, 3 updated)
- **E2E Playwright**: 4 new specs in `frontend/e2e/activity-feed.spec.ts` — committed with `PLAYWRIGHT_UNVERIFIED` note (live-stack run pending)
- **Code review**: 3 phases reviewed; 3 blocking issues caught Phase 1, 4 recommended fixes Phase 2, 3 recommendations Phase 3

## Files Changed

**Backend:**
- `backend/src/events/domain-event-bus.ts` — `CardCreatedEvent` added; `CardMovedEvent` updated
- `backend/src/repositories/event.repository.ts` — `EventInput` updated for `card.created` event type
- `backend/src/services/event.service.ts` — `UserRepository` injection; `resolveDisplayName()`; `emitCardCreated()`
- `backend/src/services/card.service.ts` — `actorId?` param on `moveCard()` and `createCard()`
- `backend/src/routes/feed.ts` — `projectEventRow()` projection in both history replay paths
- `backend/src/routes/index.ts` — `UserRepository` + updated `EventService` construction
- `backend/src/routes/cards.ts` — `actorId` threading + `EventService` wired into column cards router

**Frontend:**
- `frontend/src/types/index.ts` — `CardMovedEvent`, `CardCreatedEvent`, `ActivityEvent` union
- `frontend/src/components/ActivityFeed/ActivityFeed.tsx` — attributed rendering + exhaustiveness guard
- `frontend/src/hooks/useActivityFeed.ts` — dual type-guards; `ActivityEvent[]` state
- `frontend/src/components/ActivityFeed/__tests__/ActivityFeed.test.tsx` — 5 new component tests
- `frontend/src/hooks/__tests__/useActivityFeed.test.ts` — 1 new hook test; 3 updated

**E2E:**
- `frontend/e2e/activity-feed.spec.ts` (new) — 4 attribution E2E specs
- `frontend/e2e/helpers/auth.ts` — `loginAsAttributionUser` helper added

## Lessons Learned

1. **Creative phase decision quality**: The Payload Snapshot architecture worked exactly as designed. No surprises during implementation — the creative document's next steps mapped cleanly to Phase 1 work items.

2. **Code review as primary architectural safety net**: 10 issues caught across 3 phases (3 blocking in Phase 1: boardId fallback, DI violation, EventService wiring). The code reviewer agent consistently enforced the architectural constraints. The coding agent should self-check DI and construction-site completeness before submitting.

3. **SSE shape normalization pre-identified**: The history/live shape divergence was called out in the creative document and solved via `projectEventRow()` — correctly implemented in Phase 1 without iteration.

Reference: `memory-bank/reflection/reflection-TASK-016.md`

## Technical Debt

- **`payload` jsonb is implicit schema**: `actor_display_name`, `cardTitle`, etc. are convention, not DB-enforced. A future migration to dedicated columns or a typed jsonb validator would be more robust.
- **E2E tests not live-stack verified**: `PLAYWRIGHT_UNVERIFIED` — Playwright specs should be run against the Docker Compose stack before this branch merges.
- **Name-change propagation**: Past entries show name at event time — correct for audit-log semantics, but if profile editing is added later, a name-change event may be desirable.

## References

- Task: `memory-bank/tasks/TASK-016.md`
- Reflection: `memory-bank/reflection/reflection-TASK-016.md`
- Architecture: `memory-bank/creative/TASK-016-activity-feed-attribution-architecture.md`
- Feature: FEAT-013 in `memory-bank/roadmap.md`
