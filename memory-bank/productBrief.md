# Product Brief

> This document captures the business and product context for development teams.
> It ensures all agents understand the product's purpose, users, and constraints.

## Product Overview

- **Name**: BanyanBoard
- **Value Proposition**: A simple, fast kanban board for small teams who want to organize work without the overhead of enterprise tools like Jira or Asana.
- **Product Type**: Web Application (self-hosted / local)
- **Stage**: MVP

## Key Functionality

Core capabilities this product provides:

- Create and manage multiple kanban boards
- Organize boards into columns (To Do, In Progress, Done) — columns are customizable
- Create cards with titles, descriptions, due dates, and labels
- Drag-and-drop cards between columns
- Invite team members and collaborate on shared boards
- Real-time activity feed on the board page showing card movement events (SSE-based, collapsible sidebar)

## Markets Serviced

- **Primary Market**: Small software teams, freelancers, and indie teams (2–10 people)
- **Secondary Markets**: Personal productivity users, small non-technical teams
- **Geographic Focus**: Global
- **Market Size**: Large — SMB project management is a well-established category

## Competitive Landscape

- **Direct Competitors**: Trello, Linear (kanban view), GitHub Projects
- **Indirect Competitors**: Notion (boards), Jira, Asana, sticky notes / spreadsheets
- **Key Differentiators**: Self-hosted, minimal setup, no per-seat pricing, no bloat
- **Competitive Advantages**: Runs locally with Docker Compose; no account/cloud required; fast and focused

## Key Personas

### Primary Users

| Persona | Role | Goals | Pain Points | Success Metrics |
|---------|------|-------|-------------|-----------------|
| Dev Team Lead | Engineering lead on a small team | Keep the team's work visible, unblock people, ship features | Heavyweight tools slow the team down; too many notifications | Cards move through columns predictably; no stale cards |
| Individual Developer | IC contributor | Know what to work on next; track personal tasks | Forgetting context when switching tasks; unclear priorities | Clear queue of next tasks; due dates visible at a glance |

### Secondary Users

| Persona | Role | Goals |
|---------|------|-------|
| Freelancer | Solo contractor | Track client work and deliverables across multiple projects |
| Small Business Owner | Non-technical team lead | Assign and track tasks for a small ops or support team |

### Administrators/Operators

| Persona | Role | Responsibilities |
|---------|------|------------------|
| Self-Hoster | Dev/IT who deploys BanyanBoard | Stand up the app via Docker Compose; manage upgrades and backups |

## User Flows

- **Primary Flow**: User opens a board → scans columns → drags a card from In Progress to Done
- **Onboarding**: User creates a board → adds columns → creates their first card → shares board URL with a teammate
- **Key Workflows**:
  - Daily standup: open board, scan In Progress column, update card statuses
  - Sprint planning: create cards in To Do, assign labels and due dates, drag to prioritize
  - Card detail: click card → edit description, set due date, add/remove labels

## Success Metrics & KPIs

### Business Metrics

- Deployments via Docker Compose (adoption signal for self-hosted)
- GitHub stars / forks (community traction)
- Retention: users returning to the same board across multiple sessions

### Product Metrics

- Time-to-first-card: < 2 minutes from first load to first card created
- Cards moved per session (engagement signal)
- Boards with 2+ members (team adoption signal)

### Technical Metrics

- API p95 response time < 200ms for all CRUD operations
- Page load (initial) < 2s on localhost
- Zero data loss on card moves (idempotent drag-and-drop)

## Non-Functional Requirements

### Performance

- **Response Time**: p95 < 200ms for API endpoints; p99 < 500ms
- **Throughput**: Support 50 concurrent users per instance without degradation
- **Concurrent Users**: Designed for small teams (2–20 active users per board)
- **Page Load Time**: < 2s initial load on localhost; < 1s for navigation between boards

### Scalability

- **Users**: Target 2–20 concurrent users per self-hosted instance
- **Data Volume**: Hundreds of boards, thousands of cards per instance — not hyper-scale
- **Growth Rate**: Designed for small teams; no auto-scaling required
- **Peak Load**: Spikes during stand-ups (multiple users opening boards simultaneously)

### Security

- **Authentication**: Session-based auth (email + password) — **implemented** (TASK-011 Phase 1); express-session with PostgreSQL session store; bcrypt (cost 12) for password hashing; no OAuth required for MVP
- **Authorization**: Board-level permissions — owner can invite members; members can read/write cards
- **Compliance**: No specific compliance requirements for MVP (self-hosted, no PII beyond user accounts)
- **Data Classification**: Internal — user-generated task data
- **Encryption**: HTTPS in production (TLS termination at reverse proxy); passwords hashed with bcrypt
- **Email Enumeration Protection**: Login returns identical error messages for unknown email and wrong password

### Availability & Reliability

