# Product Roadmap

## Summary

- **Total Features**: 15
- **Released Versions**: 0
- **Active Versions**: 0
- **Planning Versions**: 1
- **Backlog (next)**: 2

---

## Versions

### v0.1.0 — Foundation (Planning)

- **Status**: planning
- **Target Date**: TBD
- **Description**: Working local kanban board — full stack from Docker Compose to drag-and-drop UI. Delivers the core loop: create a board, add cards, move them across fixed columns.
- **Features**:
  - FEAT-001: Express API with TypeScript Scaffold (complete) [Level 3]
  - FEAT-002: Board & Column API (planned) [Level 2]
  - FEAT-003: Card Management API (planned) [Level 2]
  - FEAT-004: Card Move & Ordering (complete) [Level 2]
  - FEAT-005: React Frontend Scaffold (complete) [Level 3]
  - FEAT-006: User Authentication (complete) [Level 3]

### next (Planning)

- **Status**: planning
- **Features**:
  - FEAT-007: Pagination for list endpoints (complete) [Level 2]
  - FEAT-008: E2E Test Suite for Board Flow (in_progress) [Level 2]
  - FEAT-009: Realtime Activity Feed (complete) [Level 3]
  - FEAT-010: Card Labels (complete) [Level 3]
  - FEAT-011: Card Color Picker (complete) [Level 3]
  - FEAT-012: User Profile, Messaging, and Navigation Enhancements (complete) [Level 3]
  - FEAT-013: Activity Feed User Attribution (complete) [Level 3]
  - FEAT-014: Workflow Automation (complete) [Level 4]
  - FEAT-015: Delete Card UI (planned) [Level 2]

---

## Features

### FEAT-001: Express API with TypeScript Scaffold

- **Version**: v0.1.0
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Set up the Express + TypeScript backend project from scratch. Includes Docker Compose orchestration (api, postgres services), database connection pooling, migration tooling (node-pg-migrate), environment variable config, structured logging, and the 3-layer clean architecture skeleton (routes → services → repositories). This is the foundation everything else builds on.
- **Linked Tasks**: TASK-001 (COMPLETE)
- **Branch**: feature/FEAT-001-express-api-scaffold
- **Created**: 2026-06-13
- **Completed**: 2026-06-13

---

### FEAT-002: Board & Column API

- **Version**: v0.1.0
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 2
- **Description**: REST endpoints for board CRUD (create, read, list, delete). Each board is created with three fixed columns seeded automatically: To Do, In Progress, Done. Includes the boards and columns DB schema (migration), repository, service, and routes. No user-configurable columns for MVP.
- **Linked Tasks**: TASK-002 (COMPLETE)
- **Branch**: feature/FEAT-002-board-column-api
- **Created**: 2026-06-13

---

### FEAT-003: Card Management API

- **Version**: v0.1.0
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 2
- **Description**: REST endpoints for card CRUD within a column (create, read, update, delete). Cards have title (required), description (optional), due date (optional), and labels (optional array of strings — card-scoped, free-form). Includes cards DB schema (migration), repository, service, and routes.
- **Linked Tasks**: TASK-007 (COMPLETE)
- **Completed**: 2026-06-16
- **Branch**: feature/FEAT-003-card-management-api
- **Created**: 2026-06-13

---

### FEAT-004: Card Move & Ordering

- **Version**: v0.1.0
- **Status**: planned
- **Priority**: high
- **Complexity**: Level 2
- **Description**: API endpoint to move a card to a different column and update its sort position within that column. Uses a float/fractional ordering strategy to avoid rewriting all positions on every move. Includes position field on cards schema and a PATCH /cards/:id/move endpoint.
- **Status**: complete
- **Linked Tasks**: TASK-008 (COMPLETE)
- **Completed**: 2026-06-16
- **Branch**: feature/FEAT-004-card-move-ordering
- **Created**: 2026-06-13

---

### FEAT-005: React Frontend Scaffold

- **Version**: v0.1.0
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Set up the React + TypeScript frontend. Includes Vite build tooling, component architecture decisions (folder structure, routing), typed API client (fetch wrappers with error handling), board view with kanban columns, card drag-and-drop (dnd-kit), and Docker Compose integration (frontend service with hot reload in dev). This establishes the UI patterns all future features follow.
- **Linked Tasks**: TASK-009 (complete)
- **Branch**: feature/FEAT-005-react-frontend-scaffold
- **Created**: 2026-06-13
- **Completed**: 2026-06-17

---

### FEAT-007: Pagination for list endpoints

- **Version**: next
- **Status**: planned
- **Priority**: medium
- **Complexity**: Level 2
- **Description**: Add `?page=1&limit=20` query parameter support to list endpoints (initially `GET /boards`). Returns a paginated envelope `{ data, total, page, limit }`. Uses LIMIT/OFFSET at the repository layer. Validates `page` ≥ 1, `limit` 1–100, with sensible defaults (page=1, limit=20).
- **Status**: complete
- **Linked Tasks**: TASK-006 (COMPLETE)
- **Completed**: 2026-06-16
- **Branch**: feature/FEAT-007-pagination-list-endpoints
- **Created**: 2026-06-16

