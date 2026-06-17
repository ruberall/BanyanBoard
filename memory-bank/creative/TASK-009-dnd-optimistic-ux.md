# Architecture Decision: Drag-and-Drop UX & Optimistic Update Integration

**Created**: 2026-06-16
**Status**: DECIDED
**Decision Type**: Architecture (Frontend / Creative 3)
**Task**: TASK-009 React Frontend Scaffold (Level 3, FEAT-005)
**Builds on**: Creative 2 — `TASK-009-api-client-design.md` (React Query on a thin typed transport core)

## Context

This decision specifies how **dnd-kit** integrates with the **React Query cache** to deliver the kanban card-move interaction — the centerpiece interaction of the MVP and the product's highest-impact risk ("Drag-and-drop UX is complex to get right" — productBrief Risks). Creative 2 already chose React Query and mandated that optimistic move state live in the cache via the `useMoveCard` mutation's `onMutate → setQueryData → onError rollback → onSettled invalidate` lifecycle. This document does not re-litigate that; it decides the dnd-kit layer that sits on top and the precise mapping from a drop event to a `moveCard(cardId, { column_id, after_card_id? })` call.

### System Requirements

- Drag a card within a column (reorder) **and** across columns (the primary user flow: In Progress → Done).
- On drag end: no-op if the slot is unchanged; otherwise optimistically reorder the UI, call `PATCH /cards/:id/move`, and revert on error (AC-7, AC-8).
- `after_card_id` derived to match the backend position algorithm exactly (see "Backend Contract" below).
- Optimistic update must mutate **both** the source-column card list and the destination-column card list atomically *before* the network call (cards are fetched one React Query per `columnId`).
- Error reversion restores the exact pre-drag state of both affected column caches and surfaces `ErrorBanner` (AC-8, AC-9 conventions).

### Backend Contract (must match — verified against `backend/src/services/card.service.ts`)

Cards in a column are ordered `position ASC` (tiebreak `created_at ASC`). The move endpoint computes the new fractional `position` from `after_card_id` against the **destination column's current card list**:

| `after_card_id` | Destination state | Resulting position |
|---|---|---|
| (column empty) | no cards | `1.0` |
| `null` | non-empty | `firstCard.position / 2` (insert at top) |
| id of the **last** card | — | `lastCard.position + 1.0` (append) |
| id of a **middle** card | — | midpoint of that card and the next (`(after.position + next.position) / 2`) |

Therefore the frontend rule is unambiguous: **`after_card_id` = the id of the card that will sit immediately *above* the drop slot in the destination column; `null` if the card lands at the top.** This is a pure function of the *destination ordering as the user sees it*, which is exactly what dnd-kit's sortable index gives us.

> **Same-column caveat**: the backend recomputes position against the column's current list, which on the server still contains the moving card. Because we send `after_card_id` (a stable card id) rather than a numeric index, this is self-correcting: we derive `after_card_id` from the *visual target ordering with the dragged card removed*, and the backend's midpoint math lands the card in the right gap regardless of where it came from. The optimistic client and the server converge on the same final ordering; the `onSettled` invalidation refetches authoritative positions.

### Non-Functional Requirements

- **WCAG 2.1 AA baseline (AC-10)** — keyboard operability of interactive controls. productBrief lists "Keyboard navigation (move cards without mouse)" as a checked AA requirement and full screen-reader DnD narration as an explicit *post-MVP nice-to-have*. So: the move interaction MUST be keyboard-operable; rich SR live-region narration is desirable but not a blocker.
- **Zero data loss on card moves** — reliable revert; the cache is the single source of optimistic truth (no divergent `useState` snapshot).
- Tablet-responsive; pointer + keyboard sensors required, touch is a nice-to-have but cheap to include.
- No `console.log`; failures flow through `ApiError → ErrorBanner` (systemPatterns Logging rule, carried to the browser in Creative 2).

### Established Patterns to Respect

- **React Query cache is the only home for server/optimistic state** (Creative 2 decision; do not introduce a parallel local board state).
- **Single typed `ApiError` boundary**; mutation `onError` reads `error.message`.
- **Centralized query-key factory** (`cards.byColumn(columnId)`) — the optimistic writer and the invalidator must use the same keys.
- Mirror the backend ethos: favor a well-tested standard mechanism over bespoke plumbing (productBrief mitigation explicitly says "use a well-tested library").

