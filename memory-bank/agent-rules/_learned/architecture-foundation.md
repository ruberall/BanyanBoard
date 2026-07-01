---
name: "Learned: Architecture Foundation Tasks"
globs: ["memory-bank/creative/**", "memory-bank/tasks/**", "backend/src/routes/**", "backend/src/events/**", "backend/src/services/**", "**/*"]
topics: ["architecture", "creative-phase", "foundation-tasks", "planning", "sse", "event-bus", "event-emission", "routing", "retry", "design"]
priority: medium
evidence_count: 6
last_updated: 2026-07-01
auto_generated: true
---

# Architecture Foundation Tasks

- For scaffold/foundation tasks that all future features build on, front-load all architecture decisions in the creative phase before any code is written; the rework cost of a mid-build pivot on a foundation is proportional to the number of downstream features that inherit it.
- In SSE history-replay routes, subscribe to the event bus before issuing the DB history query, buffer live events into a request-scoped array, replay history, then drain the buffer with eventId dedup — events emitted during the async window are silently dropped otherwise.
- Implement `DomainEventBus` as `Map<scopeId, Set<handler>>` rather than a Node.js `EventEmitter` singleton — avoids the max-listener ceiling, enables explicit cleanup via returned unsubscribe closures, and eliminates stringly-typed event names.
- For event emission on new routes, verify the event service is threaded into the router factory or sub-router constructor before the coding agent finishes — an unregistered service is a silent omission that passes all existing tests.
- When a creative phase specifies a retry utility, annotate at the call site if per-attempt side effects (e.g., inserting a DB row per attempt) require a manual loop instead — the generic utility cannot expose the attempt number to its caller.
- When a new user-configurable entity's firing events use a different identity model from an existing built-in entity's firing table (e.g., UUID FK vs hardcoded string constant), create a genuinely separate table — conflating two identity models through a nullable FK produces a schema that is ambiguous to query and fragile to evolve.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Front-loading decisions on FEAT-001 scaffold eliminated mid-build pivots | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
| Subscribe-before-flush ordering for SSE endpoints | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
| DomainEventBus as Map<scopeId, Set<handler>> vs EventEmitter singleton | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-18 |
| Event service router wiring | [reflection-TASK-016.md](../reflection/reflection-TASK-016.md) | 2026-06-27 |
| Creative doc specified `retryWithBackoff`; Phase 3 used manual loop because per-attempt delivery rows require the attempt number inside the loop | [reflection-TASK-017.md](../reflection/reflection-TASK-017.md) | 2026-06-28 |
| trigger_executions separate from workflow_rule_triggers — UUID FK vs varchar constant identity model conflict; additive scope boundary enforced | [reflection-TASK-019.md](../reflection/reflection-TASK-019.md) | 2026-07-01 |
