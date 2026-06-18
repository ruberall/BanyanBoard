---
name: "Learned: Testing Patterns"
globs: ["*.test.*", "*.test.tsx", "*.test.ts", "*.spec.*"]
topics: ["testing-patterns", "typescript", "test-fixtures"]
priority: medium
evidence_count: 10
last_updated: 2026-06-18
auto_generated: true
---

# Testing Patterns

- Use `supertest` agent in integration tests to avoid port-binding conflicts across test suites.
- Test validation middleware by asserting both the HTTP status code and the error message body structure.
- Validate paginated endpoint tests include assertions on `total`, `page`, and `limit` fields — not just `data`.
- Declare fixture constants in test files only if they are referenced in at least one assertion — unused typed constants cause TS6133 errors that fail the build pipeline.
- In Playwright configs for suites sharing a live database, set `workers: 1` to prevent isolation race conditions unless each test namespaces its own data.
- When testing TanStack Query error states in Playwright, wait for `[role="status"]` to disappear before asserting `[role="alert"]` — this spans the full retry cycle rather than racing against it.
- When wiring a PostgreSQL-backed middleware (e.g., `connect-pg-simple`) into `createApp`, add a `NODE_ENV === 'test'` conditional that substitutes an in-memory store to prevent the real store constructor from intercepting stub pool mock chains in route integration tests.
- When adding Playwright E2E specs to a project that also uses vitest, add `exclude: ['e2e/**']` to `vitest.config.ts` before committing the first `.spec.ts` file to the `e2e/` directory.
- Test SSE endpoints using native `http.createServer` + `http.get()` against a random bound port — supertest 7 blocks `server.close()` on open SSE connections and never sends `buffer(false)` requests.
- Add `src/**/__tests__` (recursive glob) to `tsconfig.json` `exclude`, not just `src/__tests__` — nested test helper files cause TS2393 duplicate declaration errors when only the top-level directory is excluded.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| supertest agent pattern | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| Validation middleware test assertions | [reflection-TASK-002.md](../reflection/reflection-TASK-002.md) | 2026-06-15 |
| Pagination field assertions | [reflection-TASK-006.md](../reflection/reflection-TASK-006.md) | 2026-06-16 |
| Unused ALL_COLUMN_IDS in useMoveCard.test.tsx caused TS6133 build failure | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
| Playwright workers=1 for shared-DB suites | [reflection-TASK-010.md](../reflection/reflection-TASK-010.md) | 2026-06-17 |
| TanStack Query retry cycle wait pattern | [reflection-TASK-010.md](../reflection/reflection-TASK-010.md) | 2026-06-17 |
| MemoryStore fallback for stub-pool tests (connect-pg-simple) | [reflection-TASK-011.md](../reflection/reflection-TASK-011.md) | 2026-06-18 |
| vitest/Playwright coexistence: exclude e2e/** | [reflection-TASK-011.md](../reflection/reflection-TASK-011.md) | 2026-06-18 |
| SSE endpoints require native http.get, not supertest | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
| tsconfig exclude must use src/**/__tests__ recursive glob | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
