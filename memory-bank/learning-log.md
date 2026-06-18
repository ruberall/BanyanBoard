# Learning Log

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
