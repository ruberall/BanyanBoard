---
name: "Learned: Data Integrity"
globs: ["**/repositories/**/*.ts", "**/migrations/**"]
topics: ["data-integrity", "transactions", "database"]
priority: low
evidence_count: 1
last_updated: 2026-06-15
auto_generated: true
---

# Data Integrity

- Always wrap multi-statement writes (insert + dependent inserts) in an explicit transaction — partial failure leaves data in an inconsistent state even when individual statements succeed.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| createBoard board+column inserts without transaction leaves partial data on column insert failure | [reflection-TASK-002.md](../reflection/reflection-TASK-002.md) | 2026-06-15 |
