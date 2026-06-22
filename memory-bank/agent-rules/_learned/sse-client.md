---
name: "Learned: SSE Client Patterns"
globs: ["frontend/src/hooks/*.ts", "**/*Feed*.ts", "**/*sse*.ts", "**/*EventSource*.ts"]
topics: ["sse", "eventsource", "frontend", "auth", "cors"]
priority: low
evidence_count: 2
last_updated: 2026-06-22
auto_generated: true
---

# SSE Client Patterns

- Use an absolute `VITE_API_URL`-based URL for `EventSource` — relative URLs resolve to the Vite dev server origin, not the API, causing immediate connection failure.
- Always construct `EventSource` with `{ withCredentials: true }` when the API uses session-cookie authentication — the default omits credentials on cross-origin SSE connections, resulting in 401s.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Relative SSE URL routed to Vite dev server (port 5173) | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-22 |
| Missing `withCredentials` caused 401 on cross-origin EventSource | [reflection-TASK-012.md](../reflection/reflection-TASK-012.md) | 2026-06-22 |
