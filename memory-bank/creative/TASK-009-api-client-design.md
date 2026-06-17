# Architecture Decision: Frontend API Client Layer

**Created**: 2026-06-16
**Status**: DECIDED
**Decision Type**: Architecture (Frontend / Creative 2)
**Task**: TASK-009 React Frontend Scaffold (Level 3, FEAT-005)

## Context

This decision selects the data-fetching / server-state strategy for the BanyanBoard React frontend. It governs how every page and component reads and mutates backend data, how loading/error states are modeled, and — critically — how the kanban drag-and-drop optimistic update (Creative 3) is implemented. Creative 3 is explicitly sequenced **after** this decision because the optimistic-update mechanism depends on the choice made here.

### System Requirements

- A typed API client exposing the 10 contract functions (`listBoards`, `getBoard`, `createBoard`, `deleteBoard`, `listCards`, `createCard`, `getCard`, `updateCard`, `deleteCard`, `moveCard`).
- Base URL read from `VITE_API_URL` (12-factor; never hardcoded).
- Typed `ApiError` (`status: number`, `message: string`) thrown on every non-2xx response; backend error shape is `{ error: string, message: string }`.
- Loading and error states for every async read (AC-9: board-load failure shows a banner, not a blank screen).
- Optimistic create (AC-4 board, AC-6 card) — new item appears without a full page reload.
- Optimistic move with **revert on error** (AC-7 success persists, AC-8 reverts and shows error).

### Technical Constraints

- **Stack**: React 18 + TypeScript, Vite 5, React Router v6, Vitest + React Testing Library.
- **No auth in MVP** — no token refresh, no 401-retry interceptor needed yet. FEAT-006 (User Authentication) is next and will add session-based auth (cookies per productBrief), so the client must have a single, obvious place to attach credentials/headers later.
- **No real-time / WebSockets** (explicit constraint) — no cache invalidation pushed from the server is required at MVP.
- **No SSR** — tablet-first SPA, served as static dist behind nginx.
- **Scale**: 2–20 users per board; hundreds of boards, thousands of cards per instance. Not hyper-scale.
- **Bundle size matters** — tablet-first initial load target < 2s on localhost; team values "no bloat" (productBrief differentiator).

### Non-Functional Requirements

- Page navigation between boards < 1s (revisiting a board should feel instant).
- Zero data loss on card moves — idempotent, correctly-ordered move semantics with reliable revert.
- WCAG 2.1 AA baseline — async states must be announced accessibly (the client choice influences how easily loading/error are surfaced, see `LoadingSpinner`/`ErrorBanner`).
- Maintainability: this scaffold sets the pattern **all future features follow**, so the choice must scale to FEAT-006+ without a rewrite.

### Established Patterns to Respect (systemPatterns.md)

The backend already enforces a clean, layered, typed contract: typed errors (`AppError` → `{ error, message }`), single-source config (`config.ts` reads env), and DI for testability. The frontend client should mirror this ethos: **one module owns the transport + error mapping**, the rest of the app consumes typed functions. Whatever server-state library is chosen sits *on top of* that transport module — it does not replace the typed `ApiError` boundary.

> **Observability note**: The standard OpenTelemetry/Prometheus sections of the architecture template target backend services. This is a browser client; there is no OTLP exporter or server-side tracing here. Browser-side observability for this layer means: (a) `ApiError` carries `status` + `message` so failures are diagnosable; (b) no `console.log` in production code (errors flow to `ErrorBanner` / error boundaries); (c) when distributed tracing spans the frontend post-MVP, the single `request()` transport function is the one place to inject a `traceparent` header — the same single-seam argument that favors a thin transport core below.

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| `apiClient` (transport core) | Single fetch seam | Build URL from `VITE_API_URL`, set headers, `JSON.stringify` body, parse response, map non-2xx → `ApiError`. The **only** place that touches `fetch`. |
| `ApiError` | Typed error | Carries `status` + `message`; thrown by transport, caught by UI/error layer. |
| Endpoint functions | Typed contract | The 10 contract functions; thin wrappers over the transport core returning typed domain objects. |
| Server-state layer | Cache + async state | Owns loading/error/data state, dedup, optimistic mutation + rollback. **This is the layer the three options differ on.** |
| Query keys / hooks | Consumption API | What components import (`useBoards()`, `useBoard(id)`, `useMoveCard()` etc., or hand-rolled equivalents). |

