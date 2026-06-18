# Product Roadmap

## Summary

- **Total Features**: 9
- **Released Versions**: 0
- **Active Versions**: 0
- **Planning Versions**: 1
- **Backlog (next)**: 1

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
  - FEAT-009: Realtime Activity Feed (planned) [Level 3]

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
- **Status**: planned
- **Priority**: medium
- **Complexity**: Level 3
- **Description**: Track and display a realtime activity feed of card movements between columns. Card actions (create, move, label, assign, delete) emit domain events per systemPatterns.md Domain Event Pattern. Events carry timestamp, actor, action type, card ID, and before/after state. In-process emitter for v1, designed for future message bus extraction. Transport via SSE or WebSocket (to be decided in creative phase). New backend events endpoint and frontend ActivityFeed component.
- **Linked Tasks**: TASK-012 (PLANNING)
- **Branch**: feature/FEAT-009-realtime-activity-feed
- **Created**: 2026-06-18

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
