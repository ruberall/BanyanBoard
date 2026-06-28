# UI/UX Decision: Activity Feed Panel

**Created**: 2026-06-18
**Status**: DECIDED
**Decision Type**: UI/UX

---

## User Context

### Target Users

- **Primary**: Dev Team Lead — monitors the board for progress visibility; glances at the feed during standups to see what moved and when, without having to ask teammates
- **Secondary**: Individual Developer — confirms their own card moves registered, quickly scans what teammates have been doing in the last hour

### User Goals

1. See recent card movement at a glance without leaving the board page
2. Know who moved what, from which column to which column, and roughly when
3. Understand the live-ness of the data (is the feed live? is it reconnecting?)

### Use Cases

| Use Case | User | Goal | Frequency |
|----------|------|------|-----------|
| Standup check | Dev Team Lead | Scan who moved what since yesterday | Daily |
| Confirming own action | Individual Developer | Verify a card move registered | After each drag |
| Monitoring remotely | Dev Team Lead | Watch team progress in real time during sprint | Several times/day |
| Diagnosing connectivity | Either | Understand why the feed stopped updating | Occasional |

### Constraints

- **Devices**: Desktop primary; tablet responsive (min 768 px). Mobile is not required for v1.
- **Accessibility**: WCAG 2.1 AA — keyboard navigation, screen reader labels, visible focus indicators, color not sole status indicator
- **Existing Patterns**: CSS Modules (no utility class framework); `border: 1px solid #e2e8f0` card borders; `#718096` muted text; `background: #fff` surface; `border-bottom: 1px solid #e5e7eb` panel separators; `font-size: 0.875rem` / `0.9rem` body text; `role="alert"` for error states (ErrorBanner pattern)
- **Board layout**: KanbanBoard uses `display: flex; gap: 16px; overflow-x: auto` — columns flow horizontally and can exceed viewport width. Any feed placement must not compress column width or break horizontal scroll.
- **Feed data**: last 20 events, most recent first on load; new events prepended at top on SSE push

---

## User Flow

### Flow Diagram

```
[User opens board page]
        |
        v
[Board loads (columns + cards)]
        |
        v
[Activity feed mounts → GET /activity → renders last 20 entries or empty state]
        |
        v
[SSE stream opens → feed auto-updates]
        |
     ┌──┴──────────────────────────────────────────┐
     |                                             |
[New event arrives]                    [SSE disconnects]
     |                                             |
     v                                             v
[Entry prepended at top]            ["Reconnecting..." indicator shown]
[If user is reading history:         [Auto-reconnect fires in background]
  auto-scroll paused]                             |
     |                                [SSE reconnects]
     v                                             |
[User scrolls up to read history] → [Indicator dismissed, feed resumes]
     |
     v
[User scrolls to top] → [Auto-scroll resumes for new entries]
```

### Flow Description

1. **Entry**: User navigates to `/boards/:boardId` — board page always mounts the feed panel
2. **Initial load**: Feed panel fetches recent events via REST; shows LoadingSpinner while fetching, then renders up to 20 entries newest-first, or the empty state
3. **Live updates**: SSE stream opens after initial load; incoming events prepend entries at the top
4. **Auto-scroll**: By default the feed scrolls to show the newest entry (top). If the user scrolls down into history, auto-scroll pauses (user is reading). When the user scrolls back to the top, auto-scroll resumes.
5. **Reconnect**: If SSE drops, a non-intrusive inline indicator replaces (or appears above) the entry list. Background reconnect fires automatically; on success the indicator disappears.
6. **Exit**: User navigates away — SSE stream closes, feed unmounts cleanly.

### Error States

| Error | Cause | User Recovery |
|-------|-------|---------------|
| Empty state | No events on this board yet | None required — informational message shown |
| "Reconnecting…" | SSE connection dropped | Automatic — user waits; no manual action needed |
| Initial fetch failure | REST call failed (network/server error) | ErrorBanner with error message (reuses existing ErrorBanner component) |

