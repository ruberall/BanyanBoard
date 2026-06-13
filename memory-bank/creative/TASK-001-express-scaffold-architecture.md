# Architecture Decision: Express API with TypeScript Scaffold

**Created**: 2026-06-13
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-001 (FEAT-001)
**Branch**: feature/FEAT-001-express-api-scaffold

## Context

This document resolves the six open architecture questions for the BanyanBoard backend
scaffold. The scaffold is the foundation every later feature (Board/Column CRUD, Card
management, Card move/ordering, session auth) builds on, so the decisions here must be
correct, simple, and stable — but the scaffold itself implements **no business logic**.

### System Requirements
- Express + TypeScript backend, created from scratch.
- Docker Compose orchestration of two services: `api` and `postgres`.
- PostgreSQL access via the `pg` driver with connection pooling.
- Database migrations via `node-pg-migrate`, run on startup.
- Environment-variable-driven configuration (12-Factor).
- Structured JSON logging (pino), OpenTelemetry-aligned field names.
- 3-layer clean architecture skeleton: **routes → services → repositories**, plus a `db/` layer.
- A `/health` endpoint that returns `200 {"status":"ok"}`.

### Technical Constraints
- Prescribed, non-negotiable stack: Node.js, TypeScript (strict), Express, PostgreSQL (`pg`),
  node-pg-migrate, Docker Compose, 3-layer clean architecture.
- Single Express app — **no microservices**, no message queues, no outbound HTTP calls in MVP.
- Local-only orchestration — Docker Compose, no Kubernetes, no cloud services.
- **Guiding principle (binding):** *"favor simplicity over clever abstractions."*
- No hardcoded values, credentials, or URLs anywhere in source.

### Non-Functional Requirements
- p95 API latency < 200ms; p99 < 500ms.
- 50 concurrent users per instance without degradation.
- TypeScript strict mode; `npx tsc --noEmit` must produce zero errors.
- Structured JSON logs with trace correlation fields.
- No cloud telemetry by default (self-hosted, privacy-preserving).
- `docker compose up --build` → all services healthy within 60s.

### Acceptance Criteria (definition of done for the scaffold)
- AC-VERIFY-1: `docker compose up --build` → all services healthy within 60s.
- AC-VERIFY-2: `GET /health` → HTTP 200 `{"status":"ok"}`.
- AC-VERIFY-3: `npx tsc --noEmit` → zero errors.
- AC-VERIFY-4: migrations run on startup; migrations table exists.
- AC-VERIFY-5: `src/routes/`, `src/services/`, `src/repositories/`, `src/db/` exist with example files.

### Note on Observability Requirements vs. Product Constraints

The org-wide `observability-requirements.md` mandates a full OpenTelemetry stack (traces,
metrics, OTLP exporter, Prometheus endpoint). The productBrief explicitly states **"no cloud
telemetry; no third-party analytics by default"**, the app is **self-hosted single-instance**
with **no service-to-service boundaries** (the only "downstream" is Postgres), and the binding
guiding principle is **"favor simplicity over clever abstractions."**

**Resolution (documented deviation):** This scaffold adopts the observability requirements'
**logging** standard in full (structured JSON, OTel-aligned field names, env-driven config,
trace/span/transaction correlation fields, redaction) but treats full distributed tracing and
a Prometheus metrics endpoint as **deferred / opt-in**, not wired by default.

Rationale for the deviation:
- There are **zero cross-service boundaries** in the MVP — distributed tracing exists to
  correlate spans *across services/queues*, of which there are none. A trace ID is still
  generated per request (for log correlation), satisfying the "every request has a traceable
  transaction ID" intent without the SDK weight.
- A full OTel SDK + OTLP exporter + Prometheus endpoint on a single self-hosted box is the
  exact "clever abstraction" the guiding principle warns against and contradicts the
  "no cloud telemetry by default" privacy stance.
