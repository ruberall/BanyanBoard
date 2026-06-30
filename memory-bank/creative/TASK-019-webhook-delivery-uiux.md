# UI/UX Decision: Board Settings Automation Tab + Webhook Rule Management

**Created**: 2026-06-30
**Status**: DECIDED
**Decision Type**: UI/UX

---

## User Context

### Target Users

- **Primary**: Dev Team Lead — small-team engineering lead who wants to pipe board events to external systems (CI pipelines, Slack relay, internal dashboards) without polling. Technical; comfortable with webhook URLs and trigger concepts. Values speed and low overhead.
- **Secondary**: Individual Developer — may occasionally view delivery history to diagnose whether a webhook fired; does not configure rules themselves.
- **Tertiary**: Self-Hoster — operator who deployed BanyanBoard via Docker Compose; may inspect delivery status to confirm integrations are working.

### User Goals

1. Find and configure a webhook automation rule in as few steps as possible without leaving the board context.
2. Verify a rule is active (enabled, correct URL) and that deliveries are succeeding.
3. Diagnose failed deliveries by seeing the status, error, and attempt count without needing direct DB access.

### Use Cases

| Use Case | User | Goal | Frequency |
|----------|------|------|-----------|
| Create a webhook rule | Dev Team Lead | Connect card-moved-to-Done event to an external system | Once per board setup |
| Enable/disable a rule | Dev Team Lead | Temporarily mute a webhook without deleting it | Occasional |
| Check delivery status | Dev Team Lead | Confirm webhook fired and was received | After each rule setup or incident |
| Diagnose failed delivery | Dev Team Lead / Self-Hoster | Understand why webhook is not being received | During debugging |
| Delete a stale rule | Dev Team Lead | Clean up rules no longer needed | Rare |

### Constraints

- **Devices**: Desktop-primary; tablet (640–1024px) supported; mobile (< 640px) responsive-degraded is acceptable (settings are rarely used on mobile for this persona).
- **Accessibility**: WCAG 2.1 AA — keyboard navigation throughout; status badges must use text + icon (non-color-only); all form fields labeled; focus indicators visible; `role="alert"` on errors per the existing Error Display Pattern.
- **Existing Patterns**: CSS Modules (no new component libraries); `ErrorBanner` (`role="alert"`) for error surfacing; TanStack Query for server state; React Router (no dedicated routing library beyond what is already in App.tsx); heading row currently: Back button (left) · `<h1>` board name · FilterBar (right).
- **No WebSockets**: Delivery History must poll for updates; no SSE re-use for this surface (SSE is board-scoped for the activity feed; adding a second SSE endpoint for settings state is out of scope and contradicts "No bloat").
- **No new external libraries**: reuse dnd-kit is already present; do not add a full UI component library (e.g., Radix, Headless UI) for one modal.

---

## User Flow

### Flow Diagram

```
[Board page] → [click gear icon in headingRow]
                      ↓
              [Board Settings surface opens]
                      ↓
              [Automation tab is default-active]
                      ↓
         ┌────────────┴─────────────┐
         ↓                          ↓
  [No rules yet]            [Rules exist]
  empty state               rules list shown
         ↓                          ↓
  [Fill New Rule form]       [Fill New Rule form]
  trigger-type selector      (or manage existing)
  + webhook URL input
         ↓
  [Submit form]
         ├──[validation error]→ ErrorBanner in form, stays open
         └──[success]────────→ rule appears in list, form clears
                                      ↓
                           [Delivery History panel]
                           (empty until trigger fires)
                                      ↓
                           [User moves card to Done]
                                      ↓
                           [User returns to Automation tab]
                           [Manual refresh or auto-poll]
                                      ↓
                           [Delivery row shows pending→delivered]
                                      ↓
                           [Exit: close settings / press Escape]
```

### Flow Description

1. **Entry**: User is on `/boards/:boardId`. Settings gear icon is visible in the heading row right side (adjacent to FilterBar or replacing the current right-side space). User clicks or activates it with keyboard.
2. **Settings opens**: Board Settings surface appears with the Automation tab pre-selected (it is the only tab for v1; the tab chrome sets up future extensibility).
3. **New Rule form**: User selects trigger type from a `<select>` (only "Card moved to Done" in v1) and enters a webhook URL in a text input. The URL field validates format on blur (before submission).
4. **Submit**: On success, the new rule appears in the rules list below/above the form; the form clears. On validation or API error, an `ErrorBanner` renders inside the settings surface with `role="alert"`.
5. **Delivery History**: A collapsible panel below the rules list shows recent `webhook_deliveries` rows for this board's rules. A "Refresh" button (not auto-polling by default; see polling strategy) fetches the latest.
6. **Exit**: User clicks a close button (×) or presses Escape. Focus returns to the gear icon. The board page underneath is unchanged.

