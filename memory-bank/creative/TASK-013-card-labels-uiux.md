# UI/UX Decision: Card Labels — Three Interface Questions

**Created**: 2026-06-25
**Status**: DECIDED
**Decision Type**: UI/UX
**Task**: TASK-013
**Feature**: FEAT-010 Card Labels

---

## User Context

### Target Users

- **Primary**: Individual Developer (IC contributor) — desktop browser, wants to scan and update cards quickly; labels are a priority/category signal at a glance
- **Primary**: Dev Team Lead — scans the whole board during standups; needs FilterBar to reduce visual noise without navigating away
- **Secondary**: Freelancer — solo use, labels distinguish client/project; picker must be fast to reach

### User Goals

1. See at a glance which labels a card carries without opening a detail modal
2. Quickly change a card's label color with minimal clicks
3. Filter the board to a single label so only relevant cards are visible

### Use Cases

| Use Case | User | Goal | Frequency |
|----------|------|------|-----------|
| Scan board by label color | Any | Visually group cards by label type | Every session |
| Filter to a single label | Team Lead / Dev | Focus board view during standup or sprint review | Several times/day |
| Edit label color on a card | Any | Update label to match priority or category | Occasional (setup + reclassify) |
| Drag-and-drop card with labels | Any | Move card; labels should not interfere with drag handle | Every session |

### Constraints

- **Devices**: Desktop primary (Chrome/Firefox/Safari/Edge latest); tablet responsive (layout adapts); mobile drag-and-drop is nice-to-have
- **Accessibility**: WCAG 2.1 AA — keyboard navigation, screen reader labels, color contrast, focus indicators visible; labels must not rely on color alone (text in badge required)
- **Existing Patterns**: `ActivityFeed` is `position: fixed; right: 0; width: 280px`; `BoardPage.module.css` already adds `padding-right: 284px` to keep content clear of the feed; any overlay/popover must also respect that boundary; TanStack Query optimistic mutations; `ErrorBanner` pattern for errors
- **Card width**: Column `min-width: 280px`; card padding `8px 12px`; usable card interior ≈ 256px

---

## User Flow

### Label-Edit Flow

```
User sees card on board
        ↓
User wants to change label color
        ↓
User opens color picker (interaction TBD — Q3)
        ↓
Picker opens (popover anchored to badge)
        ↓
User clicks a color swatch
        ↓
Optimistic update: badge color changes immediately
API mutation fires in background
        ↓
On success: confirmed. On error: revert + ErrorBanner
        ↓
User closes picker (click-outside or Escape)
```

### Filter Flow

```
User on BoardPage
        ↓
User clicks a label in FilterBar (Q1 — placement TBD)
        ↓
Board re-renders: only cards with matching label visible
Other cards hidden (or greyed)
        ↓
User clicks same label or "Clear" to reset
        ↓
All cards restored
```

### Error States

| Error | Cause | User Recovery |
|-------|-------|---------------|
| Color save fails | Network error or 5xx | Badge reverts to previous color; `ErrorBanner` shown with message |
| Board load fails | Network/auth | Existing `ErrorBanner` on BoardPage handles this |
| No cards match filter | All cards have different labels | Empty column shows existing "empty" state copy |

---

## Q1 — FilterBar Placement in BoardPage

The FilterBar lets users click a label chip to show only cards with that label. It must sit within the `padding-right: 284px` content zone and must not conflict with the `ActivityFeed`.

### Option 1A: Inline in Heading Row (flex siblings)

- **Approach**: Convert the `<h1>` line into a `display: flex; justify-content: space-between; align-items: center` row. Board name left, FilterBar chips right — all in one horizontal band.
- **Wireframe/Layout**:
  ```
  ┌──────────────────────────────────────────────────┐
  │ Sprint Board                   [bug] [feat] [fix]│  ← single heading row
  ├──────────────────────────────────────────────────┤
  │ [ To Do col ]  [ In Progress ]  [ Done col ]     │
  └──────────────────────────────────────────────────┘
  ```
