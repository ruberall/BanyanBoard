---
name: "Learned: Frontend Accessibility"
globs: ["*.tsx", "*.jsx", "src/components/**"]
topics: ["frontend-accessibility", "wcag", "forms"]
priority: low
evidence_count: 1
last_updated: 2026-06-17
auto_generated: true
---

# Frontend Accessibility

- Every form `<input>`, `<textarea>`, and `<select>` must have an associated `<label>` with explicit `htmlFor` — `placeholder` alone fails WCAG 2.1 AA and will fail code review.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Missing label on CreateCardForm input caught in code review | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
