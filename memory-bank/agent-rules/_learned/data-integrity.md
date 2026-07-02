---
name: "Learned: Data Integrity"
globs: ["**/repositories/**/*.ts", "**/migrations/**", "**/services/*.ts"]
topics: ["data-integrity", "transactions", "database", "data-migration", "event-sourcing"]
priority: medium
evidence_count: 3
last_updated: 2026-07-02
auto_generated: true
---

# Data Integrity

- Always wrap multi-statement writes (insert + dependent inserts) in an explicit transaction — partial failure leaves data in an inconsistent state even when individual statements succeed.
- Always include a reversible `down()` in schema-change migrations even when rollback loses data (e.g., `jsonb → text[]` drops color); the presence of a `down()` is more valuable than its semantic completeness because it preserves the ability to revert the migration runner state.
- When rendering historical rows from a write-once event/audit table as human-readable text, treat a formatting bug fix as forward-only — existing rows keep their originally-captured payload forever, so flag an explicit backfill-or-accept decision rather than assuming the fix retroactively corrects old data.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| createBoard board+column inserts without transaction leaves partial data on column insert failure | [reflection-TASK-002.md](../reflection/reflection-TASK-002.md) | 2026-06-15 |
| labels jsonb migration: reversible down() drops color but preserves migration runner state | [reflection-TASK-013.md](../reflection/reflection-TASK-013.md) | 2026-06-27 |
| card_events.payload immutable at emit time — TASK-012-era null fromColumnName/toColumnName bug fixed in card.service.ts (eebac6e) does not retroactively fix 3 historical 2026-06-22 rows | [reflection-TASK-020.md](../reflection/reflection-TASK-020.md) | 2026-07-02 |