---

## Options Explored

### Option 1: Fixed Right Sidebar (always visible)

- **Approach**: A fixed-width right sidebar (~240 px) sits alongside the board area. The board's horizontal scroll area takes the remaining width. The sidebar is always visible — no toggle needed.
- **Wireframe/Layout**:
  ```
  ┌──────────────────────────────────────────────┐
  │  AppHeader                                   │
  ├──────────────────────────────────┬───────────┤
  │  Board Name                      │ Activity  │
  ├──────────────────────────────────┤  Feed     │
  │  [To Do]  [In Progress]  [Done]  │ ─────── │
  │   card      card          card   │ entry 1  │
  │   card                    card   │ entry 2  │
  │                                  │ entry 3  │
  │  (horizontal scroll →)           │  ...     │
  └──────────────────────────────────┴───────────┘
  ```
- **User Flow**: User opens board → feed immediately visible to the right → no interaction needed to see it
- **Key UI Elements**: Fixed-width aside column; scrollable entry list inside it; sticky "Activity" heading; reconnect indicator at top of list
- **Pros**:
  - Always in peripheral vision — glanceable without any interaction
  - No toggle state to manage (simpler implementation and a11y)
  - Feed never overlays the kanban columns (no content hidden)
  - Consistent position across all boards — zero learning curve
- **Cons**:
  - Permanently consumes ~240 px of horizontal real estate on every board, even when the user doesn't care about the feed
  - On smaller desktops or when a board has many columns, the kanban columns may feel cramped
  - On tablet (768–1024 px) the columns become very narrow
- **Usability**: High — zero interaction required to access feed
- **Accessibility**: High — feed is always in the DOM, screen readers can reach it; no toggle focus trap
- **Implementation Complexity**: Low — `display: grid; grid-template-columns: 1fr 240px` on the page

---

### Option 2: Collapsible Right Sidebar (default open)

- **Approach**: Same right sidebar position, but with a toggle button that collapses the panel to a narrow icon strip (~32 px) or hides it entirely. Defaults to open on first visit; remembers state via `localStorage`.
- **Wireframe/Layout** (expanded):
  ```
  ┌──────────────────────────────────────────────┐
  │  AppHeader                                   │
  ├──────────────────────────────────┬───────────┤
  │  Board Name              [‹ hide]│ Activity  │
  ├──────────────────────────────────┤ ─────── │
  │  [To Do]  [In Progress]  [Done]  │ entry 1  │
  │   card      card          card   │ entry 2  │
  │   card                           │  ...     │
  └──────────────────────────────────┴───────────┘
  ```
  (collapsed):
  ```
  ┌───────────────────────────────────────┬──┐
  │  Board Name                   [› show]│  │
  ├───────────────────────────────────────┤  │
  │  [To Do]  [In Progress]  [Done]       │  │
  │                                       │  │
  └───────────────────────────────────────┴──┘
  ```
- **User Flow**: User opens board → feed visible by default → can collapse if they want full kanban width → state persists
- **Key UI Elements**: Toggle button (chevron icon + label); `localStorage` persistence; aside element with transition; reconnect indicator with unread badge on collapse
- **Pros**:
  - Best of both worlds: feed available by default, but power users can recover column width
  - `localStorage` persistence means the choice is remembered across page loads
  - When collapsed, a small notification badge or dot can signal new activity without showing the feed
- **Cons**:
  - More complex state management (open/closed + unread badge)
  - Toggle button adds a focusable element that must be keyboard-accessible
  - When collapsed, a badge is the only indicator of new activity — users who miss it lose awareness
  - Animation/transition adds implementation effort; must be `prefers-reduced-motion` aware
