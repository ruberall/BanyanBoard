# UAT Configuration

This file is created and maintained by `/banyan-uat-init`. It carries project-specific UAT infrastructure (base URLs, persona credentials, auth strategy, viewport presets, isolation strategy).

**Companion file**: `memory-bank/projectConfig.md` `## UAT` section carries project-wide *ergonomic* defaults (default sections, artifact git policy). Keep secrets/infra here; keep ergonomics there.

---

**Status**: Configured
**Last Updated**: 2026-07-02

## Environments

| Name | Base URL              | Default |
|------|-----------------------|---------|
| dev  | http://localhost:5173 | yes     |

> `/banyan-uat` refuses to run against environments where `name == "prod"`. There is no override flag — production UAT must be intentionally invoked via a separate (future) command.

## Auth

- **Strategy**: login
  - `token` — inject localStorage/cookies from `.auth/<persona>.json`, hard-reload. Fastest.
  - `login` (selected) — drive the login UI on every run. No token capture step needed; slightly slower per-run but zero setup.
  - `token+fallback` — try token first; on auth failure or 401, fall back to `login` and cache fresh tokens back to `.auth/<persona>.json`.
- **Credential vault**: `.auth/` (confirmed already present in `.gitignore`) — unused while strategy is `login`, left configured in case you switch strategies later
- **Token file pattern**: `.auth/<persona>.json`
- **Login selectors** (strategy is `login`, so these are always used) — detected from `frontend/src/pages/LoginPage/LoginPage.tsx`:
  - username: `#email`
  - password: `#password`
  - submit:   `button[type="submit"]`
  - post-login wait: url matches `/` (LoginPage navigates to `/` or the `next` query param on success)

## Persona Map

BanyanBoard has no RBAC — a single authenticated-user role, no admin/permission distinction in the `users` table. `productBrief.md` documents multiple product personas (Dev Team Lead, Individual Developer, Freelancer, Small Business Owner, Self-Hoster), but they are all the same auth role in the app today. Modeled as a single `user` persona rather than one row per product persona.

| Role | Test Account                  | Auth Reference       |
|------|--------------------------------|-----------------------|
| user | uat-user@banyanboard.test      | $UAT_USER_PW          |

## Viewports

| Name    | Width | Height | Default For    |
|---------|-------|--------|-----------------|
| desktop | 1280  | 720    | all non-mobile  |
| mobile  | 375   | 667    | mobile section  |

## Execution

- **max_parallel_tabs**: 4
- **isolation_strategy**: auto          # auto | same-persona-only | incognito
  - `auto` (default) — probes incognito support at run start; falls back to `same-persona-only` if unavailable. Today this always falls back; the Claude-in-Chrome MCP does not yet expose incognito tab creation.
  - `same-persona-only` — explicit conservative. Walkers with the same resolved persona run in parallel; walkers with different personas serialize.
  - `incognito` — reserved for a future Claude-in-Chrome release. Selecting today errors at the phase gate.
- **auth_cookies_to_clear**:            # cookie names to scrub between persona groups
    - connect.sid                       # express-session default cookie name (no custom `name` option set in backend/src/app.ts)
- **logout_url**:                       # empty — no dedicated /logout page route exists; logout is POST /auth/logout triggered from the AppHeader "Sign out" button (useLogout hook), not a navigable URL. UAT should clear cookies/localStorage directly between persona groups instead of navigating.
- **screenshot_retention**: keep 10 most recent runs
- **default_timeout_ms**: 15000
- **ux_pattern_check**: enabled

## Notes

- The credential vault directory MUST be added to `.gitignore` — already confirmed present.
- Only one persona role is configured today (`user`). If BanyanBoard later adds board-level roles (owner vs. member, per `productBrief.md`'s Authorization NFR: "owner can invite members; members can read/write cards"), add a second Persona Map row and revisit `isolation_strategy` implications.
- `--persona-override` flags warn when the supplied address does not match the project's documented test-account pattern. Update the Persona Map rather than relying on overrides for repeated runs.
- **Superseded a prior version** of this file (dated 2026-06-17) that predated FEAT-006 auth and had `Strategy: none` — updated now that session-based auth is implemented and live.