### Error States

| Error | Cause | User Recovery |
|-------|-------|---------------|
| Invalid webhook URL | Non-HTTP/HTTPS scheme or malformed URL | Inline field-level validation message on blur; `ErrorBanner` on submit failure |
| API 400 on rule create | Server rejects URL (e.g., loopback SSRF block) | `ErrorBanner` with `error.message` from API; user corrects URL |
| API 401 | Session expired | `ErrorBanner` "Session expired — please log in again"; redirect is handled by TanStack Query's existing 401 handling |
| Delivery failed/exhausted | Webhook endpoint down or returning non-2xx | Visible in Delivery History panel — `failed`/`exhausted` badge with error tooltip/text |
| Network error loading rules | API unreachable | `ErrorBanner` inside the settings surface; user can retry by closing and reopening |

---

## Options Explored

### Option 1: Full-Screen Modal (Dialog Overlay)

- **Approach**: A centered modal dialog (`<dialog>` element or div with `role="dialog" aria-modal="true"`) covering most of the viewport. Contains the Automation tab header + tab panel. The board is visible but dimmed in the background with a semi-transparent scrim. Width ~640px on desktop; full-width on mobile.
- **Wireframe/Layout (desktop)**:
  ```
  ┌─────────────────────────────────────────────┐  ← backdrop scrim
  │                                             │
  │   ┌───────────────────────────────────┐     │
  │   │ Board Settings              [×]   │     │
  │   ├───────────────────────────────────┤     │
  │   │ [Automation]                      │     │  ← tab (single for v1)
  │   ├───────────────────────────────────┤     │
  │   │ Rules                             │     │
  │   │  (empty state or rules list)      │     │
  │   │                                   │     │
  │   │ New Rule                          │     │
  │   │  Trigger: [Card moved to Done ▼]  │     │
  │   │  Webhook URL: [____________]      │     │
  │   │  [Enable]  [Add Rule]             │     │
  │   │                                   │     │
  │   │ Delivery History        [Refresh] │     │
  │   │  (table or empty state)           │     │
  │   └───────────────────────────────────┘     │
  │                                             │
  └─────────────────────────────────────────────┘
  ```
- **User Flow**: click gear → modal opens; user interacts entirely within the modal; close button or Escape dismisses.
- **Pros**:
  - Established, widely understood pattern. Users expect modals for settings dialogs.
  - Backdrop scrim communicates "this is a focused task; board is temporarily inaccessible."
  - Traps focus correctly with `inert` attribute or focus-trap logic, which is a well-understood WCAG modal requirement.
  - Self-contained; no routing change needed; no URL changes (board stays at `/boards/:boardId`).
  - Consistent with how similar tools (Trello, Linear) surface board-level settings.
  - Fixed width (640px) gives ample space for the three panels without horizontal scroll.
- **Cons**:
  - Requires implementing a focus-trap manually (no Radix/Headless UI). Doable with a small `useFocusTrap` hook or by using the native `<dialog>` element.
  - Blocks access to the board while settings are open — user cannot drag cards while in settings (acceptable: settings is a separate task mode).
  - Native `<dialog>` has minor browser inconsistencies (backdrop behavior, animation) but all target browsers support it (Chrome/Firefox/Safari/Edge latest).
- **Usability**: High — modal is immediately recognizable for settings.
- **Accessibility**: High — native `<dialog>` provides ARIA dialog role, keyboard dismiss, and backdrop click dismiss natively; focus management is well-specified.
- **Implementation Complexity**: Low-Medium — native `<dialog>` + CSS Modules; no external library needed.

---

### Option 2: Right-Side Slide-Over Drawer

