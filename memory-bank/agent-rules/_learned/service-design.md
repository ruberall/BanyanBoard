---
name: "Learned: Service Design"
globs: ["src/services/*.ts", "src/services/**/*.ts"]
topics: ["service-design", "dependency-injection"]
priority: low
evidence_count: 2
last_updated: 2026-06-27
auto_generated: true
---

# Service Design

- When a service method needs a cross-entity existence check, inject `Queryable` as a second constructor parameter rather than importing a peer repository — avoids circular imports and keeps the check at the correct layer.
- When a service's constructor depends on a new repository, always update every construction site (e.g., `routes/index.ts`) in the same commit — missed construction sites silently omit the dependency and fail only at the feature's specific call path.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| CardService Queryable injection for column check | [reflection-TASK-008.md](../reflection/reflection-TASK-008.md) | 2026-06-16 |
| Construction site completeness: EventService missing from createColumnCardsRouter | [reflection-TASK-016.md](../reflection/reflection-TASK-016.md) | 2026-06-27 |