- **User Flow**: User sees board name and label filters together at a glance; one click activates a filter
- **Pros**:
  - Minimal vertical space — no extra row
  - Board name and filter are visually connected (same row = same scope)
  - Consistent with common kanban patterns (Trello uses a similar top-bar approach)
  - Simple CSS change to existing `.heading` rule
- **Cons**:
  - Long board names can crowd out filter chips; need `min-width` on name + `flex-shrink: 0` on chips or truncation on name
  - On tablet (narrow viewport) the row may wrap unattractively
- **Usability**: High
- **Accessibility**: High — FilterBar chips are `<button>` elements with `aria-pressed`; heading stays an `<h1>`
- **Implementation Complexity**: Low

### Option 1B: Separate Toolbar Row

- **Approach**: Add a dedicated `<div className={styles.toolbar}>` row between the heading and `<DndContext>`. FilterBar renders inside it.
- **Wireframe/Layout**:
  ```
  ┌──────────────────────────────────────────────────┐
  │ Sprint Board                                     │  ← h1
  ├──────────────────────────────────────────────────┤
  │ Filter: [bug] [feat] [fix]                       │  ← toolbar row
  ├──────────────────────────────────────────────────┤
  │ [ To Do col ]  [ In Progress ]  [ Done col ]     │
  └──────────────────────────────────────────────────┘
  ```
- **User Flow**: Same as 1A but user reads board name first, then sees filter row below it
- **Pros**:
  - No crowding risk — chips have a full-width row regardless of board name length
  - Easy to extend the toolbar row later (search box, member filter, etc.)
  - Tablet-safe: each row is independent, no wrap collision
- **Cons**:
  - Adds ~36px of vertical height before content; board columns appear lower on the screen
  - Slight visual separation between heading and filter can feel disconnected — two separate zones for one board's controls
- **Usability**: High
- **Accessibility**: High
- **Implementation Complexity**: Low

### Option 1C: Inside AppHeader

- **Approach**: Move FilterBar into the global `AppHeader` navigation bar
- **Wireframe/Layout**: (omitted — this option is explicitly called out as not preferred in the task)
- **Pros**: Single persistent location
- **Cons**: AppHeader is page-agnostic; FilterBar is board-scoped. It would need conditional rendering and board context plumbing. Far from the content it filters — poor spatial coupling.
- **Usability**: Low
- **Accessibility**: Medium
- **Implementation Complexity**: High
- **NOTE**: This option is excluded from the evaluation matrix and will not be selected.

### Q1 Evaluation Matrix

| Criteria | 1A — Inline Heading Row | 1B — Separate Toolbar Row |
|----------|------------------------|--------------------------|
| Usability | High | High |
| Accessibility | High | High |
| Consistency | High (matches Trello/Linear pattern) | Medium (extra visual layer) |
| Responsiveness | Medium (long names need truncation) | High |
| Performance | High | High |
| Implementation | Low | Low |

### Q1 Decision: Option 1A — Inline in Heading Row

**Rationale**: BanyanBoard targets small teams and simple boards. Board names are typically short ("Sprint", "Backlog", "Team Board"). The space economy of a single heading row is a net win: the board content starts 36px higher, and the spatial coupling of "board name + its filters" in one row communicates that the filter scopes to this board. Option 1B is marginally safer for very long names but adds vertical clutter that is out of proportion for an MVP tool.

**Trade-offs Accepted**:
- Long board names will truncate with `text-overflow: ellipsis` on the `<h1>`. This is acceptable: the board name is readable at creation time; truncation at a reasonable `max-width` (e.g., `max-width: 50%`) keeps chips always visible.
- If the feature roadmap adds more toolbar controls (search, member filter), revisit and promote to Option 1B at that time.

**CSS change required**:
```css
/* BoardPage.module.css */
.page { padding: 24px 284px 24px 24px; }

.headingRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.heading {
  margin: 0;
  font-size: 1.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
  flex-shrink: 1;
}
```

**JSX change required** (BoardPage.tsx):
```tsx
<div className={styles.headingRow}>
  <h1 className={styles.heading}>{board.name}</h1>
  <FilterBar labels={allLabels} activeLabel={activeLabel} onSelect={setActiveLabel} />
</div>
```

