# Architecture Decision: Frontend Component Architecture

**Created**: 2026-06-16
**Status**: DECIDED
**Decision Type**: Architecture (Frontend code organization)
**Task**: TASK-009 — React Frontend Scaffold (FEAT-005)

## Context

This decision establishes the folder structure, naming conventions, and shared-component
patterns for the BanyanBoard React + TypeScript frontend. It is foundational: every future
feature (starting with FEAT-006 User Authentication) will follow the convention set here.

The project is an MVP for a self-hosted kanban tool aimed at small teams (2–20 users). The
backend already follows a disciplined 3-layer clean architecture (routes → services →
repositories) that "favors simplicity over clever abstractions" (productBrief.md, techContext.md).
The frontend should mirror that discipline: **structured and predictable, but not over-engineered.**

### System Requirements

- House the 9 MVP components: `BoardListPage`, `BoardPage`, `KanbanBoard`, `KanbanColumn`,
  `KanbanCard`, `CreateCardForm`, `ErrorBanner`, `LoadingSpinner`, `NotFoundPage`.
- Support React Router v6 routes: `/` → `BoardListPage`, `/boards/:boardId` → `BoardPage`,
  `*` → `NotFoundPage`.
- Co-exist with a typed API client (`src/api/`) and domain types (`src/types/`) — already
  sketched in techContext.md Component Structure.
- Support co-located unit tests (Vitest + React Testing Library), per the Test Strategy:
  `src/components/ComponentName/ComponentName.test.tsx`.
- Accommodate CSS Modules for scoped styling.
- Scale cleanly as FEAT-006+ add more pages, components, and domain areas (auth, card detail).

### Technical Constraints

- React 18 + TypeScript, Vite 5 build, React Router v6, dnd-kit, Vitest + RTL, CSS Modules.
- techContext.md already documents a **layer-based** sketch (`components/`, `pages/`, `hooks/`,
  `api/`). Deviating from it requires justification; aligning with it is the path of least surprise.
- Small team, MVP stage — onboarding speed and low ceremony matter more than maximal modularity.
- Must not hard-block future growth (i18n, more domains) but must not pre-build for scale that
  the productBrief explicitly rules out ("not hyper-scale").

### Non-Functional Requirements (from productBrief.md)

- **Maintainability**: clean architecture, simplicity-first; the convention must be easy to learn.
- **Accessibility**: WCAG 2.1 AA — favors a shared `components/` location for reusable accessible
  primitives (`ErrorBanner`, `LoadingSpinner`) so a11y is solved once and reused.
- **Performance**: initial load < 2s; structure must permit route-based code splitting later.
- **Testability**: co-located tests close to source (mirrors backend's co-location pattern in
  systemPatterns.md).

## Component Analysis

### Core Components

| Component | Type | Purpose | Responsibilities |
|-----------|------|---------|------------------|
| `BoardListPage` | Route page | Entry point | Fetch + render board list; empty state; inline "Create Board" form |
| `BoardPage` | Route page | Board view | Fetch board + cards; host dnd-kit `DndContext`; orchestrate optimistic move |
| `NotFoundPage` | Route page | 404 fallback | Render not-found message + link to `/` |
| `KanbanBoard` | Board feature | Column layout | Render ordered columns in a horizontal scroll container |
| `KanbanColumn` | Board feature | Droppable column | Render header + ordered card list; act as drop target |
| `KanbanCard` | Board feature | Draggable card | Render title/labels/due-date chip; draggable handle |
| `CreateCardForm` | Board feature | Card creation | Inline form at column bottom; title required, description optional |
| `ErrorBanner` | Shared UI | Error surface | Full-width dismissable banner for API errors (reused everywhere) |
| `LoadingSpinner` | Shared UI | Async state | Accessible spinner (reused everywhere) |

Two clear groupings emerge: **board-domain components** (KanbanBoard/Column/Card, CreateCardForm)
and **shared/generic UI** (ErrorBanner, LoadingSpinner). Pages compose both.

### Component Interactions

```
Router
 ├─ BoardListPage ── api.listBoards / createBoard ── ErrorBanner, LoadingSpinner
 ├─ BoardPage ───── api.getBoard / listCards / moveCard
 │    └─ DndContext
 │         └─ KanbanBoard
 │              └─ KanbanColumn (droppable)
 │                   ├─ KanbanCard (draggable)
 │                   └─ CreateCardForm
 └─ NotFoundPage
```

