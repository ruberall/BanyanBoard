---
name: "Learned: API Design"
globs: ["**/routes/**/*.ts", "**/services/**/*.ts"]
topics: ["api-design", "rest", "response-shape"]
priority: low
evidence_count: 1
last_updated: 2026-06-15
auto_generated: true
---

# API Design

- When a create endpoint auto-seeds child records, return the full parent+children shape in the 201 response to avoid forcing consumers into an immediate second GET.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| POST /boards returns bare Board without auto-seeded columns, forcing a second GET | [reflection-TASK-002.md](../reflection/reflection-TASK-002.md) | 2026-06-15 |
