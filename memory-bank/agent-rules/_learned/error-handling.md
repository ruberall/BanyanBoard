---
name: "Learned: Error Handling"
globs: ["**/*.ts", "**/*.tsx"]
topics: ["error-handling", "observability", "database"]
priority: low
evidence_count: 1
last_updated: 2026-06-28
auto_generated: true
---

# Error Handling

- When a trigger row tracks multi-attempt delivery, populate `trigger_error` from the last delivery's error on exhaustion — this makes the trigger table self-sufficient for root-cause diagnosis without requiring a join to `_deliveries`.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| `trigger_error` was initially `null` even on Rule #2 exhaustion; code review W1 fix added `deliveries.at(-1)?.delivery_error ?? null` to provide an audit-trail summary at the trigger level | [reflection-TASK-017.md](../reflection/reflection-TASK-017.md) | 2026-06-28 |
