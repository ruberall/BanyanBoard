---
name: "Learned: Security"
globs: ["backend/src/routes/auth.ts", "backend/src/routes/*.ts", "backend/src/middleware/*.ts"]
topics: ["security", "authentication", "session-management"]
priority: low
evidence_count: 1
last_updated: 2026-06-18
auto_generated: true
---

# Security

- Call `req.session.regenerate()` before assigning `req.session.userId` on any login or registration flow to prevent session fixation attacks; only assign the userId inside the regenerate callback.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Session fixation via regenerate() on privilege escalation | [reflection-TASK-011.md](../reflection/reflection-TASK-011.md) | 2026-06-18 |
