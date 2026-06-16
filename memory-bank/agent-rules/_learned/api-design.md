---
name: "Learned: API Design"
globs: ["src/routes/*.ts", "src/routes/**/*.ts"]
topics: ["api-design", "routing"]
priority: low
evidence_count: 1
last_updated: 2026-06-16
auto_generated: true
---

# API Design

- Register `PATCH /:id/[action]` routes before `PATCH /:id` in Express routers — prevents Express matching the action segment as the `:id` param; add a comment with the WHY.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| PATCH /:id/move registration order | [reflection-TASK-008.md](../reflection/reflection-TASK-008.md) | 2026-06-16 |