---

## Q2 — KanbanCard Flex Layout (drag handle + badge + title)

The label badge must move from below the title to right of the drag handle. The card interior is ≈ 256px wide. Drag handle is ≈ 28px wide. Remaining space ≈ 228px is shared between badge(s) and title.

### Option 2A: Single Flex Row — Handle + Badges + Title

- **Approach**: The entire card header becomes one `display: flex; align-items: center` row: `[⠿]` `[badge]` `[title text]`. Title is last and takes remaining space; it truncates if too long.
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────┐
  │ ⠿  [bug]  Fix login redirect issue │
  │                                    │
  │ Due: 2026-07-01                    │
  └────────────────────────────────────┘
  ```
- **User Flow**: Everything visible at once; user can read title and label in one saccade
- **Pros**:
  - Compact — no extra row; card height stays minimal
  - Natural left-to-right reading: handle → category signal → title
  - Cards with no label look the same (handle + title) — no layout shift on toggle
- **Cons**:
  - Long titles truncate (`text-overflow: ellipsis`) — some context lost
  - Multiple badges can crowd out the title on narrow columns
- **Usability**: High
- **Accessibility**: High — title still in `<h3>`, badge is a `<span>` with text
- **Implementation Complexity**: Low

### Option 2B: Two-Row Layout — Handle+Badges Top, Title Bottom

- **Approach**: Top row: `[⠿] [badge(s)]`. Second row: `[title text]` (full width, no truncation risk).
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────┐
  │ ⠿  [bug]                          │
  │ Fix login redirect issue           │
  │                                    │
  │ Due: 2026-07-01                    │
  └────────────────────────────────────┘
  ```
- **User Flow**: User sees badge first (top row), then reads full title below
- **Pros**:
  - Title never truncates; full context always readable
  - Multiple badges easily accommodated on top row without title crowding
- **Cons**:
  - Cards are taller; fewer cards visible per screen on a busy board
  - Slight disconnect between category badge and its title text (separated by row boundary)
  - When there are no labels, the drag handle appears on its own row — looks odd; needs conditional layout
- **Usability**: Medium
- **Accessibility**: High
- **Implementation Complexity**: Low–Medium (conditional layout for label-less cards)

### Option 2C: Handle Left Column, Badges+Title Right Column

- **Approach**: The handle is a left-aligned fixed-width column (flex item, no grow). The right flex item contains `[badge(s)]` stacked above `[title]`.
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────┐
  │     │ [bug]                        │
  │  ⠿  │ Fix login redirect issue     │
  │     │ Due: 2026-07-01              │
  └────────────────────────────────────┘
  ```
- **Pros**:
  - Clear visual separation of interaction zone (handle) from content zone
  - Title has full right-column width; never crowded by badge
- **Cons**:
  - Most complex layout; requires nested flex containers
  - Handle vertically centered beside a multi-line right column — can look tall on simple single-line cards
  - Structural change is larger; higher risk of breaking existing drag-and-drop hover/ghost styles
- **Usability**: Medium
- **Accessibility**: Medium (handle is still first in DOM; fine for keyboard order)
- **Implementation Complexity**: Medium

### Q2 Evaluation Matrix

| Criteria | 2A — Single Row | 2B — Two Rows | 2C — Left Column |
|----------|----------------|---------------|-----------------|
| Usability | High | Medium | Medium |
| Accessibility | High | High | Medium |
| Consistency | High (matches existing card structure) | Medium | Low |
| Responsiveness | High | Medium | Medium |
| Performance | High | High | High |
| Implementation | Low | Low-Medium | Medium |

### Q2 Decision: Option 2A — Single Flex Row

**Rationale**: BanyanBoard cards hold short task titles (individual work items, not paragraph summaries). Truncation at card width is acceptable and is the standard pattern across Trello, Linear, and GitHub Projects. The single-row layout is compact — preserving vertical density so more cards are visible per column during standup scans. The primary persona pain point is "unclear priorities" — a compact row that places the category badge immediately after the handle and before the title serves that goal efficiently. Option 2B's height overhead hurts the density that makes kanban boards useful.

**Trade-offs Accepted**:
- Titles longer than ~35 characters will truncate. Mitigation: `title` HTML attribute on the `<h3>` shows full text on hover as a tooltip. Cards have descriptions for extended context.
- Multiple badges on one row can crowd the title. Constrain to `max-width: 60px` per badge with truncation, or cap visible badges at 2 with a "+N" overflow indicator (implementation detail for the build phase).

**CSS change required**:
```css
/* KanbanCard.module.css */
.cardHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  min-width: 0; /* allows flex children to shrink below content size */
}

