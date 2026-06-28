# Architecture Decision: Activity Feed Actor Attribution Storage Strategy

**Created**: 2026-06-27
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-016 — Activity Feed User Attribution (FEAT-013, Level 3)

---

## Context

### System Requirements

1. When a user moves a card, the ActivityFeed must show `"[FirstName LastName] moved '[card title]' from [column name] to [column name] on [date]"` — replacing the current `actorEmail ?? 'Someone'` display.
2. When a user creates a card, the ActivityFeed must show `"[FirstName LastName] created card '[card title]' on [date]"` — a brand-new event type (`card.created`) that does not yet exist in the system.
3. Both SSE live-push events (via `DomainEventBus.publish()`) and SSE history replay events (from `EventRepository.findRecentByBoard()` / `findAfterById()`) must carry the actor's display name.
4. `CardService.moveCard()` currently hardcodes `actorId: null` and `actorEmail: null`; the session `userId` is available on `req.session.userId` at the route layer but is not threaded through to the service.
5. `CardService.createCard()` emits no event at all today; it must begin emitting a `card.created` event.
6. The frontend `ActivityFeed.tsx` currently renders `event.actorEmail ?? 'Someone'` and must be updated to use the display name.

### Technical Constraints

1. **3-Layer Architecture (Guiding Principle 1)** — No SQL in services or routes. Name resolution from the `users` table must be performed at the repository layer only.
2. **Dependency Injection (Guiding Principle 2)** — Services receive dependencies via constructor; no `new Foo()` inside business logic.
3. **Parameterized SQL (Guiding Principle 5)** — All queries use `$1, $2, ...` placeholders; no string interpolation.
4. **`RETURNING` on INSERTs (Guiding Principle 6)** — INSERT into `card_events` must return the created row; no separate SELECT after write.
5. **No console.log (Guiding Principle 4)** — All logging via pino.
6. **Domain Types at Repository Layer (Guiding Principle 11)** — `EventRow` type owned by `event.repository.ts`.
7. The `actorId` FK column on `card_events` already exists and is set to `SET NULL` on user deletion — the schema is already attribution-ready.
8. The SSE feed sends two distinct shapes: raw `EventRow` (from DB for history replay) and `DomainEvent` (from bus for live events). Both paths must produce the actor display name.
9. The session `userId` is accessible as `req.session.userId` in route handlers; it cannot be read inside services without violating the layer constraint — the route must pass it in.

### Non-Functional Requirements

- **Performance (p95 < 200ms)**: Attribution lookup must not add material latency. The activity feed is a sidebar read; history replay is on SSE connect, not the hot card-move path.
- **Scalability (2–20 concurrent users)**: Small-team MVP scale. No need for caching layers or denormalized read models.
- **Data Consistency**: Actor display name should accurately attribute authorship. The correctness trade-off between point-in-time accuracy (snapshot) and current accuracy (JOIN) must be explicitly chosen.
- **Observability**: `emitCardMoved` and new `emitCardCreated` are persisted operations; they should log `eventId`, `cardId`, `actorId`, and event type using the existing `pino` logger pattern. No sensitive data (email, userId) in logs unless already established.
- **Deleted-user handling**: `actor_id` is `FK → users SET NULL` — if a user is deleted, the FK goes null. Both strategies must handle this gracefully.

---

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| `backend/src/routes/cards.ts` | HTTP layer for card mutations | Extract `req.session.userId`; pass `actorId` (and optionally resolved display name) to service; call `moveCard` / `createCard` |
| `backend/src/services/card.service.ts` | Business logic for cards | Orchestrate repo + EventService; accept `actorId` (+ optional display name) as input parameters |
| `backend/src/services/event.service.ts` | Event persistence + bus publication | Receive attribution data; persist to `card_events`; publish on `DomainEventBus` |
| `backend/src/repositories/event.repository.ts` | SQL for `card_events` | `insert()` — persist event row; `findRecentByBoard()` / `findAfterById()` — read events with attribution |
| `backend/src/repositories/user.repository.ts` | SQL for `users` | `findById()` already exists — returns `PublicUser` with `first_name` / `last_name` |
| `backend/src/events/domain-event-bus.ts` | In-process event bus types | `DomainEvent` union; `CardMovedEvent` and new `CardCreatedEvent` must carry `actorDisplayName` |
| `backend/src/routes/feed.ts` | SSE transport | Sends `EventRow` (history) and `DomainEvent` (live) — both must carry display name |
| `frontend/src/types/index.ts` | Frontend domain types | `CardMovedEvent` and new `CardCreatedEvent` must carry `actorDisplayName` |
| `frontend/src/components/ActivityFeed/ActivityFeed.tsx` | Renders event list | Must render `actorDisplayName` in place of `actorEmail` |
| `frontend/src/hooks/useActivityFeed.ts` | SSE consumer hook | May need to accept a broader event union type |

