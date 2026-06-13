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
