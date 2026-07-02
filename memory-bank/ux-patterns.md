# UX Patterns

<!--
  CROSS-FILE CONSISTENCY GUARDRAIL (read before editing)

  This file is the canonical source for COMPONENT-USAGE and BEHAVIORAL-UI rules
  (AlertDialog vs Dialog, Drawer vs Modal, Tabs vs Sections, Toast placement,
  empty-state requirements, mobile adaptation). Anything else MUST live where it
  belongs and be REFERENCED here, not restated:

    | Topic                                          | Canonical source       |
    |------------------------------------------------|------------------------|
    | Tech stack, component library version, E2E fw  | techContext.md         |
    | Design tokens (color, spacing, typography)     | techContext.md OR      |
    |                                                | tokens.json /          |
    |                                                | tailwind.config.*      |
    | Architecture patterns, error conventions       | systemPatterns.md      |
    | Testing patterns, what's deliberately untested | systemPatterns.md      |
    | Persona definitions, user roles, NFRs          | productBrief.md        |

  REFERENCE syntax — write `see techContext.md → Design Tokens`, NOT inline copies.
  The /banyan-uat synthesizer follows references when checking conformance; a
  missing reference target itself becomes a finding.

  Why: duplicate facts drift. When ux-patterns.md, systemPatterns.md, and
  techContext.md disagree on the spacing scale, UAT findings become noise and
  trust in the file collapses. Reference once; layer behavior on top.

  ALLOWED: "Form field heights: 40px (≡ --space-10 from techContext.md → Design
  Tokens). Not 36px or 44px." — references the canonical source AND adds a
  UX-specific behavioral rule.

  FORBIDDEN: copy-pasting the spacing scale into this file.
-->

**Last Updated**: 2026-07-02
**Source(s)**: live-walk + manual verification
**Source hashes**: { "live-walk": "20260702T192500Z-rerun", "manual-verify": "20260702T-modal-esc-check" }

**Status**: DRAFT — v1.8 single-source live-walk stub. This file is a starting point,
NOT authoritative. Hand-review every section below before relying on it in UAT
conformance checks. The full multi-source ingest (Figma + Storybook + design-doc +
interview, with conflict resolution) is the v1.9 roadmap item.

**Walk scope**: Authenticated as the single `user` persona (see
`uat-config.md` → Persona Map; persona context also documented in
`productBrief.md` → Key Personas). Desktop viewport only (1280×720) — mobile
adaptation is out of scope for the v1.8 UX walker and is instead covered when
`/banyan-uat` runs its mobile section.

**Auth note**: A live session cookie was already present in the browser for
`uat-user@banyanboard.test` (or an equivalent previously-authenticated account) —
no login form drive or registration was required to reach the app.

**Re-run note**: This is a re-run of a prior walk that was blocked by a stale dev
server (see git history of this file / prior archive). The dev server was
confirmed restarted from `.claude-worktrees/FEAT-017` (backend port 3000,
frontend Vite port 5173) before this walk, and the Card Activity Feed feature
(TASK-020/FEAT-017) **was successfully observed this time**. Several claims from
the previous draft (about modal ESC/outside-click dismissal in particular) were
re-verified live rather than carried forward blindly, and one was found to be
incorrect — see the Dialogs & Modals section below.

---

## Dialogs & Modals

