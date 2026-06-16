---
name: "Learned: Service Design"
globs: ["src/services/*.ts", "src/services/**/*.ts"]
topics: ["service-design", "dependency-injection"]
priority: low
evidence_count: 1
last_updated: 2026-06-16
auto_generated: true
---

# Service Design

- When a service method needs a cross-entity existence check, inject `Queryable` as a second constructor parameter rather than importing a peer repository — avoids circular imports and keeps the check at the correct layer.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| CardService Queryable injection for column check | [reflection-TASK-008.md](../reflection/reflection-TASK-008.md) | 2026-06-16 |