## Options Explored

### Option 1: Pure Layer-Based (`components/`, `pages/`, `hooks/`, `api/`, `types/`)

- **Description**: Organize strictly by technical role. All reusable components in
  `src/components/`, route components in `src/pages/`, hooks in `src/hooks/`, etc. This is
  exactly the sketch already in techContext.md.
- **Structure**:
  ```
  src/
  ├── api/          # client.ts, boards.ts, cards.ts
  ├── components/   # KanbanBoard, KanbanColumn, KanbanCard, CreateCardForm,
  │                 #   ErrorBanner, LoadingSpinner (all flat)
  ├── pages/        # BoardListPage, BoardPage, NotFoundPage
  ├── hooks/
  ├── types/
  └── routes.tsx
  ```
- **Pros**:
  - Zero learning curve; matches techContext.md sketch exactly.
  - Trivial for a tiny app; everything findable by role.
- **Cons**:
  - `components/` becomes a dumping ground as features grow — board-specific and generic
    components blur together. By FEAT-007 (card detail) this folder is crowded.
  - No signal about which components belong to which domain; refactoring/deleting a feature
    means hunting across flat folders.
  - Doesn't communicate domain boundaries the way the backend's structure does.
- **Technical Fit**: High (matches existing sketch) — **Complexity**: Low — **Scalability**: Low–Medium

### Option 2: Pure Feature-Based (`features/board/`, `features/boardList/`)

- **Description**: Organize by domain feature. Each feature owns its components, hooks, types,
  and API calls. Generic primitives live in a small `shared/` or `ui/` folder.
- **Structure**:
  ```
  src/
  ├── features/
  │   ├── boardList/   # BoardListPage + CreateBoardForm + hooks + slice of api
  │   └── board/       # BoardPage, KanbanBoard, KanbanColumn, KanbanCard, CreateCardForm, dnd logic
  ├── shared/ui/       # ErrorBanner, LoadingSpinner
  ├── api/             # client + typed endpoint fns
  └── types/
  ```
- **Pros**:
  - Excellent domain cohesion and scalability; deleting/refactoring a feature is localized.
  - Mirrors the backend's module-orientation philosophy.
- **Cons**:
  - Over-engineered for a 9-component MVP. Two pages (`BoardListPage`, `BoardPage`) and one
    real feature cluster (board) don't justify a full `features/` taxonomy yet.
  - Ambiguity for tiny features: is `boardList` a "feature" or just a page? Forces premature
    boundary decisions.
  - Diverges from the techContext.md sketch without proportional payoff at MVP scale.
- **Technical Fit**: Medium — **Complexity**: Medium–High — **Scalability**: High

### Option 3: Hybrid — Layer-Based Base with Domain Sub-Grouping (RECOMMENDED)

- **Description**: Keep the familiar layer-based top level from techContext.md
  (`api/`, `components/`, `pages/`, `hooks/`, `types/`), but **sub-group** components by
  concern: `components/board/` for the kanban-domain cluster and `components/common/` for
  reusable primitives. Each component is a self-contained folder co-locating its `.tsx`,
  `.module.css`, and `.test.tsx`. Pages stay in `pages/`. This honors the existing sketch while
  preventing the flat-`components/` dumping ground, and gives a clear migration path toward
  `features/` only if/when the app actually outgrows it.
- **Structure**: see "Decision" section below for the full tree.
- **Pros**:
  - Backward-compatible with techContext.md (same top-level dirs) — minimal surprise.
  - Domain cohesion *where it matters* (`components/board/`) without forcing a `features/`
    taxonomy onto trivial pages.
  - Self-contained component folders co-locate styles + tests + the component, matching the
    Test Strategy path convention and the backend's test co-location ethos.
  - Clear, documented rule for "where does X go" that FEAT-006+ can follow mechanically.
  - Disciplined but not over-engineered — exactly the brief.
- **Cons**:
  - Slightly more nesting than pure flat layers (one extra folder level per component).
  - Requires a documented placement rule (provided below) to avoid drift.
- **Technical Fit**: High — **Complexity**: Low–Medium — **Scalability**: Medium–High

## Evaluation Matrix

