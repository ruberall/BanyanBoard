# Learning Metrics

## Configuration

- **Expiry**: Rules not reinforced within 90 days are candidates for removal
- **Promotion threshold**: 3+ evidence entries promotes a rule to medium priority

## Task History

| Task | Date | Learnings Extracted | Rules Created | Rules Amended | Notes |
|------|------|---------------------|---------------|---------------|-------|
| TASK-001 | 2026-06-13 | 4 | 3 | 0 | First extraction — no prior rules existed |
| TASK-002 | 2026-06-15 | 2 | 2 | 0 | data-integrity + api-design (Level 2 cap) |
| TASK-006 | 2026-06-16 | 2 | 0 | 2 | testing-patterns + api-design amended (Level 2 cap) |
| TASK-009 | 2026-06-17 | 4 | 3 | 1 | frontend-accessibility + react-query-patterns + docker-compose created; testing-patterns amended (Level 3) |
| TASK-011 | 2026-06-18 | 4 | 1 | 2 | security created; testing-patterns + api-design amended (Level 3) |
| TASK-012 | 2026-06-18 | 4 | 0 | 2 | testing-patterns (10→ evidence_count) + architecture-foundation amended; subscribe-before-flush + DomainEventBus Map pattern (Level 3) |
| TASK-012 (re-run) | 2026-06-22 | 3 | 2 | 0 | docker-dev-environment + sse-client created; post-archive integration bugs (Windows Docker inotify, EventSource URL + withCredentials) |
| TASK-013 | 2026-06-27 | 4 | 1 | 3 | ui-patterns created; testing-patterns + react-query-patterns + data-integrity amended (Level 3) |
| TASK-014 | 2026-06-27 | 3 | 0 | 2 | testing-patterns + frontend-accessibility amended; api-design promoted to medium (Level 2) |
| TASK-015 | 2026-06-27 | 4 | 1 | 2 | data-validation created; testing-patterns + security amended (Level 3) |

## Consolidation History

| Date | Task | Files Before | Files After | Merged | Expired | Promoted | Pruned |
|------|------|-------------|------------|--------|---------|----------|--------|
| 2026-06-13 | TASK-001 archive | 3 | 3 | 0 | 0 | 0 | 0 |
| 2026-06-16 | TASK-006 archive | 5 | 5 | 0 | 0 | 1 | 0 |
| 2026-06-17 | TASK-009 archive | 8 | 8 | 0 | 0 | 0 | 0 |
| 2026-06-18 | TASK-011 archive | 10 | 10 | 0 | 0 | 0 | 0 |
| 2026-06-22 | TASK-012 re-archive | 12 | 11 | 1 | 0 | 1 | 0 |
| 2026-06-27 | TASK-014 archive | 11 | 11 | 0 | 0 | 1 | 0 |
| 2026-06-27 | TASK-013 archive | 12 | 12 | 0 | 0 | 1 | 0 |
| 2026-06-27 | TASK-015 archive | 14 | 14 | 0 | 0 | 0 | 6 |

## Rule Effectiveness

| File | Evidence Count | Priority | Last Updated | Status |
|------|---------------|----------|--------------|--------|
| testing-patterns.md | 10 | medium | 2026-06-27 | active (pruned 6 stale bullets) |
| architecture-foundation.md | 3 | medium | 2026-06-18 | active (promoted) |
| api-design.md | 3 | medium | 2026-06-27 | active (promoted) |
| react-query-patterns.md | 3 | medium | 2026-06-27 | active (promoted) |
| observability-standards.md | 1 | low | 2026-06-13 | active |
| data-integrity.md | 2 | low | 2026-06-27 | active |
| security.md | 2 | low | 2026-06-27 | active |
| data-validation.md | 1 | low | 2026-06-27 | active |
| frontend-accessibility.md | 2 | low | 2026-06-27 | active |
| docker-compose.md | 2 | low | 2026-06-22 | active (merged: docker-dev-environment) |
| sse-client.md | 2 | low | 2026-06-22 | active |
| service-design.md | 1 | low | 2026-06-16 | active |
| ui-patterns.md | 1 | low | 2026-06-27 | active |
