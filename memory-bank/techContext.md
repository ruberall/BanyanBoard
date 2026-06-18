# Tech Context

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + TypeScript + Vite 8 | SPA; served separately in dev; TanStack Query v5 for async state; React Router v6 for client-side routing |
| Backend | Node.js + TypeScript + Express | REST API; clean 3-layer architecture |
| Database | PostgreSQL | Relational; Docker-managed in dev |
| Infrastructure | Docker Compose | Single `docker compose up` for full stack |

## Architecture Approach

Clean architecture with 3 layers — keep it simple:
1. **Routes** — Express route handlers; validate input, call service
2. **Services** — Business logic; orchestrate repositories
3. **Repositories** — Database access via pg driver or query builder

No clever abstractions. No microservices. One Express app.

## Component Structure

```
/
├── frontend/           # React + TypeScript SPA (Vite 8)
│   ├── src/
│   │   ├── types/      # Domain types (Board, Column, Card, User, ApiError, CardMovedEvent)
│   │   ├── context/    # React contexts (AuthContext — currentUser, login, logout, register via TanStack Query)
│   │   ├── components/ # UI components (common/ for shared, feature-specific otherwise; PrivateRoute for auth guard; ActivityFeed — collapsible right sidebar showing real-time card-move events, localStorage persistence for collapsed state)
│   │   ├── pages/      # Route-level components (BoardListPage, BoardPage, LoginPage, RegisterPage, NotFoundPage)
│   │   ├── hooks/      # Custom React hooks (useLogin, useRegister, useLogout, useCurrentUser, useActivityFeed — SSE client returning events[] + connectionStatus)
│   │   ├── lib/        # Shared utilities (logger.ts — warn/error only, always emit)
│   │   ├── api/        # API client
│   │   │   ├── client.ts     # request<T>() fetch transport (credentials: 'include'; 401 triggers redirect to /login)
│   │   │   ├── endpoints.ts  # Typed endpoint functions (board CRUD + auth: loginUser, registerUser, logoutUser, getCurrentUser)
│   │   │   ├── hooks.ts      # TanStack Query hooks (useBoards, useBoard, useCreateBoard, etc.)
│   │   │   └── queryKeys.ts  # TanStack Query key factory (queryKeys.auth.me + board keys)
│   │   └── test-setup.ts  # jest-dom setup
│   ├── e2e/            # Playwright E2E tests (requires running stack: docker compose up)
│   │   ├── auth.spec.ts        # Auth flow: unauthenticated redirect, login, register, logout, a11y
│   │   ├── board-list.spec.ts  # Board list CRUD (authenticated)
│   │   ├── board-page.spec.ts  # Board/card interactions (authenticated)
│   │   ├── error-pages.spec.ts # 404 and error states (authenticated)
│   │   └── helpers/
│   │       ├── auth.ts         # loginAsTestUser(page.request) — uses page.request to share session cookie
│   │       └── api.ts          # createBoard/deleteBoard via APIRequestContext (authenticated)
│   ├── vite.config.ts      # Build config with @/ path alias
│   ├── vitest.config.ts    # Test config (separate from vite.config.ts due to Vite 8/Vitest 3 compatibility)
│   ├── tsconfig.app.json   # TypeScript 6 strict config
│   ├── eslint.config.js    # ESLint 10 flat config
│   └── package.json
├── backend/            # Express + TypeScript API
│   ├── src/
│   │   ├── types/
│   │   │   └── session.d.ts      # express-session module augmentation (adds userId to SessionData)
│   │   ├── routes/
│   │   │   ├── index.ts          # createRouter — mounts auth (public) then requireAuth then domain routes
│   │   │   ├── health.ts         # GET /health
│   │   │   ├── auth.ts           # createAuthRouter — POST /register (auto-login), /login, /logout; GET /me
│   │   │   ├── boards.ts         # createBoardsRouter — CRUD for /boards
│   │   │   └── feed.ts           # createFeedRouter — GET /boards/:boardId/events (SSE activity feed)
│   │   ├── services/
│   │   │   ├── auth.service.ts   # AuthService — register, login, getMe (bcrypt cost 12, email-enum-safe)
│   │   │   └── board.service.ts  # BoardService — input validation + business logic
│   │   ├── repositories/
│   │   │   ├── user.repository.ts  # UserRepository — SQL + User/PublicUser types (no password_hash in PublicUser)
│   │   │   ├── board.repository.ts # BoardRepository — SQL + Board/Column types
│   │   │   └── event.repository.ts # EventRepository — insert/findRecentByBoard/findAfterById for card_events
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts    # Synchronous session guard; throws UnauthorizedError if no userId
│   │   │   └── cors.ts           # CORS with credentials: true; reflects origin for wildcard dev config
│   │   ├── lib/
│   │   │   └── asyncHandler.ts   # Wraps async handlers to forward errors to next()
│   │   └── db/         # DB connection + queryable interface
│   └── package.json
├── docker-compose.yml  # Full stack orchestration
└── memory-bank/
```