### Component Interactions

```
Component  →  server-state layer (hooks)  →  endpoint fns  →  apiClient transport  →  fetch → backend
                     ↑ cache / optimistic / rollback live here
```

The transport core + `ApiError` + endpoint functions are **identical across all three options** — they are mandated by the contract. The options diverge only on the server-state layer above them.

## Options Explored

### Option 1: Plain fetch wrappers + `useState`/`useEffect`

- **Description**: Implement the transport core and typed endpoint functions, then consume them directly in components via `useState` + `useEffect` (or a small hand-rolled `useAsync` hook). Optimistic updates and rollback are done by mutating local component state and reverting on a caught `ApiError`.
- **Components**: `apiClient`, endpoint fns, `useAsync`/hand-rolled hooks, per-component state.
- **Pros**:
  - Zero runtime dependencies beyond React — smallest bundle (~0 KB added).
  - Full control; nothing hidden. Easy to reason about for a small app.
  - No library learning curve.
- **Cons**:
  - Boilerplate repeated per call site: loading flag, error flag, `useEffect` deps, cleanup/abort, "is mounted" guards.
  - **No caching or dedup** — navigating away and back to a board refetches everything; multiple components needing the same data each fetch it. Hurts the < 1s board-navigation NFR.
  - **Optimistic update + rollback is hand-rolled and error-prone** — exactly the AC-7/AC-8 path flagged as High-impact risk in productBrief ("Drag-and-drop UX is complex to get right"). Snapshot/restore logic must be written and tested manually for every mutation.
  - No request deduplication for the parallel per-column card fetches (Phase 3 fetches cards per column).
  - The pattern every future feature copies is the *most* boilerplate-heavy one.
- **Technical Fit**: Medium — mirrors backend simplicity ethos, but pushes complexity to every call site.
- **Complexity**: Low to set up, **High** in aggregate (every feature re-implements async/optimistic plumbing).
- **Scalability**: Low — boilerplate and cache-absence cost grows linearly with features.

### Option 2: React Query (TanStack Query v5)

- **Description**: Keep the same transport core + typed endpoint functions, and wrap reads in `useQuery` and writes in `useMutation`. Caching, dedup, background refetch, and **first-class optimistic-update helpers** (`onMutate` → snapshot → `setQueryData` → `onError` rollback → `onSettled` invalidate) are provided by the library.
- **Components**: `apiClient`, endpoint fns, `QueryClientProvider`, query-key factory, `useQuery`/`useMutation` hooks.
- **Pros**:
  - **Purpose-built optimistic update + rollback** — the AC-7/AC-8 + Creative 3 path is a documented, well-tested pattern (`onMutate`/`onError`/`onSettled`) rather than bespoke code. Directly de-risks the highest-impact product risk.
  - Caching + dedup → revisiting a board is instant (meets < 1s navigation NFR); parallel per-column card fetches dedup automatically.
  - Declarative loading/error/data per hook → trivially wired to `LoadingSpinner` / `ErrorBanner`; far less boilerplate per feature.
  - Excellent TypeScript inference; integrates cleanly with the typed endpoint functions and `ApiError`.
  - Scales to FEAT-006+: query invalidation on auth changes, and the future real-time story (if WebSockets ever arrive) maps to `queryClient.invalidateQueries` — no rewrite.
  - Strong testing story with RTL (`QueryClientProvider` wrapper); aligns with the documented test strategy (msw + mutation tests).
- **Cons**:
  - Adds ~12–13 KB gzipped to the bundle.
  - Concepts to learn (query keys, staleness, `gcTime`) — a small upfront cost for the team.
  - Mild risk of over-configuration (tuning stale/gc times) — mitigated by sensible defaults.
- **Technical Fit**: High — sits cleanly on the mandated transport core; matches "establish the pattern all future features follow."
- **Complexity**: Low–Medium (library handles the hard parts; small conceptual overhead).
- **Scalability**: High — the marginal cost of each new feature's data layer is minimal.

