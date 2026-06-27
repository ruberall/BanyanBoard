---
name: "Learned: UI Patterns"
globs: ["src/components/**/*.tsx", "src/components/**/*.module.css"]
topics: ["ui-patterns", "popover", "css", "shared-constants"]
priority: low
evidence_count: 1
last_updated: 2026-06-27
auto_generated: true
---

# UI Patterns

- When a `position:fixed` popover uses a hardcoded layout constant (e.g., sidebar width in pixels), extract that constant to a shared JS module and reference it from both the CSS variable definition and the TypeScript flip logic — do not inline the same number in two places.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| LabelColorPicker 284px ActivityFeed margin hardcoded in both KanbanColumn.module.css and LabelColorPicker.tsx | [reflection-TASK-013.md](../reflection/reflection-TASK-013.md) | 2026-06-27 |