- The design keeps the **seam open**: logger emits OTel-named fields, a `requestId`/`traceId`
  is created per request, and config has reserved (disabled-by-default) OTEL_* slots. Adding
  the full SDK later is additive and does not require refactoring routes/services/repositories.

This deviation is recorded against the observability requirements' "OpenTelemetry First" and
"Distributed Tracing Always" principles. The logging standard is met; tracing/metrics are
intentionally scoped out of the MVP scaffold and tracked as future work.

## Component Analysis

### Core Components
| Component | Path | Purpose | Responsibilities |
|-----------|------|---------|------------------|
| Config | `src/config.ts` | Typed, validated env config | Read `process.env` once, validate, fail-fast, export frozen typed object |
| Logger | `src/logger.ts` | Structured logging | Instantiate pino singleton with OTel-aligned fields + redaction; expose child logger factory |
| App factory | `src/app.ts` | Build configured Express app | Wire middleware, routes, error handler; **does not listen** |
| Server entry | `src/server.ts` | Process entry point | Build pool, run migrations, build app, `listen()`, handle shutdown |
| DB pool | `src/db/pool.ts` | `pg.Pool` lifecycle | Create pool from config; expose `query`/`getClient`; close on shutdown |
| Migration runner | `src/db/migrate.ts` | Programmatic migrations | Run node-pg-migrate up at startup before listen |
| Routes | `src/routes/` | HTTP layer | Parse/validate request, call service, shape HTTP response. No business logic |
| Services | `src/services/` | Domain layer | Business rules, orchestration. No HTTP, no SQL |
| Repositories | `src/repositories/` | Data layer | SQL via the pool. No business logic, no HTTP |
| Errors | `src/errors.ts` | Error taxonomy | `AppError` base + typed subclasses mapped to HTTP status |
| Async wrapper | `src/lib/asyncHandler.ts` | Error funneling | Wrap async handlers so rejections reach error middleware |
| Error middleware | `src/middleware/errorHandler.ts` | Central error→HTTP | Map errors to status + JSON body; log via request logger |
| Request context | `src/middleware/requestContext.ts` | Per-request id + logger | Generate/extract request id; attach child logger to `req` |
| Health route | `src/routes/health.ts` | Liveness check | `GET /health` → `200 {"status":"ok"}` |

### Component Interactions
```
HTTP request
  └─> Express app (app.ts)
        ├─ requestContext middleware  (assigns req.id, req.log child logger)
        ├─ pino-http access log
        ├─ router  (routes/*)         → calls service
        │                                  service (services/*) → calls repository
        │                                                            repository (repositories/*) → pool.query()
        │                                                                                              └─> PostgreSQL
        └─ errorHandler middleware    (catches AppError / unknown → JSON + status)

Process boot (server.ts):
  config (validated) ─> logger ─> pool ─> migrate(pool) ─> app(deps) ─> listen ─> ready
  SIGTERM/SIGINT ─> server.close ─> pool.end ─> exit
```

The dependency direction is strictly inward: `routes` depend on `services`, `services` depend
on `repositories`, `repositories` depend on the `pool`. No layer reaches "up". The `pool` and
`logger` are the only cross-cutting dependencies and are passed in explicitly (see Decision 2).

---

## Decision 1: App Factory Pattern

### Option 1A: Pure factory (`createApp(deps)`) + separate `server.ts`
- **Description**: `app.ts` exports `createApp(deps): Express` that wires middleware/routes and
  returns the app without calling `listen`. `server.ts` imports it, builds dependencies
  (config/logger/pool), runs migrations, then calls `app.listen`.
- **Pros**: App fully testable with supertest without binding a port; clean boot ordering lives
  in one place; dependencies are explicit and injectable for tests.
- **Cons**: Two files instead of one (trivial).
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: High.

### Option 1B: Conditional listen (`if (require.main === module)`)
- **Description**: Single `app.ts` that builds the app and conditionally listens only when run
  directly.
- **Pros**: One file.
- **Cons**: Mixes build and boot concerns; `require.main` checks are brittle under different
  runners/bundlers/ts-node; boot side effects at import time complicate testing.
