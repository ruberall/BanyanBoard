# Tech Context

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + TypeScript | SPA; served separately in dev |
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
├── frontend/           # React + TypeScript SPA
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/      # Route-level components
│   │   ├── hooks/      # Custom React hooks
│   │   └── api/        # API client (fetch wrappers)
│   └── package.json
├── backend/            # Express + TypeScript API
│   ├── src/
│   │   ├── routes/     # Express route definitions
│   │   ├── services/   # Business logic
│   │   ├── repositories/ # DB access + domain types (types co-located with their repo)
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

# Frontend only (dev server with hot reload)
cd frontend && npm run dev

# Backend only (watch mode)
cd backend && npm run dev

# Run backend tests
cd backend && npm test

# Run frontend tests
cd frontend && npm test

# Type check backend
cd backend && npx tsc --noEmit

# Type check frontend
cd frontend && npx tsc --noEmit
```

## Environment Setup

All config via environment variables. See `.env.example` for the full list.

Key variables:
| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | set in docker-compose.yml |
| `PORT` | Express server port | `3000` |
| `JWT_SECRET` | Auth token signing key | must be set |
| `LOG_LEVEL` | Log verbosity | `info` |
| `NODE_ENV` | Environment | `development` |

## Database

- **Engine**: PostgreSQL 15+
- **Migrations**: node-pg-migrate — JS migration files in `backend/migrations/`; filenames are `<epoch-ms>_<description>.js` (e.g., `1749916800000_create-boards-and-columns.js`); run automatically on startup via `RUN_MIGRATIONS_ON_START=true`
- **Schema**: boards → columns → cards (ordered); users; board_members
- **UUID primary keys**: all tables use `gen_random_uuid()` (PostgreSQL built-in, no extension required)
- **Local**: Managed by Docker Compose (`postgres` service); data persisted in Docker volume

## External Services

None for MVP. All services run locally via Docker Compose.
