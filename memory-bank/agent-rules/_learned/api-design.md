---
name: "Learned: API Design"
globs: ["**/routes/**/*.ts", "**/services/**/*.ts"]
topics: ["api-design", "rest", "response-shape"]
priority: low
evidence_count: 2
last_updated: 2026-06-16
auto_generated: true
---

# API Design

- When a create endpoint auto-seeds child records, return the full parent+children shape in the 201 response to avoid forcing consumers into an immediate second GET.
- For breaking response shape changes, add a compatibility AC (e.g., AC-COMPAT-1) to the task spec and update the existing route test at the same phase that introduces the shape change — not at the phase where the full feature lands.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| POST /boards returns bare Board without auto-seeded columns, forcing a second GET | [reflection-TASK-002.md](../reflection/reflection-TASK-002.md) | 2026-06-15 |
| AC-COMPAT-1 early route test update for GET /boards envelope change | [reflection-TASK-006.md](../reflection/reflection-TASK-006.md) | 2026-06-16 |
