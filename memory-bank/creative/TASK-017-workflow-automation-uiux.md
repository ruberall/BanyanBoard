# UI/UX Decision: Workflow Automation Visual Treatment

**Created**: 2026-06-27
**Status**: DECIDED
**Decision Type**: UI/UX

---

## User Context

### Target Users

- **Primary**: Dev Team Lead — opens the board daily for standups; wants to see stale work surfaced immediately without hunting; scans column states at a glance.
- **Primary**: Individual Developer — wants a clear queue of next tasks; needs to distinguish stale vs. fresh work at a glance; moves cards to Done and expects a satisfying, clear completion signal.
- **Secondary**: Freelancer / Small Business Owner — same board-scan usage pattern; may be less tolerant of unexpected visual noise.

### User Goals

1. Instantly see which cards are stale (stuck in To Do or In Progress for 2+ days) without manual review.
2. Feel confident that dragging a card to Done has been registered — the color change is a success signal.
3. Understand when something went wrong silently vs. when it needs attention, without being overwhelmed with notifications.

### Use Cases

| Use Case | User | Goal | Frequency |
|----------|------|------|-----------|
| Morning standup board scan | Dev Team Lead | Immediately see stale column, triage backlog | Daily |
| Card completion | Individual Developer | Drag to Done, see pale green confirmation | Multiple times per day |
| Rescuing a stale card | Individual Developer | Drag card out of Stale, keep it out permanently | Occasionally |
| Board load after DB error | Any user | Board still loads; warnings don't block work | Rare |

### Constraints

- **Devices**: Desktop primary (Chrome/Firefox/Safari/Edge latest). Tablet responsive. Mobile drag-and-drop is nice-to-have only.
- **Accessibility**: WCAG 2.1 AA mandatory. Color MUST NOT be the sole indicator of any state (Stale column, done color). Keyboard navigation must function. Screen readers must understand column purpose via `aria-label`.
- **Existing Patterns**:
  - `KanbanColumn` renders `<section aria-label="Column: {name}">` with `<h2>` heading; background `#f7fafc`; `min-width: 300px`.
  - `KanbanCard` renders `<article>` with `background: #fff`; `border: 1px solid #e2e8f0`; inline `backgroundColor` style from `card.color`.
  - `ErrorBanner` renders `role="alert"` with controlled/uncontrolled dismiss; consistent color/shape for board-level errors.
  - Filter state: page-level state + prop drilling (BoardPage → KanbanBoard → KanbanColumn). New column-level props must follow the same pattern.
  - TanStack Query: `invalidateQueries` after mutations restores server truth. Optimistic updates already used for card moves.
  - No toast/notification library in the codebase — only `ErrorBanner`.

---

## User Flow

### Flow Diagram

```
[User navigates to /boards/:boardId]
         ↓
[Board loads — GET /boards/:boardId runs WorkflowService]
         ↓
  [Stale cards moved to Stale column server-side]
         ↓
[Board renders 4 columns: To Do | In Progress | Stale | Done]
         ↓
         ├─ [User sees Stale column with distinct header treatment]
         │         ↓
         │   [User reads stale cards — icon + text confirm staleness]
         │         ↓
         │   [User drags card OUT of Stale → stale_suppressed = true → card stays where placed]
         │
         └─ [User drags any card to Done column]
                   ↓
           [Optimistic: card moves + color → #d4edda immediately]
                   ↓
           [PATCH /cards/:id/move in-flight]
                   ↓
              [Success path]                  [Failure path]
                   ↓                                ↓
         [TanStack invalidation]          [3 retries exhaust]
         [Server truth confirms color]    [Next board refresh reverts color silently]

[Board load warnings[] path]:
GET /boards/:boardId returns warnings[]
         ↓
[Frontend parses warnings — no UI displayed; logged to console]
[Board continues to render normally]
```

### Flow Description

1. **Entry**: User opens `/boards/:boardId`. Board data loads (LoadingSpinner shown during fetch).
2. **Stale evaluation**: Server-side WorkflowService moves stale cards before response. User sees four columns on render.
3. **Stale column recognition**: User reads the Stale column's distinct header treatment and/or stale-indicator on individual cards.
4. **Card rescue**: User drags a card out of Stale. The card stays in its destination on all future board loads (`stale_suppressed = true`).
5. **Done move**: User drags card to Done. Card moves instantly (optimistic). Background turns pale green immediately (optimistic color update). PATCH completes; TanStack invalidation confirms or silently reverts.
6. **Exit**: User continues working; board reflects authoritative state after invalidation cycle.

### Error States

| Error | Cause | User Recovery |
|-------|-------|---------------|
| Stale rule fails for one or more cards | DB error during WorkflowService.applyBoardRules | Board loads normally; warnings[] silently logged; affected cards stay where they are (not in Stale) |
| Done-color rule fails after 3 retries | DB error during WorkflowService.triggerDoneColorRule | Card color reverts to previous value on next TanStack Query invalidation cycle (silent, no notification) |
| Board load network error | Network / server error on GET /boards/:boardId | Existing ErrorBanner pattern handles this (unchanged) |