- **Usability**: High — flexible, respects user preference
- **Accessibility**: Medium-High — toggle requires careful ARIA (`aria-expanded`, `aria-controls`); collapsed state means feed content is removed from the reading order (must use `aria-hidden` or conditional render)
- **Implementation Complexity**: Medium — localStorage hook, controlled open state, ARIA wiring, reduced-motion CSS

---

### Option 3: Bottom Drawer Panel

- **Approach**: The feed lives in a horizontal panel docked to the bottom of the board page, below the kanban columns. The panel has a fixed height (~200 px) with the entry list scrolling horizontally inside it (entries flow left-to-right as a horizontal feed), or entries stack vertically in a scrollable list.
- **Wireframe/Layout**:
  ```
  ┌──────────────────────────────────────────────┐
  │  AppHeader                                   │
  ├──────────────────────────────────────────────┤
  │  Board Name                                  │
  ├──────────────────────────────────────────────┤
  │  [To Do]      [In Progress]      [Done]       │
  │   card          card              card        │
  │   card                            card        │
  ├──────────────────────────────────────────────┤
  │  Activity ─────────────────────────────────  │
  │  [entry 1]  [entry 2]  [entry 3]  [entry 4]  │
  └──────────────────────────────────────────────┘
  ```
- **User Flow**: User scrolls down past the kanban board to see the feed, or the panel is always visible if the board is short enough
- **Key UI Elements**: Horizontal scrolling feed OR fixed-height bottom panel with vertical list; entries as compact chips or rows
- **Pros**:
  - Does not compress kanban column width at all — columns have full horizontal width
  - Familiar pattern for activity logs (similar to browser devtools console)
- **Cons**:
  - **Critical usability problem**: requires user to scroll down to see the feed — this breaks the "glanceable" requirement. The entire point is peripheral awareness during standup; a hidden-until-scrolled feed fails this goal.
  - Horizontal scrolling entry chips are harder to read for multi-word descriptions
  - Viewport height pressure: on short viewports or when many cards exist, the bottom panel may be off-screen entirely
  - Tablets lose even more vertical space
- **Usability**: Low — does not support glanceable awareness; requires scrolling to view
- **Accessibility**: Medium — no toggle complexity, but temporal content at the bottom gets low priority in screen reader linear flow
- **Implementation Complexity**: Low — CSS only, no state needed; but usability failure makes complexity moot

---

### Option 4: Floating Overlay Panel (slide-in from right, non-persistent)

- **Approach**: The feed is hidden by default. A floating "Activity" button appears as an icon in the bottom-right corner (or top-right corner of the board area). Clicking it opens an overlay panel that slides in from the right edge, floating over the kanban columns without displacing them.
- **Wireframe/Layout** (open):
  ```
  ┌──────────────────────────────────────────────┐
  │  AppHeader                                   │
  ├──────────────────────────────────────────────┤
  │  Board Name                                  │
  │  [To Do]  [In Progress]  [Done] ┌──────────┐ │
  │   card      card          card  │ Activity │ │
  │   card                    card  │ ──────── │ │
  │                                 │ entry 1  │ │
  │                                 │ entry 2  │ │
  │                           [⊕]   │  ...     │ │
  │                                 └──────────┘ │
  └──────────────────────────────────────────────┘
  ```
- **User Flow**: User clicks the Activity icon → panel slides in over the board → user reads feed → clicks X or presses Esc to close
- **Key UI Elements**: FAB-style trigger button; overlay panel (z-index above board, semi-transparent background optional); close button; slide-in animation
- **Pros**:
  - Zero impact on kanban column width — columns have 100% width always
  - Feed is explicitly opt-in — users who never care about activity lose nothing
- **Cons**:
  - **Critical usability failure**: "glanceable" requirement is fundamentally broken — the feed is hidden until explicitly opened. A Team Lead cannot scan activity while dragging cards.
  - Overlay partially obscures columns — contradicts the "must not crowd kanban columns" constraint
  - More complex: focus trapping in modal-like panel, Esc key handling, FAB positioning
  - Notification badge is needed to signal new activity, adding complexity
  - AC-ENTRY-1 says feed must be "visible on every board page" — this requires explicit open; ambiguous compliance