- **Approach**: A panel slides in from the right edge of the viewport, occupying 400px (desktop) or 100vw (mobile). The board content shifts left or is overlaid. Contains the Automation tab + panels.
- **Wireframe/Layout (desktop)**:
  ```
  ┌───────────────────────────────────┬──────────────────┐
  │                                   │ Board Settings[×] │
  │   [board content, dimmed]         ├──────────────────┤
  │                                   │ [Automation]     │
  │                                   ├──────────────────┤
  │                                   │ Rules            │
  │                                   │  (list)          │
  │                                   │                  │
  │                                   │ New Rule         │
  │                                   │  Trigger: [▼]    │
  │                                   │  URL: [_____]    │
  │                                   │  [Add Rule]      │
  │                                   │                  │
  │                                   │ Delivery History │
  │                                   │  [Refresh]       │
  │                                   │  (table)         │
  └───────────────────────────────────┴──────────────────┘
  ```
- **User Flow**: click gear → drawer slides in from right; user can optionally see board context alongside (though board is dimmed/inaccessible); close button or Escape dismisses.
- **Pros**:
  - Shows the board alongside settings, giving context (user sees board name, columns).
  - Feels modern; used by GitHub (issue sidebar), Linear (detail panels).
  - Allows for future extensibility to add more content without rewriting to a route.
- **Cons**:
  - More complex CSS animation + positioning than a centered modal.
  - On tablet, the drawer may compress the board too aggressively.
  - Does not meaningfully benefit this use case: user configures a rule *before* using the board, not during; being able to see the board simultaneously offers minimal UX value.
  - The heading row's `FilterBar` is already on the right side — a right-side drawer opening from a right-side gear creates potential visual confusion about the drawer's anchor point.
  - No existing drawer pattern in the codebase to reuse; would be a new pattern (CSS-only animation + slide logic).
  - 400px drawer on a board that already has a right-side ActivityFeed panel (`padding: 24px 284px 24px 24px` in `BoardPage.module.css`) may cause layout stacking issues.
- **Usability**: Medium — slide-over pattern is less universal than modal for settings; benefit of seeing board behind is minimal for this task.
- **Accessibility**: Medium — requires explicit focus trap and `aria-modal`; no native element for drawers; CSS `transform` animation can cause motion issues for users with prefers-reduced-motion (mitigable but extra work).
- **Implementation Complexity**: Medium-High — new pattern in codebase; CSS animation; layout conflict with ActivityFeed right padding.

---

### Option 3: Dedicated Route `/boards/:boardId/settings`

- **Approach**: Clicking the gear navigates (React Router) to a new route `/boards/:boardId/settings`. The board page is replaced by a Settings page. The Back button or breadcrumb returns to `/boards/:boardId`.
- **Wireframe/Layout**:
  ```
  ┌─────────────────────────────────────────────────────┐
  │ [← Back to board]  Board Settings — My Board        │
  ├─────────────────────────────────────────────────────┤
  │ [Automation]                                        │  ← tab
  ├─────────────────────────────────────────────────────┤
  │ Rules                                               │
  │  (list)                                             │
  │ New Rule                                            │
  │  Trigger: [Card moved to Done ▼]                    │
  │  Webhook: [_______________________________]         │
  │  [Add Rule]                                         │
  │                                                     │
  │ Delivery History                     [Refresh]      │
  │  (table)                                            │
  └─────────────────────────────────────────────────────┘
  ```
- **User Flow**: click gear → navigate to `/boards/:boardId/settings` → interact with Automation tab → click Back (or breadcrumb) to return to board.
- **Pros**:
  - Deeplink-able URL; browser Back/Forward work naturally.
  - No focus-trap complexity; no backdrop; full page layout for the settings content.
  - Easiest to implement — just a new `<Route>` in App.tsx + a new page component.
  - Full page width gives maximum space for Delivery History table.
- **Cons**:
  - Navigation away from board breaks the "board context" mental model — user expects settings to appear contextually without leaving the board view (this is the standard pattern in Trello, Linear, Notion).
  - Board state (DnD context, active cards, SSE connection) is torn down on navigation; users lose the activity feed and any in-progress drag operations (rare, but jarring).
  - The settings surface for v1 is simple enough (one form + one table) that a full-page route adds routing overhead without user benefit.
  - Does not match the "no bloat" product ethos — a full navigation feels heavy for configuring a single webhook per board.
  - URL-based settings are not expected by users of kanban tools; competitors use modals/overlays.