### Component Interactions

The attribution data flows through two distinct paths that must converge on the same shape at the SSE frame boundary:

**Live event path** (card move happens now):
```
Route handler (has req.session.userId)
  → CardService.moveCard(id, columnId, afterCardId, actorId [, actorDisplayName])
    → EventService.emitCardMoved(payload with attribution)
      → EventRepository.insert() — persists row
      → DomainEventBus.publish(CardMovedEvent with actorDisplayName)
        → feed.ts bus subscriber → res.write(SSE frame)
```

**History replay path** (client connects / reconnects):
```
feed.ts GET /boards/:boardId/events
  → EventRepository.findRecentByBoard() or findAfterById()
    → returns EventRow[] (with attribution already in row or needing JOIN)
      → for each row: res.write(SSE frame)
```

The key design question is: **at which layer, and by which mechanism, does `actorDisplayName` enter the data?**

---

## Options Explored

### Option 1: Payload Snapshot

At the moment an event is emitted, resolve the actor's `first_name` and `last_name` from the `users` table (in `EventService`, via a `UserRepository` passed by constructor injection) and write the concatenated display name into the `card_events.payload` jsonb column as `actor_display_name`. All subsequent reads of this event return the stored snapshot.

```
card_events.payload = {
  "cardTitle": "Fix login bug",
  "fromColumnName": "In Progress",
  "toColumnName": "Done",
  "actor_display_name": "Rebecca Uberall"   ← snapshotted at write time
}
```

**Architecture Diagram:**
```
Route (actorId from session)
  │
  ▼
CardService.moveCard(actorId)
  │
  ▼
EventService.emitCardMoved({ actorId, ... })
  │
  ├─ UserRepository.findById(actorId) ← one extra SELECT at write time
  │       ↓
  │   actor_display_name = "Rebecca Uberall"
  │
  ├─ EventRepository.insert({ ..., payload: { actor_display_name, ... } })
  │       → card_events row with display name baked in
  │
  └─ DomainEventBus.publish({ actorDisplayName: "Rebecca Uberall", ... })

History replay:
  EventRepository.findRecentByBoard()
    → SELECT id, ..., payload FROM card_events   (no JOIN)
    → payload.actor_display_name extracted in service or at SSE layer
```

**Pros:**
- History replay query is a simple `SELECT` on `card_events` — no JOIN needed. Query stays O(n events), not O(n events × users).
- Actor display name is **immutable once written** — reflects who actually performed the action even if the user later changes their name or is deleted. This is the semantically correct model for an audit log.
- `EventRepository.findRecentByBoard()` and `findAfterById()` do not change their SQL — only their callers need to extract `payload.actor_display_name`.
- No schema migration required; `payload` jsonb already exists and currently stores `cardTitle`, `fromColumnName`, `toColumnName`, and `actorEmail`.
- `EventService` receives `UserRepository` via constructor injection — no layering violation.
- Deleted users: their display name is preserved in the snapshot. The feed accurately attributes the historical action even after account deletion.

**Cons:**
- If a user changes their name, past events still show the old name. For a kanban tool this is acceptable (events are historical facts), but it should be acknowledged.
- `EventService` now has an additional dependency: `UserRepository`. This slightly widens the service's constructor signature but is consistent with DI pattern.
- One extra DB round-trip at write time (SELECT from `users` before INSERT into `card_events`). This adds latency to the card-move operation — but the existing card move already does multiple queries (find card, find column, find sibling cards), so one more lightweight PK lookup is negligible at MVP scale.
- If `actorId` is null (unauthenticated scenario — not currently possible since all routes are behind `requireAuth`, but theoretically possible), the lookup returns null and `actor_display_name` falls back to `null`.