| Criteria | Option 1 (Layer flat) | Option 2 (Feature) | Option 3 (Hybrid) |
|----------|-----------------------|--------------------|-------------------|
| Scalability | Low–Med | High | Med–High |
| Maintainability | Med | High | High |
| Onboarding / Simplicity | High | Med | High |
| Fit with existing techContext sketch | High | Low | High |
| Fit with backend discipline | Med | High | High |
| Over-engineering risk | Low | High | Low |
| Implementation Cost | Low | Med | Low |

## Observability Architecture

This is a client-side SPA scaffold, not a backend service, so the OpenTelemetry SDK/tracing/
metrics stack from `observability-requirements.md` (which targets server-side services) does
**not** apply directly. The relevant observability concerns for the frontend are:

### Logging / Console Discipline
- **No `console.log` in committed code** — mirrors the backend rule in systemPatterns.md. A thin
  `src/lib/logger.ts` wrapper (gated on `import.meta.env.DEV`) is the only sanctioned console
  surface; ESLint `no-console` enforces this (allowing `warn`/`error` only).
- API errors surface to the user via `ErrorBanner` (not silent console logs).

### Trace Context Propagation
- The typed API client (`src/api/client.ts`) is the single outbound HTTP boundary. It is the
  designated place to inject a W3C `traceparent` header in a future observability iteration, so
  frontend→backend requests can be correlated with backend traces. Out of scope for this MVP
  scaffold but the single-client design keeps it a one-file change later.

### Configuration
- All runtime config via Vite env vars (`import.meta.env.VITE_*`), never hardcoded — 12-factor
  config-in-environment. `VITE_API_URL` is the only variable for MVP.

| Variable | Purpose | Default (dev) |
|----------|---------|---------------|
| `VITE_API_URL` | Backend base URL | `http://localhost:3000` |

## Decision

**Chosen**: Option 3 — Hybrid (Layer-based base with domain sub-grouping + self-contained
component folders).

### Chosen Directory Structure

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                 # path alias "@/" → src/; Vitest config
├── .eslintrc.cjs                  # no-console, react-hooks, import order
├── .prettierrc
├── .env.example                   # VITE_API_URL=http://localhost:3000
├── Dockerfile                     # multi-stage node build → nginx serve
├── nginx.conf                     # SPA fallback to index.html
└── src/
    ├── main.tsx                   # React root; mounts <RouterProvider>
    ├── App.tsx                    # top-level layout shell (header/outlet)
    ├── routes.tsx                 # React Router v6 route table
    ├── vite-env.d.ts              # typed import.meta.env (VITE_API_URL)
    │
    ├── api/                       # typed API client — single HTTP boundary
    │   ├── client.ts              # fetch wrapper, ApiError, base-URL from env
    │   ├── boards.ts              # listBoards/getBoard/createBoard/deleteBoard
    │   ├── cards.ts               # listCards/createCard/getCard/updateCard/deleteCard/moveCard
    │   └── __tests__/
    │       ├── client.test.ts
    │       └── boards.test.ts
    │
    ├── types/                     # shared domain types (cross-component)
    │   └── index.ts               # Board, Column, Card, BoardWithColumns, PaginatedResponse
    │
    ├── hooks/                     # cross-cutting reusable hooks (grow as needed)
    │   └── .gitkeep
    │
    ├── lib/                       # small framework-agnostic utilities
    │   └── logger.ts              # DEV-gated console wrapper (no-console elsewhere)
    │
    ├── pages/                     # route-level components (one folder each)
    │   ├── BoardListPage/
    │   │   ├── BoardListPage.tsx
    │   │   ├── BoardListPage.module.css
    │   │   └── BoardListPage.test.tsx
    │   ├── BoardPage/
    │   │   ├── BoardPage.tsx       # hosts dnd-kit DndContext + optimistic move
    │   │   ├── BoardPage.module.css
    │   │   └── BoardPage.test.tsx
    │   └── NotFoundPage/
    │       ├── NotFoundPage.tsx
    │       ├── NotFoundPage.module.css
    │       └── NotFoundPage.test.tsx
    │
    └── components/
        ├── board/                 # board-domain component cluster
        │   ├── KanbanBoard/
        │   │   ├── KanbanBoard.tsx
        │   │   ├── KanbanBoard.module.css
        │   │   └── KanbanBoard.test.tsx
        │   ├── KanbanColumn/
        │   │   ├── KanbanColumn.tsx
        │   │   ├── KanbanColumn.module.css
        │   │   └── KanbanColumn.test.tsx
        │   ├── KanbanCard/
        │   │   ├── KanbanCard.tsx
        │   │   ├── KanbanCard.module.css
        │   │   └── KanbanCard.test.tsx
        │   └── CreateCardForm/
        │       ├── CreateCardForm.tsx
        │       ├── CreateCardForm.module.css
        │       └── CreateCardForm.test.tsx
        └── common/                # generic reusable UI primitives
            ├── ErrorBanner/
            │   ├── ErrorBanner.tsx
            │   ├── ErrorBanner.module.css
            │   └── ErrorBanner.test.tsx
            └── LoadingSpinner/
                ├── LoadingSpinner.tsx
                ├── LoadingSpinner.module.css
                └── LoadingSpinner.test.tsx
