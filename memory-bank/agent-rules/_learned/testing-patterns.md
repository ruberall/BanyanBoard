---
name: "Learned: Testing Patterns"
globs: ["**/*.test.ts", "**/*.test.js", "**/jest.config.*", "**/__tests__/**"]
topics: ["testing", "jest", "db-integration", "ci"]
priority: low
evidence_count: 2
last_updated: 2026-06-13
auto_generated: true
---

# Testing Patterns

- Write `testMatch` globs in `jest.config.ts` as project-relative patterns (`'**/__tests__/**/*.test.ts'`) rather than `<rootDir>`-prefixed paths; `<rootDir>` interpolation produces backslash separators on Windows that break Jest's glob engine inside git worktrees.
- Use a runtime environment guard (`const describeIfDb = DATABASE_URL ? describe : describe.skip`) rather than database mocks for integration tests that require a live database; guards make tests CI-correct (pass with DB, skip gracefully without) while mocks test the mock, not the real behavior.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Jest Windows testMatch backslash bug | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| describeIfDb skip guard over DB mocks | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
