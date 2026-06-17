---
name: "Learned: Docker Compose Patterns"
globs: ["docker-compose.yml", "docker-compose*.yml", "Dockerfile*"]
topics: ["docker-compose", "docker", "frontend-dev"]
priority: low
evidence_count: 1
last_updated: 2026-06-17
auto_generated: true
---

# Docker Compose Patterns

- Use a named Docker volume for `node_modules` (e.g., `frontend_node_modules:/app/node_modules`) when bind-mounting a frontend service directory — without it, the host filesystem's `node_modules` shadows the container's on Windows/macOS, causing binary incompatibility.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Named node_modules volume required for frontend service on Windows/Mac | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
