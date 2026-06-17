---
name: "Learned: React Query Patterns"
globs: ["src/api/hooks.ts", "src/api/**", "*.hooks.ts"]
topics: ["react-query", "optimistic-updates", "frontend-state"]
priority: low
evidence_count: 1
last_updated: 2026-06-17
auto_generated: true
---

# React Query Patterns

- For optimistic mutations touching two cache keys, snapshot both keys in `onMutate`, rewrite both atomically with `setQueryData`, restore both in `onError`, and invalidate both in `onSettled` — updating only the destination key leaves the source stale on rollback.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| useMoveCard requires both-column cache rewrite for kanban card moves | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