### Option 3: SWR

- **Description**: Same transport core + endpoint functions, with reads via SWR's `useSWR`. Mutations/optimistic updates via `mutate` / `useSWRMutation` with the `optimisticData` + `rollbackOnError` options.
- **Components**: `apiClient`, endpoint fns, `SWRConfig`, `useSWR` hooks, `mutate`.
- **Pros**:
  - Lighter than React Query (~4–5 KB gzipped).
  - Caching + dedup + revalidation out of the box → meets the navigation NFR.
  - Simple, minimal API; quick to learn.
  - Supports optimistic UI (`optimisticData`, `rollbackOnError`).
- **Cons**:
  - Optimistic-update ergonomics for **non-trivial reordering** (kanban move with `after_card_id`, cross-list reorder, rollback) are thinner than React Query's `onMutate`/`onError`/`onSettled` lifecycle. Multi-key coordinated updates (a card leaves column A's list *and* joins column B's list) are more awkward via `mutate` than via React Query mutation callbacks.
  - Default `revalidateOnFocus` can cause surprising refetches mid-interaction (must be tuned off for the board view to avoid clobbering optimistic state).
  - Mutation story (`useSWRMutation`) is less mature/expressive than React Query's; the pattern future features copy is weaker for write-heavy flows.
- **Technical Fit**: Medium–High — good for read-centric apps; BanyanBoard's defining interaction is a write-heavy optimistic reorder.
- **Complexity**: Low.
- **Scalability**: Medium–High — fine for reads, weaker for the coordinated optimistic mutations this product centers on.

## Evaluation Matrix

Scores: High / Medium / Low (higher = better for that criterion).

| Criteria | Option 1: Plain fetch | Option 2: React Query | Option 3: SWR |
|----------|----------------------|-----------------------|---------------|
| Optimistic update + rollback (AC-7/AC-8, the core risk) | Low | **High** | Medium |
| Caching / dedup (< 1s navigation NFR) | Low | **High** | High |
| Maintainability / boilerplate (pattern future features copy) | Low | **High** | Medium–High |
| Bundle size (tablet-first load) | **High** (0 KB) | Medium (~13 KB) | High (~4–5 KB) |
| TypeScript ergonomics | Medium | **High** | Medium–High |
| Future auth (FEAT-006) fit | Medium | **High** | Medium–High |
| Learning curve / time-to-implement | **High** | Medium | High |
| Testability (Vitest + RTL + msw) | Medium | **High** | Medium–High |

## Observability / Error-Surface Architecture (browser scope)

