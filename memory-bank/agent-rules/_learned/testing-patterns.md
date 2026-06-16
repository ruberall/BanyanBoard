---
name: "Learned: Testing Patterns"
globs: ["**/*.test.ts", "**/*.test.js", "**/jest.config.*", "**/__tests__/**"]
topics: ["testing", "jest", "db-integration", "ci"]
priority: medium
evidence_count: 4
last_updated: 2026-06-16
auto_generated: true
---

# Testing Patterns

- Write `testMatch` globs in `jest.config.ts` as project-relative patterns (`'**/__tests__/**/*.test.ts'`) rather than `<rootDir>`-prefixed paths; `<rootDir>` interpolation produces backslash separators on Windows that break Jest's glob engine inside git worktrees.
- Use a runtime environment guard (`const describeIfDb = DATABASE_URL ? describe : describe.skip`) rather than database mocks for integration tests that require a live database; guards make tests CI-correct (pass with DB, skip gracefully without) while mocks test the mock, not the real behavior.
- When a repository method issues multiple sequential DB queries, chain `mockResolvedValueOnce` per call in order — a single `mockResolvedValue` will return the same row for all calls and corrupt assertions on subsequent queries.
- When mocking a class instance for service tests, cast as `as unknown as jest.Mocked<ClassName>` — plain `jest.fn()` methods without this cast infer a return type of `never`, causing `mockResolvedValueOnce` argument errors.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Jest Windows testMatch backslash bug | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| describeIfDb skip guard over DB mocks | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| Multi-query stub mismatch (COUNT+SELECT mockResolvedValueOnce) | [reflection-TASK-006.md](../reflection/reflection-TASK-006.md) | 2026-06-16 |
| Service test `jest.Mocked<T>` cast to avoid `never` inference | [reflection-TASK-007.md](../reflection/reflection-TASK-007.md) | 2026-06-16 |
