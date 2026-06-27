---
name: "Learned: Data Validation"
globs: ["frontend/src/**/*.tsx", "frontend/src/api/endpoints.ts"]
topics: ["data-validation", "nullable-fields", "form-handling"]
priority: low
evidence_count: 1
last_updated: 2026-06-27
auto_generated: true
---

# Data Validation

- When an optional text input must store NULL (not empty string) in the database, use a conditional spread at the call site (`...(value ? { field: value } : {})`) rather than sending `field: ""` and relying on the backend to coerce it.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| RegisterPage initially sent `first_name: ""` when field blank; fixed with conditional spread to omit field | [reflection-TASK-015.md](../reflection/reflection-TASK-015.md) | 2026-06-27 |
