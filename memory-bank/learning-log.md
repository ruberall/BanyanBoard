# Learning Log

---

## 2026-07-02 - Consolidation (during TASK-020 archive)

- Files before: 14, Files after: 14
- Merged: 0 files
- Expired: 0 bullets (0 files deleted) — no rules older than 90 days
- Promoted: 1 file (`data-integrity.md` low → medium; evidence_count reached threshold of 3 ≥ 3)
- Pruned: 0 files (no file exceeds 15-bullet max)

---

## 2026-07-02 - TASK-020 Reflection

### Extracted Patterns
- **data-integrity** → amended `agent-rules/_learned/data-integrity.md` (evidence count: 2 → 3)
  - Write-once event/audit table payloads are captured immutably at emit time; a formatting bug fix is forward-only and requires an explicit backfill-or-accept decision for existing rows
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 16 → 17)
  - Verify a UAT/UX-walker's keyboard/timing-interaction claim via direct DOM state check, not the walker's self-reported before/after comparison

### systemPatterns.md Updates
- None (no novel architecture pattern — both learnings are process/testing guidance, not system design)

---

## 2026-07-01 - Consolidation (during TASK-019 archive)

- Files before: 14, Files after: 14
- Merged: 0 files
- Expired: 0 bullets (0 files deleted)
- Promoted: 1 file (`security.md` low → medium; evidence_count reached threshold of 4 ≥ 3)
- Pruned: 6 bullets from `testing-patterns.md` (bullet count 16 → 10; exceeded 15-bullet max; removed 6 oldest single-evidence bullets from TASK-011 to TASK-014)
- All rules recent (< 90 days); no stale expiry candidates

---

## 2026-07-01 - TASK-019 Reflection

### Extracted Patterns
- **security** → amended `agent-rules/_learned/security.md` (evidence count: 2 → 4)
  - WebhookTransport outbound HTTP: must inject W3C traceparent, never log raw URL, never echo URL in API error response
  - maskWebhookUrl() in RulesList — raw webhook_url rendered in UI exposed embedded credentials
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 15 → 16)
  - WebhookDispatcher per-step DB write assertion: use fake timers across 30s backoff, assert state after each attempt not just terminal state
- **architecture-foundation** → amended `agent-rules/_learned/architecture-foundation.md` (evidence count: 5 → 6)
  - trigger_executions separate from workflow_rule_triggers — UUID FK vs varchar constant identity model conflict; additive scope boundary enforced

### systemPatterns.md Updates
- None (patterns captured in _learned files; no novel system-wide architectural additions)

---

## 2026-06-28 - TASK-018 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 15)
  - Wholesale `vi.mock` gap: new hook export → undefined in dependent tests (BoardPage, KanbanBoard)
  - Missing `vi` import in existing component test files

### systemPatterns.md Updates
- None (learnings are testing practices, not architectural patterns)

---

## 2026-06-28 - Consolidation (during TASK-017 archive)

- Files before: 15, Files after: 14
- Merged: 1 file (`architecture-patterns.md` → `architecture-foundation.md`; evidence_count: 4→5)
- Expired: 0 bullets (0 files deleted)
- Promoted: 0 files (no low-priority file reached evidence_count threshold of 3)
- Pruned: 0 excess bullets
- All rules recent (< 90 days); no stale expiry candidates

---

## 2026-06-28 - TASK-017 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 13) — read backend type definitions before asserting frontend interface shapes
- **architecture-patterns** → amended `agent-rules/_learned/architecture-patterns.md` (evidence count: 2) — annotate creative phase utilities when per-attempt callbacks require a manual loop (NOTE: file was created in this same session for TASK-017 learnings; merged here)
- **error-handling** → created `agent-rules/_learned/error-handling.md` (evidence count: 1) — populate trigger_error from last delivery error on exhaustion for audit-trail self-sufficiency
- **api-design** → amended `agent-rules/_learned/api-design.md` (evidence count: 4) — mark additive response fields optional so existing consumers compile without changes

### systemPatterns.md Updates
- None (no novel system-wide architectural patterns)