- **Technical Fit**: Medium. **Complexity**: Low. **Scalability**: Medium.

### Option 1C: Framework/DI bootstrap (e.g., a container that owns app lifecycle)
- **Description**: A bootstrap layer/container resolves the app and lifecycle.
- **Pros**: Powerful for large apps.
- **Cons**: Over-engineered for a single small service; violates the simplicity principle.
- **Technical Fit**: Low. **Complexity**: High. **Scalability**: High.

**DECISION: Option 1A — pure `createApp(deps)` factory + `server.ts` entry point.**
This is the canonical testable-Express pattern, keeps boot ordering explicit, and is the
simplest thing that satisfies "app testable without starting the server."

---

## Decision 2: DB Pool Lifecycle

### Option 2A: Module-level singleton (`import { pool } from './db/pool'`)
- **Description**: Pool created at module load, imported wherever needed.
- **Pros**: Dead simple to use.
- **Cons**: Pool is created as an import side effect → hard to substitute in tests; couples
  every repository to a global; shutdown ordering is implicit.
- **Technical Fit**: Medium. **Complexity**: Low. **Scalability**: Medium.

### Option 2B: App-level singleton injected as a dependency
- **Description**: `server.ts` creates one `pool`, passes it into `createApp({ pool, logger,
  config })`; routes pass it to services, services to repositories (repositories receive the
  pool/`Queryable` via constructor or factory args).
- **Pros**: One pool per process (correct for pooling); explicit, injectable, testable (pass a
  mock/`pg-mem`/test pool); clean shutdown ordering in `server.ts`; no import-time side effects.
- **Cons**: Slightly more plumbing than a global import.
- **Technical Fit**: High. **Complexity**: Low–Medium. **Scalability**: High.

### Option 2C: `req.db` via middleware
- **Description**: Attach pool/client to every `req`.
- **Pros**: Handlers grab `req.db` easily.
- **Cons**: Couples the data layer to the HTTP request object; repositories become untestable
  outside Express; leaks transport concerns into the data layer — anti-clean-architecture.
- **Technical Fit**: Low. **Complexity**: Medium. **Scalability**: Medium.

### Option 2D: DI container
- **Description**: tsyringe/awilix resolves repositories with an injected pool.
- **Pros**: Scales to many dependencies.
- **Cons**: Abstraction overkill for this size; against the guiding principle.
- **Technical Fit**: Low. **Complexity**: High. **Scalability**: High.

**DECISION: Option 2B — single app-level `pg.Pool` created in `server.ts`, injected as an
explicit dependency** (`createApp({ config, logger, pool })`). Repositories are constructed
with a `Queryable` interface (the pool, or a client during transactions). This is correct for
connection pooling (one pool per process), keeps the data layer pure and testable, and gives
`server.ts` deterministic startup/shutdown ordering.

---

## Decision 3: Config / Env Validation

### Option 3A: Scattered `process.env` reads
- **Cons**: No validation, easy to typo, no fail-fast, no types. Violates "no hardcoded /
  unvalidated config". Rejected.

### Option 3B: Single typed `config.ts`, hand-rolled fail-fast
- **Description**: One module reads `process.env`, checks required vars, coerces types, throws
  a `ConfigurationError` listing all missing/invalid vars, exports a frozen typed object.
- **Pros**: Zero extra deps; fully typed; fail-fast at startup; simple; one source of truth.
- **Cons**: Manual validation code (small, for ~10 vars).
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: Medium.

### Option 3C: `dotenv` + `zod` schema
- **Description**: Parse `process.env` through a zod schema with coercion and defaults.
- **Pros**: Declarative, precise types inferred, great error messages, trivial to extend.
- **Cons**: One small dependency (zod). zod is already the natural choice for request-body
  validation in later CRUD features, so it pays for itself.
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: High.

### Option 3D: `convict`
- **Cons**: Heavier/older ergonomics, another dependency with less reuse than zod. Rejected.

