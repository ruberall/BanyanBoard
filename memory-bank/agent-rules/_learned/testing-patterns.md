---
name: "Learned: Testing Patterns"
globs: ["*.test.*", "*.test.tsx", "*.test.ts", "*.spec.*"]
topics: ["testing-patterns", "typescript", "test-fixtures"]
priority: medium
evidence_count: 16
last_updated: 2026-07-01
auto_generated: true
---

# Testing Patterns

- Playwright E2E tests that rely on new DOM elements (e.g., a palette button) require the Vite dev server to have HMR'd those changes before the test run — restart Docker Compose for a clean state if a new element is timing out even though the parent container is visible.
- When a build phase produces only Playwright spec files and the live stack is not verified during the session, add a `PLAYWRIGHT_UNVERIFIED` note to the task execution state and treat it as an open checklist item for UAT — do not treat commit of an unrun spec as equivalent to a passing test.
- Place frontend component tests co-located alongside the component file (`ComponentName.test.tsx`), never in a `__tests__/` subdirectory — extend existing test files when adding coverage to a component that already has tests.
- When extending a function's signature with optional parameters, update all existing mock assertions to match the new full call signature (e.g., `(email, hash, undefined, undefined)`) rather than leaving them at the old arity.
- When adding a new event type to a discriminated union consumed by an SSE hook, add a dedicated hook test for the new type's parser branch — component rendering tests do not exercise the hook's parse logic.
- Use `page.waitForRequest((req) => req.url().includes('/events'))` as an SSE subscription barrier before API writes in live-push E2E tests — heading visibility alone does not guarantee the SSE connection is open and listening.
- When writing frontend type tests, read the backend's contract type definition first — do not invent an interface shape independently of the source-of-truth type.
- When adding a new export to a wholesale-mocked module (`vi.mock('@/api/module')`), grep for all test files using that mock and add an explicit stub for the new export in each — auto-mocked undefined exports silently break component renders.
- Before adding `vi.fn()` or `vi.spyOn` calls to an existing test file, verify `vi` is included in the vitest import statement — component test files often import only `{ describe, it, expect }` and lack `vi`.
- For async retry loops with fixed backoff, use Jest fake timers and assert the delivery row state after each individual attempt (not only after the terminal state) to verify that per-step DB writes occur rather than a single terminal write.

## Evidence

| Learning | Source | Date |
|----------|--------|------|
| Playwright E2E needs HMR'd dev server before new DOM element tests | [reflection-TASK-014.md](../reflection/reflection-TASK-014.md) | 2026-06-27 |
| Unrun Playwright specs committed without live-stack verification | [reflection-TASK-013.md](../reflection/reflection-TASK-013.md) | 2026-06-27 |
| Co-located test placement — test writer created `__tests__/` dirs for both BoardPage and RegisterPage | [reflection-TASK-015.md](../reflection/reflection-TASK-015.md) | 2026-06-27 |
| Mock arity mismatch — `auth.service.test.ts` broke after `createUser` extended to 4-arg signature | [reflection-TASK-015.md](../reflection/reflection-TASK-015.md) | 2026-06-27 |
| SSE hook union branch: `card.created` parser not covered by component test | [reflection-TASK-016.md](../reflection/reflection-TASK-016.md) | 2026-06-27 |
| SSE waitForRequest barrier in live-push E2E tests | [reflection-TASK-016.md](../reflection/reflection-TASK-016.md) | 2026-06-27 |
| Test Writer invented WorkflowWarning { type, cardId } instead of reading backend { code, message, details? } | [reflection-TASK-017.md](../reflection/reflection-TASK-017.md) | 2026-06-28 |
| Wholesale vi.mock gap: new hook export → undefined in dependent tests (BoardPage, KanbanBoard) | [reflection-TASK-018.md](../reflection/reflection-TASK-018.md) | 2026-06-28 |
| Missing `vi` import in existing component test file (KanbanCard.test.tsx) | [reflection-TASK-018.md](../reflection/reflection-TASK-018.md) | 2026-06-28 |
| WebhookDispatcher per-step DB write assertion — fake timers across 30s backoff, state checked after each attempt | [reflection-TASK-019.md](../reflection/reflection-TASK-019.md) | 2026-07-01 |