> **Observability note (browser scope)**: As in Creative 2, the OpenTelemetry/Prometheus sections of the template target backend services and are N/A here. Browser-scope observability for this interaction = typed `ApiError` surfaced via `ErrorBanner`, no `console.log`, and the single `request()` transport seam (Creative 2) remaining the only future `traceparent` injection point. dnd-kit adds no new network boundary.

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| `DndContext` (on `BoardPage`) | Single drag context for the whole board | Owns sensors, `onDragStart`/`onDragEnd`, collision detection, `DragOverlay`. One context spans all columns so cross-column moves are native. |
| `SortableContext` (per `KanbanColumn`) | Ordered, droppable card list | Provides the per-column item-id array (in position order) that drives sortable indexing and makes empty columns valid drop targets. |
| `useSortable` (per `KanbanCard`) | Draggable + sortable card | Supplies `attributes`, `listeners`, `setNodeRef`, transform; exposes keyboard + pointer activation. |
| `useMoveCard` (React Query mutation) | Optimistic move + rollback | `onMutate` snapshots + rewrites both column caches; `onError` restores snapshot + sets banner; `onSettled` invalidates both columns. **Defined in Creative 2; this doc wires the inputs.** |
| `onDragEnd` handler | Event → contract translation | Resolves source/destination column, computes the destination ordering, derives `after_card_id`, no-ops unchanged slots, and fires `useMoveCard.mutate(...)`. |
| `queryKeys.cards.byColumn(columnId)` | Cache addressing | The single key both the optimistic writer and the read hook (`useCards(columnId)`) use. |

### Component Interactions

```
BoardPage
 └─ DndContext (sensors: Pointer + Keyboard; DragOverlay)
     ├─ KanbanColumn "To Do"      → SortableContext(items=cardIds)  → KanbanCard(useSortable) ×N
     ├─ KanbanColumn "In Progress"→ SortableContext(items=cardIds)  → KanbanCard(useSortable) ×N
     └─ KanbanColumn "Done"       → SortableContext(items=cardIds)  → KanbanCard(useSortable) ×N

onDragEnd(active, over)
   → derive { destColumnId, after_card_id }
   → useMoveCard.mutate({ cardId, column_id, after_card_id })
        onMutate:   snapshot byColumn(src) + byColumn(dest); setQueryData both (optimistic)
        onError:    restore both snapshots; setBannerError(ApiError.message)
        onSettled:  invalidateQueries byColumn(src) + byColumn(dest)
```

## Options Explored

### Decision 1 — dnd-kit integration style

#### Option 1A: `@dnd-kit/sortable` preset (SortableContext + useSortable)

- **Description**: One board-level `DndContext`; each `KanbanColumn` wraps its cards in a `SortableContext` whose `items` array is the column's card ids in position order; each `KanbanCard` calls `useSortable`. Handles intra-column reorder and cross-column moves out of the box, and gives `over`/`active` data plus sortable indices directly usable to derive `after_card_id`.
- **Components**: `DndContext`, `SortableContext` ×columns, `useSortable` ×cards, `sortableKeyboardCoordinates`.
- **Pros**:
  - Built-in **keyboard sensor** with sortable coordinate getter → AC-10 keyboard move is largely free (arrow keys reorder, space/enter pick up & drop).
  - `arrayMove` + sortable index give a clean, well-tested derivation of the target ordering → `after_card_id`.
  - Empty-column drops handled by making the `SortableContext`/column a droppable; standard pattern with abundant references.
  - Smooth reorder animations and `DragOverlay` support included.
  - Matches productBrief mitigation ("use a well-tested library") and de-risks the High-impact item.
- **Cons**:
  - Slightly more concepts (SortableContext, strategy) than raw core.
  - Cross-column "drop on empty column" needs a small explicit droppable, a known minor gotcha.
- **Technical Fit**: High. **Complexity**: Low–Medium. **Scalability**: High (pattern reused by every future board feature).

#### Option 1B: `@dnd-kit/core` only (useDraggable + useDroppable, custom logic)

- **Description**: Raw draggables and droppables; hand-write ordering, index math, and a keyboard story.
- **Pros**: Maximum control; marginally smaller surface.
- **Cons**: Re-implements exactly what the sortable preset provides — including the **keyboard coordinate getter** that makes AC-10 cheap. Hand-rolled reorder/keyboard logic is precisely the bespoke, error-prone code the productBrief risk warns against. More tests for less benefit.
- **Technical Fit**: Medium. **Complexity**: High. **Scalability**: Medium.