---

## 2026-06-27 - Consolidation (during TASK-016 archive)

- Files before: 14, Files after: 13
- Merged: 1 file (`architecture-patterns.md` → `architecture-foundation.md`; evidence_count: 3→4)
- Expired: 0 bullets (0 files deleted)
- Promoted: 0 files
- Pruned: 0 excess bullets
- All rules recent (< 90 days); no stale expiry candidates

---

## 2026-06-27 - TASK-016 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 12) — union hook branch coverage, SSE waitForRequest E2E barrier
- **service-design** → amended `agent-rules/_learned/service-design.md` (evidence count: 2) — construction site completeness
- **architecture-patterns** → created `agent-rules/_learned/architecture-patterns.md` (evidence count: 1) — event service router wiring verification

### systemPatterns.md Updates
- None (architecture-patterns learning is captured in new _learned file; not a system-wide novel pattern)

---

## 2026-06-27 - Consolidation (during TASK-013 archive)

- Files before: 12, Files after: 12
- Merged: 0 files
- Expired: 0 bullets (0 files deleted)
- Promoted: 1 file (`react-query-patterns.md` low → medium; evidence_count reached threshold of 3)
- Pruned: 0 excess bullets
- All rules recent (< 90 days); no stale expiry candidates

---

## 2026-06-27 - Consolidation (during TASK-015 archive)

- Files before: 14, Files after: 14
- Merged: 0 files
- Expired: 0 bullets (0 files deleted)
- Promoted: 0 files (no file crossed evidence_count threshold of 3 this cycle)
- Pruned: 6 bullets from `testing-patterns.md` (bullet count 16 → 10; exceeded 15-bullet max; removed 6 oldest single-evidence bullets from TASK-001 to TASK-010)

---

## 2026-06-27 - TASK-015 Reflection

### Extracted Patterns
- **data-validation** → created `agent-rules/_learned/data-validation.md` (evidence count: 1) — conditional spread for NULL vs empty string
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 16) — co-located test placement + mock arity mismatch
- **security** → amended `agent-rules/_learned/security.md` (evidence count: 2) — PII in seed migrations must use env var substitution

### systemPatterns.md Updates
- None (no novel architectural patterns)

---

## 2026-06-27 - TASK-013 Reflection

### Extracted Patterns
- **ui-patterns** → created `agent-rules/_learned/ui-patterns.md` (evidence count: 1) — position:fixed popover shared constant rule
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 14) — PLAYWRIGHT_UNVERIFIED commit pattern
- **react-query-patterns** → amended `agent-rules/_learned/react-query-patterns.md` (evidence count: 3) — deferred rollback wiring as reliability debt
- **data-integrity** → amended `agent-rules/_learned/data-integrity.md` (evidence count: 2) — reversible migration down() rule

### systemPatterns.md Updates
- None (component-level and testing patterns, not system architecture)

---

## 2026-06-27 - Consolidation (during TASK-014 archive)

- Files before: 11, Files after: 11
- Merged: 0 files
- Expired: 0 bullets (0 files deleted)
- Promoted: 1 file (`api-design.md` low → medium; evidence_count reached threshold of 3)
- Pruned: 0 excess bullets
- All rules recent (< 90 days); no stale expiry candidates

---

## 2026-06-27 - TASK-013 Reflection

### Extracted Patterns
- **ui-patterns** → created `agent-rules/_learned/ui-patterns.md` (evidence count: 1) — position:fixed popover shared constant rule
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 14) — PLAYWRIGHT_UNVERIFIED commit pattern
- **react-query-patterns** → amended `agent-rules/_learned/react-query-patterns.md` (evidence count: 3) — deferred rollback wiring as technical debt
- **data-integrity** → amended `agent-rules/_learned/data-integrity.md` (evidence count: 2) — reversible migration down() rule

---

## 2026-06-27 - TASK-014 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 13) — RTL fireEvent + rAF timing; fixture type mismatch fix; Playwright HMR state
- **frontend-accessibility** → amended `agent-rules/_learned/frontend-accessibility.md` (evidence count: 2) — useEffect dismiss listener timing + rAF guard redundancy

