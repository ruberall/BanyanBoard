# Project Brief

## Project Overview

**Name**: BanyanBoard
**Description**: A kanban board for small teams. Users create boards with columns (To Do, In Progress, Done) and move cards between them. Cards have titles, descriptions, due dates, and labels.
**Core Purpose**: Simple, self-hosted project tracking for small teams who don't need enterprise tooling.
**Goals**:
- Ship a working kanban board runnable with `docker compose up`
- Keep the codebase simple and maintainable (clean architecture, no over-engineering)
- Deliver a fast, intuitive drag-and-drop experience

## Repository Structure

- **Type**: Poly-repo (single repo, monolith split into frontend + backend)
- **Workspace Tool**: None (separate package.json per app)
- **Workspace Root**: `/`
- **Apps**:
  - `frontend/` — React + TypeScript SPA
  - `backend/` — TypeScript + Express REST API

## Git Configuration

- **Repository**: Yes
- **Provider**: Unknown (local only for now)
- **CLI Available**: none
- **Remote URL**: none
- **Default Branch**: main
- **Archive Strategy**: local-merge

## Security Debt (Auto-Generated)

### Dependency Upgrade: jest + ts-jest ecosystem
- **Current Version**: jest 29.7.0 / ts-jest 29.1.5
- **Target Version**: jest 30.x (latest major)
- **Security Issue**: Moderate advisory chain in transitive test dependencies (js-yaml ≤4.1.1, jest-snapshot, @jest/transform) — test infrastructure only, not production runtime
- **Scope**: All backend test files
- **Breaking Changes**: Yes — jest 30.x requires config and matcher updates
- **Recommended Priority**: LOW (test-only; no known exploit vector in this codebase's test usage)
- **Generated From**: Task TASK-013, Phase 1, Date 2026-06-22