#### Option 1C: react-beautiful-dnd — **excluded** (spec mandates dnd-kit; rbd is unmaintained and lacks first-class React 18 StrictMode support).

### Decision 2 — Where optimistic state lives

- **Option 2A — React Query cache** (`onMutate`/`setQueryData` on both column keys). Aligns with Creative 2; single source of truth; rollback via captured snapshot. **Chosen.**
- **Option 2B — local `useState` board snapshot** mirrored alongside the cache. Rejected: creates two sources of truth that drift (especially against `onSettled` refetch), duplicates the move logic, and contradicts the Creative 2 mandate. The only state we keep in `useState` is transient *drag UI* state (the `activeCard` for the overlay), which is not server state.

### Decision 3 — Visual feedback during drag

- **Option 3A — `DragOverlay` (floating clone)** with the source card rendered at reduced opacity in place. **Chosen.** The overlay is rendered outside the scrolling/transform context, so it tracks the pointer cleanly across columns and during horizontal board scroll; it avoids layout jank from re-measuring. Standard dnd-kit recommendation for cross-container sortables.
- **Option 3B — in-place ghost only (transform the original node)**. Rejected as the primary mechanism: across columns and within a horizontally scrolling board container, transformed-in-place nodes are prone to clipping/offset glitches. (We *do* still dim the origin slot for affordance — the overlay and the dimmed origin are complementary, not exclusive.)

### Decision 4 — Drag handle vs full-card drag target

- **Option 4A — full card is the drag target** (listeners on the card root). Simplest pointer UX, but the entire card swallows pointer interactions and there is no obvious affordance; future card actions (open detail, FEAT-007) would conflict.
- **Option 4B — dedicated drag handle** (a labeled handle element carries `attributes`+`listeners`; the rest of the card is free for clicks/links). **Chosen.** Rationale:
  - **Accessibility (AC-10)**: the handle is a focusable control with `aria-label` (e.g., `"Reorder card: {title}"`) and `aria-roledescription="draggable"`; keyboard users Tab to a single, discoverable control to initiate a move, rather than the whole card being a focus trap. It also leaves the card body free for the (future) "open card" affordance without gesture ambiguity.
  - **Pointer affordance**: a visible grip icon signals draggability (color-independent, satisfying the "not by color alone" AA requirement).
  - Cost is one small element per card — negligible.

## Evaluation Matrix

Scores: High / Medium / Low (higher = better).

| Criteria | 1A: Sortable preset | 1B: Core-only |
|---|---|---|
| Keyboard accessibility (AC-10) — free keyboard sensor | **High** | Low |
| Correctness of reorder / `after_card_id` derivation | **High** (sortable index + arrayMove) | Medium (hand-rolled) |
| Cross-column move support | High | Medium |
| Maintainability / pattern future features copy | **High** | Low |
| Implementation effort | **High** (least code) | Low (most code) |
| Bundle cost | Medium (`core`+`sortable`+`utilities` ~ small) | Medium (`core` only, marginally smaller) |
| De-risks productBrief High-impact DnD risk | **High** | Medium |

## Decision

**Chosen**:
1. **dnd-kit `@dnd-kit/sortable` preset** (Option 1A): one board-level `DndContext`, a `SortableContext` per column, `useSortable` per card, with the `verticalListSortingStrategy` and a keyboard sensor using `sortableKeyboardCoordinates`.
2. **Optimistic state in the React Query cache** (Option 2A) via the Creative-2 `useMoveCard` lifecycle; only transient drag-overlay state lives in `useState`.
3. **`DragOverlay` floating clone** + dimmed origin slot (Option 3A).
4. **Dedicated, accessible drag handle** per card (Option 4B).

### Rationale

- The sortable preset's **keyboard sensor + sortable coordinate getter** turns AC-10 (keyboard move) from bespoke work into configuration — directly satisfying the one accessibility requirement the productBrief marks as in-scope while the richer SR narration stays a deliberate post-MVP item.
- The sortable **index** is exactly the input needed to derive `after_card_id` against the destination ordering; pairing it with React Query's `onMutate`/`onError`/`onSettled` (Creative 2) gives a fully standard, well-tested path for AC-7/AC-8 — squarely addressing the product's named High-impact risk with library mechanisms rather than hand-rolled plumbing.
- Keeping all optimistic state in the cache (one source of truth, snapshot-based rollback over **both** affected column keys) is the only approach that reverts cleanly and converges with the `onSettled` refetch of authoritative positions.