**Technical Fit**: High — consistent with existing `payload` jsonb pattern where `actorEmail` and column names are already stored. No new tables, no schema changes.
**Complexity**: Low — additive change to `EventService` constructor and `emitCardMoved` / new `emitCardCreated` methods.
**Scalability**: High — read path has zero added cost; write-time lookup is trivial at MVP scale.

---

### Option 2: JOIN at Read Time

Store only `actor_id` FK on `card_events` (already done). At read time — both `findRecentByBoard()` and `findAfterById()` — LEFT JOIN `card_events` with `users` to fetch the current `first_name` and `last_name` and include them in the returned `EventRow`.

```sql
SELECT
  ce.id, ce.board_id, ce.card_id, ce.actor_id,
  ce.event_type, ce.from_column_id, ce.to_column_id,
  ce.payload, ce.occurred_at,
  u.first_name AS actor_first_name,
  u.last_name  AS actor_last_name
FROM card_events ce
LEFT JOIN users u ON u.id = ce.actor_id
WHERE ce.board_id = $1
ORDER BY ce.occurred_at DESC
LIMIT $2
```

The live path additionally requires resolving the display name at publish time (since `DomainEventBus.publish()` takes a `DomainEvent` struct, not a raw DB row). Either:
- (2a) `EventService` still calls `UserRepository.findById()` before publishing on the bus — making the read-time JOIN redundant for the live path, or
- (2b) `feed.ts` does a separate lookup when it receives a live bus event that has only `actorId` — violating the "no SQL in routes" guiding principle.

Sub-option 2a is the only architecturally valid variant under the guiding principles.

**Architecture Diagram (2a — JOIN + pre-publish lookup):**
```
Route (actorId from session)
  │
  ▼
CardService.moveCard(actorId)
  │
  ▼
EventService.emitCardMoved({ actorId })
  │
  ├─ UserRepository.findById(actorId) ← SELECT at write time (same as Option 1)
  │       ↓
  │   actorDisplayName = "Rebecca Uberall"
  │
  ├─ EventRepository.insert({ actorId, payload: { cardTitle, columns... } })
  │       → row has actor_id FK; display name NOT in payload
  │
  └─ DomainEventBus.publish({ actorDisplayName, ... })

History replay:
  EventRepository.findRecentByBoard()
    → SELECT ... FROM card_events LEFT JOIN users   (JOIN on every history read)
    → EventRow now includes actor_first_name, actor_last_name
```

**Pros:**
- History events always show the current name — if a user updates their name, history updates automatically.
- `payload` jsonb stays clean of user profile data.
- Semantically mirrors a "view" or "projection" model — history is always a live join.

**Cons:**
- History replay query adds a LEFT JOIN on every SSE connect. At MVP scale (20 users, ≤20 events) this is unnoticeable, but the JOIN adds complexity to the SQL and to the `EventRow` type shape.
- The live path (`EventService.emitCardMoved → bus.publish`) still needs the display name resolved at write time (sub-option 2a) — so the `UserRepository.findById()` call is required at write time anyway. This means Option 2 does not actually eliminate the write-time lookup; it merely shifts WHERE the display name is stored.
- `EventRow` type must be extended with nullable `actor_first_name` / `actor_last_name` columns. This is a type-level change that ripples through `EventRepository`, `feed.ts` (which serializes `EventRow` directly), and `useActivityFeed.ts` (which deserializes the SSE payload).
- History events will show `null` name for deleted users (FK SET NULL wipes `actor_id`), revealing that a user was deleted — arguably worse UX than a stored "Rebecca Uberall" that still shows after deletion.
- If a user changes their name, history updates silently. For an activity log this is arguably incorrect: the log says someone performed an action; changing the log entry retroactively is unexpected behavior.
- Two places to maintain the display-name logic: the write path (for live bus events) and the read path (for history replay). Both must stay in sync.

**Technical Fit**: Medium — requires changing the SQL in both `findRecentByBoard` and `findAfterById`, extending `EventRow`, and updating serialization in `feed.ts`. More surface area than Option 1.
**Complexity**: Medium — SQL changes + type changes + two-path synchronization concern.
**Scalability**: High for read performance at MVP; introduces JOIN cost that grows with user table size at large scale (negligible here).

---

### Option 3: Hybrid — Snapshot with Fallback JOIN

Store `actor_display_name` in `payload` (Option 1), but for events that already exist in the DB without the field (migration compatibility), fall back to a JOIN-based lookup at read time. This handles the case where historical events were written before this feature shipped.

