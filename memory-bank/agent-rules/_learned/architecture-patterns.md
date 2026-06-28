---
name: "Learned: Architecture Patterns"
globs: ["**/*"]
topics: ["architecture", "creative", "retry", "design"]
priority: low
evidence_count: 1
last_updated: 2026-06-28
auto_generated: true
---

# Architecture Patterns

- When a creative phase specifies a retry utility, annotate at the call site if per-attempt side effects (e.g., inserting a DB row per attempt) require a manual loop instead — the generic utility cannot expose the attempt number to its caller.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Creative doc specified `retryWithBackoff`; Phase 3 correctly used manual loop because `workflow_action_deliveries` needs one row per attempt — the build agent resolved this by judgment, but the creative doc gave no guidance | [reflection-TASK-017.md](../reflection/reflection-TASK-017.md) | 2026-06-28 |
