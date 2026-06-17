# TASK-009: React Frontend Scaffold

**Complexity**: Level 3 (inherited from FEAT-005)
**Status**: PLANNING_COMPLETE
**Roadmap**: FEAT-005
**Branch**: feature/FEAT-005-react-frontend-scaffold
**Worktree**: .claude-worktrees/FEAT-005

## Task Description

Set up the React + TypeScript frontend. Includes Vite build tooling, component architecture decisions (folder structure, routing), typed API client (fetch wrappers with error handling), board view with kanban columns, card drag-and-drop (dnd-kit), and Docker Compose integration (frontend service with hot reload in dev). This establishes the UI patterns all future features follow.

## Specification

### Overview

Greenfield React + TypeScript frontend for BanyanBoard. Establishes the UI foundation all future features will extend. The MVP delivers the primary user flow end-to-end: browse boards → open a board → scan kanban columns → drag cards between columns. No authentication (FEAT-006 covers that).

### Technology Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Build tool | Vite 5 | Fast HMR, native ESM, stated in feature description |
| UI framework | React 18 + TypeScript | Project mandate |
| Routing | React Router v6 | Industry standard SPA routing |
| Drag-and-drop | dnd-kit | Stated in feature description; accessible, modular |
| Styling | CSS Modules | Zero-dependency, scoped, good TS support; *flag for creative review if team prefers Tailwind/styled-components* |
| API layer | **FLAG for creative review** — typed fetch wrappers vs React Query vs SWR (see Creative Phases) |
| Testing | Vitest + React Testing Library | Vite-native, mirrors Jest API |
| Linting | ESLint + Prettier (inherit from root config if present) | Consistency |

### Configuration

All runtime config via Vite env vars (12-factor):

| Variable | Purpose | Default (dev) |
|----------|---------|---------------|
| `VITE_API_URL` | Backend base URL | `http://localhost:3000` |

Accessed in code as `import.meta.env.VITE_API_URL`. Never hardcoded.

### Routing

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `BoardListPage` | Lists all boards; entry point |
| `/boards/:boardId` | `BoardPage` | Shows board with kanban columns and cards |
| `*` | `NotFoundPage` | 404 fallback |

### Domain Types (TypeScript)

```typescript
interface Board {
  id: string;
  name: string;
  created_at: string;
}

interface Column {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

interface Card {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  labels: string[];
  position: number;
  created_at: string;
  updated_at: string;
}

interface BoardWithColumns extends Board {
  columns: Column[];
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
```

### API Client Contract

The API client must:
- Read base URL from `VITE_API_URL`
- Throw typed `ApiError` (with `status: number`, `message: string`) on non-2xx responses
- Expose strongly-typed functions mapping 1:1 with backend endpoints

Minimum required functions:
```typescript
listBoards(): Promise<PaginatedResponse<Board>>
getBoard(boardId: string): Promise<BoardWithColumns>
createBoard(name: string): Promise<Board>
deleteBoard(boardId: string): Promise<void>
listCards(columnId: string): Promise<Card[]>
createCard(columnId: string, data: { title: string; description?: string }): Promise<Card>
getCard(cardId: string): Promise<Card>
updateCard(cardId: string, data: Partial<Pick<Card, 'title' | 'description' | 'due_date' | 'labels'>>): Promise<Card>
deleteCard(cardId: string): Promise<void>
moveCard(cardId: string, data: { column_id: string; after_card_id?: string }): Promise<Card>
```

*The internal implementation of these functions (raw fetch vs React Query vs SWR) is a creative-phase decision.*

### UI Components (MVP scope)

| Component | Responsibility |
|-----------|---------------|
| `BoardListPage` | Fetch and render board list; "Create Board" form inline or modal |
| `BoardPage` | Fetch board + all column cards; orchestrate drag-and-drop context |
| `KanbanBoard` | Renders ordered columns side-by-side in a horizontal scroll container |
| `KanbanColumn` | Renders column header + ordered card list; droppable target |
| `KanbanCard` | Renders card title, labels, due date chip; draggable handle |
| `CreateCardForm` | Inline form at bottom of a column; title required, description optional |
| `ErrorBanner` | Full-width dismissable banner for API errors |
| `LoadingSpinner` | Accessible spinner for async states |
| `NotFoundPage` | 404 with link back to `/` |

