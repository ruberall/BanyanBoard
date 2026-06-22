---
name: "Learned: Docker Development Patterns"
globs: ["docker-compose.yml", "docker-compose*.yml", "Dockerfile*", "**/vite.config.*"]
topics: ["docker", "docker-compose", "dev-environment", "frontend-dev", "vite", "hot-reload"]
priority: low
evidence_count: 2
last_updated: 2026-06-22
auto_generated: true
---

# Docker Development Patterns

- Use a named Docker volume for `node_modules` (e.g., `frontend_node_modules:/app/node_modules`) when bind-mounting a frontend service directory — without it, the host filesystem's `node_modules` shadows the container's on Windows/macOS, causing binary incompatibility.
- After writing frontend source files while the Docker container is stopped, restart the container (`docker compose restart frontend`) before testing — Vite's in-memory module graph does not detect file changes made before startup on Windows Docker volumes because inotify events are not forwarded reliably.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Named node_modules volume required for frontend service on Windows/Mac | [reflection-TASK-009.md](../reflection/reflection-TASK-009.md) | 2026-06-17 |
| Restart Docker frontend container after writing source files while container was stopped (Windows inotify gap) | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-22 |