### Rule: Confirmation dialogs use `AlertDialog` for destructive actions
- **Observed exception, not a rule to emulate**: card deletion (per-card `×`
  delete button) is **instant, optimistic removal with NO confirmation dialog of
  any kind** — neither `AlertDialog` nor plain `Dialog`. Re-confirmed this walk:
  clicking "Delete card: <title>" removes the card immediately with no dialog.
  This is an intentional product decision, not a gap: see `productBrief.md` →
  Key Functionality ("Delete cards instantly via a per-card delete button
  (optimistic removal; no confirmation dialog — matches the fast, focused
  product ethos)"). Do not add a confirmation dialog to card delete without a
  product decision to reverse this ethos.
- **No other destructive-action flow was observed** in this walk (no delete-board
  UI exists yet — "Enable delete boards" appears only as a backlog card title on
  the UAT Sprint Board, not an implemented feature). Leave the general
  AlertDialog-for-destructive rule as the default for any *future* destructive
  action (e.g., delete board, when built) unless a product decision documents
  another exception.
- Reference: observed on `frontend/src/components/board/KanbanCard/KanbanCard.tsx`
  (`onDelete` button, `frontend/src/api/hooks.ts` `useDeleteCard`)

### Rule: Modals close on ESC, NOT on outside-click
- **Re-verified live a third time (2026-07-02), correcting the immediately
  prior draft**: ESC **does** close `CardDetailModal` — confirmed via
  `document.querySelector('dialog').open` flipping from `true` to `false`
  immediately after a real `Escape` keypress, with no application code
  involved (native `<dialog>.showModal()` browser behavior: ESC fires
  `cancel` → default action closes the dialog → `close` event fires, which
  both modals already listen for via `onClose`). The two prior "ESC doesn't
  work" observations in this file's history were automation false negatives,
  not real product behavior — likely a synthetic-keyevent quirk in the walker
  tooling rather than anything the app does. **Do not trust a UX-walker
  ESC-key observation without confirming `dialog.open` state directly**; this
  is now itself a walker-methodology lesson, not just a UI fact.
- **Outside-click**: confirmed does NOT close the modal — clicking well
  outside the modal panel (on the dimmed backdrop) leaves `dialog.open ===
  true`. This matches expectations: native `<dialog>` does not provide
  outside-click dismissal for free, and neither `CardDetailModal` nor
  `BoardSettingsModal` implements manual backdrop-click detection
  (`event.target === dialogRef.current` check) to add it.
  - **Flag for hand-review**: decide whether outside-click dismissal should be
    added (standard modal-UX expectation) or whether ESC + explicit-close-only
    is the intentional pattern for this app. Until decided, do not assume
    outside-click works when writing new UI or E2E tests. (ESC is now
    confirmed reliable and safe to assume.)
- **Observed implementation gap** (not a UX rule, flag for hand-review / UAT
  accessibility pass): neither modal has a `role="dialog"` / `role="alertdialog"`
  nor an `aria-modal` attribute in the live DOM — confirmed via
  `document.querySelector('[role="dialog"],[role="alertdialog"]')` and
  `document.querySelector('[aria-modal]')`, both returning `null`/`undefined`
  for `CardDetailModal` and the Board Settings modal alike. This is a
  **cross-cutting** implementation gap (affects at least two modal components,
  not a one-off), likely an accessibility defect rather than an intentional
  pattern — do not codify "no dialog role" as the house style.

## Card Activity Feed (CardDetailModal) — newly observed this walk

<!-- This is a new authoritative section: the previous walk could not reach this
     feature due to a stale dev server; this re-run confirmed the dev server was
     serving the current worktree and observed the feature directly. -->

- **Trigger**: clicking a card's title (a `<button>`, not a plain heading — the
  title element in the live DOM is interactive: `onClick` opens the modal)
  opens `CardDetailModal`. Confirmed on `frontend/src/components/board/KanbanCard/KanbanCard.tsx`
  behavior matching source.
- **Structure observed**: modal contains a card-title `<h2>`-equivalent heading,
  a close button (`aria-label="Close card details"`), and a visible
  `<h3>Activity</h3>` section heading followed by a `<ul>`/`list` of activity
  entries.
- **Empty state**: the literal string **"No activity yet."** was confirmed
  present in the live DOM (via `document.body` text scan) as the app's
  empty-activity copy — consistent with the orchestrator's expectation.
  However, the specific card this walker created and observed already had at
  least one event (`card.created`) by the time the modal was opened, so the
  empty state itself was not visually exercised on a truly-zero-event card in
  this run; treat the "No activity yet." string as confirmed-to-exist but not
  confirmed-to-render-correctly-in-isolation. Recommend a follow-up walk (or
  hand-check) that opens the modal on a card in the same render pass as its
  creation, before any move, to see the empty state render live.