*Folder structure and naming conventions are a creative-phase decision.*

### Drag-and-Drop Behaviour

On drag end:
1. Validate the card moved to a different column OR different position within same column (no-op if same slot).
2. **Optimistic update**: immediately update local state to show card in new position.
3. Call `moveCard(cardId, { column_id, after_card_id? })` where `after_card_id` is the card immediately above the drop target (or omitted if dropped first).
4. On API error: revert optimistic state and display `ErrorBanner` with message.

*Optimistic UI integration with whichever state management approach is chosen is a creative-phase decision.*

### Docker Compose Integration

Add a `frontend` service to the project root `docker-compose.yml` (or `docker-compose.dev.yml`):
- Image: `node:20-alpine` running `vite dev --host`
- Port: `5173:5173`
- Volume mount: `./frontend:/app` for hot reload
- Env: `VITE_API_URL=http://backend:3000` (service-to-service name)
- `depends_on: backend`

Production build target (`frontend/Dockerfile`):
- Multi-stage: `node:20-alpine` build stage → `nginx:alpine` serve stage
- Serves static dist from `/usr/share/nginx/html`
- Nginx config rewrites all routes to `index.html` (SPA fallback)

### Acceptance Criteria

**AC-1 — App renders without error**
- Given the dev server is running (`npm run dev` inside `frontend/`)
- When I open `http://localhost:5173` in Chrome, Firefox, Safari, or Edge latest
- Then the page loads without a white screen or unhandled console error within 2 seconds

**AC-2 — Board list displays**
- Given at least one board exists in the backend
- When I open `/`
- Then I see a list of board names, each as a clickable link to `/boards/:id`

**AC-3 — Empty board list state**
- Given no boards exist
- When I open `/`
- Then I see a non-empty empty-state message (e.g., "No boards yet") and a "Create Board" affordance

**AC-4 — Create board**
- Given I am on `/`
- When I enter a board name and submit the create form
- Then the new board appears in the list without a full page reload, and the backend `POST /boards` was called

**AC-5 — Board view displays columns and cards**
- Given a board with columns and at least one card exists
- When I navigate to `/boards/:id`
- Then I see columns rendered left-to-right in position order, each containing its cards in position order

**AC-6 — Create card**
- Given I am on a board view
- When I type a title in the inline create form at the bottom of a column and submit
- Then the card appears at the bottom of that column without a page reload, and `POST /columns/:columnId/cards` was called

**AC-7 — Drag card to another column**
- Given a board with at least two columns each containing at least one card
- When I drag a card from Column A and drop it onto Column B
- Then the card moves to Column B optimistically, `PATCH /cards/:id/move` is called with the correct `column_id`, and the card remains in Column B after the API resolves

**AC-8 — Drag-and-drop revert on API error**
- Given the API is unreachable or returns 5xx for `PATCH /cards/:id/move`
- When I drag a card to another column
- Then the card reverts to its original column, and an error message is displayed to the user

**AC-9 — API error banner on board load failure**
- Given the backend is unavailable
- When I navigate to `/boards/:id`
- Then I see an error message explaining the board could not be loaded (not a blank screen)

**AC-10 — Keyboard navigation basics**
- Given I am on `/`
- When I navigate using Tab and Enter only
- Then I can reach and activate every board link and the "Create Board" form submit button (WCAG 2.1 AA baseline)

**AC-11 — 404 route**
- Given I navigate to a path that does not exist (e.g., `/foo/bar`)
- When the page renders
- Then I see a "Not Found" message with a link back to `/`

**AC-12 — Docker Compose hot reload**
- Given I run `docker compose up` from the project root
- When I edit a frontend source file
- Then the change is reflected in the browser without restarting the container (Vite HMR via volume mount)

### Out of Scope (MVP)

- Authentication / protected routes (FEAT-006)
- Editing card details beyond title (FEAT-007+)
- Real-time updates / WebSocket (explicitly excluded from constraints)
- Dark mode / theming
- Column creation/deletion from UI (columns are seeded via backend)
- Mobile layout (tablet responsive is required; mobile is not)

---

