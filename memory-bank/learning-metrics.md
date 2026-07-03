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
| TASK-016 | 2026-06-27 | 4 | 1 | 2 | architecture-patterns created; testing-patterns + service-design amended (Level 3) |
| TASK-017 | 2026-06-28 | 4 | 2 | 2 | error-handling + architecture-patterns created; testing-patterns + api-design amended (Level 4) |
| TASK-018 | 2026-06-28 | 2 | 0 | 1 | testing-patterns amended: wholesale vi.mock gap + missing vi import (Level 2) |
| TASK-019 | 2026-07-01 | 4 | 0 | 3 | security (+2) + testing-patterns + architecture-foundation amended; 4-phase Level 4 webhook delivery |
| TASK-020 | 2026-07-02 | 2 | 0 | 2 | data-integrity + testing-patterns amended (Level 2 cap); immutable event-payload gotcha + UAT walker ESC false-negative pattern |
| TASK-021 | 2026-07-03 | 1 | 0 | 1 | api-design amended (Level 1 cap); grep existing PATCH endpoint before assuming backend work is needed |

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
| 2026-06-27 | TASK-016 archive | 14 | 13 | 1 | 0 | 0 | 0 |
| 2026-06-28 | TASK-017 archive | 15 | 14 | 1 | 0 | 0 | 0 |
| 2026-07-01 | TASK-019 archive | 14 | 14 | 0 | 0 | 1 | 6 |
| 2026-07-02 | TASK-020 archive | 14 | 14 | 0 | 0 | 1 | 0 |

## Rule Effectiveness

| File | Evidence Count | Priority | Last Updated | Status |
|------|---------------|----------|--------------|--------|
| testing-patterns.md | 17 | medium | 2026-07-02 | active (pruned 16→10 bullets, TASK-020 +1) |
| architecture-foundation.md | 6 | medium | 2026-07-01 | active (merged: architecture-patterns) |
| api-design.md | 5 | medium | 2026-07-03 | active (promoted, TASK-021) |
| security.md | 4 | medium | 2026-07-01 | active (promoted) |
| react-query-patterns.md | 3 | medium | 2026-06-27 | active (promoted) |
| data-integrity.md | 3 | medium | 2026-07-02 | active (promoted, TASK-020) |
| error-handling.md | 1 | low | 2026-06-28 | active |
| observability-standards.md | 1 | low | 2026-06-13 | active |
| data-validation.md | 1 | low | 2026-06-27 | active |
| frontend-accessibility.md | 2 | low | 2026-06-27 | active |
| docker-compose.md | 2 | low | 2026-06-22 | active (merged: docker-dev-environment) |
| sse-client.md | 2 | low | 2026-06-22 | active |
| service-design.md | 2 | low | 2026-06-27 | active |
| ui-patterns.md | 1 | low | 2026-06-27 | active |
