---
name: "Learned: Security"
globs: ["backend/src/routes/auth.ts", "backend/src/routes/*.ts", "backend/src/middleware/*.ts", "backend/migrations/*.js"]
topics: ["security", "authentication", "session-management", "pii", "migrations"]
priority: low
evidence_count: 2
last_updated: 2026-06-27
auto_generated: true
---

# Security

- Call `req.session.regenerate()` before assigning `req.session.userId` on any login or registration flow to prevent session fixation attacks; only assign the userId inside the regenerate callback.
- Data seed migrations containing PII (names, emails, phone numbers) must use environment variable substitution (`process.env.SEED_VALUE`) rather than hard-coded literal strings to prevent committing personal data to source history.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Session fixation via regenerate() on privilege escalation | [reflection-TASK-011.md](../reflection/reflection-TASK-011.md) | 2026-06-18 |
| Seed migration `20260627140001` hard-coded `first_name = 'Rebecca', last_name = 'Uberall'` in committed source | [reflection-TASK-015.md](../reflection/reflection-TASK-015.md) | 2026-06-27 |