- **Error boundary**: `ApiError` thrown by the transport core is the single typed failure type. React Query surfaces it via `error` on each hook; `ErrorBanner` renders `error.message`, and AC-9 (board-load failure shows a banner) is satisfied declaratively.
- **No `console.log`** in production code (consistent with backend rule in systemPatterns.md). Unexpected (non-`ApiError`) throws are caught by a top-level React error boundary.
- **Future tracing seam**: the single `request()` transport function is the one place to inject a `traceparent` header if/when frontend-to-backend distributed tracing is added — no per-call-site changes.
- **Config**: `VITE_API_URL` is the only runtime config, read once where the transport core is constructed (12-factor; mirrors the backend's single-source `config.ts` discipline).

| Variable | Purpose | Default (dev) |
|----------|---------|---------------|
| `VITE_API_URL` | Backend base URL | `http://localhost:3000` |

## Decision

**Chosen**: Option 2 — React Query (TanStack Query v5), layered on top of a thin, framework-agnostic transport core that owns `fetch`, `VITE_API_URL`, and `ApiError` mapping.

### Rationale

1. **It directly de-risks the product's single highest-impact risk.** productBrief flags drag-and-drop as Medium-likelihood / High-impact, and the NFRs demand "zero data loss on card moves." React Query's `onMutate`/`onError`/`onSettled` optimistic lifecycle is the canonical, well-tested solution for exactly AC-7 (optimistic move persists) and AC-8 (revert on error). Option 1 would hand-roll this fragile logic at every mutation; Option 3's mutation/reorder ergonomics are thinner for the coordinated cross-column update this app centers on.
2. **It meets the navigation NFR for free.** Caching + dedup make board revisits instant (< 1s) and dedup the parallel per-column card fetches in Phase 3 — Option 1 cannot.
3. **It sets the right precedent.** This scaffold defines the pattern all future features copy. React Query gives each future feature a low-boilerplate, declarative data layer; Option 1's per-call-site plumbing would be copied into every feature as debt.
4. **It is future-proof for FEAT-006 (auth) and beyond.** Auth headers/credentials attach in the one transport seam; invalidation-on-login maps to `invalidateQueries`; an eventual real-time story maps to the same invalidation API — no rewrite. The contract functions and `ApiError` boundary are preserved regardless.
5. **The cost is acceptable and bounded.** ~13 KB gzipped is small relative to React itself and well within the < 2s tablet load budget; the conceptual overhead is offset many times over by eliminated boilerplate and the de-risked move flow.

The transport core is kept **separate** from React Query so the typed `ApiError` contract is the stable boundary and the library remains swappable — but a swap is not anticipated.

### Trade-offs Accepted

- **~13 KB bundle cost** over Option 1's zero and ~8 KB over SWR — accepted because it buys the optimistic-mutation correctness this product is built around, and stays within the load budget.
- **A library to learn** — accepted; React Query is industry-standard, well-documented, and the concepts (query keys, mutations) are exactly the abstractions the app needs anyway.
- **One more dependency to keep current** — accepted; v5 is stable and widely maintained.

## Implementation Guidelines

1. **Transport core** (`src/api/client.ts`): a single `request<T>(path, init?)` function that reads `import.meta.env.VITE_API_URL`, sets `Content-Type: application/json`, stringifies bodies, and on non-2xx parses `{ error, message }` and throws `new ApiError(status, message)`. This is the only module that calls `fetch`.
2. **`ApiError`** (`src/api/errors.ts`): `class ApiError extends Error { constructor(public status: number, message: string) }`.
3. **Endpoint functions** (`src/api/endpoints.ts`): the 10 contract functions, each a thin typed wrapper over `request<T>` returning domain types from `src/types/`. These are framework-agnostic and unit-tested directly (msw / fetch mocks) per the test strategy.
4. **Provider**: wrap the app in `<QueryClientProvider>` with one `QueryClient`; set conservative defaults (e.g., `staleTime: 30_000`, `refetchOnWindowFocus: false` to avoid clobbering optimistic board state mid-interaction).
5. **Query-key factory** (`src/api/queryKeys.ts`): centralized keys, e.g. `boards.all`, `boards.detail(id)`, `cards.byColumn(columnId)` — prevents key-string drift and makes invalidation precise.
6. **Read hooks**: `useBoards()`, `useBoard(id)`, `useCards(columnId)` via `useQuery`; expose `{ data, isLoading, error }` straight into `LoadingSpinner` / `ErrorBanner`.
7. **Mutation hooks**: `useCreateBoard`, `useDeleteBoard`, `useCreateCard`, `useMoveCard` via `useMutation`. `useMoveCard` implements the optimistic lifecycle (snapshot in `onMutate`, `setQueryData` for both affected column lists, rollback in `onError`, invalidate in `onSettled`) — this hook is the input Creative 3 builds the dnd-kit integration on.
8. **No `console.log`** in production code; route failures through `ApiError` → `ErrorBanner` and a top-level error boundary.
9. **Future auth (FEAT-006)**: attach credentials/headers in `request()` only; do not touch call sites.

### Code Sketch — `BoardListPage` fetching boards (AC-2/AC-3/AC-4/AC-9)

```typescript
// src/api/client.ts
const BASE_URL = import.meta.env.VITE_API_URL;

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    // backend error shape: { error, message }
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// src/api/endpoints.ts
export const listBoards = () =>
  request<PaginatedResponse<Board>>('/boards');
export const createBoard = (name: string) =>
  request<Board>('/boards', { method: 'POST', body: JSON.stringify({ name }) });

// src/api/queryKeys.ts
export const boardKeys = { all: ['boards'] as const };

// src/api/hooks.ts
export function useBoards() {
  return useQuery({ queryKey: boardKeys.all, queryFn: listBoards });
}
export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createBoard(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.all }),
  });
}

// src/pages/BoardListPage.tsx
export function BoardListPage() {
  const { data, isLoading, error } = useBoards();
  const createBoard = useCreateBoard();

  if (isLoading) return <LoadingSpinner label="Loading boards" />;
  if (error) return <ErrorBanner message={(error as ApiError).message} />; // AC-9

  const boards = data?.data ?? [];
  return (
    <main>
      <h1>Boards</h1>
      {boards.length === 0 ? (
        <p>No boards yet. Create your first board below.</p>          // AC-3
      ) : (
        <ul>
          {boards.map((b) => (
            <li key={b.id}>
              <Link to={`/boards/${b.id}`}>{b.name}</Link>             // AC-2
            </li>
          ))}
        </ul>
      )}
      <CreateBoardForm
        onSubmit={(name) => createBoard.mutate(name)}                  // AC-4: list refreshes via invalidate
        pending={createBoard.isPending}
        error={createBoard.error as ApiError | null}
      />
    </main>
  );
}
```

## Validation Checklist

- [x] Meets all system requirements (typed client, `VITE_API_URL`, `ApiError`, loading/error, optimistic create + move/revert)
- [x] Respects technical constraints (no auth/real-time/SSR; bundle within budget; React 18 + Vite + Vitest)
- [x] Addresses NFRs (< 1s navigation via cache; zero-data-loss move via tested optimistic lifecycle; accessible async states wired to existing components)
- [x] Technically feasible — TanStack Query v5 + React 18 is a standard, well-supported pairing
- [x] Risks identified and acceptable (see below)
- [x] Complies with Guiding Principles in systemPatterns.md — single transport seam mirrors single-source config; typed `ApiError` mirrors backend `AppError → { error, message }`; no `console.log`
- [x] Respects established patterns — thin typed contract layer; library sits on top, contract stays stable
- [x] Observability addressed at browser scope (typed errors, no console.log, single tracing seam, single config read)
- [x] Trace-context seam identified (single `request()` function) for future cross-boundary tracing
- [x] Error/logging strategy consistent with project conventions (no console.log; errors → `ErrorBanner`)
- [N/A] Backend metrics naming — this is a browser client, no Prometheus/OTLP exporter here

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Optimistic move logic still mis-coordinates two column lists | Low | High | Use the documented `onMutate`/`onError`/`onSettled` pattern; centralize in `useMoveCard`; integration test in Phase 4 (AC-7/AC-8) |
| `refetchOnWindowFocus` clobbers in-progress optimistic state | Medium | Medium | Disable globally in `QueryClient` defaults for MVP |
| Bundle growth pushes load over budget | Low | Medium | ~13 KB is well within < 2s localhost budget; monitor with Vite bundle report |
| Team unfamiliarity slows initial build | Low | Low | Standard library, abundant docs; scaffold establishes the copyable pattern |
| Query-key string drift across features | Low | Medium | Centralized key factory (`queryKeys.ts`) from day one |

## Next Steps

1. Build the transport core (`client.ts`) + `ApiError` + the 10 endpoint functions; unit-test with msw/fetch mocks (Phase 1).
2. Add `QueryClientProvider`, query-key factory, and read hooks; wire `BoardListPage` (Phase 2).
3. Implement mutation hooks including `useMoveCard` with the optimistic lifecycle (Phase 3–4).
4. **Proceed to Creative 3** (drag-and-drop UX): optimistic state lives in the React Query cache via `useMoveCard`'s `onMutate`/`setQueryData`; Creative 3 maps dnd-kit drop events (and `after_card_id` derivation) onto that mutation.

---

ARCHITECTURE CREATIVE COMPLETE
Document: memory-bank/creative/TASK-009-api-client-design.md
Decision: React Query (TanStack Query v5) on top of a thin typed fetch transport core that owns VITE_API_URL + ApiError; chosen primarily because its built-in optimistic-update/rollback lifecycle directly de-risks the kanban card-move flow (AC-7/AC-8) that Creative 3 depends on.
