---
name: "Learned: Data Integrity"
globs: ["**/repositories/**/*.ts", "**/migrations/**"]
topics: ["data-integrity", "transactions", "database", "data-migration"]
priority: low
evidence_count: 2
last_updated: 2026-06-27
auto_generated: true
---

# Data Integrity

- Always wrap multi-statement writes (insert + dependent inserts) in an explicit transaction — partial failure leaves data in an inconsistent state even when individual statements succeed.
- Always include a reversible `down()` in schema-change migrations even when rollback loses data (e.g., `jsonb → text[]` drops color); the presence of a `down()` is more valuable than its semantic completeness because it preserves the ability to revert the migration runner state.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| createBoard board+column inserts without transaction leaves partial data on column insert failure | [reflection-TASK-002.md](../reflection/reflection-TASK-002.md) | 2026-06-15 |
| labels jsonb migration: reversible down() drops color but preserves migration runner state | [reflection-TASK-013.md](../reflection/reflection-TASK-013.md) | 2026-06-27 |