- **`card.created` entry format** (observed): "`<Display Name> created this
  card`" + a separately-rendered formatted timestamp (e.g., "7/2/2026, 3:17:11
  PM" — locale datetime string, not relative time).
- **`card.moved` entry format — OBSERVED BUG, not a pattern to emulate**: after
  moving the test card from "To Do" to "In Progress" via keyboard drag-and-drop
  (space to pick up, arrow key to move, space to drop — the app's documented
  keyboard DnD interaction per its own on-page instructions), the activity
  entry read exactly:

  > "Joe Smith moved this card from a column to a column"

  This is **not** the expected "X moved this card from Y to Z" format with real
  column names — both column-name slots rendered the literal placeholder-like
  text "a column" instead of "To Do" / "In Progress". This is almost certainly
  a bug (e.g., a message-template interpolation failure or a missing
  column-name lookup on the moved-event path) rather than an intentional UX
  choice, since the `card.created` entry on the same list correctly names the
  actor. **Flag this as a defect for the team** — do not treat "a column" as
  house style for future event-message copy.
- **Persistence confirmed**: closed the modal, reloaded the full page
  (hard navigation, not SPA route change), reopened the modal on the same card
  — the identical two activity entries (create + move, including the "a
  column" text) reappeared with the same timestamps. This confirms activity
  history is **re-fetched from the server** on modal open, not served from an
  in-memory/session-only cache — matches the orchestrator's persistence check.
- **Toast/notification note**: no toast appeared for the card move or card
  creation — consistent with the app's existing no-toast pattern (see Toasts &
  Banners below); the Activity list inside `CardDetailModal` plus the
  board-level Activity sidebar are the only "something happened" feedback
  mechanisms observed.

## Drawer vs Modal

### Rule: Side drawer for contextual detail/inspector panels (≥ 768px)
<!-- TODO: hand-author after verifying with the team -->
- **Observed this walk**: `CardDetailModal` is a **centered modal**, not a side
  drawer, despite functioning as a card detail/inspector panel (title, activity
  history). Under a strict reading of this rule, a card-detail inspector might
  be expected to use a side drawer so the board list remains visible behind it;
  the live implementation instead uses a centered overlay that obscures the
  board. Flag for hand-review: decide whether `CardDetailModal` should migrate
  to a drawer, or whether this rule's scope should explicitly exclude
  card-detail modals (e.g., reserving drawers for wider inspector content).
  Board Settings also uses a **centered modal**, not a side drawer, for its
  config panel — same open question applies there.

## Tabs vs Sections

### Rule: Tabs for switching between mutually exclusive views of the same resource
- **Observed**: Board Settings currently exposes exactly one tab ("Automation").
  Its DOM does not use the ARIA tabs pattern in a way that changes this walk's
  prior conclusion — confirmed again this run via a `tab`/`tabpanel` reading:
  a single `tab "Automation"` element and one `tabpanel` were present. With
  only one tab, there isn't yet a second view to confirm real tab-switching
  behavior or ARIA conformance (`aria-selected`, roving tabindex, etc.) —
  revisit when a second tab is added.

### Rule: Sections (accordion or sectioned scroll) for viewing all related info at once
- **Observed, matches rule**: within the single "Automation" tab, **Rules** and
  **Delivery History** are stacked as scrollable sections in one panel, not
  split into separate tabs. Confirmed again this run. This is correct usage per
  this rule — two views a user reviews together (create a rule, then check its
  delivery history) belong in one scroll, not tab-switched.

## Forms

### Layout
- **Observed**: card-creation form is a **single-column, single-field inline
  form** embedded at the bottom of each column list (title input + "Add card"
  button) — not a modal or drawer form. Confirmed present in every column,
  including columns with existing cards. The compose box is always visible in
  the empty state, effectively serving as the empty state's call-to-action (see
  Empty States below).
- Required indicator: not observed — no fields in the flows walked showed a
  visible required-field marker (`*` or otherwise).
  <!-- TODO: hand-author explicit required-field convention with the team -->
- Field heights: `see techContext.md → Design Tokens (verify this section exists)`
  — no design-tokens section was found in the current `techContext.md`; this is
  a reference placeholder, not a confirmed cross-reference.

### Validation
<!-- TODO: hand-author after verifying with the team -->
- Not exercised this walk (card creation was tested with valid non-empty
  titles only; empty-title submit behavior and login-form validation were not
  driven this run, consistent with the walker's rule against submitting forms
  with autofilled/real credentials).

### Errors
<!-- TODO: hand-author after verifying with the team -->
- `ErrorBanner` component exists and is documented in `systemPatterns.md` →
  "Error Display Pattern (Frontend)" (`role="alert"`, controlled/uncontrolled
  dismiss) — see that document for the component contract. This walk did not
  trigger a live server-error banner to confirm on-page placement; verify by hand.

## Empty States

### Rule: Always provide an empty-state view with one primary CTA
- **Observed, matches rule**: empty "To Do" / "In Progress" columns show gray
  "No cards yet" text directly above an always-visible inline "Card title…" +
  "Add card" compose form — the compose form itself is the primary CTA (no
  separate empty-state illustration or button). Re-confirmed this walk after
  deleting the test card (all four columns showed "No cards yet" simultaneously
  when the filter also had no matches — see below).
- **Observed, does NOT clearly match rule**: filtering the board to zero results
  (via the "Filter cards…" box, tested with a nonsense query) reuses the
  **identical** "No cards yet" copy as the true-empty state — re-confirmed this
  walk. There is no distinct "no cards match your filter" message, and the
  inline compose form remains visible/actionable even though the emptiness is
  filter-induced, not literal. Flag for hand-review — team should decide
  whether filtered-empty deserves distinct copy (e.g., "No cards match
  \"<query>\"" + a "Clear filter" affordance) instead of reusing the
  zero-cards message.
- **Observed gap, not a pattern to emulate**: navigating to a syntactically-valid
  but nonexistent board route (`/boards/<bad-id>`) renders a **blank page**
  (only the app header "BanyanBoard" / "Sign out" render; no board content, no
  error, no CTA) — re-confirmed this walk with a fresh nonexistent UUID. This is
  inconsistent with the true 404 route (`/nonexistent-path`), which **does**
  render a proper `NotFoundPage` (heading "Not Found" + explanatory text +
  "Back to boards" link) — also re-confirmed this walk. Flag as a TODO for the
  team: either surface the same not-found treatment for an invalid/deleted
  board ID, or route it through `NotFoundPage`.
- **New this walk — Activity empty state**: the literal copy **"No activity
  yet."** exists for a card with zero events (see Card Activity Feed section
  above) — matches this rule's spirit (a clear empty-state message), though no
  CTA is expected or needed for a read-only activity log.

## Toasts & Banners

### Rule: Toast top-right, auto-dismiss after [duration]
- **Not observed, re-confirmed this walk.** No toast notification appeared
  anywhere in this walk, including after card creation, card move (both column
  drag and the resulting activity-log entry), and card deletion. Instead, the
  **Activity sidebar** (persistent, collapsible right panel) and, as of this
  walk, the per-card **Activity** history inside `CardDetailModal` are the
  app's only mechanisms for surfacing "something just happened" feedback. **This
  app currently has no toast pattern at all** — do not assume one exists when
  writing new UI; either use the existing Activity-feed/Activity-history
  convention, or make a deliberate product decision to introduce toasts and
  update this file accordingly.
  <!-- TODO: hand-author the toast rule (or formally retire it) after this is discussed with the team -->

### Rule: Banner full-width, persistent until dismissed, only for page-wide state
<!-- TODO: hand-author after verifying with the team -->
- Not exercised this walk (no page-wide banner state was triggered).

## Loading States

<!-- TODO: hand-author after verifying with the team -->
- Not clearly observed — all pages walked loaded fast enough (localhost, warm
  cache) that no skeleton/spinner state was visually confirmable this run
  either. `PrivateRoute` is documented in `systemPatterns.md` →
  "PrivateRoute: 4-State Guard" as rendering a `LoadingSpinner` during the
  session check; a brief "Loading..." status text was observed transiently
  during board-page navigation (caught via an accessibility-tree read that
  reported only a loading indicator), consistent with that documented guard,
  but the walker did not capture enough detail to confirm skeleton-vs-spinner
  visual treatment. Verify by hand, e.g. by throttling the network.

## Mobile Adaptation

Out of scope for this v1.8 desktop-only live walk. The UAT walker's mobile
section (`memory-bank/uat-config.md` → Viewports → `mobile` 375×667) is
responsible for observing and validating mobile-breakpoint behavior.

### Breakpoint: `see techContext.md → Design Tokens (verify this section exists)`
### Rule: Tables → card list on mobile
<!-- TODO: hand-author after verifying with the team -->
### Rule: Multi-column forms → single column
<!-- TODO: hand-author after verifying with the team — all forms observed this walk were already single-column even on desktop -->
### Rule: Right-side inspectors → bottom drawers
<!-- TODO: hand-author after verifying with the team — no inspector panel was found to observe; note CardDetailModal is itself a centered modal, not a side inspector, on desktop (see Drawer vs Modal above) -->

## Tokens

> Tokens (color, spacing, typography) are NOT defined here. Reference the canonical source.
>
> - Color: `see techContext.md → Design Tokens (verify this section exists)` — no
>   dedicated design-tokens section was found in the current `techContext.md`;
>   card color-badge values (e.g. the green `#d4edda` Done-color) are documented
>   as an *implementation detail* in `systemPatterns.md` → "Optimistic Done-Color
>   Cross-Slice Cache Pattern", not as a reusable design token — flag this gap
>   for the team rather than treating it as the token source of truth.
> - Spacing: `see techContext.md → Design Tokens (verify this section exists)`
> - Typography: `see techContext.md → Design Tokens (verify this section exists)`