- **Usability**: Low for glanceable use cases; acceptable only if team has zero standup use case
- **Accessibility**: Medium — requires focus trap management inside overlay, complex ARIA
- **Implementation Complexity**: High — animation, overlay, focus management, z-index layering with drag-and-drop

---

## Evaluation Matrix

| Criteria | Option 1: Fixed Sidebar | Option 2: Collapsible Sidebar | Option 3: Bottom Panel | Option 4: Floating Overlay |
|----------|------------------------|------------------------------|----------------------|--------------------------|
| Usability (glanceability) | High | High | Low | Low |
| Accessibility | High | Medium-High | Medium | Medium |
| Consistency with existing patterns | High | High | Medium | Low |
| Responsiveness (tablet) | Medium | High | Medium | Medium |
| Performance | High | High | High | Medium |
| Implementation Complexity | Low | Medium | Low | High |
| Meets AC-ENTRY-1 (always visible) | Yes | Yes (default open) | Marginal | No |

---

## Decision

**Chosen**: Option 2 — Collapsible Right Sidebar (default open)

### Rationale

The primary use case is **glanceable awareness during standup** — the feed must be visible by default on every board page without requiring any user action. This immediately eliminates Options 3 (scroll required) and 4 (explicit open required).

Between Options 1 (always-on) and 2 (collapsible), Option 2 is chosen because:

1. **Board width pressure is a real concern.** BanyanBoard targets small teams with 2–5 columns. On a 1280 px desktop, 3 columns each at ~280 px plus gaps already occupy ~900 px. A permanent 240 px sidebar leaves only ~380 px for kanban columns — too tight on smaller monitors. The collapsible design gives users relief when they want full kanban focus.

2. **Default-open satisfies the "always visible" requirement.** AC-ENTRY-1 says the feed must be visible on every board page — this is satisfied by defaulting to open. Users who collapse it are making an explicit, remembered choice.

3. **`localStorage` persistence means the sidebar only needs to be opened once.** Power users who want full-width boards will collapse once and never see the sidebar again. Users who want the feed will never need to think about it.

4. **Reconnect badge on collapse maintains awareness.** When collapsed, a small dot on the toggle button signals "new activity" — this prevents the worst-case where a user misses that the feed exists.

5. **Complexity is manageable.** The implementation requires one `useState` (or `useLocalStorage`) hook, one ARIA toggle pattern, and a CSS transition. These are standard patterns in this codebase.

### Trade-offs Accepted

- **ARIA toggle complexity over no toggle**: The collapsible requires `aria-expanded` / `aria-controls` wiring on the toggle button. Mitigation: follow the established ARIA authoring practices exactly; add tests.
- **`prefers-reduced-motion` required**: The slide animation must respect `prefers-reduced-motion: reduce`. Mitigation: use `@media (prefers-reduced-motion: reduce) { transition: none }` in the CSS Module.
- **Unread badge adds state**: When collapsed, new events increment an unread counter that clears on open. Mitigation: keep badge logic inside the `useActivityFeed` hook alongside SSE state.

---

## Design Specifications

### Layout

