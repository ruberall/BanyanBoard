# UAT Configuration

This file is created and maintained by `/banyan-uat-init`. It carries project-specific UAT infrastructure (base URLs, persona credentials, auth strategy, viewport presets, isolation strategy).

**Companion file**: `memory-bank/projectConfig.md` `## UAT` section carries project-wide *ergonomic* defaults (default sections, artifact git policy). Keep secrets/infra here; keep ergonomics there.

---

**Status**: Configured
**Last Updated**: 2026-06-17

## Environments

| Name    | Base URL                  | Default |
|---------|---------------------------|---------|
| dev     | http://localhost:5173     | yes     |

> `/banyan-uat` refuses to run against environments where `name == "prod"`. There is no override flag — production UAT must be intentionally invoked via a separate (future) command.

## Auth

- **Strategy**: none
  - BanyanBoard has no authentication in the current build (FEAT-006 covers auth).
  - UAT navigates directly to `http://localhost:5173` without a login step.
  - **Update this section after FEAT-006 is implemented** — switch strategy to `token+fallback` and populate the Persona Map with real test credentials.
- **Credential vault**: `.auth/` (must be in `.gitignore` when auth is added)
- **Token file pattern**: `.auth/<persona>.json`
- **Login selectors**: N/A (no auth)

## Persona Map

No credentials required — the app has no auth gate in the current build. Persona roles below are context-only (used by walkers to adopt the correct user perspective).

| Role                | Test Account                          | Auth Reference |
|---------------------|---------------------------------------|----------------|
| dev-team-lead       | (no auth — persona context only)      | none           |
| individual-developer| (no auth — persona context only)      | none           |

> Update with real test accounts after FEAT-006 (User Authentication) is implemented.

## Viewports

| Name    | Width | Height | Default For    |
|---------|-------|--------|----------------|
| desktop | 1280  | 720    | all non-mobile |
| mobile  | 375   | 667    | mobile section |

## Execution

- **max_parallel_tabs**: 4
- **isolation_strategy**: auto          # auto | same-persona-only | incognito
  - `auto` (default) — probes incognito support at run start; falls back to `same-persona-only` if unavailable.
- **auth_cookies_to_clear**: []          # none — no auth cookies in current build
- **logout_url**: ""                     # no logout — no auth in current build
- **screenshot_retention**: keep 10 most recent runs
- **default_timeout_ms**: 15000
- **ux_pattern_check**: enabled

## Notes

- Auth is intentionally `none` for the current build. BanyanBoard has no login flow until FEAT-006 ships.
- After FEAT-006: run `/banyan-uat-init --force` to update auth strategy to `token+fallback`, add real test-account emails, and populate `.auth/` with captured tokens.
- The credential vault `.auth/` must be added to `.gitignore` before any tokens are captured.
