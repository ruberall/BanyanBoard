---
name: "Learned: Docker Dev Environment"
globs: ["docker-compose.yml", "docker-compose*.yml", "**/vite.config.*"]
topics: ["docker", "dev-environment", "vite", "hot-reload"]
priority: low
evidence_count: 1
last_updated: 2026-06-22
auto_generated: true
---

# Docker Dev Environment

- After writing frontend source files while the Docker container is stopped, restart the container (`docker compose restart frontend`) before testing — Vite's in-memory module graph does not detect file changes made before startup on Windows Docker volumes because inotify events are not forwarded reliably.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Vite stale module cache on Windows Docker volumes | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-22 |