## Development Commands

```bash
# Start full stack
docker compose up

# Start full stack (rebuild images)
docker compose up --build

# Stop stack
docker compose down

# View logs
docker compose logs -f

# Frontend dev server (Vite HMR on port 5173)
npm --prefix frontend run dev

# Frontend tests
npm --prefix frontend run test

# Frontend build
npm --prefix frontend run build

# Backend only (watch mode)
cd backend && npm run dev

# Run backend tests
cd backend && npm test

# Type check backend
cd backend && npx tsc --noEmit

# Type check frontend
npm --prefix frontend run tsc
```

## Environment Setup

All config via environment variables. See `.env.example` for the full list.

### Backend Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | set in docker-compose.yml |
| `PORT` | Express server port | `3000` |
| `LOG_LEVEL` | Log verbosity | `info` |
| `LOG_FORMAT` | Log output format (`json` or `pretty`) | `json` |
| `NODE_ENV` | Environment | `development` |
| `SESSION_SECRET` | Secret used to sign session cookies — **must be set in production** (≥ 32 chars) | dev fallback in `app.ts`; startup exits if missing in production |
| `SESSION_COOKIE_MAX_AGE_MS` | Session cookie lifetime in milliseconds | `604800000` (7 days) |
| `SESSION_SECURE` | Set `Secure` flag on session cookie (requires HTTPS) | `false` |
| `FEED_MAX_HISTORY` | Maximum number of past events returned to a new SSE subscriber on connect | `20` |
| `FEED_SSE_HEARTBEAT_MS` | Interval (ms) between SSE keep-alive comment frames | `15000` |

### Frontend Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_URL` | Backend base URL | `http://localhost:3000` |

## Frontend Routing

React Router v6 (`BrowserRouter`) wraps the app in `main.tsx`. Routes are declared in `App.tsx`:

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `BoardListPage` | Board list with create/delete |
| `/boards/:boardId` | `BoardPage` | Board detail (Phase 3) |
| `*` | `NotFoundPage` | Catch-all 404 |

## Frontend Configuration

### Build Configuration (Vite 8)
- **Config file**: `frontend/vite.config.ts`
- **Path alias**: `@/` maps to `src/`
- **HMR port**: 5173 (default)
- **React plugin**: `@vitejs/plugin-react` with Fast Refresh

### Test Configuration (Vitest 3)
- **Config file**: `frontend/vitest.config.ts`
- **Environment**: jsdom (DOM testing)
- **Setup files**: `src/test-setup.ts` (imports jest-dom)
- **Note**: Split from `vite.config.ts` due to Vite 8 + Vitest 3 compatibility (Vitest bundles older Vite; `mergeConfig` works around this)

### TypeScript Configuration
- **File**: `frontend/tsconfig.app.json`
- **Target**: TypeScript 6
- **Strict mode**: enabled (`strict: true`)
- **Path aliases**: `@/` → `src/`
- **Syntax-only emit**: `erasableSyntaxOnly` (removes type-only imports automatically)

## Database

- **Engine**: PostgreSQL 15+
- **Migrations**: node-pg-migrate — JS migration files in `backend/migrations/`; filenames are `<epoch-ms>_<description>.js` (e.g., `1749916800000_create-boards-and-columns.js`); run automatically on startup via `RUN_MIGRATIONS_ON_START=true`
- **Schema**: boards → columns → cards (ordered); users; board_members
- **UUID primary keys**: all tables use `gen_random_uuid()` (PostgreSQL built-in, no extension required)
- **Local**: Managed by Docker Compose (`postgres` service); data persisted in Docker volume

