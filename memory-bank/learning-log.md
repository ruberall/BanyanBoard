# Learning Log

Chronological record of all pattern extraction events.

---

## 2026-06-13 — TASK-001 Reflection

### Extracted Patterns

- **testing** → created `agent-rules/_learned/testing-patterns.md` (evidence count: 2)
  - Jest Windows testMatch backslash bug in worktrees
  - `describeIfDb` skip guard pattern for DB integration tests
- **architecture** → created `agent-rules/_learned/architecture-foundation.md` (evidence count: 1)
  - Front-load all decisions on foundation/scaffold tasks before writing code
- **observability** → created `agent-rules/_learned/observability-standards.md` (evidence count: 1)
  - Document observability deviations explicitly in creative phase with rationale

### systemPatterns.md Updates

- None (patterns already captured in initial systemPatterns.md write during TASK-001 build)

---

## 2026-06-15 — TASK-002 Reflection

### Extracted Patterns

- **data-integrity** → created `agent-rules/_learned/data-integrity.md` (evidence count: 1)
  - Always wrap multi-statement writes in an explicit transaction
- **api-design** → created `agent-rules/_learned/api-design.md` (evidence count: 1)
  - Return full parent+children shape in 201 when create auto-seeds child records

### systemPatterns.md Updates

- None

---

## 2026-06-16 — TASK-006 Reflection

### Extracted Patterns

- **testing-patterns** → amended `agent-rules/_learned/testing-patterns.md` (evidence count: 3)
  - Multi-query stub mismatch: use `mockResolvedValueOnce` per query, not a single `mockResolvedValue`
- **api-design** → amended `agent-rules/_learned/api-design.md` (evidence count: 2)
  - Add AC-COMPAT-1 for breaking shape changes and update route tests at the same phase

### systemPatterns.md Updates

- None (learnings are coding/testing practices, not novel architectural patterns)
