---
name: "Learned: Observability Standards Deviation"
globs: ["memory-bank/creative/**", "src/**/*.ts"]
topics: ["observability", "standards", "product-fit", "documentation"]
priority: low
evidence_count: 1
last_updated: 2026-06-13
auto_generated: true
---

# Observability Standards Deviation

- When org-wide observability standards conflict with product constraints (self-hosted, single-service, no-cloud-telemetry), document the deviation explicitly in the creative phase with a named rationale and an open seam for future adoption — never silently omit required instrumentation; never blindly comply with standards that contradict the product brief.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| OTel tracing/metrics deferred on self-hosted single-service BanyanBoard | [reflection-TASK-001.md](../reflection/reflection-TASK-001.md) | 2026-06-13 |