.dragHandle {
  cursor: grab;
  background: none;
  border: none;
  padding: 2px 4px;
  font-size: 1rem;
  color: #a0aec0;
  line-height: 1;
  flex-shrink: 0; /* handle never shrinks */
}

.title {
  margin: 0;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
  min-width: 0;
}

/* Inline badge within the header row */
.labelBadge {
  flex-shrink: 0;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 0.75rem;
  line-height: 1.4;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* background-color applied via inline style from label.color */
}
```

**JSX change required** (KanbanCard.tsx):
```tsx
<div className={styles.cardHeader}>
  <button
    type="button"
    className={styles.dragHandle}
    aria-label={`Reorder card: ${card.title}`}
    {...(overlay ? {} : { ...attributes, ...listeners })}
    aria-roledescription="draggable"
  >
    ⠿
  </button>
  {card.labels.map((label) => (
    <span
      key={label.id}
      className={styles.labelBadge}
      style={{ backgroundColor: label.color, color: contrastColor(label.color) }}
    >
      {label.name}
    </span>
  ))}
  <h3 className={styles.title} title={card.title}>{card.title}</h3>
</div>
```

**Note on drag-and-drop safety**: The drag handle's `attributes` and `listeners` remain on the `<button>` only. The `<article>` element that has `ref={setNodeRef}` is unchanged. The inner layout change does not affect dnd-kit wiring.

---

## Q3 — LabelColorPicker Trigger Interaction

How the user opens the color picker for a card's label, and whether the picker is a floating popover or inline expansion.

### Option 3A: Click Badge Opens Floating Popover

- **Approach**: The label badge itself is a `<button>` (or `role="button"`). Clicking it opens a small floating color-swatch popover anchored below the badge. The popover contains 8–12 color swatches and a "Remove label" option. Clicking a swatch commits the change (optimistic update). Clicking outside or pressing Escape closes it.
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────┐
  │ ⠿  [bug ▾]  Fix login redirect    │
  └────────────────────────────────────┘
       ┌─────────────────┐
       │ ● ● ● ● ● ● ● ● │  ← color swatches
       │ [Remove label]  │
       └─────────────────┘
  ```
- **User Flow**: Click badge → popover opens → click swatch → badge updates immediately → popover closes
- **Pros**:
  - Fewest clicks (1 click to open picker vs. hover + click)
  - No hover-only affordance — works on touch/tablet
  - Badge is already the most relevant anchor point for a color picker
  - Small downward chevron `▾` on badge provides clear "this is interactive" affordance
- **Cons**:
  - Badge-as-button feels slightly unconventional; users might not expect a badge to be clickable
  - Requires accessible focus trap in popover and Escape key handling
  - Popover must not overflow into ActivityFeed zone (right edge constraint)
- **Usability**: High
- **Accessibility**: High — button role, aria-expanded, popover has role="dialog" or listbox with arrow-key support
- **Implementation Complexity**: Medium

### Option 3B: Hover-Reveal Pencil Icon on Badge

- **Approach**: On badge hover (and on focus), a small pencil/edit icon appears as an overlay on the badge (or immediately right of it). Clicking the pencil opens the floating popover.
- **Wireframe/Layout**:
  ```
  ┌────────────────────────────────────┐
  │ ⠿  [bug ✏]  Fix login redirect    │  ← pencil appears on hover
  └────────────────────────────────────┘
  ```
- **User Flow**: Hover badge → see pencil → click pencil → popover opens → click swatch → badge updates
- **Pros**:
  - Explicit "edit" metaphor — unambiguous intent
  - Badge in non-hover state is visually clean