**Architecture Diagram:**
```
Read path:
  EventRepository.findRecentByBoard()
    → SELECT ce.*, u.first_name, u.last_name
      FROM card_events ce
      LEFT JOIN users u ON u.id = ce.actor_id
    → EventRow includes both payload.actor_display_name (if present)
      AND actor_first_name / actor_last_name (from JOIN for legacy rows)
    → Caller picks payload.actor_display_name ?? computed from JOIN columns
```

**Pros:**
- Handles existing event rows gracefully without a data backfill migration.
- New events get clean snapshot semantics; old events degrade gracefully.

**Cons:**
- More complex than either pure option. The fallback logic lives somewhere — either in the repository (leaks display-name computation into SQL layer) or in `EventService`/`feed.ts` (routes/services constructing display names — violates layer separation).
- Permanently couples the read query to a JOIN even after 100% of rows have `actor_display_name` in payload — the JOIN is never safe to remove without a migration.
- At this project stage, existing `card_events` rows all have `actorId: null` (the wire-up was never done). There are effectively zero rows with real attribution to migrate. The hybrid's only advantage — handling legacy rows — does not apply here.
- The extra complexity buys nothing for a greenfield deployment.

**Technical Fit**: Low — unnecessary complexity for this project stage.
**Complexity**: High — dual read paths, conditional logic, permanent JOIN dependency.
**Scalability**: Same as Option 2 (JOIN always present).

---

## Evaluation Matrix

| Criteria | Option 1: Snapshot | Option 2: JOIN at Read | Option 3: Hybrid |
|----------|--------------------|------------------------|------------------|
| Scalability | High | High (MVP scale) | High (MVP scale) |
| Maintainability | High — single write path, no JOIN debt | Medium — two paths to keep in sync | Low — permanent dual-path complexity |
| Performance (write) | Negligible extra PK SELECT | Same (lookup still needed for live path) | Same |
| Performance (read) | High — no JOIN | Medium — LEFT JOIN on every history read | Medium — LEFT JOIN always present |
| Historical accuracy | High — snapshot is immutable fact | Low — name changes silently mutate history | Medium — mixed |
| Deleted-user UX | High — name preserved in snapshot | Low — shows null after user deletion | Medium |
| Security (Guiding Principle 9) | High — no PII in logs; display name in payload, not logs | High | High |
| Observability | High — clean log events | High | Medium |
| Implementation Cost | Low — additive, minimal SQL change | Medium — SQL + type changes | High |
| Guiding Principle compliance | Full | Full (sub-option 2a) | Partial (complex layer interaction) |

---

## Observability Architecture

This feature adds two new event-emission paths (`emitCardMoved` with actor attribution, `emitCardCreated`). Observability follows existing project patterns.

### Logging

- **Library**: `pino` via the module-level `logger` singleton (already used in `event.service.ts`)
- **Format**: Structured JSON; `LOG_LEVEL` and `LOG_FORMAT` from environment
- **Existing pattern** in `emitCardMoved`: `logger.info({ eventId, cardId, toColumnId }, 'event.card_moved.emitted')`
- **New events to add**:
  - `logger.info({ eventId, cardId, columnId }, 'event.card_created.emitted')` — on card creation
  - The `actorId` may appear in logs (it is a UUID, not PII). The display name and email MUST NOT appear in log entries (Guiding Principle 9 + observability-requirements.md §3.3).
- **No change needed** to log output format or destination.

### Distributed Tracing

- **Current state**: `requestContext` middleware attaches `{ requestId, traceId }` to `req.log`. The card-move route already runs under this middleware.
- **No new spans required** for this feature — the attribution lookup (`UserRepository.findById`) is a sub-operation within the existing card-move request span.
- The `DomainEventBus` is in-process; no cross-service trace propagation boundary is introduced.
- If OTEL is wired up (optional `OTEL_SDK_DISABLED` flag), the DB queries will be auto-instrumented by `@opentelemetry/auto-instrumentations-node`.

### Metrics

- **Standard metrics**: `http_requests_total` and `http_request_duration_seconds` already cover the `PATCH /cards/:id/move` and `POST /columns/:columnId/cards` endpoints.
- **No new custom metrics** are required for this feature at MVP scale. The additional `UserRepository.findById()` call is an internal sub-operation, not a separately metered operation.
- If future monitoring needs arise, a `card_events_emitted_total{event_type}` counter would be the appropriate addition — deferred to a future observability task.