---

### FEAT-008: E2E Test Suite for Board Flow

- **Version**: next
- **Status**: complete
- **Priority**: medium
- **Complexity**: Level 2
- **Description**: Implement runnable E2E tests for the board flow using Playwright. Covers the full happy path (create board → open → add card → drag between columns → persist), negative paths (blank inputs, 404, invalid board UUID), and accessibility (keyboard DnD). Selectors and wait conditions are fully specified in `memory-bank/uat/spec-TASK-009-e2e.md` from the UAT run.
- **Linked Tasks**: TASK-010 (COMPLETE)
- **Branch**: feature/FEAT-008-e2e-test-suite-board-flow
- **Created**: 2026-06-17
- **Completed**: 2026-06-17

---

### FEAT-009: Realtime Activity Feed

- **Version**: next
- **Status**: complete
- **Priority**: medium
- **Complexity**: Level 3
- **Description**: Track and display a realtime activity feed of card movements between columns. Card actions (create, move, label, assign, delete) emit domain events per systemPatterns.md Domain Event Pattern. Events carry timestamp, actor, action type, card ID, and before/after state. In-process emitter for v1, designed for future message bus extraction. Transport via SSE or WebSocket (to be decided in creative phase). New backend events endpoint and frontend ActivityFeed component.
- **Linked Tasks**: TASK-012 (COMPLETE)
- **Branch**: feature/FEAT-009-realtime-activity-feed (merged → main 2026-06-18)
- **Created**: 2026-06-18
- **Completed**: 2026-06-18

---

### FEAT-010: Card Labels

- **Version**: next
- **Status**: complete
- **Priority**: medium
- **Complexity**: Level 3
- **Description**: Three enhancements to the card label system: (1) FilterBar — a text input in the upper-right of the board screen that filters the visible card list to only cards whose title or description contains the entered string; includes an × clear button that restores all cards. (2) Label placement — move the label badge to the right of the drag handle (not below it); widen columns slightly to accommodate. (3) User-chosen pale color — replace any fixed palette with a swatch grid of very pale colors the user selects per label; chosen color stored per card in the DB.
- **Linked Tasks**: TASK-013 (COMPLETE)
- **Branch**: feature/FEAT-010-card-labels (merged → main 2026-06-27)
- **Created**: 2026-06-25
- **Completed**: 2026-06-27

---

### FEAT-011: Card Color Picker

- **Version**: next
- **Status**: complete
- **Priority**: medium
- **Complexity**: Level 3
- **Description**: A palette button on each card opens a modal with ~10 pale color swatches. Selecting a swatch sets the card's background color and persists it to the DB. Requires a new `color` column on the `cards` table (migration), backend validation, and a new `CardColorPicker` modal component on the frontend.
- **Linked Tasks**: TASK-014 (COMPLETE)
- **Branch**: feature/FEAT-011-card-color-picker (merged → main 2026-06-27)
- **Created**: 2026-06-27
- **Completed**: 2026-06-27

---

### FEAT-012: User Profile, Messaging, and Navigation Enhancements

- **Version**: next
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 3
- **Description**: Five related enhancements: (1) Sign Out button in the upper-right of the initial screen that navigates to the existing login page. (2) Extend the users table with first_name and last_name columns; add a messages table linked to a recipient user (message string 255 chars, created_at timestamp, recipient_user_id FK). (3) Add First name and Last name fields to the Register screen; persist with user account on register. (4) Data migration: set first_name="Rebecca", last_name="Uberall" on the one existing user. (5) Back button in the upper-left of the Cards/Board screen that navigates to the Boards list screen.
- **Linked Tasks**: TASK-015 (COMPLETE)
- **Branch**: feature/FEAT-012-user-profile-messaging
- **Created**: 2026-06-27
- **Completed**: 2026-06-27

---

### FEAT-006: User Authentication

- **Version**: v0.1.0
- **Status**: planned
- **Priority**: medium
- **Complexity**: Level 3
- **Description**: Session-based auth for the Express API. Register and login with email + password (bcrypt). Express-session with PostgreSQL session store. Auth middleware protecting all board/card routes. React login/register pages and session state management on the frontend. Users DB schema and migration.
- **Status**: complete
- **Linked Tasks**: TASK-011 (COMPLETE)
- **Branch**: feature/FEAT-006-user-authentication
- **Created**: 2026-06-13
- **Completed**: 2026-06-18

---

### FEAT-014: Workflow Automation