---

## Decision 1: Stale Column Visual Treatment

### Options Explored

#### Option A: Name-Only (No Distinct Styling)
- **Approach**: Stale column renders identically to To Do and In Progress. The name "Stale" is the only indicator. No CSS changes to `KanbanColumn`.
- **Wireframe/Layout**:
  ```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ To Do        │  │ In Progress  │  │ Stale        │  │ Done         │
  │ (grey bg)    │  │ (grey bg)    │  │ (grey bg)    │  │ (grey bg)    │
  │              │  │              │  │ [Card]       │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
  ```
- **User Flow**: User reads all four column headers; "Stale" name communicates state.
- **Pros**:
  - Zero implementation delta (no CSS changes).
  - Visually consistent — no surprise for users.
- **Cons**:
  - Name alone is easily missed during a quick scan. Users accustomed to 3 columns may not register the new fourth column immediately.
  - Does not draw the eye to the work that needs attention — defeats the primary purpose of surfacing stale work.
  - Provides no scanability advantage during standups; team lead still has to read column names.
- **Usability**: Low — the feature's value depends on users noticing stale work; a name-only indicator is too weak.
- **Accessibility**: High — no accessibility concerns introduced.
- **Implementation Complexity**: Low.

#### Option B: Distinct Column Header Color (Amber/Warm Tint)
- **Approach**: The Stale column receives a distinct header background: warm amber/sand tint (`#fef3c7`, matching the existing "Pale amber" swatch already in the SWATCHES palette). Column body background remains `#f7fafc` (unchanged). The heading `h2` gains a small icon prefix (⚠ or ⏰) alongside the "Stale" text. `aria-label` on the `<section>` reads `"Stale — cards here have not moved in 2 or more days"`.
- **Wireframe/Layout**:
  ```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐
  │ To Do        │  │ In Progress  │  │ ⏰ Stale         │  │ Done         │
  │ grey header  │  │ grey header  │  │ amber header     │  │ grey header  │
  │ #f7fafc bg   │  │ #f7fafc bg   │  │ #f7fafc body     │  │ #f7fafc bg   │
  │              │  │              │  │ [Card] [Card]    │  │              │
  └──────────────┘  └──────────────┘  └──────────────────┘  └──────────────┘
  ```
- **User Flow**: User's eye is drawn to the amber header during standup scan. The icon + name confirms what the column means. Cards in the column are otherwise normal.
- **Pros**:
  - Strong pre-attentive scan signal without changing card appearance.
  - Non-color indicator (icon + name) satisfies WCAG 2.1 AA — color is supplemental.
  - Minimal visual change: only the column header is affected; cards look normal.
  - Consistent with the existing column structure — same `<section>/<h2>` DOM, just new CSS class on the heading.
  - Amber (`#fef3c7`) is already in the SWATCHES palette, meaning no new color decisions needed.
- **Cons**:
  - User must still notice the column to know cards are there. If Stale column is empty (no stale cards), the amber header is a "false alarm" visual.
  - Amber may look like an error state to some users (amber = warning). Could be addressed with a clock icon instead of a warning icon.
- **Usability**: High — pre-attentive color pop draws the eye immediately; icon + text confirm.
- **Accessibility**: High — WCAG AA compliant: icon + name are non-color indicators.
- **Implementation Complexity**: Low — CSS class on heading + `aria-label` on section.

#### Option C: Card-Level Stale Indicator (Amber Left Border on Individual Cards)
- **Approach**: All cards in the Stale column (or any stale card regardless of column) receive an amber left border (`border-left: 3px solid #d97706`) and a small "Stale" text badge above the title. The column itself looks like other columns. This approach works whether or not a separate Stale column exists.
- **Wireframe/Layout**:
  ```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ To Do        │  │ In Progress  │  │ Stale        │  │ Done         │
  │ (grey)       │  │ (grey)       │  │ (grey)       │  │ (grey)       │
  │              │  │              │  │ ║ [Card]     │  │              │
  │              │  │              │  │   [Stale]    │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
  (amber left border on stale cards)
  ```
- **User Flow**: User scans cards individually; amber border + "Stale" badge on a card signals its state.
- **Pros**:
  - Card-level indicator works even if a user moves a stale card to another column manually.
  - Very explicit per-card signal.
- **Cons**:
  - Adds complexity to `KanbanCard` — needs a `isStale?: boolean` prop or column-type knowledge.
  - Cards do not currently know which column type they are in; this would require passing column metadata down to each card, breaking the existing prop-drilling model which passes only `column: Column` and `filterText`.
  - Stale column already groups stale cards; card-level indicators within that column are redundant.
  - The `stale_suppressed` flag means a card dragged out of Stale is no longer stale — but the border would need to be cleared immediately on move, requiring optimistic state for a suppression flag that isn't tracked client-side.
  - Higher implementation complexity and more component coupling.