**DECISION: Option 3C — `dotenv` + `zod` in a single `src/config.ts`.**
A zod schema with `z.coerce`, defaults, and `.parse(process.env)` gives typed, fail-fast,
self-documenting config in a few lines. zod will be reused for HTTP input validation in
FEAT-002+, so it is not a single-purpose dependency. `config.ts` exports one frozen `config`
object; **nothing else in the codebase reads `process.env`.** `dotenv` is loaded only outside
production (Compose injects real env vars).

---

## Decision 4: Migration Execution Strategy

### Option 4A: Run automatically on API startup (blocking, programmatic)
- **Description**: `server.ts` calls node-pg-migrate's programmatic API to run `up` against the
  pool **before** `app.listen`. If migrations fail, the process exits non-zero.
- **Pros**: Satisfies AC-VERIFY-4 directly ("migrations run on startup"); zero extra
  orchestration; works identically locally and in Compose; one command (`docker compose up`)
  brings up a fully-migrated DB.
- **Cons**: With multiple API replicas, concurrent migration runs could race — **not a concern**
  for single-instance self-hosted MVP, and node-pg-migrate takes an advisory lock anyway.
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: Medium (fine for this scale).

### Option 4B: Separate `npm run migrate` script only
- **Pros**: Decouples deploy from schema change.
- **Cons**: `docker compose up --build` would not produce a migrated DB on its own → fails
  AC-VERIFY-4's startup intent and adds a manual step. Rejected as the default (kept as an
  *additional* script for ops, but not the startup path).

### Option 4C: Dedicated Compose init/migrate container
- **Description**: A separate one-shot service runs migrations, API `depends_on` it.
- **Pros**: Clean separation; API image needn't contain migrate logic at runtime.
- **Cons**: Extra service, extra image build, more Compose complexity; ordering/healthcheck
  plumbing. Over-engineered for single-instance MVP.
- **Technical Fit**: Medium. **Complexity**: Medium–High. **Scalability**: High.

### Option 4D: Migration-check endpoint
- **Cons**: Migrations should never be triggered by a web request. Rejected.

**DECISION: Option 4A — run migrations programmatically at startup, blocking, before
`listen`** — and **also** provide standalone `npm run migrate:up` / `migrate:down` scripts for
ops use (Option 4B as a supplement, not the boot path). This is the simplest path that makes
`docker compose up --build` yield a healthy, fully-migrated service and directly satisfies
AC-VERIFY-1 and AC-VERIFY-4. node-pg-migrate's advisory lock guards against accidental
concurrent runs if replicas are ever added.

---

## Decision 5: Logger Wiring

### Option 5A: Module-level pino singleton in `logger.ts`, child loggers per request
- **Description**: `logger.ts` builds one pino instance configured from `config` (level,
  format, redaction, base fields `service`/`version`/`environment`). `requestContext`
  middleware creates a per-request **child logger** bound with `requestId`/`traceId`/`spanId`
  and attaches it to `req.log`. Services/repositories receive a logger via DI (the request
  child where available, else the base logger).
- **Pros**: One configured logger; per-request correlation via cheap pino children; OTel-aligned
  fields; satisfies the observability logging standard; idiomatic pino.
- **Cons**: Logger must be threaded into services/repos (already doing that with the pool, so no
  new pattern).
- **Technical Fit**: High. **Complexity**: Low. **Scalability**: High.

### Option 5B: `pino-http` only (request logging, no app loggers)
- **Pros**: One line of access logging.
- **Cons**: Gives access logs but no shared application logger for services/repos/boot. We need
  both. (We will use `pino-http` *in addition*, bound to the same instance.)

### Option 5C: Logger passed explicitly everywhere, no singleton
- **Cons**: Boot code (config/pool/migrate) needs a logger before any request exists; a base
  singleton is unavoidable. Pure explicit passing adds ceremony with no benefit here.

### Option 5D: Global `console` replacement
- **Cons**: Banned by observability requirements (no `console.*` in production code). Rejected.

