---
name: "Learned: Frontend Accessibility"
globs: ["*.tsx", "*.jsx", "src/components/**"]
topics: ["frontend-accessibility", "wcag", "forms"]
priority: low
evidence_count: 2
last_updated: 2026-06-27
auto_generated: true
---

# Frontend Accessibility

- Every form `<input>`, `<textarea>`, and `<select>` must have an associated `<label>` with explicit `htmlFor` — `placeholder` alone fails WCAG 2.1 AA and will fail code review.
- `useEffect` listener attachment runs after React's render cycle, so a mousedown that opened a modal cannot trigger an outside-click handler registered in that same effect — `requestAnimationFrame` guards on modal dismiss listeners are redundant and break RTL tests.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Missing label on CreateCardForm input caught in code review | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
| useEffect modal dismiss guard: rAF unnecessary and breaks RTL | [reflection-TASK-014.md](../reflection/reflection-TASK-014.md) | 2026-06-27 |