- **Cons**:
  - Two-step (hover + click) — slower for frequent label editing
  - Hover states do not exist on touch screens — tablet/mobile users can't discover the control
  - More complex CSS (`.badge:hover .pencil { display: block }`) plus keyboard focus equivalent
- **Usability**: Medium
- **Accessibility**: Medium — pencil must be keyboard-reachable (`:focus-within` on badge container)
- **Implementation Complexity**: Medium

### Option 3C: Card Hover Reveals "Edit Label" Button

- **Approach**: When hovering the card (not the badge), an "Edit label" or "+" button appears in a card action area (top-right corner of card).
- **Wireframe/Layout**:
  ```
  ┌──────────────────────────────[✏]──┐  ← appears on card hover
  │ ⠿  [bug]  Fix login redirect      │
  └────────────────────────────────────┘
  ```
- **Pros**:
  - Clear affordance; familiar from Trello-style card action buttons
- **Cons**:
  - Clutters card hover state (already has drag handle activation)
  - Positionally ambiguous — top-right corner could conflict with future card menu
  - Hover-only again — touch accessibility concern
- **Usability**: Medium
- **Accessibility**: Low-Medium
- **Implementation Complexity**: Medium

### Option 3D: Click Card Opens Modal with Picker

- **Approach**: Clicking anywhere on the card body opens a card-detail modal which includes a label color picker
- **Pros**: Picker has plenty of space; fits with Trello's "click card = open card" pattern
- **Cons**: Very heavy for a simple color change; adds a full modal implementation; conflicts with drag-and-drop (click vs. drag disambiguation); modal complexity is out of scope for MVP labels
- **Usability**: Low (for this specific task — overkill)
- **Accessibility**: High (modals are well-understood)
- **Implementation Complexity**: High
- **NOTE**: Excluded from evaluation matrix.

### Popover Anchoring Sub-decision

Both 3A and 3B lead to a floating popover. The question is: floating popover anchored to the badge, OR inline expansion below the badge?

**Inline expansion** (badge grows downward to reveal swatches) is appealing for simplicity but:
- Expands the card height mid-board, causing layout shift that could confuse drag-and-drop
- At card width of 256px, the expansion would be very narrow for 8+ color swatches

**Floating popover** anchored to the badge:
- No layout shift on the card
- Can be wider than the badge (e.g., `min-width: 200px`) for comfortable swatch layout
- Must respect the right boundary: compute available space to the right; if badge is near the right edge (within 284px of viewport right due to ActivityFeed), anchor popover to the left edge of the badge instead

**Decision: Floating popover, badge-anchored, with boundary detection.**

### Q3 Evaluation Matrix

| Criteria | 3A — Click Badge | 3B — Hover Pencil | 3C — Card Hover Button |
|----------|-----------------|------------------|----------------------|
| Usability | High | Medium | Medium |
| Accessibility | High | Medium | Medium |
| Consistency | High | Medium | Medium |
| Responsiveness | High (touch-safe) | Low (hover-only) | Low (hover-only) |
| Performance | High | High | High |
| Implementation | Medium | Medium | Medium |

### Q3 Decision: Option 3A — Click Badge Opens Floating Popover

**Rationale**: The primary personas are developers using desktop browsers; they reach for labels frequently during sprint planning and standup updates. One click to open the picker (versus hover + click) is meaningfully faster for repeated use. Touch safety (tablet support) eliminates Options 3B and 3C. Adding a small downward chevron `▾` to the badge resolves the discoverability concern: the badge is visually signaled as interactive without needing hover.

The floating popover (not inline expansion) is chosen to prevent card layout shift during drag-and-drop sessions.

**Trade-offs Accepted**:
- Badge-as-button is slightly unconventional. Mitigation: the `▾` caret and a subtle hover background-brightness change (`filter: brightness(0.92)`) provide visual affordance without changing the badge's shape.
- Popover positioning logic is required to avoid clipping at the ActivityFeed boundary. Use a simple check: if the badge's `getBoundingClientRect().right + popoverWidth > window.innerWidth - 284`, flip the popover to left-anchor. This is a small utility function in the component.