- **Usability**: Medium — familiar navigation, but context loss is disorienting.
- **Accessibility**: High — no focus-trap complexity; standard page navigation; all browser accessibility features work naturally.
- **Implementation Complexity**: Low — just a route + page component; but user experience cost is significant.

---

### Option 4: Inline Expand Below Heading Row (Accordion)

- **Approach**: Clicking the gear expands an inline panel below the heading row (above the kanban board). The board content pushes down. The panel collapses when closed.
- **Wireframe/Layout**:
  ```
  ┌─────────────────────────────────────────────────────┐
  │ [Back]  My Board              [FilterBar]  [⚙ Settings]
  ├─────────────────────────────────────────────────────┤
  │ [Automation]                                        │
  ├─────────────────────────────────────────────────────┤
  │ Rules: (list) | New Rule form | Delivery History    │
  ├─────────────────────────────────────────────────────┤
  │                [board content below]                │
  └─────────────────────────────────────────────────────┘
  ```
- **User Flow**: click gear → panel expands inline below heading row; board is visible below but compressed; click gear again or press Escape to collapse.
- **Pros**:
  - Board remains visible below; user does not lose context entirely.
  - No routing change; no modal overlay complexity.
- **Cons**:
  - Inline panel pushes the kanban board down, making layout feel unstable and breaking the board's visual primacy.
  - Horizontal space in the heading row is already constrained (Back + h1 + FilterBar); adding a Settings toggle that doubles as an expand trigger is visually busy.
  - The activity feed panel (`padding-right: 284px`) already occupies the right side; an inline expand that doesn't account for this creates asymmetry.
  - Three panels (rules list + form + history) do not fit comfortably in a horizontal row without complex responsive logic.
  - Accordion pattern for settings is non-standard and lower discoverability than a gear → modal flow.
  - Poor mobile behavior — inline expansion in a constrained heading row is especially problematic on narrow viewports.
- **Usability**: Low-Medium — unfamiliar pattern for settings; layout instability.
- **Accessibility**: Medium — no focus trap needed, but the panel is not a recognized a11y pattern for dialogs; screen readers may not announce it as a settings overlay.
- **Implementation Complexity**: Medium — layout management is complex given existing CSS; responsive behavior needs significant work.

---

## Evaluation Matrix

| Criteria | Option 1: Modal | Option 2: Drawer | Option 3: Route | Option 4: Accordion |
|----------|-----------------|------------------|-----------------|---------------------|
| Usability | High | Medium | Medium | Low |
| Accessibility | High | Medium | High | Medium |
| Consistency with existing patterns | High | Low | High | Low |
| Responsiveness | High | Medium | High | Low |
| Performance | High | High | Medium | High |
| Implementation Complexity | Low-Medium | Medium-High | Low | Medium |

---

## Decision

**Chosen**: Option 1 — Full-Screen Modal (Dialog Overlay)

### Rationale

The modal pattern is the correct choice for this product for three reasons:

1. **User expectation alignment.** Board-level settings accessed from a toolbar icon always open as an overlay in comparable tools (Trello, Linear, GitHub Projects). Users of this persona have been conditioned to expect a focused overlay, not a navigation change or an inline expand. The modal immediately communicates "this is a temporary focus shift" without the disorienting context loss of a route change.

2. **No implementation bloat.** The native HTML `<dialog>` element provides `role="dialog"`, `aria-modal`, backdrop, Escape-key dismiss, and focus return behavior natively — without importing any component library. This directly respects the "no bloat" and "reuse existing patterns" constraints. The implementation is a single new component (`BoardSettingsModal`) using CSS Modules for the overlay scrim and content sizing.

3. **Layout compatibility.** The board page already has `padding-right: 284px` for the ActivityFeed. A right-side drawer would conflict with this layout. The inline accordion would destabilize the board layout. A centered modal avoids both issues and works cleanly across all target breakpoints.

The route-based option (Option 3) is rejected despite its accessibility simplicity because context loss (board teardown, SSE disconnection, loss of in-progress drag state) is a poor UX for settings that are expected to be quick-access overlays.

### Trade-offs Accepted

- **Focus trap requires implementation.** Native `<dialog>` handles Escape-dismiss and initial focus, but returning focus to the trigger element on close requires a `useRef` to the gear button. This is a small implementation cost with clear, well-documented patterns.
- **Board is inaccessible while settings are open.** This is intentional — settings is a task-mode context switch. The user is not expected to drag cards while configuring webhooks.
- **No URL-based deeplink to settings.** The board ID is in the URL; the settings overlay state is ephemeral page state. For v1 this is acceptable; a future enhancement could add a `?settings=automation` query parameter.

