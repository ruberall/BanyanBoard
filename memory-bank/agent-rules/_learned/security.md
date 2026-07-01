---
name: "Learned: Security"
globs: ["backend/src/routes/auth.ts", "backend/src/routes/*.ts", "backend/src/middleware/*.ts", "backend/migrations/*.js", "backend/src/**/*.ts", "frontend/src/**/*.tsx"]
topics: ["security", "authentication", "session-management", "pii", "migrations", "outbound-http", "credential-exposure", "ssrf", "trace-context"]
priority: low
evidence_count: 4
last_updated: 2026-07-01
auto_generated: true
---

# Security

- Call `req.session.regenerate()` before assigning `req.session.userId` on any login or registration flow to prevent session fixation attacks; only assign the userId inside the regenerate callback.
- Data seed migrations containing PII (names, emails, phone numbers) must use environment variable substitution (`process.env.SEED_VALUE`) rather than hard-coded literal strings to prevent committing personal data to source history.
- When introducing any component that performs outbound HTTP to a user-supplied URL, verify in code review that (a) W3C `traceparent` is injected via OTel `propagation.inject(context.active(), headers)` before the fetch call, (b) the raw URL is never logged (log the parsed host only via `new URL(url).host`), and (c) no URL fragment or server error message containing the URL is rendered in the UI or echoed in an API error response.
- User-supplied URLs stored in the database must be masked in UI renders (display `${host}/***`) to prevent credential exposure when users share screens or export data; never render the raw URL value in any user-facing component.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Session fixation via regenerate() on privilege escalation | [reflection-TASK-011.md](../reflection/reflection-TASK-011.md) | 2026-06-18 |
| Seed migration `20260627140001` hard-coded `first_name = 'Rebecca', last_name = 'Uberall'` in committed source | [reflection-TASK-015.md](../reflection/reflection-TASK-015.md) | 2026-06-27 |
| WebhookTransport missing traceparent injection + URL exposure in RulesList + onError echoing err.message | [reflection-TASK-019.md](../reflection/reflection-TASK-019.md) | 2026-07-01 |
| maskWebhookUrl() — RulesList rendered raw webhook_url exposing embedded tokens | [reflection-TASK-019.md](../reflection/reflection-TASK-019.md) | 2026-07-01 |