**DECISION: Option 5A — single pino instance exported from `src/logger.ts`, with per-request
child loggers** created in `requestContext` middleware and surfaced as `req.log`. `pino-http`
is mounted using the **same** instance for HTTP access logs. The base logger is used for
boot/shutdown and as the default when no request context exists. Logs are OTel-aligned JSON
with `service`, `version`, `environment`, and (in request scope) `requestId`/`traceId`/`spanId`,
with redaction configured from `LOG_REDACT_PATTERNS`.

---

## Decision 6: Error Handling Architecture

### Option 6A: try/catch in every handler
- **Cons**: Repetitive, easy to forget, inconsistent responses. Rejected.

### Option 6B: Async wrapper utility only
- **Description**: `asyncHandler(fn)` wraps async handlers so rejected promises are forwarded to
  `next(err)` and reach the error middleware.
- **Pros**: Removes boilerplate; one place catches all async errors.
- **Cons**: Alone, it doesn't define *what* an error is or *which* HTTP status it maps to.

### Option 6C: Centralized error class hierarchy + status mapping
- **Description**: `AppError` base carries `statusCode`, a stable `code` string, and `isOperational`.
  Subclasses: `ValidationError`(400), `UnauthorizedError`(401), `ForbiddenError`(403),
  `NotFoundError`(404), `ConflictError`(409). A central `errorHandler` middleware maps `AppError`
  → its status/body, unknown errors → 500 (generic body, full detail logged).
- **Pros**: Consistent JSON error contract; services throw domain errors without knowing HTTP;
  routes/services stay clean; trivially extensible per feature.
- **Cons**: A little upfront structure (a few small classes).

### Option 6D: Domain error codes → HTTP map table
- **Description**: Throw plain `{code}` and map codes to statuses via a lookup table.
- **Pros**: Decoupled.
- **Cons**: Loses stack/typing benefits of error classes; map drifts from throw sites. Less
  ergonomic in TS than a class hierarchy.

**DECISION: Combine Option 6B + Option 6C.** Use an `asyncHandler` wrapper to funnel all async
rejections into Express's error pipeline, **and** a centralized `AppError` hierarchy mapped to
HTTP status by a single `errorHandler` middleware (mounted last). Services throw typed domain
errors; the middleware is the only place that knows HTTP status codes and shapes the JSON error
body. Unknown/non-operational errors return a generic 500 with full detail logged (never leaked
to the client). This keeps routes thin, services HTTP-agnostic, and the error contract uniform —
the cleanest fit for the 3-layer architecture.

---

## How the Decisions Fit Together

```
src/
├── server.ts          # entry: config→logger→pool→migrate→createApp→listen→graceful shutdown
├── app.ts             # createApp({config, logger, pool}): middleware + routes + errorHandler
├── config.ts          # zod-validated, frozen, typed env config (single process.env reader)
├── logger.ts          # pino singleton (OTel-aligned) + child factory
├── errors.ts          # AppError hierarchy
├── lib/
│   └── asyncHandler.ts
├── middleware/
│   ├── requestContext.ts   # requestId/traceId + req.log child
│   └── errorHandler.ts     # AppError→HTTP, last middleware
├── db/
│   ├── pool.ts        # createPool(config): pg.Pool + helpers + close()
│   └── migrate.ts     # runMigrations(pool, config)
├── routes/
│   ├── index.ts       # mounts feature routers
│   └── health.ts      # GET /health → 200 {"status":"ok"}
├── services/
│   └── health.service.ts   # example service (DB ping for readiness)
└── repositories/
    └── health.repository.ts # example repository (SELECT 1)
```

The four decisions reinforce each other:
- **Config (3C)** is built first and feeds everything — pool sizing, log level, DB URL, port.
- **Logger (5A)** is built from config and is available to boot, pool, and per-request scope.
- **Pool (2B)** is created once in `server.ts` and injected, giving deterministic
  migrate→listen→shutdown ordering and a pure, testable data layer.