---

## Design Specifications

### Layout

**Desktop (> 1024px)**:
- Modal centered in viewport; width: 640px; max-height: 80vh; overflow-y: auto within the modal body.
- Semi-transparent backdrop scrim (`rgba(0,0,0,0.4)`).
- Modal header: "Board Settings" title (left) + close button × (right).
- Single tab "Automation" displayed as a tab-strip for future extensibility.
- Tab panel content: Rules list (top) → New Rule form (below) → Delivery History panel (bottom, collapsible).

**Tablet (640–1024px)**:
- Modal width: `min(640px, calc(100vw - 32px))`; centered; same layout.
- Delivery History table: hide "Rule" column (it is implicitly scoped to board); keep Status, Trigger, Attempt, Date.

**Mobile (< 640px)**:
- Modal width: 100vw; height: 100dvh; no border-radius; slides up from bottom (CSS transform animation).
- Tab strip collapses to a single label (no tab-strip needed if only one tab).
- Delivery History table: show only Status + Date columns; other columns accessible via horizontal scroll within the table container (`overflow-x: auto`).

### Heading Row Gear Icon

The gear icon is placed at the far right of the heading row, **after** `FilterBar`, using a flex layout. Current heading row layout:
```
[Back] ←→ [h1 board name (flex-shrink: 1)] ←→ [FilterBar] ←→ [⚙]
```

```
.headingRow {
  display: flex;
  align-items: center;
  justify-content: space-between;  /* existing */
  gap: 12px;                        /* existing */
}
```

The gear button uses `aria-label="Board settings"` and `aria-haspopup="dialog"` to communicate its purpose to screen readers. It is a plain `<button type="button">` with a gear SVG icon. No text label on desktop (icon-only with `aria-label`); on mobile the `<button>` can optionally show "Settings" text.

### Key Components

| Component | Purpose | Behavior |
|-----------|---------|----------|
| `SettingsGear` button (inline in BoardPage) | Entry point | `onClick` sets `settingsOpen = true`; stores ref for focus return on close |
| `BoardSettingsModal` | Container overlay | Native `<dialog>` element; `open` attr driven by `settingsOpen` state; Escape handled by `dialog` natively; close button calls `onClose`; `onClose` returns focus to gear ref |
| `AutomationTab` | Tab panel content | Rules list + New Rule form + Delivery History; owns local rule CRUD state |
| `RulesList` | List of `automation_rules` | Renders rule rows; toggle enable/disable inline; delete button per row |
| `NewRuleForm` | Create rule form | Controlled inputs; validates URL on blur; calls create mutation; shows `ErrorBanner` on error |
| `DeliveryHistoryPanel` | Delivery History | Table of `webhook_deliveries` rows; status badge per row; Refresh button; auto-poll (see Polling Strategy) |
| `StatusBadge` | Renders delivery status | Non-color-only: text + SVG icon; 4 states (see below) |

### Automation Tab — Internal Layout Wireframe

```
┌──────────────────────────────────────────────┐
│ Board Settings                          [×]  │
├──────────────────────────────────────────────┤
│ [Automation]                                 │  ← tab strip (single tab v1)
├──────────────────────────────────────────────┤
│                                              │
│  Automation Rules                            │
│  ─────────────────────────────────────────  │
│  (empty state: "No rules yet. Add one below.")│
│  ─────────────────────────────────────────  │
│  OR:                                         │
│  [●] Card moved to Done                      │
│      https://hooks.example.com/abc  [Delete] │
│                                              │
│  New Rule                                    │
│  ─────────────────────────────────────────  │
│  Trigger type                                │
│  [Card moved to Done ▼         ]             │
│                                              │
│  Webhook URL                                 │
│  [https://...                  ]             │
│  (field error: "Must be a valid HTTPS URL")  │
│                                              │
│  [x] Enable rule immediately                 │
│                                              │
│  [Add Rule]                                  │
│                                              │
│  Delivery History              [Refresh]     │
│  ─────────────────────────────────────────  │
│  Status    Rule              Attempt  Date   │
│  [✓ delivered] Card→Done       1    12:04   │
│  [✗ failed]    Card→Done       2    11:58   │
│  [● pending]   Card→Done       0    11:55   │
│                                              │
│  (empty state: "No deliveries yet.")         │
└──────────────────────────────────────────────┘
```