- **Usability**: Medium — useful signal but noisy if all cards in Stale already have it.
- **Accessibility**: High — border + text badge are non-color indicators.
- **Implementation Complexity**: High — requires column-type knowledge in KanbanCard.

#### Option D: Distinct Column Header + Empty-State Friendly Message
- **Approach**: Same as Option B (amber header + icon), plus: when the Stale column is empty, it shows a friendly empty-state message instead of "No cards yet" — e.g., "No stale cards — nice work!" The message resets to the standard "No cards yet" phrasing for all other columns.
- **Wireframe/Layout**:
  ```
  ┌──────────────────────────────┐
  │ ⏰ Stale                    │  ← amber heading background
  ├──────────────────────────────┤
  │  No stale cards — nice work! │  ← custom empty state
  │                              │
  │  [drop zone]                 │
  └──────────────────────────────┘
  ```
- **User Flow**: Same as B; additionally, on a day with no stale cards, user reads the positive empty-state message.
- **Pros**:
  - All benefits of Option B plus positive reinforcement when the board is clean.
  - Serves the Dev Team Lead persona: daily standup scan yields either stale cards (to triage) or a positive signal (team velocity is good).
  - Empty state message is a well-established pattern in kanban tools (Trello uses this).
- **Cons**:
  - Slightly more implementation work than B (conditional empty message based on column name).
  - The amber header on an empty Stale column may still feel like a warning when there's nothing to worry about. Mitigation: the positive empty state copy counterbalances this visually.
- **Usability**: High — amber header + icon draws attention to stale work; positive empty state prevents the amber from feeling like an error when there's nothing stale.
- **Accessibility**: High — icon + name + text are all non-color indicators.
- **Implementation Complexity**: Low-Medium — same as B plus a conditional in KanbanColumn's empty state render path.

### Evaluation Matrix — Decision 1

| Criteria | A (Name Only) | B (Header Color+Icon) | C (Card-Level) | D (Header+Empty State) |
|----------|--------------|----------------------|----------------|----------------------|
| Usability | Low | High | Medium | High |
| Accessibility | High | High | High | High |
| Consistency | High | High | Medium | High |
| Responsiveness | High | High | Medium | High |
| Performance | High | High | Medium | High |
| Implementation | Low | Low | High | Low-Medium |

### Decision 1: Stale Column Visual Treatment

**Chosen**: Option D — Distinct amber column header with icon prefix, plus a friendly empty-state message.

**Rationale**: The entire value of the Stale column is that it makes neglected work immediately visible during a standup scan. Option A (name only) fails this goal. Option C (card-level indicator) introduces coupling between `KanbanCard` and column-type knowledge that does not exist in the current architecture and adds complexity for negligible gain over the column grouping itself. Option D extends B with a meaningful empty state message that serves the Dev Team Lead persona: when the board is clean, the empty-state copy gives a positive signal ("nice work!") that prevents the amber header from feeling like an error. The amber tint is already present in the existing SWATCHES palette (`#fef3c7`), so no new design decisions are needed. The icon (⏰) + name "Stale" in the heading ensures the indicator is not color-alone, satisfying WCAG 2.1 AA.

**Trade-offs Accepted**:
- The amber header is always visible even when Stale is empty. Mitigation: the friendly empty-state message ("No stale cards — nice work!") counterbalances the amber warning tone when there's nothing to worry about.
- The icon (⏰) is a Unicode emoji. On some platforms/fonts it renders as a color glyph, which is a purely additive enhancement. The text "Stale" alongside it is sufficient without the icon.

---

## Decision 2: Optimistic Color Update on Done Move

### Options Explored

#### Option A: Immediate Optimistic Color (Before Server Confirms)
- **Approach**: When the user drops a card on the Done column, the card's `color` is set to `#d4edda` in the TanStack Query cache immediately, before the PATCH response arrives. The card moves to Done (existing optimistic behavior) AND turns pale green simultaneously.
- **User Flow**: Drop card → card appears in Done with pale green background in the same render cycle. PATCH completes → invalidation → server confirms color (or silently reverts if rule failed).
- **Pros**:
  - Instant feedback — the card move and color change feel like a single action.
  - Meets AC-ASYNC-1 exactly ("color is set to #d4edda client-side immediately").
  - Consistent with the existing optimistic update pattern for card moves.
  - No loading state or delay needed.
- **Cons**:
  - The color change is a workflow side-effect, not a direct user action — applying it optimistically before server confirms is slightly presumptuous. However, the plan explicitly calls for this via AC-ASYNC-1.
  - On failure, the silent revert (TanStack invalidation) may confuse users who saw the green and then it disappears, but per AC-ERROR-2 this is explicitly accepted behavior.