- **App factory (1A)** receives `{config, logger, pool}` and is fully testable via supertest.
- **Migrations (4A)** run after the pool exists and before listen.
- **Error handling (6B+6C)** is wired as the terminal middleware inside `createApp`, so both
  test and production apps share the exact same error contract.

The example `health` route exercises all three layers end-to-end (route → service → repository →
pool → `SELECT 1`), satisfying AC-VERIFY-5 with a real, vertical reference slice developers copy
for FEAT-002+.

---

## Evaluation Matrix

| Criteria | 1A factory | 2B inject pool | 3C zod config | 4A startup migrate | 5A pino child | 6B+6C errors |
|----------|-----------|----------------|---------------|--------------------|---------------|--------------|
| Scalability | High | High | High | Med (fine for scale) | High | High |
| Maintainability | High | High | High | High | High | High |
| Performance | High | High | High | High | High | High |
| Security | n/a | High (no global) | High (validated) | High | High (redaction) | High (no leak) |
| Observability | High | Med | High | Med | High | High |
| Simplicity (guiding principle) | High | High | High | High | High | Med-High |
| Impl. cost | Low | Low | Low | Low | Low | Low |

---

## Observability Architecture

### Logging
- **Library**: `pino` (+ `pino-http` for access logs, `pino-pretty` dev-only).
- **Format**: Structured JSON; OTel-aligned fields. Base fields: `service`, `version`,
  `environment`. Request scope adds: `requestId`, `traceId`, `spanId`.
- **Wiring**: One pino instance in `logger.ts`; per-request child via `requestContext`
  middleware on `req.log`; services/repositories receive a logger via DI.
- **Redaction**: `redact` configured from `LOG_REDACT_PATTERNS` (default
  `password,secret,token,authorization,cookie`). Never log credentials/PII.
- **Configuration**: `LOG_LEVEL`, `LOG_FORMAT`, `LOG_OUTPUT` via `config.ts`.

