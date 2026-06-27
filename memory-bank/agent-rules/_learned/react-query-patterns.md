---
name: "Learned: React Query Patterns"
globs: ["src/api/hooks.ts", "src/api/**", "*.hooks.ts"]
topics: ["react-query", "optimistic-updates", "frontend-state"]
priority: low
evidence_count: 2
last_updated: 2026-06-27
auto_generated: true
---

# React Query Patterns

- For optimistic mutations touching two cache keys, snapshot both keys in `onMutate`, rewrite both atomically with `setQueryData`, restore both in `onError`, and invalidate both in `onSettled` — updating only the destination key leaves the source stale on rollback.
- For single-key optimistic mutations, snapshot the current cache value in `onMutate` and restore it via `setQueryData` in `onError` before calling `invalidateQueries` in `onSettled` — without the snapshot, a failed PATCH leaves the optimistic value permanently applied until the next background refetch.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| useMoveCard requires both-column cache rewrite for kanban card moves | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
| Single-key optimistic mutation snapshot/restore pattern | [reflection-TASK-014.md](../reflection/reflection-TASK-014.md) | 2026-06-27 |