- **Usability**: High — most seamless experience.
- **Accessibility**: High — no animation dependency; color appears in the same render as the card move.
- **Implementation Complexity**: Low — extend the existing card move mutation's `onMutate` optimistic update to also set `color: '#d4edda'` in the cache.

#### Option B: Server-Confirmed Color (2-Second Delay)
- **Approach**: Card moves to Done immediately (existing optimistic behavior). Pale green only appears after the PATCH response completes and WorkflowService has applied the color server-side, then TanStack Query invalidation renders the updated card.
- **User Flow**: Drop card → card in Done (white background) → ~2 seconds later → card turns pale green (from invalidation fetch).
- **Pros**:
  - No optimistic "lie" — color only appears when it's actually persisted.
- **Cons**:
  - 2-second delay between move and color change breaks the "rewarding completion" feel.
  - AC-ASYNC-1 explicitly requires the optimistic update. This option does not satisfy the AC.
  - Users may not notice the color change 2 seconds later if they've already moved on.
- **Usability**: Low — delayed feedback is worse UX; AC non-compliant.
- **Accessibility**: Medium — no animation concern, but the delayed state change is harder to understand.
- **Implementation Complexity**: Low (but spec-non-compliant).

#### Option C: Immediate Optimistic + CSS Fade-In Transition
- **Approach**: Same as Option A (color set immediately in cache), but the pale green background fades in over ~300ms using a CSS `transition: background-color 300ms ease-in`. This gives the color change a subtle "painting over" feel rather than a hard snap.
- **User Flow**: Drop card → card in Done → pale green fades in over 300ms.
- **Pros**:
  - Slightly more polished than a hard snap.
  - The fade draws the eye to the color change, making the "completion reward" more noticeable.
- **Cons**:
  - CSS transitions on `background-color` may interact poorly with dnd-kit's drag overlay (which also sets inline styles/transforms). The `transition` on the card's style object is already used by dnd-kit for drop animations; a simultaneous `background-color` transition could overlap awkwardly.
  - WCAG 2.3.3 (Animation from Interactions) — if the user has `prefers-reduced-motion: reduce`, the fade must be suppressed. This adds implementation complexity.
  - Adds a CSS change to `KanbanCard.module.css` that affects all cards, not just done-moved cards. Scoping the transition to only the "just-turned-green" card requires ephemeral state.
- **Usability**: Medium-High — the fade is nice but introduces complexity that may not be worth the small polish gain.
- **Accessibility**: Medium — requires `prefers-reduced-motion` handling.
- **Implementation Complexity**: Medium — dnd-kit interaction risk; motion preference handling.

### Evaluation Matrix — Decision 2

| Criteria | A (Immediate Optimistic) | B (Server-Confirmed) | C (Immediate + Fade) |
|----------|--------------------------|---------------------|---------------------|
| Usability | High | Low | Medium-High |
| Accessibility | High | Medium | Medium |
| Consistency | High | Medium | Medium |
| Responsiveness | High | Low | High |
| Performance | High | High | High |
| Implementation | Low | Low | Medium |
| AC Compliance | Yes | No | Yes |

### Decision 2: Optimistic Color Update

**Chosen**: Option A — Immediate optimistic color update, hard snap (no fade transition).

**Rationale**: AC-ASYNC-1 mandates the optimistic update. Option A satisfies it with the least complexity and the highest usability. The CSS fade (Option C) is not worth the implementation risk of dnd-kit transition conflicts and `prefers-reduced-motion` handling for a 300ms aesthetic improvement. The existing optimistic update pattern in the codebase (card move) already does a hard snap — the pale green should follow the same convention. The card is already moving positions (hard snap) in the same gesture; adding a color hard snap is visually coherent. The "completion reward" is delivered by the color itself, not by the animation.

**Trade-offs Accepted**:
- If the Done-color rule fails after 3 retries, the card's pale green reverts silently on the next TanStack Query invalidation. This is a silent revert that could briefly confuse a user who sees the green disappear. This is explicitly accepted per AC-ERROR-2 ("No error is shown to the user"). The revert is indistinguishable from other TanStack Query background refetches, so it does not read as an error to the user.

---

## Decision 3: Rollback UX for Done-Color Rule Failure

### Options Explored

#### Option A: Silent Snap-Back (No Notification)
- **Approach**: When the Done-color rule fails after 3 retries, TanStack Query's `invalidateQueries` on mutation settle fetches fresh board data. The server returns the card without `#d4edda` (color unchanged). The pale green disappears as part of the normal data refresh cycle. No toast, no banner, no retry icon.
- **Pros**:
  - AC-ERROR-2 explicitly states: "No error is shown to the user in the UI (failure is silent from user perspective)."
  - Consistent with existing behavior: other background refresh cycles also update card states silently.
  - No notification infrastructure needed (no toast library; only `ErrorBanner` in the codebase).
  - Avoids user confusion — most users won't notice or care that the rule failed; the card is still in Done.