## Frontend Auth

Auth state is managed entirely via **TanStack Query** — no separate AuthContext or Zustand store.

| Layer | Location | Purpose |
|-------|----------|---------|
| Hook | `frontend/src/hooks/useCurrentUser.ts` | `useQuery` for `GET /auth/me`; `retry: false`, `staleTime: 0` |
| Mutations | `frontend/src/hooks/useLogin.ts`, `useLogout.ts`, `useRegister.ts` | Auth mutation hooks |
| Route guard | `frontend/src/components/PrivateRoute/PrivateRoute.tsx` | 4-state guard: loading→spinner, error→ErrorBanner, unauthenticated→`/login?next=…`, authenticated→`AppHeader + Outlet` |
| App shell | `frontend/src/components/AppHeader/AppHeader.tsx` | Persistent header with app name + Sign out button |
| Pages | `frontend/src/pages/LoginPage/`, `frontend/src/pages/RegisterPage/` | Public auth pages |
| Fetch client | `frontend/src/api/client.ts` | All requests include `credentials: 'include'` |
| Query key | `frontend/src/api/queryKeys.ts` `auth.me` | `['auth', 'me']` |
| Auth endpoints | `frontend/src/api/endpoints.ts` | `fetchMe`, `login`, `logout`, `register` |
| User type | `frontend/src/types/index.ts` | `User { id: string; email: string }` |

Routing (in `App.tsx`): `/login` and `/register` are public; all other routes wrapped in `<PrivateRoute>`.

## Authentication

Session-based authentication using `express-session` backed by a PostgreSQL session store (`connect-pg-simple`).

- **Session store**: `connect-pg-simple` writes session rows to the `session` table (created by the package's own `table.sql`; managed separately from node-pg-migrate migrations)
- **Password hashing**: `bcrypt` with a cost factor of 12 (balances security and login latency)
- **Session type augmentation**: `backend/src/types/session.d.ts` extends `express-session`'s `SessionData` to add `userId?: string`
- **Auth middleware**: `requireAuth` (`backend/src/middleware/requireAuth.ts`) — applied as group middleware in `routes/index.ts` to protect all domain routes in one place

### Auth Packages Added
| Package | Purpose |
|---------|---------|
| `express-session` | Session management |
| `connect-pg-simple` | PostgreSQL session store for express-session |
| `bcrypt` | Password hashing |
| `@types/express-session` | TypeScript types |
| `@types/connect-pg-simple` | TypeScript types |
| `@types/bcrypt` | TypeScript types |

## API Endpoints

All endpoints are prefixed by the Express mount path. The app currently exposes:

| Method | Path | Auth Required | Description | Response |
|--------|------|---------------|-------------|----------|
| `GET` | `/health` | No | Liveness probe | `200 { status: "ok" }` |
| `POST` | `/auth/register` | No | Register a new user (`{ email, password }`) | `201 PublicUser` or `400`/`409` |
| `POST` | `/auth/login` | No | Log in and establish a session (`{ email, password }`) | `200 PublicUser` or `400`/`401` |
| `POST` | `/auth/logout` | No | Destroy the current session | `200 {}` |
| `GET` | `/auth/me` | Yes | Return the authenticated user | `200 PublicUser` or `401` |
| `GET` | `/boards` | Yes | List all boards | `200 Board[]` |
| `GET` | `/boards/:id` | Yes | Get board with columns | `200 BoardWithColumns` or `404` |
| `GET` | `/boards/:boardId/events` | Yes | SSE activity feed for a board; streams `EventRow` frames; supports `Last-Event-ID` header for missed-event replay | `text/event-stream` (long-lived) or `401` |
| `POST` | `/boards` | Yes | Create board (`{ name }` body) | `201 Board` or `400` |
| `DELETE` | `/boards/:id` | Yes | Delete board | `204` or `404` |

Error shape for all non-2xx responses: `{ error: string, message: string }`.

## External Services

None for MVP. All services run locally via Docker Compose.
