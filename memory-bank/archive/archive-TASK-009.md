# Archive: React Frontend Scaffold

## Metadata
- **Task ID**: TASK-009
- **Complexity**: Level 3
- **Started**: 2026-06-16
- **Completed**: 2026-06-17
- **Roadmap Link**: FEAT-005
- **Branch**: feature/FEAT-005-react-frontend-scaffold
- **Worktree**: .claude-worktrees/FEAT-005

## Summary

TASK-009 delivered the complete React + TypeScript frontend foundation for BanyanBoard: a fully functional kanban board application spanning board listing, board view with parallel column fetching, card creation, drag-and-drop with optimistic updates, and a production-ready Docker setup. All 12 acceptance criteria were met, 115 tests pass across 12 test files, and the production build compiles cleanly to 326 kB (gzipped: 103 kB JS + 1 kB CSS).

This task establishes the UI patterns all future FEAT-005+ features will extend. The architecture choices — hybrid component structure, React Query v5 on a thin transport core, dnd-kit sortable preset, CSS Modules — all held under implementation pressure and produced clean, maintainable code.

## Requirements

### Original Requirements
- React 18 + TypeScript with Vite 5 build tooling
- Board list page with create-board form (inline)
- Board page with kanban column layout and card display
- Drag-and-drop card moves between columns using dnd-kit
- Optimistic updates with rollback on API error
- `VITE_API_URL` env var for 12-factor config
- Multi-stage Dockerfile (node:20-alpine build → nginx:alpine serve)
- docker-compose.yml `frontend` service with hot-reload and named volume

### Success Criteria
- [✓] AC-1: App renders without error
- [✓] AC-2: Board list displays
- [✓] AC-3: Empty board list state
- [✓] AC-4: Create board (no full reload)
- [✓] AC-5: Board view displays columns and cards
- [✓] AC-6: Create card (no full reload)
- [✓] AC-7: Drag card to another column (optimistic)
- [✓] AC-8: Drag-and-drop revert on API error
- [✓] AC-9: API error banner on board load failure
- [✓] AC-10: Keyboard navigation basics (WCAG 2.1 AA)
- [✓] AC-11: 404 route
- [✓] AC-12: Docker Compose hot reload via volume mount

## Implementation

### Approach

Five build phases following the Banyan TDD workflow, preceded by three `/banyan-creative` sessions that front-loaded all key design decisions. The creative phases produced near-production-quality code sketches that were adopted with minimal changes — particularly Creative 3's `useMoveCard` hook and `onDragEnd` algorithm, which converted the highest-complexity piece into a specified algorithm the coding agent implemented correctly on the first attempt.

### Key Components

1. **Transport Core** (`src/api/client.ts`, `src/api/endpoints.ts`)
   - `request<T>()` — single HTTP boundary; all fetch calls go through here
   - `ApiError` — typed error class with `status` and `message`
   - Strongly-typed endpoint functions mapping 1:1 with backend routes

2. **React Query Layer** (`src/api/hooks.ts`, `src/api/queryKeys.ts`)
   - `useBoards`, `useBoard`, `useCards` — query hooks with 30s stale time
   - `useCreateBoard`, `useCreateCard` — mutation hooks with cache invalidation
   - `useMoveCard` — optimistic mutation: snapshots both source and destination column caches in `onMutate`, rewrites both atomically, restores both on error, invalidates both on settle

3. **Board List Page** (`src/components/board/BoardListPage/`)
   - Board listing with empty state ("No boards yet")
   - Inline create-board form with validation
   - `ErrorBanner` for API failure display

4. **Board View** (`src/components/board/BoardPage/`, `KanbanBoard/`, `KanbanColumn/`, `KanbanCard/`)
   - `BoardPage` orchestrates the dnd-kit `DndContext` and `DragOverlay`
   - Each `KanbanColumn` independently fetches its cards via `useCards` (parallel, per-column loading/error isolation)
   - `KanbanCard` exposes a dedicated `⠿` drag handle for keyboard operability
   - `CreateCardForm` with `<label>` + `<input>` pairing for WCAG 2.1 compliance

5. **Common Components** (`src/components/common/`)
   - `ErrorBanner` — dismissable API error display
   - `LoadingSpinner` — accessible spinner with `role="status"` aria label
   - `NotFoundPage` — 404 with link back to `/`

6. **Routing** (`src/App.tsx`)
   - React Router v6: `/` → `BoardListPage`, `/boards/:boardId` → `BoardPage`, `*` → `NotFoundPage`

7. **Docker Integration**
   - `frontend/Dockerfile` — multi-stage: node:20-alpine builds Vite assets, nginx:alpine serves them
   - `frontend/nginx.conf` — SPA fallback (`try_files`), 1y cache on assets, no-cache on `index.html`
   - `docker-compose.yml` — `frontend` service with `frontend_node_modules` named volume to prevent host shadow on Windows/macOS

### Design Decisions

**Creative 1 — Component Architecture**: Hybrid layer-based structure (`src/components/board/` + `src/components/common/`), explicit imports with `@/` alias, CSS Modules + tests co-located per component. Storybook deferred.

**Creative 2 — API Client Design**: React Query (TanStack Query v5) on a thin `request<T>()` transport core. Optimistic updates via `onMutate`/`setQueryData`/`onError` rollback lifecycle.