- **Cons**:
  - A user who observed the green may be confused when it disappears. However, since the card is still in Done, the card's position (the primary user action) is preserved.
- **Usability**: High (in context of the spec) — consistent with the broader pattern; spec requires silence.
- **Accessibility**: High — no notification to make accessible.
- **Implementation Complexity**: Low — existing TanStack Query invalidation handles this automatically.

#### Option B: Toast Notification "Color update failed"
- **Approach**: If the mutation callback detects that the server-returned card lacks `#d4edda` after the PATCH, show a toast/snackbar "Color update failed — the card color could not be saved."
- **Pros**:
  - User understands why the green disappeared.
- **Cons**:
  - AC-ERROR-2 explicitly requires silence: "No error is shown to the user."
  - No toast library in the codebase; adding one adds a dependency.
  - Rule failure detection on the frontend is unreliable: the PATCH endpoint returns 200 (card is in Done); the color update is async server-side. The frontend cannot know the rule failed from the PATCH response.
  - The TanStack Query invalidation that reverts the color happens automatically; there is no hook to intercept "color went from optimistic to server-truth and they differ" without adding complex comparison logic.
- **Usability**: Medium — informative but spec-non-compliant and complex.
- **Accessibility**: Medium — toast must be accessible (role="alert").
- **Implementation Complexity**: High — requires toast library, detection logic, and a spec exception.

#### Option C: Retry Icon on Card
- **Approach**: The card shows a small "↺ retry" icon that the user can click to re-trigger the color rule.
- **Pros**:
  - User has agency.
- **Cons**:
  - AC-ERROR-2 is explicit: silence is the requirement.
  - The retry action would need a new API endpoint or mutation. Out of scope.
  - The frontend cannot detect the rule failure from the PATCH 200 response.
- **Usability**: Low (spec non-compliant, overengineered for the failure rate).
- **Accessibility**: Medium.
- **Implementation Complexity**: Very High.

### Evaluation Matrix — Decision 3

| Criteria | A (Silent Snap-Back) | B (Toast) | C (Retry Icon) |
|----------|---------------------|-----------|----------------|
| Usability | High (in spec) | Medium | Low |
| Accessibility | High | Medium | Medium |
| Consistency | High | Low | Low |
| AC Compliance | Yes | No | No |
| Implementation | Low | High | Very High |

### Decision 3: Rollback UX

**Chosen**: Option A — Silent snap-back via TanStack Query invalidation.

