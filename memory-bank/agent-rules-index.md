# Agent Rules Index

Generated: 2026-07-02T21:00:00Z
Indexed: 14 rules (0 human-authored, 14 learned) | Rejected: 0 (unsafe) | Warnings: 0

## Validation Summary

### Health Check
- Total rules: 14
- Human-authored rules: 0
- Learned rules (auto-generated): 14
- Estimated max context: ~120 lines per typical match set (OK)
- Conflicts detected: 0

### ⚠️ Warnings
None.

### 🚫 Rejected Rules (Unsafe)
None — all 14 files contain software-development-only content (coding standards, architecture patterns, testing conventions).

---

## Rules by File Pattern

| Pattern | Rule | Priority | Lines |
|---------|------|----------|-------|
| `*.test.*`, `*.test.tsx`, `*.test.ts`, `*.spec.*`, `memory-bank/uat/**`, `memory-bank/e2e-journeys/**` | [testing-patterns.md](agent-rules/_learned/testing-patterns.md) | medium | 38 |
| `memory-bank/creative/**`, `memory-bank/tasks/**`, `backend/src/routes/**`, `backend/src/events/**`, `backend/src/services/**`, `**/*` | [architecture-foundation.md](agent-rules/_learned/architecture-foundation.md) | medium | 21 |
| `src/routes/*.ts`, `src/routes/**/*.ts` | [api-design.md](agent-rules/_learned/api-design.md) | medium | 18 |
| `backend/src/routes/auth.ts`, `backend/src/routes/*.ts`, `backend/src/middleware/*.ts`, `backend/migrations/*.js`, `backend/src/**/*.ts`, `frontend/src/**/*.tsx` | [security.md](agent-rules/_learned/security.md) | medium | 20 |
| `src/api/hooks.ts`, `src/api/**`, `*.hooks.ts` | [react-query-patterns.md](agent-rules/_learned/react-query-patterns.md) | medium | 16 |
| `**/repositories/**/*.ts`, `**/migrations/**`, `**/services/*.ts` | [data-integrity.md](agent-rules/_learned/data-integrity.md) | medium | 24 |
| `**/*.ts`, `**/*.tsx` | [error-handling.md](agent-rules/_learned/error-handling.md) | low | 12 |
| `memory-bank/creative/**`, `src/**/*.ts` | [observability-standards.md](agent-rules/_learned/observability-standards.md) | low | 11 |
| `frontend/src/**/*.tsx`, `frontend/src/api/endpoints.ts` | [data-validation.md](agent-rules/_learned/data-validation.md) | low | 11 |
| `*.tsx`, `*.jsx`, `src/components/**` | [frontend-accessibility.md](agent-rules/_learned/frontend-accessibility.md) | low | 12 |
| `docker-compose.yml`, `docker-compose*.yml`, `Dockerfile*`, `**/vite.config.*` | [docker-compose.md](agent-rules/_learned/docker-compose.md) | low | 13 |
| `frontend/src/hooks/*.ts`, `**/*Feed*.ts`, `**/*sse*.ts`, `**/*EventSource*.ts` | [sse-client.md](agent-rules/_learned/sse-client.md) | low | 13 |
| `src/services/*.ts`, `src/services/**/*.ts` | [service-design.md](agent-rules/_learned/service-design.md) | low | 12 |
| `src/components/**/*.tsx`, `src/components/**/*.module.css` | [ui-patterns.md](agent-rules/_learned/ui-patterns.md) | low | 11 |

## Rules by Path

| Path Contains | Rule | Priority | Lines |
|---------------|------|----------|-------|
| `backend/src/services/` | [data-integrity.md](agent-rules/_learned/data-integrity.md), [service-design.md](agent-rules/_learned/service-design.md), [architecture-foundation.md](agent-rules/_learned/architecture-foundation.md) | medium/low/medium | — |
| `backend/src/routes/` | [api-design.md](agent-rules/_learned/api-design.md), [security.md](agent-rules/_learned/security.md), [architecture-foundation.md](agent-rules/_learned/architecture-foundation.md) | medium/medium/medium | — |
| `frontend/src/components/` | [frontend-accessibility.md](agent-rules/_learned/frontend-accessibility.md), [ui-patterns.md](agent-rules/_learned/ui-patterns.md) | low/low | — |
| `frontend/src/api/` | [react-query-patterns.md](agent-rules/_learned/react-query-patterns.md), [data-validation.md](agent-rules/_learned/data-validation.md) | medium/low | — |

## Rules by Topic

| Keywords | Rule | Priority |
|----------|------|----------|
| testing-patterns, typescript, test-fixtures, uat, browser-automation | [testing-patterns.md](agent-rules/_learned/testing-patterns.md) | medium |
| architecture, creative-phase, foundation-tasks, planning, sse, event-bus, event-emission, routing, retry, design | [architecture-foundation.md](agent-rules/_learned/architecture-foundation.md) | medium |
| api-design, routing | [api-design.md](agent-rules/_learned/api-design.md) | medium |
| security, authentication, session-management, pii, migrations, outbound-http, credential-exposure, ssrf, trace-context | [security.md](agent-rules/_learned/security.md) | medium |
| react-query, optimistic-updates, frontend-state | [react-query-patterns.md](agent-rules/_learned/react-query-patterns.md) | medium |
| data-integrity, transactions, database, data-migration, event-sourcing | [data-integrity.md](agent-rules/_learned/data-integrity.md) | medium |
| error-handling, observability, database | [error-handling.md](agent-rules/_learned/error-handling.md) | low |
| observability, standards, product-fit, documentation | [observability-standards.md](agent-rules/_learned/observability-standards.md) | low |
| data-validation, nullable-fields, form-handling | [data-validation.md](agent-rules/_learned/data-validation.md) | low |
| frontend-accessibility, wcag, forms | [frontend-accessibility.md](agent-rules/_learned/frontend-accessibility.md) | low |
| docker, docker-compose, dev-environment, frontend-dev, vite, hot-reload | [docker-compose.md](agent-rules/_learned/docker-compose.md) | low |
| sse, eventsource, frontend, auth, cors | [sse-client.md](agent-rules/_learned/sse-client.md) | low |
| service-design, dependency-injection | [service-design.md](agent-rules/_learned/service-design.md) | low |
| ui-patterns, popover, css, shared-constants | [ui-patterns.md](agent-rules/_learned/ui-patterns.md) | low |

---

## Conflict Resolutions

None detected — all rules are additive across distinct topics with no contradictory instructions on overlapping patterns.