- **Version**: next
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 4
- **Description**: Trigger-action workflow automation that applies to all cards on every board. Two built-in rules: (1) **Stale rule** — on board display, move any card not in Done that is ≥ 2 calendar days old (by `cards.created_at`, which already exists) to a new "Stale" column inserted left of Done (column order: To Do → In Progress → Stale → Done). User-initiated moves out of Stale suppress re-staling permanently via a `stale_suppressed` boolean on the card; user move wins over the rule on subsequent board loads. Stale-move failures do not block board load; they are returned in a `warnings[]` array in the board response body. (2) **Done-color rule** — when a card is moved to Done via `PATCH /cards/:id/move`, the card's background `color` column is set to the pale green swatch hex asynchronously within 2 seconds after the move is committed. Action failure does not block or roll back the card move; failure is retried up to 3 times. Rule engine tracks trigger execution (`workflow_rule_triggers`) and action delivery (`workflow_action_deliveries`) in separate tables so delivery retries are independent of trigger status. All rule-failure error shapes follow `{ code, message, details: [{ field, error }] }`. Frontend covers loading indicators, optimistic color update on Done move, and rollback on action failure. Requires creative phases for workflow engine architecture and retry design.
- **Linked Tasks**: TASK-017 (COMPLETE)
- **Branch**: feature/FEAT-014-workflow-automation (merged → main 2026-06-28)
- **Created**: 2026-06-27
- **Completed**: 2026-06-28

**Specification Notes** (for /banyan-plan reference):

*Stale column:*
- Seed 4 columns on new board creation: To Do (pos 1), In Progress (pos 2), Stale (pos 3), Done (pos 4)
- Migration for existing boards: INSERT Stale column at position 3, UPDATE Done to position 4

*cards.created_at:* Already present in DB schema — no new migration required

*stale_suppressed flag:*
- `stale_suppressed boolean NOT NULL DEFAULT false` added to `cards` table
- Set to `true` when a user-initiated `PATCH /cards/:id/move` originates from the Stale column
- Rule #1 skips any card where `stale_suppressed = true`

*Rule #1 execution point:* Applied server-side during board load (inline with `GET /boards/:boardId` response). Stale-move failures do not abort the response; failures appear as `warnings: [{ code, message, details }]` in the response body.

*Rule #2 execution:* Async callback (no `await`) fired from `CardService.moveCard` after the move DB write commits. Retried up to 3 times on failure (exponential backoff or fixed interval — decided in creative). Card move HTTP response (200) is not delayed. Frontend applies optimistic color update immediately; rolls back on next board data refresh if rule ultimately fails.

*Pale green hex:* Use the closest pale green from the existing `CardColorPicker` swatch palette. If no pale green swatch exists, add `#d4edda` to the palette and use it.

*Workflow tracking tables:*
- `workflow_rule_triggers(id uuid PK, rule_id varchar, board_id FK, card_id FK nullable, triggered_at timestamptz, trigger_status varchar CHECK IN ('success','failed'), trigger_error text nullable)`
- `workflow_action_deliveries(id uuid PK, trigger_id FK → workflow_rule_triggers, attempt int NOT NULL, attempted_at timestamptz, delivery_status varchar CHECK IN ('pending','success','failed'), delivery_error text nullable)`

*Error shape for all workflow errors:*
```json
{ "code": "WORKFLOW_ACTION_FAILED", "message": "...", "details": [{ "field": "color", "error": "DB write failed" }] }
```
HTTP 400 for synchronous rule failures; stored as `delivery_error` JSON for async failures.

*AC-ERROR coverage required per AC:* exact HTTP status code, exact response body shape `{ code, message, details: [{field, error}] }`.

*Intermediate states required per AC:* loading spinner while board data fetches, optimistic update on Done move (color applied client-side before server confirms), rollback if `workflow_action_deliveries` final status = failed on next board refresh.

---

### FEAT-015: Delete Card UI

- **Version**: next
- **Status**: planned
- **Priority**: medium
- **Complexity**: Level 2
- **Description**: Enable users to delete a card by clicking an X icon visible on each card in the kanban board. Uses the existing `DELETE /cards/:id` backend endpoint. Requires a new `useDeleteCard` mutation hook, an X button in the `KanbanCard` component, and wiring in `KanbanColumn`.
- **Linked Tasks**: TASK-018
- **Branch**: feature/FEAT-015-delete-card-ui
- **Created**: 2026-06-28

---

### FEAT-013: Activity Feed User Attribution

- **Version**: next
- **Status**: complete
- **Priority**: high
- **Complexity**: Level 3
- **Description**: User attribution for ActivityFeed card events. Card-move events show "[FirstName LastName] moved '[Card]' from [Col] to [Col]". New card.created event type shows "[FirstName LastName] created card '[Card]'". Actor display name snapshotted into payload jsonb at emit time (Payload Snapshot pattern). Fallback chain: full name → email → "Someone".
- **Linked Tasks**: TASK-016 (COMPLETE)
- **Branch**: feature/FEAT-013-activity-feed-user-attribution
- **Created**: 2026-06-27
- **Completed**: 2026-06-27