### Configuration Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `LOG_LEVEL` | Log verbosity | `info` |
| `LOG_FORMAT` | Output format (`json`/`pretty`) | `json` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector endpoint | — |
| `OTEL_SERVICE_NAME` | Service identifier | — |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio | `1.0` (dev) |
| `OTEL_SDK_DISABLED` | Disable telemetry | `false` |

No new environment variables are required for this feature.

---

## Decision

**Chosen**: Option 1 — Payload Snapshot

### Rationale

Option 1 is the correct choice for this system for four concrete reasons:

**1. Semantic correctness for an activity log.** The ActivityFeed is an audit trail of who did what. "Rebecca Uberall moved 'Fix login bug' from In Progress to Done" is a historical fact. If Rebecca later changes her display name, the log entry should still say "Rebecca Uberall" — that is who performed the action. A JOIN-based approach would silently rewrite history on name changes, which is incorrect behavior for an activity log. Option 1 treats events as immutable facts.

**2. Deleted-user resilience.** The `actor_id` FK is `SET NULL` on user deletion. Under Option 2, a deleted user's activity history shows `null` / "Someone" — the attribution is destroyed. Under Option 1, the display name is baked into the `payload` at write time, so "Rebecca Uberall moved..." survives the user's deletion. This is better UX and more honest attribution.

**3. The write-time lookup is unavoidable regardless of option.** The live event path (bus publication) requires the display name at the moment of emission — Option 2 (sub-option 2a) still calls `UserRepository.findById()` at write time to populate the `DomainEvent` struct. The only difference between options is where the string is persisted (payload vs. JOIN at read time). Since the lookup cost is identical, Option 1 earns the lookup's cost twice (write + free reads), while Option 2 pays it once at write plus again at every history read.

**4. Minimal implementation surface area.** Option 1 requires: (a) passing `actorId` from route → service → `EventService`, (b) adding `UserRepository` to `EventService`'s constructor, (c) resolving the display name in `emitCardMoved` / new `emitCardCreated`, (d) storing it in `payload`, and (e) updating the `CardMovedEvent` / new `CardCreatedEvent` bus type and frontend types. The `EventRepository` SQL for `findRecentByBoard` and `findAfterById` does NOT change. Option 2 changes those queries, `EventRow`, serialization in `feed.ts`, and the bus event type — more files, more risk.

### Trade-offs Accepted

- **Stale name on name change**: If a user changes their display name, past activity entries will still show the old name. This is acceptable: (1) the MVP has no "edit profile name" feature yet, (2) for a kanban tool, activity log accuracy at write-time is more important than retroactive name propagation, and (3) this is the standard approach used by Slack, GitHub, Linear, and other activity-feed products.
- **Write-time SELECT before INSERT**: One extra `UserRepository.findById()` call per event emission. At MVP scale (2–20 users, ≤50 concurrent card moves) this is immaterial. The existing `moveCard` path already executes three queries before event emission.
- **`payload` jsonb schema is implicit**: The `payload` column is untyped jsonb. `actor_display_name` is a convention, not enforced by a DB constraint. This is consistent with how `cardTitle`, `fromColumnName`, `toColumnName`, and `actorEmail` are already stored — the pattern is established.

---

## Implementation Guidelines

### 1. Thread `actorId` from route to service

In `backend/src/routes/cards.ts`, the `PATCH /:id/move` handler must extract `req.session.userId` and pass it to `CardService.moveCard()`. The `POST /:columnId/cards` handler must similarly pass it for `createCard()`.

Update `CardService.moveCard()` and `createCard()` signatures to accept `actorId: string | null`.

```typescript
// cards.ts (route)
router.patch('/:id/move', asyncHandler(async (req, res) => {
  const actorId = req.session.userId ?? null;
  const card = await service.moveCard(req.params.id, columnId, afterCardId, actorId);
  res.json(card);
}));

router.post('/:columnId/cards', asyncHandler(async (req, res) => {
  const actorId = req.session.userId ?? null;
  const card = await service.createCard(req.params.columnId, req.body, actorId);
  res.status(201).json(card);
}));
```

### 2. Inject `UserRepository` into `EventService`

