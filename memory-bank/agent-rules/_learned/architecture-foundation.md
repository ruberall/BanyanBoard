---
name: "Learned: Architecture Foundation Tasks"
globs: ["memory-bank/creative/**", "memory-bank/tasks/**", "backend/src/routes/**", "backend/src/events/**"]
topics: ["architecture", "creative-phase", "foundation-tasks", "planning", "sse", "event-bus"]
priority: medium
evidence_count: 3
last_updated: 2026-06-18
auto_generated: true
---

# Architecture Foundation Tasks

- For scaffold/foundation tasks that all future features build on, front-load all architecture decisions in the creative phase before any code is written; the rework cost of a mid-build pivot on a foundation is proportional to the number of downstream features that inherit it.
- In SSE history-replay routes, subscribe to the event bus before issuing the DB history query, buffer live events into a request-scoped array, replay history, then drain the buffer with eventId dedup — events emitted during the async window are silently dropped otherwise.
- Implement `DomainEventBus` as `Map<scopeId, Set<handler>>` rather than a Node.js `EventEmitter` singleton — avoids the max-listener ceiling, enables explicit cleanup via returned unsubscribe closures, and eliminates stringly-typed event names.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Front-loading decisions on FEAT-001 scaffold eliminated mid-build pivots | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| Subscribe-before-flush ordering for SSE endpoints | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
| DomainEventBus as Map<scopeId, Set<handler>> vs EventEmitter singleton | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