**Creative 3 — Drag-and-Drop UX**: `@dnd-kit/sortable` preset with one `DndContext` per board, `SortableContext` per column, `useSortable` per card. `DragOverlay` floating clone. Dedicated accessible drag handle. `after_card_id` = id of card immediately above the resting slot with the dragged card excluded from the destination list.

Reference: `memory-bank/creative/TASK-009-component-architecture.md`, `memory-bank/creative/TASK-009-api-client-design.md`, `memory-bank/creative/TASK-009-dnd-optimistic-ux.md`

## Testing

- **Unit tests**: 115 tests across 12 files
- **Coverage areas**: API transport layer (19), React Query hooks (20), BoardListPage (14), BoardPage (12), KanbanBoard/Column/Card (18), CreateCardForm (8), common components (12), drag-and-drop integration (12)
- **Test approach**: Real `QueryClient` instances seeded with fixture data; `msw`-style fetch mocking; `@testing-library/user-event` for interactions
- **All tests passing**: ✅ 115/115
- **Production build**: ✅ PASS (326 kB, gzipped 103 kB JS + 1 kB CSS)
- **Lint**: ✅ PASS

## Files Changed

**New files — Phase 1 (Scaffold & API Client):**
- `frontend/` — new Vite project root (package.json, vite.config.ts, tsconfig.json, vitest.config.ts)
- `frontend/src/api/client.ts` — request<T>() transport core + ApiError
- `frontend/src/api/endpoints.ts` — typed endpoint functions
- `frontend/src/api/queryKeys.ts` — query key factory
- `frontend/src/api/hooks.ts` — React Query hooks (queries + mutations)
- `frontend/src/api/__tests__/` — API client unit tests (19 tests)
- `frontend/src/types/index.ts` — Board, Column, Card, PaginatedResponse domain types

**New files — Phase 2 (Board List Page):**
- `frontend/src/components/board/BoardListPage/` — page + hooks + CSS + tests
- `frontend/src/components/common/ErrorBanner/` — dismissable error banner
- `frontend/src/components/common/LoadingSpinner/` — accessible loading spinner
- `frontend/src/App.tsx` — React Router wiring

**New files — Phase 3 (Board View & Kanban Layout):**
- `frontend/src/components/board/BoardPage/` — board view orchestrator
- `frontend/src/components/board/KanbanBoard/` — horizontal scroll container
- `frontend/src/components/board/KanbanColumn/` — column with card list + droppable target
- `frontend/src/components/board/KanbanCard/` — draggable card with accessible handle
- `frontend/src/components/board/CreateCardForm/` — inline card creation with accessible label

**New files — Phase 4 (Drag-and-Drop):**
- `frontend/src/api/hooks/useMoveCard.ts` — optimistic move mutation (full lifecycle)
- `frontend/src/api/hooks/useMoveCard.test.tsx` — 13 tests covering all mutation paths

**New files — Phase 5 (Docker Compose & Production Build):**
- `frontend/Dockerfile` — multi-stage Docker build
- `frontend/nginx.conf` — SPA fallback + cache headers

**Modified files — Phase 5:**
- `docker-compose.yml` — added `frontend` service + `frontend_node_modules` volume

## Lessons Learned

1. **Creative code sketches are worth the investment** — When Creative 3 included a full `useMoveCard` code sketch and `onDragEnd` algorithm, Phase 4 had zero structural surprises. The pre-work time was amortized many times over.

2. **TDD catches real accessibility issues** — The missing `<label>` on `CreateCardForm` (a real WCAG 2.1 violation) was caught at code review. Adding `getByLabelText` assertions to the test writer prompt would catch this at the test stage.

3. **React Query cache-as-source-of-truth for optimistic state** — Snapshotting both cache keys in `onMutate` and restoring both in `onError` guarantees correct rollback with no state-sync complexity.

4. **Named Docker volume for `node_modules`** — Essential on Windows/macOS to prevent host `node_modules` from shadowing the container's via the source bind-mount.

Reference: `memory-bank/reflection/reflection-TASK-009.md`

## References

- **Reflection**: `memory-bank/reflection/reflection-TASK-009.md`
- **Creative 1 (Component Architecture)**: `memory-bank/creative/TASK-009-component-architecture.md`
- **Creative 2 (API Client Design)**: `memory-bank/creative/TASK-009-api-client-design.md`
- **Creative 3 (DnD & Optimistic UX)**: `memory-bank/creative/TASK-009-dnd-optimistic-ux.md`
- **Progress**: `memory-bank/progress.md`

## Follow-up

- **`/banyan-uat TASK-009`** — Walk the primary board-flow user journey in a browser and generate the E2E test spec (`frontend/e2e/board-flow.spec.ts`). Recommended before FEAT-006 begins.
- **`TouchSensor` for tablet drag** — Not added in MVP; PointerSensor handles mouse/stylus. Low priority until a touch-device UAT pass.
- **Storybook** — Deferred per Creative 1. Add `.stories.tsx` files when `components/common/` library grows enough to warrant a visual catalog.
- **Per-phase commit SHA tracking** — The task file captures only the final phase commit. Future multi-phase tasks would benefit from an `## Phase Commits` table.