---

## Conflicts Requiring Resolution

<!--
  Populated by /banyan-ux-ingest when sources disagree (v1.9 multi-source ingest).
  Hand-authored files start with this section empty.

  Example:
  ### CONFLICT: Confirmation dialog type
  - Storybook: `Dialog`
  - Live-walk: `AlertDialog` on destructive actions
  - Design doc: silent
  - Human decision: <empty until resolved>
-->

### RESOLVED: Modal ESC/outside-click dismissal
- **History**: Run 1 (2026-07-02, stale dev server) claimed ESC "confirmed"
  working. Run 2 (2026-07-02, correct dev server, UX-walker automation)
  claimed ESC did NOT work for either modal. These two automated observations
  directly contradicted each other.
- **Resolution (2026-07-02, manual verification via direct Claude-in-Chrome
  session, not the UX-walker subagent)**: Opened `CardDetailModal` on the live
  app, confirmed `document.querySelector('dialog').open === true`, pressed a
  real `Escape` keystroke, and confirmed `.open` flipped to `false`
  immediately. **ESC reliably closes the modal** — this is native
  `<dialog>.showModal()` browser behavior requiring no application code, so
  there was never actually a code path that could regress between runs.
  Outside-click was separately confirmed to leave `.open === true` (does NOT
  close) — no manual backdrop-click handler exists in either modal component.
- **Root cause of the false negative**: the UX-walker agent's `Escape`
  keypress in Run 2 most likely did not register as a native/trusted key
  event in that automation path — a tooling artifact, not a real regression
  or environment difference. Direct `computer` tool keypresses (as used in
  this manual verification) do register correctly.
- **Human decision**: RESOLVED — ESC-to-close is confirmed working and safe to
  rely on / test against. Outside-click-to-close is confirmed NOT implemented;
  remains an open product decision (see "Modals close on ESC, NOT on
  outside-click" above) whether to add it, not a bug to fix blindly.
- **Process note for future UX/UAT walks**: when a walker reports a keyboard-
  dismissal finding, prefer verifying via a direct DOM state check
  (`dialog.open` before/after) over trusting the walker's own screenshot-based
  before/after comparison — this run shows the two can disagree.