`EventService` constructor must receive a `UserRepository` (or a minimal `findById` interface). This is dependency injection — no `new UserRepository()` inside the method body.

```typescript
// event.service.ts
export class EventService {
  constructor(
    private readonly bus: DomainEventBus,
    db: Queryable,
    private readonly userRepo: UserRepository,  // ← added
  ) {
    this.repo = new EventRepository(db);
  }
}
```

The `EventService` construction sites (`routes/index.ts`) must pass a `UserRepository` instance.

### 3. Resolve display name in `emitCardMoved` and new `emitCardCreated`

```typescript
// event.service.ts
async emitCardMoved(input: CardMovedInput): Promise<void> {
  let actorDisplayName: string | null = null;
  if (input.actorId) {
    const user = await this.userRepo.findById(input.actorId);
    if (user) {
      const parts = [user.first_name, user.last_name].filter(Boolean);
      actorDisplayName = parts.length > 0 ? parts.join(' ') : user.email;
      // Fallback to email only if both name fields are null/empty.
      // Email must NOT be logged (Guiding Principle 9), only stored in payload.
    }
  }

  const row = await this.repo.insert({
    boardId:   input.boardId,
    cardId:    input.cardId,
    actorId:   input.actorId,
    eventType: 'card.moved',
    fromColumnId: input.fromColumnId,
    toColumnId:   input.toColumnId,
    payload: {
      cardTitle:          input.cardTitle,
      fromColumnName:     input.fromColumnName,
      toColumnName:       input.toColumnName,
      actor_display_name: actorDisplayName,   // ← snapshotted
    },
  });

  this.bus.publish({
    type:               'card.moved',
    eventId:            row.id,
    boardId:            input.boardId,
    cardId:             input.cardId,
    cardTitle:          input.cardTitle,
    actorId:            input.actorId,
    actorDisplayName:   actorDisplayName,    // ← carried on bus event
    fromColumnId:       input.fromColumnId,
    fromColumnName:     input.fromColumnName,
    toColumnId:         input.toColumnId,
    toColumnName:       input.toColumnName,
    occurredAt:         row.occurred_at,
  });

  logger.info(
    { eventId: row.id, cardId: input.cardId, toColumnId: input.toColumnId },
    'event.card_moved.emitted',
    // actorId intentionally omitted from log (UUID is safe but not useful here)
    // actorDisplayName intentionally omitted (could be PII-adjacent)
  );
}
```

Display name fallback logic: `first_name + ' ' + last_name` if both present; `first_name` only if last_name is null; `last_name` only if first_name is null; `email` as last resort (already stored in payload historically). If `actorId` is null, `actorDisplayName` is null → frontend renders "Someone".

### 4. Add `card.created` event type

Add `CardCreatedEvent` to `domain-event-bus.ts`:

```typescript
export interface CardCreatedEvent {
  type: 'card.created';
  eventId: string;
  boardId: string;
  cardId: string;
  cardTitle: string;
  actorId: string | null;
  actorDisplayName: string | null;
  columnId: string;
  columnName: string | null;
  occurredAt: Date;
}

export type DomainEvent = CardMovedEvent | CardCreatedEvent;
```

Add `EventService.emitCardCreated()` following the same snapshot pattern.