**Popover specs**:
- Width: `min-width: 192px`
- Color swatches: 3 columns × 4 rows of 24×24px circles with 8px gap
- Each swatch: `<button aria-label="Red" style="background: #FC8181">` (no text, aria-label carries meaning)
- "Remove label" text button below swatches
- Dismiss: click outside (mousedown listener on document), Escape key
- Focus management: popover opens with focus on first swatch; Tab cycles through swatches and Remove button; Escape returns focus to the badge button
- `role="dialog"`, `aria-label="Choose label color"`, `aria-modal="true"`

---

## Unified Design Specifications

### Layout Summary

- **Q1**: `BoardPage` heading row becomes `display: flex` with board name (left, truncating) and `<FilterBar>` (right, chips)
- **Q2**: `KanbanCard` header area is `display: flex; align-items: center` — `[dragHandle] [badge(s)] [title]` — all in one row
- **Q3**: Badge is a `<button>` with `▾` caret; click opens floating popover with color swatches

### Responsive Behavior

| Breakpoint | Changes |
|------------|---------|
| < 640px | `headingRow` wraps to two lines (board name full-width, FilterBar full-width below); card layout unchanged (already compact); popover repositions to avoid off-screen overflow |
| 640–1024px | Heading row stays single row; ActivityFeed may collapse; popover anchoring adjusts dynamically |
| > 1024px | All decisions as described above; `padding-right: 284px` on `.page` keeps content clear of ActivityFeed |

### Key Components

| Component | Purpose | Behavior |
|-----------|---------|----------|
| `FilterBar` | Render label filter chips in heading row | Each chip is `<button aria-pressed={isActive}>` toggling active label; one active at a time; "All" resets |
| `LabelBadge` | Interactive badge in card header | `<button>` with `▾`, opens `LabelColorPicker` popover on click |
| `LabelColorPicker` | Floating color-swatch popover | Anchored to `LabelBadge`; 8–12 color swatches + "Remove"; focus-trapped; closes on Escape/outside-click |

### Interactions

| Trigger | Action | Feedback |
|---------|--------|----------|
| Click `FilterBar` chip | Set active label filter; columns re-render with only matching cards | Chip gains `aria-pressed="true"` + active visual style |
| Click `LabelBadge` | Open `LabelColorPicker` popover | Popover appears anchored below badge; first swatch focused |
| Click color swatch | Optimistic color update; API mutation fires | Badge color changes immediately; popover closes |
| API save error | Revert badge color; show `ErrorBanner` | Badge reverts; error message displayed |
| Press Escape in popover | Close popover | Focus returns to `LabelBadge` |
| Click outside popover | Close popover | Popover unmounts |
| Tab through swatches | Move focus between swatches and Remove button | Standard focus ring visible on focused swatch |

### Accessibility Requirements

- [x] Keyboard navigation support — FilterBar chips and LabelBadge are `<button>` elements; color picker is a focus-trapped dialog
- [x] Screen reader compatibility — `aria-pressed` on filter chips; `aria-label` on color swatches (color name); `aria-expanded` on badge button; `role="dialog"` on popover
- [x] Color contrast compliance — badge text color computed for contrast against badge background (light text on dark swatches, dark text on light swatches); WCAG AA 4.5:1 minimum
- [x] Focus indicators visible — default browser focus ring retained; not suppressed by CSS
- [x] Labels must not rely on color alone — badge always contains the label name as text, not just a color dot

---

## Implementation Guidelines

### For Developers

1. **FilterBar component**: Accept `labels: string[]`, `activeLabel: string | null`, `onSelect: (label: string | null) => void`. Render one `<button>` per label plus a "All" reset button. Filtering itself is done in `BoardPage` by passing a `labelFilter` prop down to `KanbanBoard` → `KanbanColumn` → cards rendered only when `card.labels.includes(labelFilter)` (or all shown when `null`). No server round-trip needed for filtering — it is client-side view filtering.