### Trade-offs Accepted

- **Empty-column drop needs an explicit droppable** wrapper so a card can land in a column that currently has no sortable items — small, well-documented; handled by making the column body a droppable with `id = columnId`.
- **`DragOverlay` requires rendering a card clone** (a little extra render code) — accepted for cross-column/scroll robustness.
- **Drag handle adds one element per card** and means the whole card is not draggable — accepted; it is the accessibility- and future-proofing-correct choice.
- **Full screen-reader DnD narration is deferred** (post-MVP per productBrief) — accepted; baseline keyboard operability + handle labels meet AA scope. (A `DndContext` `accessibility.announcements` block is cheap and SHOULD still be wired with basic pick-up/drop messages.)

## Implementation Guidelines

1. **Dependencies**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
2. **Sensors** (on `BoardPage`'s `DndContext`): `PointerSensor` (with a small `activationConstraint: { distance: 5 }` so clicking the handle/card doesn't start a drag accidentally) + `KeyboardSensor({ coordinateGetter: sortableKeyboardCoordinates })`. Add `TouchSensor` (tablet nice-to-have).
3. **Per column**: wrap cards in `<SortableContext items={cardIdsInPositionOrder} strategy={verticalListSortingStrategy}>` and make the column body a droppable with `id = columnId` so empty columns accept drops. Encode each card's draggable id as the bare `card.id`; track which column an id belongs to via the cache (see `findCardColumn` below) — do **not** smuggle column into the id string.
4. **Drag handle**: spread `useSortable().attributes` and `.listeners` onto a dedicated handle button inside `KanbanCard`; give it `aria-label={`Reorder card: ${title}`}`. Apply `setNodeRef` + `transform`/`transition` to the card root; dim the root (`opacity: 0.4`) while it is the active drag item.
5. **DragOverlay**: render a `<KanbanCard>` clone of the `activeCard` inside `<DragOverlay>`; `activeCard` is set in `onDragStart` and cleared in `onDragEnd`/`onDragCancel`.
6. **`onDragEnd`** derives `{ destColumnId, after_card_id }` per the algorithm below, **no-ops** when the slot is unchanged, then calls `moveCard.mutate(...)`. Never mutate caches directly in `onDragEnd` — all cache writes happen in `useMoveCard.onMutate` so rollback is centralized.
7. **`useMoveCard`** (Creative 2) snapshots and rewrites **both** `cards.byColumn(src)` and `cards.byColumn(dest)` in `onMutate`, restores both in `onError` (and sets the board's `ErrorBanner`), and invalidates both in `onSettled`. When `src === dest`, operate on the single key.
8. **No `console.log`**; mutation `onError` routes `(error as ApiError).message` to the `ErrorBanner`.
9. **`accessibility.announcements`** on `DndContext`: basic "Picked up {title}", "Moved {title} to {column}", "Dropped {title}" strings.

### `after_card_id` Derivation Algorithm (the tricky bit — must match backend)

Given the dnd-kit `onDragEnd({ active, over })`:

1. If `over == null` → cancel (dropped outside any droppable). No-op.
2. `activeId = active.id`. Resolve `srcColumnId` = the column whose cached list currently contains `activeId`.
3. Resolve `destColumnId`:
   - If `over.id` is a **column droppable id** (dropped on empty column / column gutter) → `destColumnId = over.id`.
   - Else `over.id` is a **card id** → `destColumnId` = the column containing `over.id`.
4. Build `destOrder` = the destination column's current card-id list **in position order, with `activeId` removed** (removed even if it was already in that column — we want the ordering as it will appear *without* the dragged card, then place it relative to the survivors).
5. Compute the **insertion index** `targetIndex` within `destOrder`:
   - If dropped on the empty-column droppable → `targetIndex = destOrder.length` (i.e., append; but since empty, it's index 0 / top).
   - Else dropped on card `over.id`: let `overIndex = destOrder.indexOf(over.id)`. dnd-kit's collision gives us whether we're above or below via the sortable transform, but the robust, framework-agnostic rule is: **`targetIndex` = the index at which `activeId` should be inserted.** Use the sortable indices: `targetIndex = newIndex` returned by treating the destination `SortableContext` items with `arrayMove`. In practice for the preset, `over` resolves to the card currently occupying the slot, and the card is inserted *before* `over` when moving upward and *after* when moving downward — `@dnd-kit/sortable` already reflects this in the `over` it reports, so `targetIndex = destOrder.indexOf(over.id)` for upward/cross-column drops and `indexOf(over.id) + 1` is **not** needed because `over` already points at the displaced item.

   To keep this deterministic and matching the backend, reduce everything to the single invariant below rather than reasoning about up/down:

   > **`after_card_id` = the id of the card immediately ABOVE the final resting slot in `destOrder` (with the dragged card excluded); `null` if the resting slot is the top.**

   Concretely:
   ```
   restingIndex = index where activeId will sit among destOrder (0 = top)
   after_card_id = restingIndex === 0 ? null : destOrder[restingIndex - 1]
   ```
   We obtain `restingIndex` from the sortable preset: when `over` is a card, `restingIndex = destOrder.indexOf(over.id)` if the drag is landing at/above that card, which is what `@dnd-kit/sortable`'s `over` already encodes for vertical lists. (See code sketch — we use `arrayMove` to compute the post-drop order and read the index, which is unambiguous and avoids manual up/down branching.)
6. **No-op guard**: if `destColumnId === srcColumnId` AND `after_card_id` equals the id that was already immediately above `activeId` in the source order (or both are top), the slot is unchanged → return without mutating or calling the API (spec step 1).
7. Otherwise call `moveCard.mutate({ cardId: activeId, column_id: destColumnId, after_card_id: after_card_id ?? undefined })` (omit the field when `null`, matching the optional-param contract).

This is exactly the value the backend consumes: `null` → top (`first.position/2`), last id → append (`last.position+1`), middle id → midpoint — verified against `card.service.ts`.

### Code Sketch

```typescript
// src/api/queryKeys.ts  (extends Creative 2 factory)
export const cardKeys = {
  byColumn: (columnId: string) => ['cards', 'column', columnId] as const,
};

// src/api/hooks.ts  — useMoveCard (Creative 2 lifecycle, fully specified)
type MoveVars = { cardId: string; column_id: string; after_card_id?: string };
type MoveCtx = {
  srcColumnId: string;
  prevSrc: Card[] | undefined;
  prevDest: Card[] | undefined;
};

export function useMoveCard(setBannerError: (m: string | null) => void) {
  const qc = useQueryClient();
  return useMutation<Card, ApiError, MoveVars, MoveCtx>({
    mutationFn: ({ cardId, column_id, after_card_id }) =>
      moveCard(cardId, { column_id, after_card_id }),   // → PATCH /cards/:id/move

    // Optimistic: rewrite BOTH affected column caches atomically, before the network call.
    onMutate: async ({ cardId, column_id: destColumnId, after_card_id }) => {
      const srcColumnId = findCardColumn(qc, cardId);     // scans cached column lists
      await qc.cancelQueries({ queryKey: cardKeys.byColumn(srcColumnId) });
      await qc.cancelQueries({ queryKey: cardKeys.byColumn(destColumnId) });

      const prevSrc = qc.getQueryData<Card[]>(cardKeys.byColumn(srcColumnId));
      const prevDest = qc.getQueryData<Card[]>(cardKeys.byColumn(destColumnId));

      const moving = (prevSrc ?? []).find((c) => c.id === cardId)!;

      // 1) remove from source
      const srcAfter = (prevSrc ?? []).filter((c) => c.id !== cardId);
      // 2) compute destination order WITHOUT the moving card, then splice it in after `after_card_id`
      const destBase = (srcColumnId === destColumnId ? srcAfter : (prevDest ?? []))
        .filter((c) => c.id !== cardId);
      const insertAt = after_card_id == null
        ? 0
        : destBase.findIndex((c) => c.id === after_card_id) + 1;
      const destAfter = [
        ...destBase.slice(0, insertAt),
        { ...moving, column_id: destColumnId },
        ...destBase.slice(insertAt),
      ];

      if (srcColumnId === destColumnId) {
        qc.setQueryData(cardKeys.byColumn(destColumnId), destAfter);
      } else {
        qc.setQueryData(cardKeys.byColumn(srcColumnId), srcAfter);
        qc.setQueryData(cardKeys.byColumn(destColumnId), destAfter);
      }
      return { srcColumnId, prevSrc, prevDest };
    },

    // Revert BOTH caches exactly, surface the error (AC-8).
    onError: (err, vars, ctx) => {
      if (!ctx) return;
      qc.setQueryData(cardKeys.byColumn(ctx.srcColumnId), ctx.prevSrc);
      qc.setQueryData(cardKeys.byColumn(vars.column_id), ctx.prevDest);
      setBannerError(err.message);                        // ErrorBanner
    },

    // Reconcile with authoritative server positions (AC-7 persists).
    onSettled: (_data, _err, vars, ctx) => {
      qc.invalidateQueries({ queryKey: cardKeys.byColumn(vars.column_id) });
      if (ctx && ctx.srcColumnId !== vars.column_id) {
        qc.invalidateQueries({ queryKey: cardKeys.byColumn(ctx.srcColumnId) });
      }
    },
  });
}

// src/board/BoardPage.tsx  — DnD context + onDragEnd derivation
export function BoardPage() {
  const { columns } = useBoardColumns();              // ordered columns
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const moveCard = useMoveCard(setBannerError);
  const qc = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null);
    if (!over) return;                                          // dropped outside

    const cardId = String(active.id);
    const srcColumnId = findCardColumn(qc, cardId);

    // over.id is either a columnId (empty/gutter droppable) or a cardId
    const overId = String(over.id);
    const overIsColumn = columns.some((c) => c.id === overId);
    const destColumnId = overIsColumn ? overId : findCardColumn(qc, overId);

    // Destination order with the dragged card removed (visual survivors).
    const destList = (qc.getQueryData<Card[]>(cardKeys.byColumn(destColumnId)) ?? [])
      .filter((c) => c.id !== cardId);

    // Resting index: append for column-drop, else position of the card we dropped onto.
    const overIndex = overIsColumn ? destList.length : destList.findIndex((c) => c.id === overId);
    const restingIndex = overIndex < 0 ? destList.length : overIndex;

    const after_card_id = restingIndex === 0 ? null : destList[restingIndex - 1].id;

    // No-op guard (spec step 1): same column AND same neighbour-above.
    if (srcColumnId === destColumnId) {
      const srcList = qc.getQueryData<Card[]>(cardKeys.byColumn(srcColumnId)) ?? [];
      const curIdx = srcList.findIndex((c) => c.id === cardId);
      const curAfter = curIdx <= 0 ? null : srcList[curIdx - 1].id;
      if (curAfter === after_card_id) return;                 // unchanged slot
    }

    setBannerError(null);
    moveCard.mutate({
      cardId,
      column_id: destColumnId,
      after_card_id: after_card_id ?? undefined,              // omit when top
    });
  }

  return (
    <>
      {bannerError && <ErrorBanner message={bannerError} onDismiss={() => setBannerError(null)} />}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveCard(findCard(qc, String(active.id)))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveCard(null)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up card ${active.id}.`,
            onDragOver: ({ over }) => (over ? `Over ${over.id}.` : ''),
            onDragEnd: ({ over }) => (over ? `Dropped onto ${over.id}.` : 'Dropped.'),
            onDragCancel: () => 'Move cancelled.',
          },
        }}
      >
        <KanbanBoard columns={columns} />
        <DragOverlay>{activeCard ? <KanbanCard card={activeCard} overlay /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}

