---
name: "Learned: Architecture Patterns"
globs: ["backend/src/routes/*.ts", "backend/src/services/*.ts"]
topics: ["architecture", "event-emission", "sse", "routing"]
priority: low
evidence_count: 1
last_updated: 2026-06-27
auto_generated: true
---

# Architecture Patterns

- For event emission on new routes, verify the event service is threaded into the router factory or sub-router constructor before the coding agent finishes — an unregistered service is a silent omission that passes all existing tests.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Event service router wiring | [reflection-TASK-016.md](../reflection/reflection-TASK-016.md) | 2026-06-27 |
