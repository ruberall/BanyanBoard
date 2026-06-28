---
name: "Learned: Architecture Foundation Tasks"
globs: ["memory-bank/creative/**", "memory-bank/tasks/**", "backend/src/routes/**", "backend/src/events/**", "backend/src/services/**"]
topics: ["architecture", "creative-phase", "foundation-tasks", "planning", "sse", "event-bus", "event-emission", "routing"]
priority: medium
evidence_count: 4
last_updated: 2026-06-27
auto_generated: true
---

# Architecture Foundation Tasks

- For scaffold/foundation tasks that all future features build on, front-load all architecture decisions in the creative phase before any code is written; the rework cost of a mid-build pivot on a foundation is proportional to the number of downstream features that inherit it.
- In SSE history-replay routes, subscribe to the event bus before issuing the DB history query, buffer live events into a request-scoped array, replay history, then drain the buffer with eventId dedup — events emitted during the async window are silently dropped otherwise.
- Implement `DomainEventBus` as `Map<scopeId, Set<handler>>` rather than a Node.js `EventEmitter` singleton — avoids the max-listener ceiling, enables explicit cleanup via returned unsubscribe closures, and eliminates stringly-typed event names.
- For event emission on new routes, verify the event service is threaded into the router factory or sub-router constructor before the coding agent finishes — an unregistered service is a silent omission that passes all existing tests.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Front-loading decisions on FEAT-001 scaffold eliminated mid-build pivots | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| Subscribe-before-flush ordering for SSE endpoints | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
| DomainEventBus as Map<scopeId, Set<handler>> vs EventEmitter singleton | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
| Event service router wiring | [reflection-TASK-016.md](../reflection/reflection-TASK-016.md) | 2026-06-27 |
