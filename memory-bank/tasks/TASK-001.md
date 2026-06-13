# TASK-001: Express API with TypeScript Scaffold

**Complexity**: Level 3
**Status**: COMPLETE
**Completed**: 2026-06-13
**Archived**: memory-bank/archive/archive-TASK-001.md
**Roadmap**: FEAT-001
**Branch**: feature/FEAT-001-express-api-scaffold
**Worktree**: .claude-worktrees/FEAT-001

## Task Description

Set up the Express + TypeScript backend project from scratch. Includes Docker Compose orchestration (api, postgres services), database connection pooling, migration tooling (node-pg-migrate), environment variable config, structured logging, and the 3-layer clean architecture skeleton (routes → services → repositories). This is the foundation everything else builds on.

---

## Specification

**Feature Type**: NFR/Infrastructure
**Creative Exploration Needed**: No — architecture decisions are prescribed (3-layer clean architecture, Express, TypeScript, node-pg-migrate, Docker Compose). No design exploration needed; the task is to implement a specific, well-understood structure.

### Verification Method

- **Test method**: `docker compose up --build` — all three services (frontend placeholder, api, postgres) start without errors; `curl http://localhost:3000/health` returns `{"status":"ok"}`; `npm test` in `backend/` passes all scaffold tests
- **Success metrics**:
  - `docker compose up --build` exits with all services healthy
  - `GET /health` returns HTTP 200 with `{"status":"ok"}`
  - TypeScript compiles with `npx tsc --noEmit` — zero errors
  - At least one migration runs successfully (`node-pg-migrate up`)
  - Jest test suite passes (≥ 1 test per layer)
- **Observable at**: Terminal output from `docker compose up`; `curl` response; `npm test` output
- **Verification frequency**: On every build; CI gate
- **Confidence**: HIGH — all tooling choices are prescribed (Express, TypeScript, node-pg-migrate, Docker Compose, pino); greenfield project with no existing constraints to reconcile

### Acceptance Criteria

#### AC-VERIFY-1: Full stack starts with a single command
**Priority**: MUST
**Confidence**: HIGH — standard Docker Compose pattern; postgres healthcheck with `pg_isready` is well-established
**Given** a machine with Docker and Docker Compose installed
**When** the developer runs `docker compose up --build` from the project root
**Then** all services (postgres, api) become healthy within 60 seconds and stay running

#### AC-VERIFY-2: Health endpoint responds correctly
**Priority**: MUST
**Confidence**: HIGH — trivial Express route returning static JSON; no unknowns
**Given** the API service is running
**When** `GET http://localhost:3000/health` is called
**Then** it returns HTTP 200 with body `{"status":"ok"}`

#### AC-VERIFY-3: TypeScript compiles cleanly
**Priority**: MUST
**Confidence**: HIGH — standard tsconfig strict mode setup; no unusual type constraints
**Given** the backend source files
**When** `npx tsc --noEmit` is run in `backend/`
**Then** it exits 0 with zero errors or warnings

#### AC-VERIFY-4: Database migrations run
**Priority**: MUST
**Confidence**: MEDIUM — node-pg-migrate setup is straightforward but Windows Docker volume timing can introduce flakiness on first run; mitigated by retry logic in pool connection
**Given** the postgres service is running
**When** the migration command runs (on API startup or manually via npm script)
**Then** the migrations table exists in postgres and all pending migrations are applied

#### AC-VERIFY-5: 3-layer architecture is navigable
**Priority**: MUST
**Confidence**: HIGH — directory structure is fully prescribed; no design decisions required
**Given** the backend source
**When** a developer opens the project
**Then** `src/routes/`, `src/services/`, `src/repositories/`, `src/db/` directories exist with at least one example file each demonstrating the pattern

### Scope Boundaries

- **In scope**: Project structure, Docker Compose, TypeScript config, Express app bootstrap, DB connection pool, migration tooling, health endpoint, structured JSON logging, environment variable config, Jest scaffold, `.env.example`
- **Out of scope**: Any business-logic routes (boards, cards, users) — those are FEAT-002+; authentication — FEAT-006; frontend app — FEAT-005; production deployment config
- **Dependencies**: None — this is the foundation
- **NFR implications**: Structured logging must use JSON format (CLAUDE.md observability standards); config must use environment variables only (12-Factor); no hardcoded URLs or credentials