**Desktop (> 1024 px), feed open:**
```
┌──────────────────────────────────────────────────────────────┐
│  AppHeader (height: 48px, border-bottom: 1px solid #e5e7eb)  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  BoardPage (.page: padding: 24px)                            │
│  ┌───────────────────────────────────────────┐ ┌──────────┐  │
│  │  Board Name (h1, font-size: 1.5rem)       │ │ Activity │  │
│  ├───────────────────────────────────────────┤ │  panel   │  │
│  │  .boardArea (flex: 1, overflow-x: auto)   │ │  240px   │  │
│  │  [To Do]  [In Progress]  [Done]           │ │          │  │
│  │                                           │ │          │  │
│  └───────────────────────────────────────────┘ └──────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Desktop, feed collapsed:**
```
┌──────────────────────────────────────────────────────────────┐
│  AppHeader                                                   │
├──────────────────────────────────────────────────────────────┤
│  Board Name                                          [›] (●) │
├──────────────────────────────────────────────────────────────┤
│  [To Do]    [In Progress]    [Done]       (full width board) │
└──────────────────────────────────────────────────────────────┘
```
where `(●)` is the unread badge dot (only shown when there are unseen events).

**Tablet (768–1024 px), feed open:**
```
┌────────────────────────────────────────────┐
│  AppHeader                                 │
├────────────────────────────────────────────┤
│  Board Name                        [‹ hide]│
├─────────────────────────────┬──────────────┤
│  Board area (overflow-x)    │  Activity    │
│  [To Do] [In Progress]      │  200px       │
│   card     card             │  (narrower)  │
└─────────────────────────────┴──────────────┘
```
On tablet the sidebar is 200 px (reduced from 240 px) and defaults to collapsed when viewport < 900 px on first visit (separate `localStorage` key per breakpoint is not needed — just auto-collapse when `window.innerWidth < 900` on mount if no stored preference exists).

### Key Components

| Component | Purpose | Behavior |
|-----------|---------|----------|
| `ActivityFeedPanel` | Outer wrapper: toggle button + collapsible aside | Manages `isOpen` state (default true), `localStorage` sync, toggle button with ARIA, unread badge count |
| `ActivityFeedList` | Scrollable list of entries + reconnect indicator + empty state | Manages `autoScroll` (pause on user scroll, resume when scrolled to top), `role="log"` for live region |
| `ActivityEntry` | Single event row | Renders actor, action string, relative timestamp; truncates long card titles |
| `ReconnectIndicator` | SSE status row at top of list | Shown when `status === 'reconnecting'`; `role="status"` |
| `useActivityFeed` | Hook encapsulating SSE connection, event list state, status | Returns `{ entries, status, unreadCount, clearUnread }` |

### Activity Entry Layout

Each entry is a two-line compact card:

```
┌────────────────────────────────────────────┐
│  👤 Alice                       2 min ago  │
│  moved "Fix login bug" from                │
│  In Progress → Done                        │
└────────────────────────────────────────────┘
```

Actual text (no emoji in production):
- **Line 1**: `{actorName}` (font-weight: 600, font-size: 0.875rem) + timestamp (float right, font-size: 0.75rem, color: #718096)
- **Line 2–3**: action description — "moved {card title} from {source} → {dest}" (font-size: 0.875rem)
- Card title truncated at ~30 chars with ellipsis (`text-overflow: ellipsis`) in the action string; full title available via `title` attribute on the truncating span

Entry border: `border-bottom: 1px solid #e2e8f0` (matches card borders in KanbanCard).
Entry padding: `padding: 10px 12px`.
Hover: `background: #f7fafc` (subtle, no border change).
No interactive elements inside an entry (v1).

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| SSE event received | New entry prepended to top of list | Entry slides in (CSS `@keyframes` fade+translate, skipped if `prefers-reduced-motion`) |
| User scrolls down in feed | Auto-scroll pauses | No visual indicator needed — natural scroll behavior |
| User scrolls back to top (within 2 px) | Auto-scroll resumes | No visual indicator |
| Toggle button clicked (open → close) | Sidebar collapses | Width transitions to 0 (or panel slides out); `aria-expanded="false"` on button |
| Toggle button clicked (closed → open) | Sidebar expands | Width transitions to 240 px; unread count cleared; `aria-expanded="true"` |
| SSE drops | Status changes to `reconnecting` | ReconnectIndicator row appears at top of list with animated dots |
| SSE reconnects | Status changes to `connected` | ReconnectIndicator row disappears |

### Reconnect Indicator Layout