```

All 9 MVP components are placed: 3 pages in `pages/`, 4 board-domain components in
`components/board/`, 2 shared primitives in `components/common/`.

### Sub-Decisions

1. **Feature vs Layer** → **Hybrid (layer base, domain sub-grouping)**. Pure layer (Option 1)
   risks a flat-`components/` dump; pure feature (Option 2) is over-engineered for 9 components.
   The hybrid keeps techContext.md's top-level dirs while introducing `components/board/` and
   `components/common/` to express the one real domain cluster.

2. **Barrel exports (`index.ts`) vs explicit imports** → **Explicit imports, NO barrels.**
   Barrel files (`index.ts` re-exports) are a known cause of Vite/Vitest circular-import
   surprises and they defeat tree-shaking clarity. With the `@/` path alias, explicit imports
   (`import { KanbanCard } from '@/components/board/KanbanCard/KanbanCard'`) are clear and
   refactor-safe. This matches the backend's "no extra indirection layer" ethos
   (systemPatterns.md domain-type-placement note). Revisit only if import paths become noisy at
   much larger scale.

3. **Co-location of styles/tests/types vs separate top-level dirs** → **Co-locate styles AND
   tests inside each component folder; keep cross-cutting types in `src/types/`.**
   - Component-local CSS Module (`X.module.css`) and test (`X.test.tsx`) live beside `X.tsx` —
     matches the Test Strategy path (`src/components/.../ComponentName.test.tsx`) and the
     backend's test co-location pattern (systemPatterns.md).
   - **Component-local types** (props interfaces) stay in the component file. **Shared domain
     types** (Board/Column/Card, used across components and the API client) live in
     `src/types/index.ts` — the frontend analogue of the backend's "shared type → dedicated file"
     rule. This avoids circular deps between components and the API client.

4. **Storybook → LATER (not now).** Storybook adds meaningful build/config/maintenance weight.
   For a 9-component MVP with co-located RTL tests already covering rendering, Storybook is
   premature. The self-contained component-folder structure makes adding Storybook later trivial
   (one `.stories.tsx` per folder). Defer until the shared `components/common/` library grows
   enough to warrant a visual catalog (revisit around FEAT-007+).

### Rationale

Option 3 is the only option that simultaneously: (a) stays compatible with the structure already
documented in techContext.md (low surprise, low migration cost), (b) prevents the flat-folder
decay that Option 1 suffers as features accumulate, and (c) avoids the premature `features/`
ceremony of Option 2 that the 9-component MVP cannot justify. It mirrors the backend's discipline
— clear boundaries, co-located tests, shared types in a dedicated file, no needless indirection —
without over-engineering. The placement rule below is mechanical enough that FEAT-006 (auth) and
later features can extend it without re-litigating structure.

### Trade-offs Accepted

- **One extra nesting level per component** (folder-per-component). Accepted: it buys
  style+test co-location and makes each component a self-contained, deletable unit. Worth it.
- **`components/board/` is a sub-grouping, not a true `features/` module** (API calls and pages
  still live outside it). Accepted: at MVP scale this is simpler; if the app grows to many
  domains, migrating `components/board/` + its page into `features/board/` is a contained,
  well-signposted refactor.
- **No barrels means slightly longer import paths.** Accepted: the `@/` alias keeps them
  readable and we avoid circular-import and tree-shaking pitfalls.

## Implementation Guidelines

1. **Placement rule (document in techContext.md / a frontend README):**
   - Route-level component (mounted by router) → `src/pages/<Name>/`.
   - Component used only by the board domain → `src/components/board/<Name>/`.
   - Generic, reusable-across-domains primitive → `src/components/common/<Name>/`.
   - Shared domain type (used by 2+ components or the API client) → `src/types/index.ts`.
     Props-only types stay in the component file.
   - Cross-cutting hook → `src/hooks/`. Domain-specific hook → next to its consuming component
     or domain folder.
2. **Each component is a folder** containing `<Name>.tsx`, `<Name>.module.css` (if it has styles),
   and `<Name>.test.tsx`. No barrel `index.ts`.
3. **Configure the `@/` path alias** in `vite.config.ts` and `tsconfig.json`; import via
   `@/components/...`, `@/api/...`, `@/types`.
4. **ESLint `no-console`** (allow `warn`/`error`); all dev logging goes through `src/lib/logger.ts`.
5. **API client is the single HTTP boundary** (`src/api/`); components never call `fetch`
   directly — this keeps trace-context injection and error normalization in one place.
6. **CSS Modules only** for component styling (no global CSS beyond a minimal `App`-level reset);
   keep labels accessible (color is not the only signal — WCAG 2.1 AA).
7. When FEAT-006 (auth) lands: add `src/pages/LoginPage/`, auth primitives under
   `components/common/` (or a new `components/auth/` cluster if it grows), and an `api/auth.ts` —
   following the same placement rule. Promote to `features/` only if a domain accumulates its own
   pages + components + hooks + API slice.

## Validation Checklist

- [x] Meets all system requirements (all 9 components placed; routes, API client, types, tests fit)
- [x] Respects technical constraints (Vite, React 18, RR v6, CSS Modules, Vitest co-located tests)
- [x] Addresses non-functional requirements (maintainability, a11y via shared primitives, testability, code-split-ready)
- [x] Technically feasible (standard Vite/React layout; `@/` alias is trivial config)
- [x] Risks identified and acceptable (see Risk Assessment)
- [x] Complies with Guiding Principles in systemPatterns.md (simplicity-first, test co-location, shared-type-in-dedicated-file, no needless indirection); frontend OTel deviation documented in Observability section (server-side SDK N/A to SPA)
- [x] Respects established patterns (mirrors backend discipline; aligns with techContext.md top-level dirs)
- [x] Observability addressed (no-console rule, single HTTP boundary for future traceparent, env-based config)
- [x] Trace context propagation: single API client designated as future injection point (out of MVP scope, documented)
- [x] Logging strategy consistent (no-console rule mirrors backend; DEV-gated logger wrapper)
- [x] Config strategy follows 12-factor (Vite env vars, no hardcoded URLs)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Structure drifts (devs dump into wrong folder) | Medium | Medium | Document the mechanical placement rule in techContext.md; enforce in code review; ESLint import-order rules |
| `components/board/` sub-grouping outgrown by many domains | Low | Medium | Documented migration path to `features/` is a contained refactor |
| Co-located tests bloat component folders visually | Low | Low | Acceptable; matches Test Strategy and backend co-location ethos |
| Choosing no-barrels causes verbose imports | Low | Low | `@/` path alias keeps imports readable; avoids circular-import/tree-shaking pitfalls |
| Deferring Storybook leaves no visual component catalog | Low | Low | Self-contained folders make adding `.stories.tsx` later trivial; revisit FEAT-007+ |

## Next Steps

1. Phase 1 scaffold: create the directory tree above; configure `@/` alias, ESLint `no-console`,
   Prettier, Vitest in `vite.config.ts`.
2. Implement `src/types/index.ts` (domain types) and `src/api/` (client + boards + cards) per the
   API Client Contract — coordinate the internal implementation with Creative 2 (API Client Design).
3. Build out pages and components into the folders defined here across Phases 2–4.
4. Update techContext.md Component Structure to reflect this hybrid layout and add the placement
   rule (the Document subagent should do this during build).

ARCHITECTURE CREATIVE COMPLETE
Document: memory-bank/creative/TASK-009-component-architecture.md
Decision: Hybrid layer-based structure (api/, types/, pages/, components/{board,common}/) with self-contained folder-per-component co-locating styles+tests, explicit imports (no barrels), shared domain types in src/types/, and Storybook deferred.