### systemPatterns.md Updates
- None (learnings are component-level patterns, not system architecture)

---

## 2026-06-22 - Consolidation (during TASK-012 re-archive)

- Files before: 12, Files after: 11
- Merged: 1 file (`docker-dev-environment.md` → `docker-compose.md`; both Docker/frontend-dev; file count exceeded 10-file cap)
- Expired: 0 bullets (0 files deleted)
- Promoted: 1 file (`architecture-foundation.md` low → medium; evidence_count reached threshold of 3)
- Pruned: 0 excess bullets
- All rules recent (< 90 days); no stale expiry candidates

---

## 2026-06-22 - TASK-012 Post-Archive Reflection (re-run)

### Extracted Patterns
- **docker-dev-environment** → created `agent-rules/_learned/docker-dev-environment.md` (evidence count: 1)
  - Restart Docker frontend container after writing source files while container was stopped (Windows inotify gap)
- **sse-client** → created `agent-rules/_learned/sse-client.md` (evidence count: 2)
  - Use absolute VITE_API_URL base for EventSource URL (relative URLs hit Vite dev server, not API)
  - Add `{ withCredentials: true }` to EventSource when API uses session-cookie auth

### systemPatterns.md Updates
- None — these are client-side configuration patterns, not architecture patterns

---

## 2026-06-18 - TASK-012 Reflection Learnings

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 8 → 10)
  - SSE endpoints require native `http.createServer` + `http.get()` — supertest 7 incompatible with long-lived streaming connections
  - `tsconfig.json` must exclude `src/**/__tests__` (recursive) not just `src/__tests__`
- **architecture** → amended `agent-rules/_learned/architecture-foundation.md` (evidence count: 1 → 3)
  - Subscribe-before-flush ordering for SSE endpoints with history replay
  - `DomainEventBus` as `Map<scopeId, Set<handler>>` vs Node.js `EventEmitter` singleton

### systemPatterns.md Updates
- Subscribe-before-flush SSE pattern added to Domain Event Pattern section (by Documentation Agent)

---

## 2026-06-18 - Consolidation (during TASK-011 archive)

- Files before: 10, Files after: 10
- Merged: 0 files
- Expired: 0 bullets (0 files deleted)
- Promoted: 0 files (testing-patterns already at medium)
- Pruned: 0 excess bullets
- All rules recent (< 90 days); no stale expiry candidates

---

## 2026-06-18 - TASK-011 Reflection

### Extracted Patterns
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 8)
  - MemoryStore fallback for stub-pool integration tests (NODE_ENV === 'test' conditional in createApp)
  - vitest/Playwright coexistence: add `exclude: ['e2e/**']` to vitest.config.ts
- **security** → created `agent-rules/_learned/security.md` (evidence count: 1)
  - Call `req.session.regenerate()` before assigning session userId on login/register
- **api-design** → amended `agent-rules/_learned/api-design.md` (evidence count: 2)
  - Use `removeQueries()` not `invalidateQueries()` in logout mutation onSuccess

### systemPatterns.md Updates
- None — TanStack Query auth state patterns were already added during Phase 2 build

---

## 2026-06-17 - TASK-009 Reflection

### Extracted Patterns
- **frontend-accessibility** → created `agent-rules/_learned/frontend-accessibility.md` (evidence count: 1)
- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 4)
- **react-query** → created `agent-rules/_learned/react-query-patterns.md` (evidence count: 1)
- **docker-compose** → created `agent-rules/_learned/docker-compose.md` (evidence count: 1)

### systemPatterns.md Updates
- None (frontend patterns documented in reflection; architecture patterns already captured during build phases)

---

## 2026-06-16 - TASK-008 Reflection

### Extracted Patterns
- **api-design** → created `agent-rules/_learned/api-design.md` (evidence count: 1)
- **service-design** → created `agent-rules/_learned/service-design.md` (evidence count: 1)

### systemPatterns.md Updates
- None (suggestions deferred to human review)