- **Uptime Target**: Best-effort for self-hosted; no SLA
- **Recovery Time Objective (RTO)**: Manual restart acceptable (Docker Compose)
- **Recovery Point Objective (RPO)**: Daily PostgreSQL backup recommended in ops docs
- **Disaster Recovery**: Docker volume backups; documented restore procedure

### Data & Privacy

- **Data Residency**: All data stays on the operator's own infrastructure
- **Data Retention**: Operator-defined; no automatic deletion
- **Privacy Requirements**: No cloud telemetry; no third-party analytics by default
- **PII Handling**: Only email/username stored; no payment data
- **Data Portability**: Export board as JSON (nice-to-have, not MVP)

### Accessibility

- **Target Compliance**: WCAG 2.1 AA
- **Key Requirements**:
  - [x] Keyboard navigation (move cards without mouse)
  - [x] Screen reader compatible labels on all interactive elements
  - [x] Color contrast compliance (labels must not rely on color alone)
  - [x] Focus indicators visible
  - [ ] Full screen reader flow for drag-and-drop (nice-to-have post-MVP)

### Internationalization (i18n)

- **Supported Languages**: English only for MVP
- **Localization Needs**: Not required for MVP; architecture should not hard-block future i18n

### Browser/Platform Support

- **Browsers**: Chrome (latest), Firefox (latest), Safari (latest), Edge (latest)
- **Mobile**: Responsive layout for tablet; mobile drag-and-drop is nice-to-have
- **Desktop**: Primary target is desktop browsers

## Integration Points

### External Systems

| System | Purpose | Protocol | Direction |
|--------|---------|----------|-----------|
| PostgreSQL | Persistent storage for boards, columns, cards, users | TCP (pg driver) | Outbound |
| Docker Compose | Local orchestration of frontend, backend, and database | — | Infrastructure |

### APIs Consumed

| API | Provider | Purpose |
|-----|----------|---------|
| (none for MVP) | — | — |

### APIs Provided

| API | Purpose | Consumers |
|-----|---------|-----------|
| REST API (Express) | CRUD for boards, columns, cards, users | React frontend |

### Data Sources

| Source | Type | Frequency |
|--------|------|-----------|
| PostgreSQL | Database | Real-time (per request) |

## Constraints & Assumptions

### Business Constraints

- MVP scope: boards, columns, cards (titles, descriptions, due dates, labels)
- Columns are **fixed per board**: To Do, In Progress, Done — not user-configurable in MVP
- Labels are **card-scoped** (free-form strings per card) — no shared board-level label registry
- No WebSockets — real-time activity feed uses SSE (Server-Sent Events) for one-way event streaming; card/column mutations still use REST + optimistic UI
- No billing, subscriptions, or usage limits in MVP
- Must run entirely via `docker compose up`

### Technical Constraints

- **Frontend**: React + TypeScript
- **Backend**: TypeScript + Express
- **Database**: PostgreSQL
- **Architecture**: Clean architecture, favoring simplicity over clever abstractions
- **Local dev**: Docker Compose only — no Kubernetes, no cloud services required
- No microservices — single Express app for MVP

### Assumptions

- Teams are small enough that full bidirectional real-time collaboration (WebSockets) is not required for MVP; SSE activity feed provides lightweight one-way event streaming
- Users are technical enough to run Docker Compose
- A single PostgreSQL instance is sufficient for MVP scale

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Drag-and-drop UX is complex to get right | Medium | High | Use a well-tested library (e.g., dnd-kit); write E2E tests for card moves |
| Clean architecture over-engineering | Medium | Medium | Enforce simplicity in code review; start with 3-layer (route → service → repository) |
| PostgreSQL migration drift | Low | High | Use a migration tool (e.g., node-pg-migrate or Flyway) from day one |
| Docker Compose networking issues on Windows | Low | Medium | Test on Windows in CI; document known workarounds |

## Open Questions

- [x] Should columns be user-configurable per board, or fixed to To Do / In Progress / Done for MVP? → **Fixed columns for MVP** (To Do, In Progress, Done)
- [x] Is real-time card updates (WebSocket) needed before v1.0, or is optimistic UI + polling sufficient? → **No WebSockets for MVP**; optimistic UI + page refresh is acceptable
- [x] Should labels be board-scoped (shared across cards) or card-scoped (free-form per card)? → **Card-scoped** (free-form labels per card, no shared label registry)

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2026-06-13 | banyan-init | Initial creation from user-provided product brief |
| 2026-06-17 | build-documentation-agent | Updated Security NFR to reflect TASK-011 Phase 1 auth implementation |
| 2026-06-18 | build-documentation-agent | Added activity feed to Key Functionality; updated real-time constraint to reflect SSE (TASK-012 Phase 3) |

## Last Refreshed

2026-06-18