**Rationale**: AC-ERROR-2 requires silence. The failure rate is expected to be very low (DB errors after 3 retries). The card remains in Done (the user's intent is fulfilled); only the background color fails to persist. The silent revert is indistinguishable from a normal TanStack refetch. No notification infrastructure exists in the codebase, and adding a toast library is out of scope for this feature.

**Trade-offs Accepted**:
- A user who notices the green disappearing has no explanation. Accepted per spec. If this proves to be a real user pain point in UAT, a future iteration could add a console warning visible in dev mode only.

---

## Decision 4: Rule Failure Visibility (warnings[] from Board Load)

### Options Explored

#### Option A: Silent — Parse but Do Not Display
- **Approach**: The frontend TypeScript type for the board GET response is extended to include `warnings?: WorkflowWarning[]`. The code reads the field. No UI is rendered for warnings. If warnings are present, they are logged to the browser console (`console.warn`) in development mode (or swallowed in production — but see implementation note).
- **Pros**:
  - AC-ERROR-1 describes Rule #1 failure as a soft failure: "board loads normally." No mention of a user-facing indicator.
  - Consistent with the Silent/AC-compliant approach already decided for Decision 3.
  - Zero UI change needed; warnings field is parsed for future extensibility.
  - No new components needed.
- **Cons**:
  - Developer/operator has no visibility into partial rule failures at the UI level.
- **Usability**: High (for end users — they are not burdened with technical failure details).
- **Accessibility**: High (nothing to make accessible).
- **Implementation Complexity**: Low.

#### Option B: Dismissible Banner — "Some cards could not be updated"
- **Approach**: If `warnings.length > 0` from the board GET response, render an `ErrorBanner` (the existing component, `role="alert"`) at the top of the board area with the message: "Some cards could not be automatically organized. The board may not reflect the latest workflow rules."
- **Pros**:
  - `ErrorBanner` already exists and is accessible (`role="alert"`, dismiss button).
  - Keeps users informed about partial rule failures.
- **Cons**:
  - Stale rule failure is a technical backend failure, not a user error. Surfacing it creates confusion and anxiety for a problem the user cannot fix.
  - The board is still fully functional (cards are where they were, just not moved to Stale). This does not need user attention.
  - The plan ("Out of scope: Notification UI for rule failures") explicitly defers this.
  - Would fire on every board load if the DB is having issues — this would be noisy.
- **Usability**: Medium — technically informative but creates unnecessary anxiety.
- **Accessibility**: High — `ErrorBanner` is already accessible.
- **Implementation Complexity**: Low-Medium.

#### Option C: Console-Only Logging
- **Approach**: Parse `warnings[]` but only log to the browser console. Never render anything in the UI.
- **Pros**:
  - Gives developers/operators debugging visibility without user noise.
- **Cons**:
  - Guiding Principle 4 forbids `console.log` in production code. The plan requires pino for backend logging; on the frontend the equivalent rule is to not use `console.log` in production paths.
  - Console logging is not structured or observable.
- **Usability**: High (no user impact).
- **Accessibility**: High.
- **Implementation Complexity**: Low (but conflicts with code standards).

### Evaluation Matrix — Decision 4

| Criteria | A (Silent Parse) | B (Dismissible Banner) | C (Console Log) |
|----------|-----------------|----------------------|----------------|
| Usability | High | Medium | High |
| Accessibility | High | High | High |
| Consistency | High | Medium | Low (violates GP4) |
| AC Compliance | Yes | Out-of-scope | Partial |
| Implementation | Low | Low-Medium | Low |

### Decision 4: Rule Failure in Board Load (warnings[])

**Chosen**: Option A — Parse `warnings[]` from the board response into the TypeScript type; render nothing to the user; make the field available for future use. The warnings field's presence/absence does not change any rendered output in Phase 4.

**Rationale**: The plan explicitly lists "Notification UI for rule failures" as out of scope. AC-ERROR-1 says the board loads normally; no UI requirement is stated for the warnings field beyond it being in the response body. Surfacing backend workflow errors to end users creates confusion for a state they cannot resolve. The field is added to the TypeScript type to preserve forward-compatibility (a future admin panel or dev overlay can surface it without a data model change). Console logging is rejected because it conflicts with Guiding Principle 4 (`console.log` forbidden in production code).

**Trade-offs Accepted**:
- Operators/developers have no UI visibility into partial rule failures. Mitigation: backend pino logging already captures these (Rule #1 failure is logged at `warn` level per the observability plan). Frontend warnings are intentionally silent per the spec.

---

## Decision 5: Stale Column Empty State

### Decision

**Chosen**: Custom empty-state message for Stale column: "No stale cards — nice work!"

All other columns retain the existing "No cards yet" message.

**Implementation**: `KanbanColumn` receives a `column` prop that already has `column.name`. A conditional in the empty-state render checks `column.name === 'Stale'` to select the appropriate message.

**Rationale**: The Stale column's amber header draws the eye. On a clean board (no stale cards), this amber header needs a counterbalancing positive signal to prevent it reading as an error state. "No stale cards — nice work!" serves the Dev Team Lead persona: a daily standup scan that yields this message means the team is moving work consistently. This is a small implementation delta (one conditional string) with a meaningful UX benefit.

---

## Consolidated Design Specifications

### Layout

- **Desktop**: Four columns side-by-side (To Do | In Progress | Stale | Done). `KanbanBoard` renders them sorted by `column.position` — no change needed since API returns the Stale column at position 3.
- **Tablet**: Horizontal scroll (existing `overflow-x: auto` on `.board`). Stale column is visible with the same horizontal scroll behavior as other columns.
- **Mobile**: Same as tablet; drag-and-drop is nice-to-have (unchanged from existing).

### Key Components

| Component | Change | Behavior |
|-----------|--------|----------|
| `KanbanColumn` | CSS: add `.staleColumn` variant class; heading text + icon | Amber heading background for Stale column; custom empty state message |
| `KanbanCard` | CSS: add `transition: background-color 200ms ease` scoped to `done` card class? | NO — no fade. Inline `backgroundColor` style set immediately from `card.color`. No new CSS needed. |
| Board-level mutation handler | Extend `onMutate` in card move mutation | Set `color: '#d4edda'` optimistically in TanStack cache when target column is Done |
| Frontend type | Extend `BoardWithColumns` type | Add `warnings?: WorkflowWarning[]` to board response type; no rendering needed |
| `swatches.ts` | Add pale green if not present | `#d4edda` is NOT currently in SWATCHES (current pale green swatch is `#dcfce7`). Add `{ name: 'Pale green (done)', hex: '#d4edda' }` to SWATCHES — or leave SWATCHES unchanged since CardColorPicker is a separate concern from the workflow-applied color. **DECISION**: Do not add `#d4edda` to SWATCHES; the workflow applies it programmatically. CardColorPicker's existing `#dcfce7` is close enough for user-selected colors. This avoids user confusion between the auto-applied done color and a manually selected swatch. |

### Stale Column CSS Specification

**New CSS class in `KanbanColumn.module.css`**:
```css
.staleHeading {
  background-color: #fef3c7;  /* Pale amber — matches existing SWATCHES 'Pale amber' */
  border-radius: 4px;
  padding: 4px 8px;
  margin: -4px -8px 12px;    /* Bleed to column edges */
}
```

The `<h2>` in a Stale column gets `className={styles.staleHeading}` (in addition to or instead of `styles.heading`). The existing `.heading` padding/margin remains; `.staleHeading` is additive. The heading text: `⏰ Stale` (icon prefix inline in JSX string, not a separate element — keeps the DOM simple).

**Accessibility**: The `<section>` element already renders `aria-label={`Column: ${column.name}`}`. For the Stale column, extend this: `aria-label="Stale — cards here have not moved in 2 or more days"` (passed as a prop override or computed in `KanbanColumn` based on `column.name === 'Stale'`).

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| User drags card to Done | Card moves to Done (existing) + `color: '#d4edda'` set in cache | Card appears in Done with pale green background immediately (same render cycle) |
| User drags card out of Stale | Card moves to destination (existing optimistic) + PATCH sends `fromColumnId = staleColumnId` → server sets `stale_suppressed = true` | Card appears in destination column immediately; no special visual feedback on the suppression (it's a backend flag) |
| Board loads with stale cards | Server moves stale cards before response; frontend renders cards in Stale column | Stale column shows amber header + cards; no separate loading indicator for rule execution (included in board load time) |
| Board loads with warnings[] | Frontend parses field; nothing rendered | No user-visible feedback |

### Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| < 640px | Horizontal scroll (existing pattern); Stale column at same `min-width: 300px` as others |
| 640-1024px | Horizontal scroll (existing pattern) |
| > 1024px | All four columns visible side-by-side if viewport is wide enough |

### Accessibility Requirements

- [x] Keyboard navigation: dnd-kit's keyboard drag handles work on all columns including Stale; no change needed. Users can keyboard-drag cards into and out of Stale.
- [x] Screen reader: `<section aria-label="Stale — cards here have not moved in 2 or more days">` — communicates purpose beyond the column name.
- [x] Color contrast: Amber heading (`#fef3c7` background, dark text) — amber pale (#fef3c7) with `#1a202c` text = contrast ratio ~14:1 (WCAG AA requires 4.5:1 for normal text). Passes.
- [x] Color not sole indicator: Icon (⏰) + column name text "Stale" + custom empty state text — three non-color signals.
- [x] Pale green done color (`#d4edda` background, dark text): `#d4edda` with `#1a202c` text = contrast ratio ~12:1. Passes WCAG AA.
- [x] Focus indicators: `KanbanCard` focus behavior unchanged (inherits browser focus ring). No new interactive elements introduced.
- [x] Error messages accessible: Not applicable (warnings are silent).

---

## Implementation Guidelines

### For Developers

1. **Stale column CSS**: Add `.staleHeading` class to `KanbanColumn.module.css` with `background-color: #fef3c7; border-radius: 4px; padding: 4px 8px; margin-bottom: 12px`. In `KanbanColumn.tsx`, conditionally apply it: `className={column.name === 'Stale' ? `${styles.heading} ${styles.staleHeading}` : styles.heading}`. Heading text: `{column.name === 'Stale' ? `⏰ ${column.name}` : column.name}`.

2. **Stale column aria-label**: In `KanbanColumn.tsx`, the `<section>` aria-label: `aria-label={column.name === 'Stale' ? 'Stale — cards here have not moved in 2 or more days' : `Column: ${column.name}`}`.

3. **Stale column empty state**: In `KanbanColumn.tsx`, change empty-state JSX: `{visibleCards.length === 0 ? (<p className={styles.empty}>{column.name === 'Stale' ? 'No stale cards — nice work!' : 'No cards yet'}</p>) : ...}`.

4. **Optimistic color on Done move**: The card move mutation is in `BoardPage` or the hook that wraps `PATCH /cards/:id/move`. In the mutation's `onMutate` callback, after moving the card to the target column in the cache, additionally set `color: '#d4edda'` on the card object in the cache IF `toColumnId === doneColumnId`. The done column ID must be available in scope (it is returned in the board's `columns` array).

5. **Board type extension**: In `frontend/src/types/index.ts`, add to the board response type:
   ```typescript
   interface WorkflowWarning {
     code: 'WORKFLOW_ACTION_FAILED';
     message: string;
     details: Array<{ field: string; error: string }>;
   }
   // Extend the Board or BoardWithColumns type:
   warnings?: WorkflowWarning[];
   ```
   The `getBoard` endpoint response should accept this optional field without breaking existing consumers.

6. **Do NOT add `#d4edda` to `swatches.ts`**: The done-color is applied programmatically by the workflow rule, not user-selected. The existing SWATCHES palette (`#dcfce7` "Pale green") is for user-facing color picking and should remain unchanged to avoid conflating the auto-applied done color with a manually selectable swatch.

7. **Identifying the Done column client-side**: The board's `columns` array from `GET /boards/:boardId` includes all four columns. The Done column is identified by `column.name === 'Done'`. This is a safe heuristic given that column names are controlled by the seed and migration (not user-customizable in MVP). The card move mutation handler receives `toColumnId`; compare it against `columns.find(c => c.name === 'Done')?.id` to gate the optimistic color update.

8. **No changes to `KanbanCard` CSS for optimistic color**: The card's inline `style` already sets `backgroundColor: card.color`. When the TanStack cache is updated with `color: '#d4edda'`, the card re-renders immediately with the pale green background. No new CSS class is needed.

9. **Rollback is automatic**: The mutation's `onSettled` callback calls `invalidateQueries` on the board/cards query. If the server-side rule failed and `cards.color` was not updated, the refetched data will have the old color (or null). The card re-renders with the pre-move color. No additional code is required for rollback beyond the existing invalidation.

10. **Warnings field — no rendering**: In the page component that calls `getBoard`, simply destructure `warnings` from the response but do not render anything. Add a TypeScript type for `WorkflowWarning` so the field is type-safe. Ensure the absence of `warnings` (when the API returns the response without the field for success cases) does not cause a type error — use `warnings?: WorkflowWarning[]` (optional).

### Component Structure

```
KanbanColumn/
├── KanbanColumn.tsx          ← Add staleHeading class, stale aria-label, stale empty state
├── KanbanColumn.module.css   ← Add .staleHeading rule
└── KanbanColumn.test.tsx     ← Add tests: stale column renders amber heading, custom empty state, aria-label

KanbanCard/
├── KanbanCard.tsx            ← No changes required for workflow feature
└── KanbanCard.module.css     ← No changes required

frontend/src/types/index.ts   ← Add WorkflowWarning type; extend board response type

frontend/src/pages/BoardPage/ ← Extend card move mutation onMutate to set optimistic color
  (or wherever the useMoveCard mutation is defined)
```

### Recommended Libraries/Patterns

- No new libraries required. All decisions work within the existing component library, TanStack Query, and dnd-kit setup.
- TanStack Query `onMutate` / `onSettled` pattern (already used for card moves) handles both optimistic update and rollback without new infrastructure.
- CSS Module class composition (existing pattern) handles the stale column heading variant.

---

## Validation Checklist

- [x] Meets all user goals: Stale work surfaces immediately (amber column header), done work has a clear completion signal (pale green), stale suppression works via existing card move (no extra UI control needed).
- [x] Accessible per requirements: WCAG 2.1 AA — color not sole indicator for Stale column (icon + text + name); pale green passes contrast ratio; keyboard navigation unchanged; screen reader aria-label extended.
- [x] Consistent with existing patterns: CSS Module class composition; `column.name`-based conditional logic (same pattern as filterText conditional); TanStack optimistic update via `onMutate`; `ErrorBanner` not used for silent failures (consistent with spec).
- [x] Respects Guiding Principles and component architecture in systemPatterns.md: No new layers introduced; filter/state prop-drilling pattern respected; no `console.log` (warnings are silent, not logged to console).
- [x] Responsive across devices: Stale column follows same `min-width: 300px` and horizontal scroll behavior as all other columns.
- [x] Performance acceptable: Stale column CSS is one additional class; optimistic update is a cache mutation (in-memory); no new network requests from the frontend.
- [x] Implementation feasible: All decisions require only additions to existing components (`KanbanColumn.tsx`, `KanbanColumn.module.css`, board page mutation handler, `types/index.ts`). No new components required. No new dependencies.

---

## Next Steps

1. **Phase 1 (DB)**: Confirm `#d4edda` is the correct hex for the done-color rule. The task spec says `#d4edda`; the current SWATCHES palette has `#dcfce7` ("Pale green"). These are different. The workflow rule must use `#d4edda` exactly as specified; no swatch change is needed. Phase 1 developer: use `#d4edda` as the hardcoded color in `WorkflowService.executeRule2DoneColor`.

2. **Phase 4 (Frontend)**: Implement the three KanbanColumn changes (stale heading CSS + aria-label + empty state) as a single, focused diff. Then separately implement the optimistic color update in the card-move mutation handler. Run the existing `KanbanColumn.test.tsx` tests, extend them with stale-specific assertions, and write `frontend/e2e/workflow.spec.ts` per the test strategy.

3. **Build agent note on Done column detection**: The `columns` array from the board response is available in the board page component. Pass it (or the Done column ID specifically) into the mutation context so the `onMutate` callback can identify whether `toColumnId === doneColumnId`. Avoid hardcoding the column name in the mutation hook — derive it from the board data.