`CardService.createCard()` needs the `boardId` (from the column's board) to emit the event. Currently `createCard()` only receives `columnId` — add a DB lookup for `board_id` from `columns` (same pattern as `moveCard()` already does).

### 5. Update `EventInput` to accept `card.created` event shape

`EventInput.fromColumnId` and `toColumnId` are move-specific fields. The `card_events` table stores these on dedicated columns. For `card.created`, these are irrelevant. Two approaches:

- (a) Make `fromColumnId` / `toColumnId` nullable in `EventInput` and the INSERT — requires a schema migration to add `NOT NULL` constraints conditionally, which is invasive.
- (b) Store `columnId` in payload for `card.created` events, and set `from_column_id` / `to_column_id` to the column ID for created events (or null if columns are nullable). Check current schema nullability.

**Recommended**: Check if `from_column_id` / `to_column_id` are nullable in the current migration. If they are (they were not in the original schema snippet — they are structural columns). A migration to make them nullable for `card.created` events is cleaner than doubling payload responsibility. Alternatively, for `card.created`, set both `from_column_id` and `to_column_id` to the target column ID — the event type discriminates semantics.

### 6. Update `CardMovedEvent` bus type to replace `actorEmail` with `actorDisplayName`

```typescript
// domain-event-bus.ts
export interface CardMovedEvent {
  type: 'card.moved';
  eventId: string;
  boardId: string;
  cardId: string;
  cardTitle?: string;
  actorId: string | null;
  actorDisplayName: string | null;   // ← replaces actorEmail
  fromColumnId: string;
  fromColumnName?: string | null;
  toColumnId: string;
  toColumnName?: string | null;
  occurredAt: Date;
}
```

### 7. Update frontend types and `ActivityFeed.tsx`

```typescript
// frontend/src/types/index.ts
export interface CardMovedEvent {
  type: 'card.moved'
  eventId: string
  boardId: string
  cardId: string
  cardTitle: string
  actorId: string | null
  actorDisplayName: string | null   // ← replaces actorEmail
  fromColumnId: string
  fromColumnName: string | null
  toColumnId: string
  toColumnName: string | null
  occurredAt: string
}

export interface CardCreatedEvent {
  type: 'card.created'
  eventId: string
  boardId: string
  cardId: string
  cardTitle: string
  actorId: string | null
  actorDisplayName: string | null
  columnId: string
  columnName: string | null
  occurredAt: string
}

export type ActivityEvent = CardMovedEvent | CardCreatedEvent
```

```tsx
// ActivityFeed.tsx rendering
{event.actorDisplayName ?? 'Someone'}
// for card.moved:
{event.actorDisplayName ?? 'Someone'} moved '{event.cardTitle}'
// for card.created:
{event.actorDisplayName ?? 'Someone'} created '{event.cardTitle}'
```

### 8. `feed.ts` serialization path

`feed.ts` currently serializes `EventRow` directly for history replay. The `EventRow` from `EventRepository` now carries `actor_display_name` inside `payload`. The SSE frame serializes the full row as JSON; the frontend reads `data.payload.actor_display_name`.

However, the current `useActivityFeed.ts` casts the parsed data as `CardMovedEvent` directly. The live path (bus event) and history path (DB row) produce structurally different shapes. This asymmetry already exists (live events have top-level fields; history events have `payload` jsonb). 

**Recommended resolution**: Normalize the shape before sending. In `feed.ts`, when sending a history row, project it to the same `ActivityEvent` shape as the bus event. This eliminates the client-side shape divergence:

```typescript
// feed.ts — project EventRow to ActivityEvent shape before sending
function projectEventRow(row: EventRow): ActivityEvent {
  const payload = row.payload as Record<string, unknown>;
  if (row.event_type === 'card.moved') {
    return {
      type:             'card.moved',
      eventId:          row.id,
      boardId:          row.board_id,
      cardId:           row.card_id,
      cardTitle:        payload['cardTitle'] as string ?? '',
      actorId:          row.actor_id,
      actorDisplayName: payload['actor_display_name'] as string | null ?? null,
      fromColumnId:     row.from_column_id,
      fromColumnName:   payload['fromColumnName'] as string | null ?? null,
      toColumnId:       row.to_column_id,
      toColumnName:     payload['toColumnName'] as string | null ?? null,
      occurredAt:       row.occurred_at.toISOString(),
    };
  }
  // card.created projection...
}
```

This projection function belongs in `feed.ts` (presentation/serialization concern of the route layer), not in the repository. It does not touch SQL — no layering violation.

### 9. No DB migration required for attribution storage

The `payload` jsonb column already exists. Writing `actor_display_name` into it requires no schema change. The only migration needed is if `card.created` events require `from_column_id` / `to_column_id` to be nullable — which should be verified against the existing migration file.

### 10. `EventService` construction in `routes/index.ts`

```typescript
// routes/index.ts
const userRepo = new UserRepository(db);
const eventService = bus ? new EventService(bus, db, userRepo) : undefined;
```

---

## Validation Checklist

- [x] Meets all system requirements — both `card.moved` and `card.created` events carry actor display name on both SSE paths
- [x] Respects technical constraints — no SQL in services (name resolution via injected `UserRepository`); parameterized SQL only; RETURNING on INSERTs
- [x] Addresses non-functional requirements — write-time lookup is negligible at MVP scale; read path has no added JOIN cost
- [x] Technically feasible — all changes are additive; no new tables required
- [x] Risks identified and acceptable — stale name risk is acknowledged and appropriate for an activity log
- [x] Complies with all Guiding Principles in systemPatterns.md — no deviations
  - Principle 1 (3-Layer): SQL stays in repositories; UserRepository.findById() called from EventService (service layer), not from routes
  - Principle 2 (DI): UserRepository injected via EventService constructor
  - Principle 4 (No console.log): pino logger used throughout
  - Principle 5 (Parameterized SQL): no string interpolation added
  - Principle 6 (RETURNING): INSERT returns row directly
  - Principle 11 (Domain Types at Repo Layer): EventRow and EventInput owned by event.repository.ts
- [x] Respects established patterns — payload jsonb field for event metadata is the existing pattern; actorEmail was already stored this way
- [x] Observability architecture defined — pino structured logging; no new metrics or spans required
- [x] Trace context propagation — no new service boundaries; existing request-scoped tracing covers the write path
- [x] Logging strategy consistent with observability-requirements.md — no PII in logs; actor UUID omitted from event log entries per principle 9
- [x] Metrics strategy — no new custom metrics needed; standard HTTP metrics already cover the endpoints

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stale actor name after user profile update | Low (no name-edit feature yet) | Low (historical log, not live data) | Document as accepted trade-off; add name-change event propagation if profile editing is added in future |
| `from_column_id` / `to_column_id` NOT NULL constraint blocks `card.created` insert | Medium (schema not confirmed nullable) | Medium (migration required) | Verify migration file before implementation; add nullable migration if needed |
| `actorId` null for moves (session missing) | Very Low (all routes behind requireAuth) | Low (falls back to "Someone") | The `requireAuth` middleware guarantees session.userId exists before route handler runs |
| `UserRepository.findById()` returns null (user deleted between move and event emit) | Very Low | Low (actorDisplayName falls back to null / "Someone") | Null check in display-name resolution; graceful fallback already in template |
| `useActivityFeed.ts` receives mixed shapes (EventRow vs DomainEvent) | Medium (current asymmetry exists) | Medium (frontend parse error) | Normalize to `ActivityEvent` shape in `feed.ts` projection function before sending SSE frame |
| `payload` jsonb field access is untyped — TypeScript won't catch typos in field names | Low (developer discipline) | Low (runtime only) | Define a typed `CardMovedPayload` / `CardCreatedPayload` interface in event.repository.ts; cast at repository boundary |

---

## Next Steps

1. **Verify schema**: Check `backend/migrations/20260618120000_create-card-events.js` — confirm whether `from_column_id` / `to_column_id` are nullable. If NOT NULL, add a migration to make them nullable before implementing `card.created` event emission.
2. **Phase 1 — Wire actor attribution for `card.moved`**:
   - Update `CardService.moveCard()` to accept `actorId: string | null`
   - Update `PATCH /:id/move` route handler to pass `req.session.userId`
   - Add `UserRepository` to `EventService` constructor; update construction in `routes/index.ts`
   - Update `emitCardMoved` to resolve and snapshot `actor_display_name`
   - Update `CardMovedEvent` bus type: replace `actorEmail` with `actorDisplayName`
   - Update `EventRow` serialization in `feed.ts` (`projectEventRow` projection)
   - Update frontend `CardMovedEvent` type; update `ActivityFeed.tsx` rendering
3. **Phase 2 — Add `card.created` event**:
   - Add `CardCreatedEvent` to `domain-event-bus.ts`
   - Add `EventService.emitCardCreated()` with snapshot pattern
   - Update `CardService.createCard()` to accept `actorId`, look up `boardId`, call `emitCardCreated`
   - Update `POST /:columnId/cards` route to pass `req.session.userId`
   - Update `feed.ts` projection to handle `card.created` event type
   - Update frontend `ActivityEvent` union type; update `ActivityFeed.tsx` to render created events
4. **Phase 3 — Tests**:
   - Unit tests for `EventService.emitCardMoved` with mocked `UserRepository` — verify display name resolved and stored in payload
   - Unit tests for `EventService.emitCardCreated`
   - Integration tests for `PATCH /cards/:id/move` — verify session userId threads through and event is emitted with actor
   - Integration tests for `POST /columns/:columnId/cards` — verify `card.created` event emitted
   - Frontend unit tests for `ActivityFeed.tsx` — verify `actorDisplayName` rendered; "Someone" fallback when null