## Test Strategy

### Unit Tests (Vitest + React Testing Library)

Test co-located with source: `src/components/ComponentName/ComponentName.test.tsx`

| Area | What to test |
|------|-------------|
| API client | Each function: correct URL construction, correct request body, `ApiError` thrown on non-2xx, typed response returned on 2xx — use `msw` (Mock Service Worker) or simple fetch mocks |
| `KanbanCard` | Renders title, labels, due date; accessible role |
| `KanbanColumn` | Renders header name, renders child cards in order |
| `BoardListPage` | Shows board links when API returns data; shows empty state when empty; shows error banner on API failure |
| `BoardPage` | Shows loading state; shows board columns after load; shows error banner on load failure |
| `CreateCardForm` | Calls create callback on submit; clears input after submit; shows validation error when title is blank |
| Drag-and-drop | Move handler calls `moveCard` with correct args; optimistic update applied; revert on error |

### Integration / Smoke Tests (Vitest)

- Full board render: mount `BoardPage` with a mocked API, assert columns and cards appear correctly
- Full drag-and-drop flow: mount `BoardPage`, simulate drag from column A to column B, assert API called and UI updated

### E2E Test Specification (to be generated by `/banyan-uat` PASS)

UAT will walk the primary flow (board list → board view → drag card → verify) and generate an E2E spec file at `frontend/e2e/board-flow.spec.ts` (Playwright or Cypress — chosen during creative phase).

---

## Implementation Roadmap

### Phase 1 — Project Scaffold & API Client ✅ COMPLETE
- [x] Init Vite + React + TypeScript project in `frontend/`
- [x] Configure ESLint, Prettier, path aliases
- [x] Implement domain types (`src/types/`)
- [x] Implement API client with all required functions
- [x] Unit test API client with fetch mocks / msw
- [x] Verify `VITE_API_URL` env var wiring

### Phase 2 — Board List Page
- Implement `BoardListPage` with list + empty state + create form
- Implement `ErrorBanner` and `LoadingSpinner`
- Unit tests for `BoardListPage`
- React Router wiring (`/` route)

### Phase 3 — Board View & Kanban Layout
- Implement `BoardPage`, `KanbanBoard`, `KanbanColumn`, `KanbanCard`
- Fetch board + all column cards (parallel fetch per column)
- Implement `CreateCardForm`
- React Router wiring (`/boards/:boardId` route)
- Unit tests for board view components

