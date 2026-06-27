---
name: "Learned: API Design"
globs: ["src/routes/*.ts", "src/routes/**/*.ts"]
topics: ["api-design", "routing"]
priority: medium
evidence_count: 3
last_updated: 2026-06-27
auto_generated: true
---

# API Design

- Register `PATCH /:id/[action]` routes before `PATCH /:id` in Express routers — prevents Express matching the action segment as the `:id` param; add a comment with the WHY.
- Use `queryClient.removeQueries()` (not `invalidateQueries()`) in a logout mutation's `onSuccess` to clear auth state immediately; `invalidateQueries` triggers a background refetch that causes a brief stale-cache flash of authenticated state before the 401 resolves.
- When adding a nullable column to a table, update the `RETURNING` clause in every repository query method (create, findAll, findById, update, move) in a single commit — partial RETURNING updates produce inconsistent API responses where some endpoints include the new field and others omit it.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| PATCH /:id/move registration order | [reflection-TASK-008.md](../reflection/reflection-TASK-008.md) | 2026-06-16 |
| removeQueries vs invalidateQueries on logout | [reflection-TASK-011.md](../reflection/reflection-TASK-011.md) | 2026-06-18 |
| RETURNING clause must cover all repository methods when adding a column | [reflection-TASK-014.md](../reflection/reflection-TASK-014.md) | 2026-06-27 |