---

## Test Strategy

### Approach

- **Emphasis**: Integration-leaning — the scaffold itself IS the artifact; tests verify the layers wire together correctly
- **Target test count**: 8–12 tests total

### File Organization

- **New test files**:
  - `backend/src/__tests__/health.test.ts` — HTTP integration test for GET /health
  - `backend/src/__tests__/db.test.ts` — DB connection pool connects successfully
  - `backend/src/__tests__/migrations.test.ts` — migrations table exists after startup

### What NOT to Test

- TypeScript types — covered by `tsc --noEmit`
- Docker Compose networking — covered by manual `docker compose up` verification
- Express internals — framework responsibility
- node-pg-migrate internals — library responsibility

### Per-Phase Test Guidance

- Phase 1 (Project structure + Docker): 0 automated tests — verified manually by `docker compose up`
- Phase 2 (TypeScript + Express app): 3 tests — health endpoint returns 200, correct JSON body, correct Content-Type
- Phase 3 (DB + migrations): 3 tests — pool connects, migrations table exists, at least one migration applied
- Phase 4 (Layer skeleton + logging): 2 tests — example repository returns expected stub; logger writes JSON

---

## Implementation Roadmap

- [x] Phase 1: Project structure & Docker Compose — COMPLETE (commit 6630dd9)
- [x] Phase 2: TypeScript + Express app bootstrap — COMPLETE (commit f82d674)
- [x] Phase 3: PostgreSQL connection pool & migrations — COMPLETE (commit 4b33651)
- [x] Phase 4: 3-layer skeleton, structured logging & Jest scaffold — COMPLETE (commit d1ff131)

## Creative Phases

- [x] Architecture Design → COMPLETE (`memory-bank/creative/TASK-001-express-scaffold-architecture.md`)

---

## Implementation Plan

### Overview

Stand up the backend project skeleton that all other features will build on. Four sequential phases, each building on the last. No parallelism needed — this is purely sequential infrastructure setup.

### Functional Requirements

- `backend/` directory with TypeScript Express application
- `docker-compose.yml` at project root orchestrating `api` and `postgres` services
- `GET /health` endpoint returning `{"status":"ok"}`
- PostgreSQL connection pool (via `pg` package)
- Migration tooling (node-pg-migrate) with npm script `db:migrate`
- 3-layer skeleton: `routes/`, `services/`, `repositories/` with one example each
- Structured JSON logger (pino or winston)
- `.env.example` documenting all required env vars
- Jest + ts-jest configured and passing

### Non-Functional Requirements

- All config via environment variables (12-Factor)
- Structured JSON logging (CLAUDE.md observability standard)
- TypeScript strict mode enabled
- No hardcoded values

### Component Analysis

**New Components (all greenfield):**
- `docker-compose.yml` — orchestrates postgres + api services
- `backend/` — full Express TypeScript application
  - `src/app.ts` — Express app factory (no listen; testable)
  - `src/server.ts` — entry point (calls `app.listen`)
  - `src/routes/health.ts` — health route
  - `src/routes/index.ts` — router aggregator
  - `src/services/` — placeholder example (e.g., `HealthService`)
  - `src/repositories/` — placeholder example (e.g., DB ping)
  - `src/db/pool.ts` — pg Pool singleton
  - `src/db/migrations/` — migration files directory
  - `src/config.ts` — typed env var config (throws on missing required vars)
  - `src/logger.ts` — pino JSON logger
  - `src/types/` — shared TypeScript interfaces
- `.env.example` — all required env vars documented
- `backend/tsconfig.json` — TypeScript strict config
- `backend/jest.config.ts` — Jest + ts-jest config

**Affected Components:** None (greenfield)

### Implementation Strategy