```
┌─────────────────────────────────────────────┐
│  ⟳  Reconnecting...                         │
└─────────────────────────────────────────────┘
```

- `role="status"` (polite live region — screen readers announce without interrupting)
- Animated spinner icon (CSS-only rotation, stops when `prefers-reduced-motion: reduce`)
- Background: `#fffbeb` (amber-50 equivalent), border-bottom: `1px solid #fcd34d`
- Text: `font-size: 0.8rem; color: #92400e`
- Positioned sticky at the top of the scrollable list (remains visible even when user scrolls history)

### Empty State Layout

```
┌─────────────────────────────────────────────┐
│                                             │
│     No activity yet.                        │
│     Card moves will appear here.            │
│                                             │
└─────────────────────────────────────────────┘
```

- `aria-label` on the container: "Activity feed — no events yet"
- Text: `color: #718096; font-size: 0.875rem; text-align: center; padding: 24px 12px`
- No icon or illustration (matches existing `KanbanBoard` empty state pattern which uses plain text)

### Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| < 768 px (mobile) | Not supported for v1 — sidebar hidden entirely (`display: none`); board takes full width |
| 768–899 px (small tablet) | Sidebar auto-collapses on first visit; user can still open it (200 px wide) |
| 900–1024 px (large tablet) | Sidebar 200 px, default open |
| > 1024 px (desktop) | Sidebar 240 px, default open |

### Accessibility Requirements

- [x] Keyboard navigation: toggle button is a standard `<button>` — focusable by Tab, activatable by Space/Enter
- [x] Screen reader: `<aside aria-label="Activity feed">` for the panel; toggle button has `aria-expanded` + `aria-controls` pointing to the aside's `id`
- [x] Live region: `<ul role="log" aria-live="polite" aria-label="Activity events">` — new entries announced politely without interrupting current speech
- [x] Color contrast: all text meets WCAG AA (dark text on light backgrounds verified against existing palette)
- [x] Color not sole indicator: reconnect indicator uses both color AND text ("Reconnecting...") AND an icon
- [x] Focus indicators: inherits existing browser default + the project's existing `outline` behavior (no CSS resets that suppress focus ring)
- [x] Reduced motion: `@media (prefers-reduced-motion: reduce)` disables entry fade-in animation and sidebar transition

---

## Implementation Guidelines

### For Developers

1. **Page layout change in `BoardPage.tsx`**: Wrap the existing `<DndContext>` block and new `<ActivityFeedPanel>` in a layout div with `display: flex; gap: 16px; align-items: flex-start`. The DndContext / KanbanBoard gets `flex: 1; min-width: 0` to allow shrink. `ActivityFeedPanel` is `width: 240px; flex-shrink: 0`.

2. **`useActivityFeed` hook** (`frontend/src/hooks/useActivityFeed.ts`): Encapsulates the SSE `EventSource`, event list (`ActivityEvent[]` state), connection status (`'connecting' | 'connected' | 'reconnecting' | 'error'`), and unread count. Returns `{ entries, status, unreadCount, clearUnread }`. Uses `useEffect` cleanup to close the EventSource on unmount. Reconnect: on `onerror`, set status to `'reconnecting'`, wait a back-off interval (start 2 s, cap 30 s), then create a new `EventSource`.

3. **`ActivityEvent` type** — add to `frontend/src/types/index.ts`:
   ```typescript
   export interface ActivityEvent {
     id: string
     boardId: string
     actorName: string
     actionType: 'card.moved'
     cardTitle: string
     fromColumn: string
     toColumn: string
     createdAt: string  // ISO 8601
   }
   ```

4. **Auto-scroll logic** in `ActivityFeedList`: Attach a `ref` to the scrollable `<ul>`. In a `useEffect` that fires when `entries` changes, check if `isUserScrolling` (ref flag set on `onScroll`). If not scrolling manually and `scrollTop` is within 2 px of 0 (list is reversed / newest-first), keep it at top. When `onScroll` fires and `scrollTop > 2`, set `isUserScrolling = true`. When `scrollTop <= 2`, set `isUserScrolling = false`.