### Phase 4 — Drag-and-Drop
- Integrate dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`)
- Implement drag-and-drop context on `BoardPage`
- Optimistic update + `moveCard` API call + revert on error
- Unit and integration tests for drag-and-drop behaviour

### Phase 5 — Docker Compose & Production Build
- `frontend/Dockerfile` (multi-stage)
- Update `docker-compose.yml` with `frontend` service
- Smoke-test hot reload in Docker
- Verify production build serves correctly via nginx

---

## Creative Phases

The following design decisions require `/banyan-creative` exploration before Phase 1 begins. Each produces a decision record in `memory-bank/creative/TASK-009-*.md`.

### Creative 1 — Component Architecture ✅ COMPLETE
**Decision**: Hybrid layer-based structure — `src/components/board/` + `src/components/common/`, explicit imports with `@/` alias, CSS Modules + tests co-located per component, Storybook deferred.
**Output**: `memory-bank/creative/TASK-009-component-architecture.md`

**Question**: What folder structure, naming conventions, and shared-component patterns should govern the frontend codebase? This decision sets the standard all future features follow.

Options to evaluate:
- Feature-based (`src/features/board/`, `src/features/boardList/`) vs layer-based (`src/components/`, `src/pages/`, `src/hooks/`)
- Barrel exports (`index.ts`) vs explicit imports
- Co-location of styles, tests, and types vs separate top-level directories
- Storybook integration (now vs later)

Decision output: `memory-bank/creative/TASK-009-component-architecture.md`

### Creative 2 — API Client Design ✅ COMPLETE
**Decision**: React Query (TanStack Query v5) on a thin `request<T>()` transport core. Optimistic updates via `onMutate`/`setQueryData`/`onError` rollback lifecycle.
**Output**: `memory-bank/creative/TASK-009-api-client-design.md`

**Question**: Should the API layer use plain typed fetch wrappers, React Query, or SWR? This impacts caching, loading/error states, optimistic updates, and future real-time capability.

Options to evaluate:
- **Plain fetch wrappers + `useState`/`useEffect`**: minimal dependencies, full control, more boilerplate
- **React Query (TanStack Query v5)**: built-in caching, deduplication, background refetch, optimistic update helpers — adds ~13KB
- **SWR**: lighter (~4KB), simpler API, less feature-rich than React Query

Constraints: no auth yet (no token refresh complexity), no real-time (no WebSocket invalidation), tablet responsive (no SSR requirement).

Decision output: `memory-bank/creative/TASK-009-api-client-design.md`

### Creative 3 — Drag-and-Drop UX & Optimistic Update Integration ✅ COMPLETE
**Decision**: `@dnd-kit/sortable` preset (one `DndContext`, `SortableContext` per column, `useSortable` per card). Optimistic state in React Query cache only. `DragOverlay` floating clone. Dedicated accessible drag handle. `after_card_id` = card immediately above resting slot (null = top).
**Output**: `memory-bank/creative/TASK-009-dnd-optimistic-ux.md`

**Question**: How should dnd-kit integrate with the chosen state management pattern, particularly for optimistic updates and error reversion?

Options to evaluate:
- dnd-kit sortable preset vs custom sensors
- Where optimistic state lives: local component state vs query cache mutation (depends on Creative 2 outcome)
- Visual feedback during drag: overlay vs in-place ghost
- Drag handle vs full-card drag target (accessibility consideration)
- How `after_card_id` is derived from dnd-kit drop event

Constraint: This creative phase should be sequenced **after** Creative 2, as the optimistic update pattern depends on the API client choice.

Decision output: `memory-bank/creative/TASK-009-dnd-optimistic-ux.md`

---

## Execution State

**Build Status**: IDLE
**Current Build**: Phase 1: Project Scaffold & API Client (TASK-009) — COMPLETE
**Build Started**: 2026-06-16
**Phase Number**: 1 of 5 COMPLETE
**Is Multi-Phase**: YES
**Can Resume**: NO

### Current Build Step
**Step**: Step 11 - Phase Git Completion
**Status**: COMPLETE
**Completed**: 2026-06-16

### Completed Steps
- Creative 1 (Component Architecture): COMPLETE (2026-06-16) — Output: memory-bank/creative/TASK-009-component-architecture.md
- Creative 2 (API Client Design): COMPLETE (2026-06-16) — Output: memory-bank/creative/TASK-009-api-client-design.md
- Creative 3 (Drag-and-Drop UX): COMPLETE (2026-06-16) — Output: memory-bank/creative/TASK-009-dnd-optimistic-ux.md
- Step 0.5 Git Setup: COMPLETE (2026-06-16) — Worktree created at .claude-worktrees/FEAT-005
- Step 1 Read Task Context: COMPLETE (2026-06-16) — Phase 1 of 5 identified
- Step 2 Load Context: COMPLETE (2026-06-16) — Level 3 rules loaded
- Step 3 Test Writer: COMPLETE (2026-06-16) — 19 tests in src/api/__tests__/client.test.ts
- Step 4 Coding Agent: COMPLETE (2026-06-16) — src/types/index.ts, src/api/client.ts, src/api/endpoints.ts, src/api/queryKeys.ts
- Step 6 Test Execution: COMPLETE (2026-06-16) — 19/19 PASS
- Step 7 Integration Verification: COMPLETE (2026-06-16) — 19/19 tests PASS, build PASS, lint PASS
- Step 8 Code Review: COMPLETE (2026-06-16) — 6 fixes applied; strict: true, canonical imports, config split, cards.all anchor, ESLint v10 script
- Step 9 Documentation: COMPLETE (2026-06-16) — techContext.md + systemPatterns.md updated, inline comments added
- Step 10 Memory Bank: COMPLETE (2026-06-16) — Phase 1 marked complete, tasks.md updated
- Step 11 Git Commit: COMPLETE (2026-06-16) — Committed to feature/FEAT-005-react-frontend-scaffold

### Active Sub-Agents
(none)
