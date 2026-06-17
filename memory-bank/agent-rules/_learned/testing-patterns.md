---
name: "Learned: Testing Patterns"
globs: ["*.test.*", "*.test.tsx", "*.test.ts", "*.spec.*"]
topics: ["testing-patterns", "typescript", "test-fixtures"]
priority: medium
evidence_count: 4
last_updated: 2026-06-17
auto_generated: true
---

# Testing Patterns

- Use `supertest` agent in integration tests to avoid port-binding conflicts across test suites.
- Test validation middleware by asserting both the HTTP status code and the error message body structure.
- Validate paginated endpoint tests include assertions on `total`, `page`, and `limit` fields — not just `data`.
- Declare fixture constants in test files only if they are referenced in at least one assertion — unused typed constants cause TS6133 errors that fail the build pipeline.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| supertest agent pattern | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| Validation middleware test assertions | [reflection-TASK-002.md](../reflection/reflection-TASK-002.md) | 2026-06-15 |
| Pagination field assertions | [reflection-TASK-006.md](../reflection/reflection-TASK-006.md) | 2026-06-16 |
| Unused ALL_COLUMN_IDS in useMoveCard.test.tsx caused TS6133 build failure | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