5. **CSS Module collapsible pattern**: Use a CSS variable approach for the width transition:
   ```css
   .sidebar {
     width: 240px;
     transition: width 200ms ease;
     overflow: hidden;
   }
   .sidebar[data-collapsed='true'] {
     width: 0;
   }
   @media (prefers-reduced-motion: reduce) {
     .sidebar { transition: none; }
   }
   ```
   Avoid `display: none` for the transition to work; use `visibility: hidden` inside when `width: 0` to remove from tab order.

6. **`localStorage` key**: `banyanboard.activity-feed.open` — store as `'true'` / `'false'` string. Read on mount in `ActivityFeedPanel` with fallback to `'true'` (default open).

7. **Relative timestamp**: Use a simple utility function `formatRelativeTime(isoString: string): string` (e.g., "just now", "2 min ago", "1 hr ago") rather than pulling in `date-fns` for a single use case. Re-render on an interval using `setInterval` in `ActivityFeedList` so timestamps stay fresh.

### Component Structure

```
frontend/src/components/activity/
├── ActivityFeedPanel/
│   ├── ActivityFeedPanel.tsx       Sidebar wrapper, toggle button, localStorage
│   ├── ActivityFeedPanel.module.css
│   └── ActivityFeedPanel.test.tsx
├── ActivityFeedList/
│   ├── ActivityFeedList.tsx        Scrollable ul, auto-scroll, reconnect indicator, empty state
│   ├── ActivityFeedList.module.css
│   └── ActivityFeedList.test.tsx
├── ActivityEntry/
│   ├── ActivityEntry.tsx           Single event row rendering
│   ├── ActivityEntry.module.css
│   └── ActivityEntry.test.tsx
└── ReconnectIndicator/
    ├── ReconnectIndicator.tsx
    └── ReconnectIndicator.module.css

frontend/src/hooks/
└── useActivityFeed.ts              SSE hook, event state, status, unread count
```

### Recommended Libraries/Patterns

- **No new libraries needed.** `EventSource` is native; relative time formatting is a ~15-line utility; CSS Modules handle the animation. Keeping zero new dependencies aligns with the project's lean footprint.
- **`role="log"`** is the correct ARIA role for a live feed of sequential events — it implies `aria-live="polite"` and `aria-atomic="false"` semantics (each new item is announced as it appears, not the whole list re-read).

---

## Validation Checklist

- [x] Meets all user goals (glanceable, actor/action/timestamp visible, live)
- [x] Accessible per WCAG 2.1 AA requirements (live region, toggle ARIA, color contrast, keyboard)
- [x] Consistent with existing patterns (CSS Modules, `#e2e8f0` borders, `#718096` muted text, plain-text empty states, `role="alert"` / `role="status"` for dynamic messages)
- [x] Respects Guiding Principles and component architecture in systemPatterns.md (3-layer frontend architecture: types → hooks/api → components)
- [x] Responsive across devices (desktop full, tablet reduced width, mobile hidden)
- [x] Performance acceptable (SSE is lightweight; 20 entries is trivial DOM; no third-party library)
- [x] Implementation feasible within existing React 19 + CSS Modules stack

---

## Next Steps

1. Add `ActivityEvent` type to `frontend/src/types/index.ts`
2. Implement `useActivityFeed` hook with SSE connection and mock data for local dev
3. Build `ActivityEntry` and `ReconnectIndicator` leaf components first (easiest to unit test)
4. Build `ActivityFeedList` with auto-scroll logic
5. Build `ActivityFeedPanel` with localStorage toggle
6. Update `BoardPage.tsx` layout to include `ActivityFeedPanel` alongside the DndContext block
7. Wire to real SSE endpoint once backend is implemented