// src/board/KanbanColumn.tsx  — SortableContext + empty-column droppable
function KanbanColumn({ column }: { column: Column }) {
  const { data: cards = [] } = useCards(column.id);            // useQuery(cardKeys.byColumn(id))
  const { setNodeRef } = useDroppable({ id: column.id });      // accepts drops on empty column
  return (
    <section ref={setNodeRef} aria-label={`Column: ${column.name}`}>
      <h2>{column.name}</h2>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map((c) => <KanbanCard key={c.id} card={c} />)}
      </SortableContext>
      <CreateCardForm columnId={column.id} />
    </section>
  );
}

// src/board/KanbanCard.tsx  — sortable card with a dedicated accessible drag handle
function KanbanCard({ card, overlay }: { card: Card; overlay?: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition,
                  opacity: isDragging && !overlay ? 0.4 : 1 };
  return (
    <article ref={setNodeRef} style={style} aria-roledescription="Card">
      <button
        type="button"
        className="drag-handle"
        aria-label={`Reorder card: ${card.title}`}
        aria-roledescription="draggable"
        {...attributes}
        {...listeners}
      >
        <GripIcon aria-hidden />
      </button>
      <h3>{card.title}</h3>
      {/* labels, due-date chip … */}
    </article>
  );
}
```

`findCardColumn(qc, cardId)` and `findCard(qc, cardId)` are small helpers that scan the cached `cardKeys.byColumn(*)` lists (the board knows its column ids) to locate which column currently holds a card id — this is how the cache, not a parallel state object, remains the single source of truth.

## Validation Checklist

- [x] Meets all system requirements (intra- + cross-column move, optimistic both-column rewrite, revert, no-op guard)
- [x] `after_card_id` derivation matches backend `card.service.ts` (null=top, last=append, middle=midpoint) — verified against source
- [x] Optimistic state lives only in the React Query cache (Creative 2 mandate); only transient overlay state in `useState`
- [x] Both source and destination column caches updated atomically in `onMutate`, restored in `onError`, invalidated in `onSettled`
- [x] WCAG 2.1 AA baseline (AC-10): keyboard sensor + sortable coordinate getter; labeled drag handle; color-independent affordance; basic DnD announcements
- [x] Respects technical constraints (dnd-kit per spec; React Query per Creative 2; no SSR; tablet sensors)
- [x] Complies with Guiding Principles in systemPatterns.md — single typed `ApiError` → `ErrorBanner`; no `console.log`; centralized query keys; well-tested library over bespoke code
- [x] Technically feasible — `@dnd-kit/sortable` + TanStack Query v5 + React 18 is a standard, documented pairing
- [x] Risks identified and acceptable (see below)
- [N/A] Backend OTLP/Prometheus metrics — browser client; no new network boundary introduced by dnd-kit

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `after_card_id` mis-derived vs backend midpoint algorithm | Medium | High | Single invariant ("id immediately above resting slot, excluding the dragged card; null = top"); unit-test the derivation against fixtures mirroring the four backend cases; integration test AC-7 |
| Empty-column drop not registering | Medium | Medium | Explicit `useDroppable({ id: columnId })` on column body; test dropping onto an empty column |
| `onSettled` refetch clobbers a fast subsequent drag | Low | Medium | `cancelQueries` in `onMutate`; `refetchOnWindowFocus:false` (Creative 2 default); React Query coalesces in-flight invalidations |
| Same-column no-op still fires API | Low | Low | Explicit no-op guard comparing neighbour-above before mutating |
| StrictMode double-invoke or stale closure in handlers | Low | Medium | Read fresh cache via `qc.getQueryData` inside handlers (no captured snapshots in `onDragEnd`); rollback snapshot captured inside `onMutate` |
| Keyboard move not announced richly to SR | Medium | Low | Baseline announcements wired; full SR narration explicitly post-MVP per productBrief |

## Next Steps

1. Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` to `frontend/` (Phase 4).
2. Implement `useMoveCard` with the both-column optimistic lifecycle + `findCardColumn`/`findCard` helpers.
3. Wire `DndContext`/sensors/`DragOverlay`/`onDragEnd` on `BoardPage`; `SortableContext` + empty droppable per `KanbanColumn`; `useSortable` + accessible handle per `KanbanCard`.
4. Unit-test the `after_card_id` derivation (four backend cases + same-column no-op) and the `useMoveCard` rollback; integration-test AC-7 (cross-column persist) and AC-8 (revert + banner); keyboard-move smoke test for AC-10.
5. Feed the primary flow (board → drag card → verify) into `/banyan-uat`; the PASS generates the E2E spec.

---

ARCHITECTURE CREATIVE COMPLETE
Document: memory-bank/creative/TASK-009-dnd-optimistic-ux.md
Decision: Use the dnd-kit @dnd-kit/sortable preset (board-level DndContext, SortableContext per column, useSortable per card) with a dedicated accessible drag handle and a DragOverlay; keep all optimistic state in the React Query cache via the Creative-2 useMoveCard onMutate/onError/onSettled lifecycle, rewriting both source and destination column caches atomically; derive after_card_id as "the id of the card immediately above the resting slot (dragged card excluded), null if top" — matching the backend's fractional-position move algorithm exactly.