1. **Phase 1** — Scaffold directory structure, `docker-compose.yml`, `package.json`, `tsconfig.json`. Verify `docker compose up` starts postgres.
2. **Phase 2** — Implement Express app (`app.ts`, `server.ts`), health route, `config.ts`. Verify `GET /health` returns 200.
3. **Phase 3** — Add `pg` pool (`db/pool.ts`), install node-pg-migrate, write first migration (create `schema_migrations` table or initial placeholder). Verify pool connects and migration runs.
4. **Phase 4** — Add pino logger, wire into app middleware (request logging). Add skeleton `service/` and `repository/` examples. Write Jest tests. Verify `npm test` passes.

### Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Windows Docker networking for pg healthcheck | Use `pg_isready` healthcheck in docker-compose; document Windows caveat |
| node-pg-migrate vs other migration tools | node-pg-migrate is JS-native, no Java required — good fit for this stack |
| TypeScript strict mode breaking imports | Enable strict from day 1; easier than retrofitting |
| pino vs winston choice | Use pino — faster, JSON-first, smaller; no winston needed for this scope |

### Observability Requirements

- **Applies**: Yes (HTTP handler + DB connection)
- **Logging**: Request logging via pino-http middleware on all routes; JSON format; includes method, url, statusCode, responseTime
- **Tracing**: Not required for MVP (no distributed services)
- **Metrics**: None for MVP
- **Configuration**: `LOG_LEVEL` (default: `info`), `LOG_FORMAT` (json only for MVP)

### API Requirements — REST

- **Involves REST API**: Yes (health endpoint only in this task)
- **Endpoints**: `GET /health → 200 {"status":"ok"}`
- **No auth** on health endpoint

### Work Items

#### WI-001-001: Project scaffold & Docker Compose
**Status**: Pending
**Dependencies**: None
**Files**: `docker-compose.yml`, `backend/package.json`, `backend/tsconfig.json`, `backend/.env.example`, `backend/src/config.ts`
**Implementation**: Create directory structure, write docker-compose with postgres + api services, configure TypeScript strict mode, document env vars

#### WI-001-002: Express app + health route
**Status**: Pending
**Dependencies**: WI-001-001
**Files**: `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/routes/health.ts`, `backend/src/routes/index.ts`
**Implementation**: App factory pattern (app.ts exports app; server.ts calls listen — keeps app testable), health route, wire routes

#### WI-001-003: DB pool + migrations
**Status**: Pending
**Dependencies**: WI-001-002
**Files**: `backend/src/db/pool.ts`, `backend/src/db/migrations/001_initial.sql`, `backend/package.json` (db:migrate script)
**Implementation**: pg Pool singleton reading from `config.DATABASE_URL`; node-pg-migrate setup; first migration creates a `schema_info` table; API startup runs pending migrations

#### WI-001-004: Logger + layer skeleton + tests
**Status**: Pending
**Dependencies**: WI-001-003
**Files**: `backend/src/logger.ts`, `backend/src/services/example.ts`, `backend/src/repositories/example.ts`, `backend/src/__tests__/*.test.ts`, `backend/jest.config.ts`
**Implementation**: pino + pino-http; skeleton service/repository with a trivial example; Jest + ts-jest; write 8 tests covering health endpoint, DB connection, migration state

---

## Execution State

**Build Status**: RUNNING
**Current Phase**: REFLECT
**Build Started**: 2026-06-13
**Build Completed**: 2026-06-13
**Reflection Completed**: 2026-06-13
**Phase Number**: 4 of 4
**Is Multi-Phase**: YES
**Can Resume**: YES

### Current Build Step
**Step**: Step 3 - Reflection Agent
**Status**: COMPLETE
**Step Started**: 2026-06-13
**Step Completed**: 2026-06-13

### Completed Steps
- Planning: COMPLETE
- Creative Architecture Design: COMPLETE → `memory-bank/creative/TASK-001-express-scaffold-architecture.md`
- Step 0.5 Git Setup: COMPLETE → worktree at `.claude-worktrees/FEAT-001`, branch `feature/FEAT-001-express-api-scaffold`
- Step 3 Test Writer (ALL phases): COMPLETE → 10 tests across 4 files in `backend/src/__tests__/`

### Sub-Agents
- Test Writer Agent (Sonnet): COMPLETE — wrote health.test.ts (3), db.test.ts (3), logger.test.ts (2), repository.test.ts (2) + jest.config.ts + package.json stub