2. **LabelBadge + LabelColorPicker**: Create a compound component. `LabelBadge` manages `isOpen` state and renders `LabelColorPicker` when open. Use `useRef` on the badge button for popover anchor position. Popover uses `position: fixed` (not absolute) to escape card's stacking context and avoid clipping by card border or column overflow. Boundary check: `badgeRect.right + 192 > window.innerWidth - 284` → left-anchor popover.

3. **Optimistic mutation pattern**: Follow the existing TanStack Query pattern. In `onMutate`, call `queryClient.setQueryData(queryKeys.cards.byColumn(columnId), ...)` to update the badge color in the cache immediately. In `onError`, call `queryClient.setQueryData(...)` to revert. In `onSettled`, call `queryClient.invalidateQueries(...)` to sync with server truth.

4. **Color contrast utility**: Implement a simple `contrastColor(hex: string): '#000' | '#fff'` function using luminance calculation (W3C formula). Used to set badge text color and swatch aria-label text color.

5. **Label data shape** (DECIDED — 2026-06-25): Per-label color is required. The `Label` type is `{ name: string; color: string }`. `Card.labels` changes from `string[]` to `Label[]`. DB migration changes `cards.labels text[]` to `cards.labels jsonb NOT NULL DEFAULT '[]'`. Default color when a label is created without an explicit color: `#95B9C7`. The color picker swatch grid offers only pale/pastel colors — the 10 swatches from the spec (Tailwind 50/100 tier). `#95B9C7` is the per-label default (applied automatically); it is NOT offered as a swatch choice since it is mid-saturation, not pale. `Card.labels` API shape: `[{ "name": "bug", "color": "#fce7f3" }]`.

### Component Structure

```
frontend/src/components/board/
├── FilterBar/
│   ├── FilterBar.tsx
│   └── FilterBar.module.css
├── LabelBadge/
│   ├── LabelBadge.tsx          (renders badge button + mounts LabelColorPicker)
│   ├── LabelBadge.module.css
│   └── LabelColorPicker.tsx    (floating popover, co-located with badge)
└── KanbanCard/
    ├── KanbanCard.tsx           (updated: cardHeader flex row)
    └── KanbanCard.module.css    (updated: cardHeader, title nowrap, labelBadge inline)
```

### Recommended Libraries/Patterns

- No new dependency needed for popover — use `position: fixed` with JS boundary detection. Avoid adding a full popover library (Floating UI, Radix) for a single use case at MVP scale; the boundary logic is a ~10-line utility function.
- `@dnd-kit` already handles drag-and-drop. The card layout change does not require any dnd-kit config change.
- TanStack Query `useMutation` with `onMutate` / `onError` / `onSettled` for the optimistic label color update (same pattern as `useMoveCard`).

---

## Validation Checklist

- [x] Meets all user goals — FilterBar for scan/filter; inline badge for at-a-glance color; click-to-edit for quick changes
- [x] Accessible per requirements — buttons, aria-pressed, aria-expanded, focus trap, color + text in badges
- [x] Consistent with existing patterns — TanStack Query optimistic mutations; ErrorBanner for errors; no new global state patterns
- [x] Respects Guiding Principles in systemPatterns.md — no console.log; TanStack Query cache keys pattern; component co-location
- [x] Responsive across devices — single-row heading wraps on mobile; popover uses fixed positioning with boundary check
- [x] Performance acceptable — filtering is client-side (no extra API calls); optimistic updates feel instant
- [x] Implementation feasible — all three decisions use existing patterns; no new third-party dependencies required

---

## Next Steps

1. Build Phase 1: Data shape — define `Label` type, migration to change `cards.labels text[]` to a `labels` JSONB column (or a separate `card_labels` table), update API endpoints and frontend `types/index.ts`
2. Build Phase 2: `FilterBar` component + heading row layout update in `BoardPage`
3. Build Phase 3: `KanbanCard` header flex layout + `LabelBadge` inline in card row
4. Build Phase 4: `LabelColorPicker` popover — swatches, boundary detection, focus trap, optimistic mutation
5. Build Phase 5: E2E tests covering filter toggle, color change optimistic update, keyboard navigation through color picker