### Distributed Tracing (deferred / opt-in — see deviation note in Context)
- A per-request `requestId`/`traceId` is generated (or extracted from incoming `traceparent`/
  `x-request-id`) for **log correlation** today. Full OpenTelemetry SDK + OTLP exporter is
  **not** wired in the MVP scaffold (single service, no cross-service boundaries, "no cloud
  telemetry by default"). Config reserves disabled-by-default `OTEL_*` slots so the SDK can be
  added later without touching routes/services/repositories.
- **Service boundaries**: only API → PostgreSQL. `pg` query timing is logged; no remote
  trace propagation is required because there are no downstream services.

### Metrics (deferred / opt-in)
- Standard metric names (`http_requests_total`, `http_request_duration_seconds`) are reserved
  names for a future `/metrics` endpoint. Not exposed by default in the scaffold. p95 latency is
  measured from `pino-http` request-duration logs for the MVP.

### Configuration Variables
| Variable | Purpose | Default (dev) | Required |
|----------|---------|---------------|----------|
| `NODE_ENV` | Environment | `development` | no |
| `PORT` | API listen port | `3000` | no |
| `DATABASE_URL` | Postgres connection string | — | **yes** |
| `PG_POOL_MAX` | Max pool connections | `10` | no |
| `PG_IDLE_TIMEOUT_MS` | Idle client timeout | `30000` | no |
| `PG_CONNECTION_TIMEOUT_MS` | Connect timeout | `5000` | no |
| `LOG_LEVEL` | Verbosity | `debug` (dev) / `info` (prod) | no |
| `LOG_FORMAT` | `json`/`pretty` | `pretty` (dev) / `json` (prod) | no |
| `LOG_REDACT_PATTERNS` | Redacted fields | `password,secret,token,authorization,cookie` | no |
| `MIGRATIONS_DIR` | node-pg-migrate dir | `migrations` | no |
| `RUN_MIGRATIONS_ON_START` | Toggle startup migrate | `true` | no |
| `OTEL_SDK_DISABLED` | Reserved (tracing off) | `true` | no |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Reserved | — | no |

> Compose provides `DATABASE_URL` (and others) via the `api` service `environment`. No secrets
> or URLs are hardcoded in source.

---

## Decision Summary

**Chosen approach**: A pure `createApp(deps)` Express factory with a separate `server.ts` entry
point; a single zod-validated frozen `config` module as the only `process.env` reader; one
app-level `pg.Pool` created in `server.ts` and injected through the layers; programmatic
node-pg-migrate run (blocking) on startup before `listen` (plus standalone migrate scripts); a
single pino instance with per-request child loggers (OTel-aligned JSON + redaction); and a
combined `asyncHandler` + `AppError` hierarchy + terminal `errorHandler` middleware for a
uniform error contract. Full OpenTelemetry tracing/metrics are deferred (documented deviation).

### Trade-offs Accepted
- **No full OTel tracing/metrics in the scaffold.** Acceptable: no cross-service boundaries
  exist in MVP, the privacy stance forbids default telemetry, and the seam is left open.
- **Startup migrations could race across replicas.** Acceptable: single-instance MVP; advisory
  lock mitigates; standalone scripts available if replicas are added.
- **A small amount of dependency plumbing** (pool + logger threaded through layers) instead of
  module-global imports. Acceptable and desirable: it is what makes the data layer testable and
  the architecture clean.
- **One extra dependency (zod).** Acceptable: reused for HTTP validation in later features.

## Implementation Guidelines

1. **Project init**: `npm init`; install `express`, `pg`, `pino`, `pino-http`, `zod`,
   `dotenv`, `node-pg-migrate`; dev-deps `typescript`, `@types/*`, `ts-node`, `tsx` (or
   `ts-node-dev`), `pino-pretty`, `supertest`, plus the test runner used project-wide.
2. **tsconfig**: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"esModuleInterop": true`,
   `target` ES2022, `module` NodeNext, `outDir dist`, `rootDir src`. `npx tsc --noEmit` must pass
   (AC-VERIFY-3).
3. **`config.ts`**: define a zod schema with `z.coerce.number()`/defaults; load `dotenv` only
   when `NODE_ENV !== 'production'`; `schema.parse(process.env)`; on `ZodError` throw a
   `ConfigurationError` listing every offending var and exit non-zero. Export
   `export const config = Object.freeze(parsed)`. **No other file may read `process.env`.**
4. **`logger.ts`**: `export const logger = pino({ level: config.logLevel, redact: ..., base:
   { service, version, environment } }, dev ? pretty-stream : undefined)`. Export a `child`
   helper. No `console.*` anywhere.
5. **`db/pool.ts`**: `export function createPool(config): Pool` using `connectionString`,
   `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`. Export `closePool(pool)`. Expose a
   `Queryable` type (`Pick<Pool, 'query'>`) that repositories depend on.
6. **`db/migrate.ts`**: `export async function runMigrations(config)` calling node-pg-migrate's
   programmatic `migrate({ databaseUrl, dir, direction: 'up', migrationsTable: 'pgmigrations',
   ... })`. Log start/finish via the base logger.
7. **`errors.ts`**: `AppError` base (`statusCode`, `code`, `isOperational=true`); subclasses
   `ValidationError`(400), `UnauthorizedError`(401), `ForbiddenError`(403), `NotFoundError`(404),
   `ConflictError`(409).
8. **`lib/asyncHandler.ts`**: `const asyncHandler = (fn) => (req,res,next) =>
   Promise.resolve(fn(req,res,next)).catch(next);` Wrap every async route handler with it.
9. **`middleware/requestContext.ts`**: read `traceparent`/`x-request-id` or generate a UUID;
   set `req.id`; attach `req.log = logger.child({ requestId, traceId })`; echo `x-request-id` on
   the response.
10. **`middleware/errorHandler.ts`** (mounted last): if `err instanceof AppError` →
    `res.status(err.statusCode).json({ error: { code, message } })`; else log full error via
    `req.log.error` and return `500 { error: { code: 'INTERNAL', message: 'Internal Server
    Error' } }`. Never leak stack/detail to the client.
11. **`app.ts`**: `export function createApp({ config, logger, pool }): Express` →
    `express.json()`, `pino-http({ logger })`, `requestContext`, mount `routes/index`, then
    `errorHandler` last. Returns app; **does not listen**.
12. **`server.ts`**: build `config` → `logger`; if `config.runMigrationsOnStart` await
    `runMigrations(config)`; `const pool = createPool(config)`; `const app = createApp({config,
    logger, pool})`; `const server = app.listen(config.port)`; register SIGTERM/SIGINT handlers
    that `server.close()` then `pool.end()`.
13. **Health vertical slice**: `health.repository.ts` → `SELECT 1`; `health.service.ts` →
    `checkReadiness()`; `routes/health.ts` → `GET /health` returns `200 {"status":"ok"}`
    (liveness; readiness/DB-ping optional but recommended). Satisfies AC-VERIFY-2 and AC-VERIFY-5.
14. **Repositories** take a `Queryable` (pool or client) and a logger via constructor/factory;
    **services** take repositories + logger; **routes** take services. No layer imports a global
    pool. No SQL in services, no HTTP in services/repositories.
15. **Docker Compose**: two services. `postgres` (official image, named volume, `healthcheck:
    pg_isready`). `api` builds from Dockerfile, `depends_on: postgres (condition:
    service_healthy)`, `environment` supplies `DATABASE_URL` etc., `healthcheck` curls
    `/health`. Target: healthy < 60s (AC-VERIFY-1).
16. **package.json scripts**: `dev` (tsx watch server.ts), `build` (tsc), `start` (node
    dist/server.js), `migrate:up`, `migrate:down`, `typecheck` (tsc --noEmit), `test`.

## Validation Checklist
- [x] Meets all system requirements
- [x] Respects technical constraints (prescribed stack, single service, Compose-only)
- [x] Addresses NFRs (pooling for 50 concurrent, structured logs, strict TS, p95 path)
- [x] Technically feasible with current constraints
- [x] Risks identified and acceptable (below)
- [x] Complies with the binding guiding principle ("favor simplicity over clever abstractions")
- [x] Deviation from observability "tracing/metrics always" documented and justified
- [x] Logging strategy consistent with observability-requirements.md
- [x] Satisfies AC-VERIFY-1..5

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Postgres not ready when API starts | Med | High | Compose `depends_on: service_healthy` + `pg_isready` healthcheck; pool connect timeout + startup retry |
| Migrations fail on boot, app half-up | Low | High | Run migrations before `listen`; exit non-zero on failure so Compose marks unhealthy |
| Concurrent migration runs (future replicas) | Low | Med | node-pg-migrate advisory lock; `RUN_MIGRATIONS_ON_START=false` + standalone job when scaling |
| Over-engineering creep | Med | Med | Decisions favor injection + small modules, no DI container/no OTel SDK; enforce in review |
| Sensitive data in logs | Low | High | pino `redact` from `LOG_REDACT_PATTERNS`; review checklist; never log auth headers/cookies |
| Strict TS friction with `pg`/`req` augmentation | Med | Low | Declare `req.id`/`req.log` via Express type augmentation; typed `Queryable` |

## Next Steps
1. Scaffold project, tsconfig (strict), and package.json scripts (Guidelines 1–2, 16).
2. Implement `config.ts`, `logger.ts`, `errors.ts`, `lib/asyncHandler.ts` (Guidelines 3,4,7,8).
3. Implement `db/pool.ts` + `db/migrate.ts` and an initial baseline migration (Guidelines 5,6).
4. Implement middleware, `app.ts`, `server.ts` (Guidelines 9–12).
5. Implement the `health` vertical slice across all three layers (Guideline 13).
6. Author `Dockerfile` + `docker-compose.yml` with healthchecks (Guideline 15).
7. Verify AC-VERIFY-1..5 (`docker compose up --build`, `GET /health`, `tsc --noEmit`,
   migrations table, directory/example files).