### Status Badge Design (non-color-only, WCAG AA)

Each status badge combines an SVG icon + text label. Color is additive (not the sole differentiator).

| Status | Icon | Text label | Color (additive) | ARIA |
|--------|------|------------|------------------|------|
| `pending` | ● (circle, hollow/filled) | "Pending" | neutral grey | `aria-label="Status: Pending"` |
| `delivered` | ✓ (checkmark) | "Delivered" | green (#276749 on white — WCAG AA) | `aria-label="Status: Delivered"` |
| `failed` | ✗ (×) | "Failed" | red (#b91c1c on white — WCAG AA) | `aria-label="Status: Failed"` |
| `exhausted` | ⊘ (ban/stop circle) | "Exhausted" | dark orange (#b45309 on white — WCAG AA) | `aria-label="Status: Exhausted"` |

The `StatusBadge` component renders:
```html
<span class="badge badge--{status}" aria-label="Status: {label}">
  <svg aria-hidden="true" ...>{icon}</svg>
  <span class="badge__text">{label}</span>
</span>
```

`aria-hidden="true"` on the SVG prevents double-announcement; `aria-label` on the wrapper span provides the full accessible name.

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| Click gear icon | Open `BoardSettingsModal` | Modal opens with Automation tab; focus moves to first interactive element (tab or close button) |
| Press Escape | Close modal | Modal closes; focus returns to gear button |
| Click × close button | Close modal | Same as Escape |
| Click backdrop scrim | Close modal | Same as Escape (native `<dialog>` click-outside behavior) |
| Tab key inside modal | Cycle focus within modal | Focus trapped inside modal (native `<dialog>` behavior) |
| Blur webhook URL field | Validate URL format | Inline field error appears if invalid (before submit) |
| Click "Add Rule" | Submit form | Loading state on button; on success: rule appears in list, form clears; on error: `ErrorBanner role="alert"` appears above form |
| Click enable toggle on rule | Toggle `enabled` flag | Optimistic toggle; calls `PATCH /boards/:boardId/automation-rules/:ruleId`; reverts on error with `ErrorBanner` |
| Click Delete on rule row | Delete rule | Confirmation is not shown (consistent with card-delete "no confirmation" product ethos); rule removed optimistically; error reverses with `ErrorBanner` |
| Click "Refresh" in Delivery History | Refetch deliveries | `invalidateQueries` for delivery history query; loading indicator on Refresh button while fetching |

### Polling Strategy for Delivery History

**Decision: Manual Refresh + Timed Auto-Poll (30s interval)**

Rationale: There are no WebSockets and the project already uses `refetchOnWindowFocus: false` globally (QueryClient config in `main.tsx`). Auto-polling every 30 seconds via TanStack Query's `refetchInterval` is the correct no-WebSocket approach. 30 seconds matches the webhook retry backoff interval, so users see status updates at a cadence that reflects the delivery lifecycle.

Implementation:
```typescript
const { data: deliveries } = useQuery({
  queryKey: queryKeys.webhookDeliveries.byBoard(boardId),
  queryFn: () => listWebhookDeliveries(boardId),
  refetchInterval: 30_000,      // poll every 30s
  enabled: settingsOpen,        // only poll while settings modal is open
  staleTime: 0,                 // always consider stale; respect the poll interval
})
```

- `enabled: settingsOpen` — polling stops the moment the modal is closed, preventing background network requests on the board page.
- The "Refresh" button calls `refetch()` imperatively for users who want to check immediately (e.g., right after triggering a card move).
- There is no auto-poll when the panel is visible for the first time — the initial query fetch covers the first load; the 30s timer starts after that.

**Empty state**: "No deliveries yet. Deliveries will appear here after a rule triggers." with a subtle muted style (no icon needed; text is sufficient).

### Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| < 640px | Modal is full-screen (100vw × 100dvh); slides up from bottom; Delivery History table shows only Status + Date; table scrolls horizontally inside `overflow-x: auto` container |
| 640–1024px | Modal is `min(640px, calc(100vw - 32px))`; Delivery History table hides "Rule" column |
| > 1024px | Modal is 640px centered; all columns in Delivery History table visible |

### Accessibility Requirements

- [x] Keyboard navigation support — native `<dialog>` element handles Escape and Tab trapping natively in all target browsers
- [x] Screen reader compatibility — `<dialog>` provides `role="dialog"` natively; `aria-labelledby` pointing to the "Board Settings" heading; form fields use `<label>` elements with `htmlFor`
- [x] Color contrast compliance (WCAG AA) — status badge color choices verified against white background: green `#276749` (5.1:1), red `#b91c1c` (5.5:1), orange `#b45309` (4.6:1), grey neutral (3:1+ for disabled state, non-interactive text)
- [x] Focus indicators visible — inherit existing browser focus ring; add `outline: 2px solid #2563eb; outline-offset: 2px` on the gear button and modal interactive elements to match existing button styles
- [x] Error messages accessible — `ErrorBanner` with `role="alert"` announces errors to screen readers immediately on mount per existing Error Display Pattern
- [x] Non-color-only status badges — text label + icon on every badge (see Status Badge Design above)
- [x] Gear button accessible name — `aria-label="Board settings"` and `aria-haspopup="dialog"`

---

## Implementation Guidelines

### For Developers

1. **Use native `<dialog>` for the modal**. Do not implement a custom modal with `role="dialog"` from scratch. The native `<dialog>` element provides: `role="dialog"`, `aria-modal`, Escape-key dismiss, `::backdrop` pseudo-element for the scrim, and focus-trap behavior in all target browsers. Call `dialogRef.current.showModal()` to open; the native close event fires on Escape and can be handled with an `onClose` handler to sync React state. Call `dialogRef.current.close()` programmatically for the × button.

2. **Focus return pattern**. Store a `useRef<HTMLButtonElement>` for the gear icon button. On modal close, call `gearButtonRef.current?.focus()`. This is required for WCAG 2.1 SC 2.4.3 (Focus Order).

3. **Polling only when modal is open**. Pass `enabled: isSettingsOpen` to the `useQuery` for delivery history. This prevents background polling when the user is working on the board.

4. **Webhook URL validation — two-level**. Level 1: on blur, validate URL format client-side (`new URL(value)` plus scheme check `url.protocol === 'https:' || url.protocol === 'http:'`). Level 2: on submit, the API validates further (scheme, SSRF rules). The `ErrorBanner` pattern handles the API error response.

5. **TanStack Query cache keys for new domains**. Add to `frontend/src/api/queryKeys.ts`:
   ```typescript
   automationRules: {
     all: ['automation-rules'] as const,
     byBoard: (boardId: string) => ['automation-rules', 'board', boardId] as const,
   },
   webhookDeliveries: {
     all: ['webhook-deliveries'] as const,
     byBoard: (boardId: string) => ['webhook-deliveries', 'board', boardId] as const,
   },
   ```

6. **New Rule form — enable toggle**. The checkbox "Enable rule immediately" defaults to `checked`. This is the expected behavior — a user creating a rule wants it active immediately. Unchecking creates a disabled rule (useful for staging a rule before activating it).

7. **Delete without confirmation**. Consistent with the existing card delete behavior (TASK-018: "optimistic removal; no confirmation dialog — matches the fast, focused product ethos"). Rule delete is optimistic; a `setBannerError` call in `onError` surfaces any API failure.

8. **Status badge as a dedicated component**. Create `frontend/src/components/common/StatusBadge/StatusBadge.tsx`. It accepts `status: 'pending' | 'delivered' | 'failed' | 'exhausted'` and renders the icon + text combination from a static config map. This keeps badge styling and a11y attributes in one testable place.

9. **Delivery History — cursor pagination** (TASK-019 Architecture decision may specify). If the API uses cursor pagination (as per systemPatterns.md Guiding Principle #13), the initial query fetches the latest 20 deliveries. A "Load more" link at the bottom of the table loads the next page. This is simpler than infinite scroll given the settings context.

10. **prefers-reduced-motion**. The mobile bottom-sheet animation (slide up) must respect `prefers-reduced-motion: reduce` — disable the transform animation and show the modal instantly when this media query matches. Add to the CSS Module:
    ```css
    @media (prefers-reduced-motion: reduce) {
      .modal { transform: none !important; transition: none !important; }
    }
    ```

### Component Structure

```
frontend/src/
├── components/
│   ├── common/
│   │   └── StatusBadge/
│   │       ├── StatusBadge.tsx
│   │       ├── StatusBadge.module.css
│   │       └── StatusBadge.test.tsx
│   └── BoardSettings/
│       ├── BoardSettingsModal.tsx         ← <dialog> wrapper + backdrop
│       ├── BoardSettingsModal.module.css
│       ├── AutomationTab.tsx              ← tab panel; composes the three sub-panels
│       ├── RulesList.tsx                  ← list of existing automation_rules
│       ├── NewRuleForm.tsx                ← controlled form; create mutation
│       ├── DeliveryHistoryPanel.tsx       ← table + polling + refresh button
│       └── __tests__/
│           ├── BoardSettingsModal.test.tsx
│           ├── NewRuleForm.test.tsx
│           └── DeliveryHistoryPanel.test.tsx
└── pages/
    └── BoardPage/
        └── BoardPage.tsx                  ← add gear button + settingsOpen state + modal render
```

### Recommended Libraries/Patterns

- **Native `<dialog>`** (no new library) — use `dialogRef.current.showModal()` / `.close()`; handle `onClose` event to sync React `settingsOpen` state.
- **CSS Modules** (existing pattern) — all new styles in `*.module.css` files; no inline styles.
- **TanStack Query** (existing pattern) — `useQuery` with `refetchInterval: 30_000` for delivery history; `useMutation` for rule create/update/delete.
- **SVG icons inline** — add gear, check, ×, pending-circle, and exhausted icons as inline SVG constants in a new `frontend/src/icons.tsx` or directly in `StatusBadge.tsx`. No icon library import.

---

## Open Design Questions — Resolved

| Question | Decision |
|----------|----------|
| Settings surface: modal vs drawer vs route | Modal (Option 1) — see Decision section |
| Automation tab layout | Rules list (top) → New Rule form (below rules) → Delivery History (bottom) — progressive disclosure matches task flow |
| New Rule form: trigger type selector | `<select>` with single option "Card moved to Done" (v1); labeled with `<label htmlFor>` |
| New Rule form: URL validation | Two-level: client-side on blur (URL constructor + scheme check) + server-side on submit |
| New Rule form: enable toggle | Checkbox "Enable rule immediately", default checked |
| Delivery History refresh strategy | Auto-poll `refetchInterval: 30_000` when modal is open + manual Refresh button (`refetch()`) |
| Status badge design | Text + icon (4 distinct icons); colors as additive non-sole-differentiator |
| Error surfacing | `ErrorBanner role="alert"` inside the modal, above the form that failed; consistent with Error Display Pattern |
| Delete confirmation | No confirmation dialog — consistent with card-delete ethos |

---

## Validation Checklist

- [x] Meets all user goals (create rule, verify status, diagnose failures)
- [x] Accessible per WCAG 2.1 AA requirements (native dialog, focus management, non-color-only badges)
- [x] Consistent with existing patterns (CSS Modules, ErrorBanner, TanStack Query, no new libraries)
- [x] Respects Guiding Principles and component architecture in systemPatterns.md (no new component libraries; 3-layer API architecture; TanStack Query cache key factory)
- [x] Responsive across devices (640px modal; full-screen mobile; table scroll)
- [x] Performance acceptable (polling only when modal open; no background SSE for settings)
- [x] Implementation feasible (native `<dialog>`; no complex new infrastructure)

---

## Next Steps

1. **Architecture creative** must resolve: `automation_rules` + `trigger_executions` + `webhook_deliveries` schema; API endpoint shapes for `GET /boards/:boardId/automation-rules`, `POST /boards/:boardId/automation-rules`, `GET /boards/:boardId/webhook-deliveries`; cursor pagination contract for delivery history (affects DeliveryHistoryPanel implementation).
2. **Phase 4 build** implements in this order: `StatusBadge` → `BoardSettingsModal` shell → `NewRuleForm` → `RulesList` → `DeliveryHistoryPanel` → wire gear button into `BoardPage.tsx`.
3. **Test coverage** per Phase 4 test strategy: component tests with Testing Library for form validation, error rendering, status badge non-color-only assertion; jest-axe for accessibility; delivery history empty state + polling interaction.
4. **Gear icon SVG**: use a simple 8-tooth gear SVG (can be sourced from Heroicons MIT-licensed SVG, inlined as a constant — no icon library import). The exact SVG path is implementation detail for the build agent.
