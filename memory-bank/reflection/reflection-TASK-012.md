# Reflection: TASK-012 - Realtime Activity Feed

**Date**: 2026-06-18
**Task Complexity**: Level 3
**Total Phases**: 4
**Duration**: 2026-06-18 (single day)

## Executive Summary

TASK-012 delivered a complete realtime activity feed for BanyanBoard using Server-Sent Events. The implementation spans the full stack: a PostgreSQL `card_events` append-only table, an in-process `DomainEventBus` interface backed by a `Map<boardId, Set<handler>>` fan-out structure, an Express SSE endpoint with Last-Event-ID replay, and a React collapsible sidebar component with localStorage persistence. All four phases completed with 177/177 backend tests and 162/162 frontend tests passing.

The most technically significant work was Phase 4 (Race Condition Hardening), which resolved a subscribe-before-flush ordering race that would have silently dropped events emitted between the history DB query and the SSE subscription registration. The fix — subscribe first, buffer live events, flush headers, replay history, drain buffer with dedup — is a non-obvious pattern that is easy to miss on first implementation of any SSE endpoint with history replay.

The two blocking code review issues in Phase 1 (empty-string UUIDs passed to non-nullable FK columns; `require()` hack bypassing DI) were caught before merge by the review sub-agent, demonstrating the value of the TDD workflow's code review gate. The SSE integration test rewrite from supertest to native `http.get` against a random port was a meaningful workflow discovery that should be codified as a learned rule.

---

## Dimension 1: Task Implementation Quality

### Requirements Achievement

**Status**: All Met

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-ENTRY-1: Feed visible on every board page (auth users) | Met | `ActivityFeedPanel` integrated into `BoardPage.tsx`; always rendered for authenticated sessions |
| AC-HAPPY-1: Card move → feed entry within 3s, no refresh | Met | In-process synchronous fan-out; SSE push is near-instant |
| AC-HAPPY-2: Actor, action, card title, relative timestamp | Met | Two-line entry format per UI/UX creative spec |
| AC-HAPPY-3: Last 20 events on initial load | Met | `EventRepository.findRecentByBoard(boardId, FEED_MAX_HISTORY)` on SSE connect |
| AC-HAPPY-4: SSE — no polling | Met | Native `EventSource` API; zero polling |
| AC-ERROR-1: Reconnecting indicator on connection drop | Met | `useActivityFeed` tracks `EventSource.readyState`; amber sticky banner |
| AC-ERROR-2: "No activity yet" empty state | Met | Rendered when event list is empty after initial load |
| AC-SCOPE-1: Card move events only in v1 | Met | `DomainEvent` union type contains only `CardMovedEvent`; extensible by design |

No scope creep was introduced. The Phase 4 race condition hardening was explicitly planned as part of the original roadmap, not an unplanned addition.

### Code Quality Assessment

**Overall Rating**: Good

- **Maintainability**: High. The `DomainEventBus` interface cleanly separates the in-process implementation from consumers. `InProcessEventBus` is ~40 lines of straightforward TypeScript. The SSE route, hook, and component each have a single responsibility. The subscribe-before-flush buffer pattern in Phase 4 required careful ordering that is not immediately obvious from reading the code — inline comments would improve future maintainability there.

- **Architecture**: High. The `Map<boardId, Set<handler>>` design avoids Node.js `EventEmitter` max-listener ceiling and memory leaks. DI through `createApp`'s `AppDeps` is consistent with the existing `pool` and `logger` injection pattern. The `DomainEventBus` interface is the explicit message-bus-ready seam documented in the creative phase.

- **Error Handling**: Good. `InProcessEventBus.publish` wraps each handler call in try/catch so one failing client does not kill fan-out to all clients. The SSE route cleans up on `req.on('close')`. The frontend hook's `onerror` handler transitions to `reconnecting` state, relying on native `EventSource` auto-retry. One gap: if the initial history query in the SSE route fails (DB error), the SSE connection is established but no history is flushed — a silent partial failure. This is low-severity at MVP scale but worth noting.

- **Testing**: Strong. 339 total tests passing across backend (177) and frontend (162). The native `http.get` pattern for SSE integration tests is more realistic than a supertest-based approach since it exercises a real persistent HTTP connection. The Phase 4 tests (SSE-RACE-1, DEDUP-1, RECONNECT-1) specifically exercise the non-obvious subscribe-before-flush race and client-side dedup logic.

### Technical Decisions

**Key Decisions:**

1. **`InProcessEventBus` over `EventEmitter` singleton** — The `Map<boardId, Set<handler>>` implementation provides O(1) fan-out per board, zero max-listener warnings, and explicit cleanup via returned unsub closures. This was the right call. The board-scoped structure also avoids the stringly-typed event name convention that a global `EventEmitter` would require.

2. **SSE over WebSocket** — SSE is the correct transport for a server-push-only feed. No client library required; native `EventSource` handles reconnect via the `retry:` field; auth via session cookie works without extra handshake. The product brief explicitly deferred WebSockets for MVP; SSE honors that decision while satisfying all acceptance criteria.

3. **Subscribe-before-flush with request-scoped buffer (Phase 4)** — Rather than flush history then subscribe (which creates a window where live events are dropped), the implementation subscribes first, buffers all live events while the history query runs, flushes headers and history, then drains the buffer with eventId dedup. This is the correct order but requires careful reasoning about the async window. The alternative (flush then subscribe with client-side replay via Last-Event-ID) would require an extra round-trip on every SSE connect and was rightly avoided.

4. **Native `http.get` for SSE integration tests** — Supertest 7's buffering behavior and `server.close()` blocking on open SSE connections made it unusable for SSE test scenarios. Native `http.get` against a bound-and-listened server on a random port is the correct pattern for testing long-lived streaming endpoints.

**Trade-offs:**

- **DI boilerplate vs. simplicity**: The `DomainEventBus` interface + `InProcessEventBus` class adds ~50 lines over a one-liner `new EventEmitter()`. This is the correct trade for DI compliance, testability, and future bus swap readiness.
- **Synchronous fan-out vs. async**: In-process fan-out is synchronous within the `publish` call, meaning a slow SSE write blocks the card move response. At MVP scale (2–20 users) this is acceptable; at higher scale, async fan-out (e.g., `setImmediate`) would be needed.
- **`localStorage` persistence vs. always-open**: The collapsible sidebar with localStorage trades a tiny amount of state complexity for substantially better usability on narrower screens. This is the right trade.

### What Went Well

1. **Creative phase quality** — Both the architecture and UI/UX creative docs were detailed enough to eliminate ambiguity during build. The architecture doc explicitly ranked four transport options and four emitter options; the UI/UX doc specified exact CSS values, ARIA attributes, and breakpoint behavior. This reduced build-time decision-making to near zero.

2. **Phase 4 was planned, not reactive** — The subscribe-before-flush race was identified in the creative-phase Risk Assessment and assigned its own build phase. Addressing it as a planned phase (with spec-first tests) rather than a post-hoc hotfix resulted in a clean, tested implementation.

3. **Code review gate caught two blocking issues in Phase 1** — Empty-string UUIDs passed to non-nullable FK columns would have caused silent DB rejections at runtime. The `require()` DI violation would have broken Jest mock ordering in ways that could have taken hours to diagnose. The review gate caught both before the phase commit.

4. **Test count growth was orderly** — Each phase had a pre-planned target test range (6–8, 5–7, 5–7, 3–4). The actual counts (8, 7, 14, 6) were within or slightly above these ranges, indicating good spec estimation. The Phase 3 overage (14 vs 7 target) reflects the additional component tests for `ActivityFeedPanel`, `ActivityFeedList`, `ActivityEntry`, and `ReconnectIndicator` as separate components — a positive overage.

### Challenges Encountered

1. **TS2393 duplicate function declarations** — `tsconfig.json` excluded `src/__tests__` but not `src/**/__tests__`, causing test helper function collisions across nested test directories. Resolved by adding `src/**/__tests__` to the `exclude` array. This is a subtle TypeScript configuration pitfall that is easy to overlook when the project first adds tests in subdirectories.

2. **SSE tests incompatible with supertest** — Supertest's `server.close()` blocks on open SSE connections (15s timeout). `agent.get().buffer(false).on('data')` in supertest v7 never sends the request because the library accumulates the response body before resolving. Resolved by rewriting 5 of 7 SSE tests using native `http.createServer` + `http.get()` against a random port. This required significantly more setup code per test but produces more realistic test behavior.

3. **BoardPage test regression in Phase 3** — `useActivityFeed` creates a native `EventSource` which is undefined in jsdom. Adding `vi.mock('@/hooks/useActivityFeed', ...)` in the BoardPage test file resolved this cleanly without requiring jsdom EventSource polyfills (which would have introduced test infrastructure complexity).

4. **Empty-string UUID fields in Phase 1** — `actorId` and `boardId` were initially passed as empty strings to UUID columns because the initial implementation did not look up `board_id` from the card record. PostgreSQL rejects empty strings for UUID columns with a type error. Resolved by querying the card to get its `board_id` before inserting the event row.

### Technical Debt & Future Work

- **Silent history-flush failure on DB error**: If the history query in the SSE route throws, the error is swallowed and the client receives a valid SSE connection with no initial history. A structured error event (e.g., `event: error\ndata: {"message":"history unavailable"}\n\n`) should be sent before entering the live stream. Low severity at MVP but worth addressing before load increases.

- **Synchronous fan-out blocking the card-move response**: At >100 concurrent SSE clients per board, synchronous fan-out inside `publish()` could measurably delay the `PATCH /cards/:id/move` response. Switch to `setImmediate(() => handler(event))` inside `InProcessEventBus.publish` when board concurrency grows.

- **`card_events` table has no TTL cleanup**: The table is append-only with no expiry. At high volume this becomes a storage concern. A background cleanup job (e.g., delete events older than 30 days) should be added in a future task.

- **Relative timestamp re-render interval**: `ActivityFeedList` uses a `setInterval` to refresh relative timestamps (e.g., "2 min ago"). The interval is not tuned — if set too aggressively it causes unnecessary renders. Verify the interval is at least 30s.

---

## Dimension 2: Claude Code Ecosystem Effectiveness

### Build Session Analysis

**Note**: Session logs not task-indexed — `.agent-logs/claude/by-task/TASK-012/` directory does not exist. The following metrics are derived from task execution state in `TASK-012.md` and conversation context. Run `/banyan-init` to upgrade to task-indexed logging.

**Build Sessions**: 4 (one per phase)
**Sub-Agents Spawned**: ~20 estimated across 4 phases (spec writer, test writer, coding agent, test runner x2-3, code reviewer, documentation agent per phase)
**Errors Recovered**: 5 significant (TS2393 tsconfig, SSE/supertest incompatibility, BoardPage jsdom regression, empty-string UUIDs, `require()` DI violation)

#### Tool Utilization (estimated from session context)

| Tool | Estimated Count | Notes |
|------|----------------|-------|
| Read | High (~60) | Creative docs, task file, existing source files loaded per agent |
| Edit | High (~40) | Source file modifications across 4 phases |
| Write | Medium (~15) | New source files, test files, migration |
| Bash | High (~50) | Test runs, TypeScript compilation, git operations |
| Agent (Task) | ~20 | Sub-agent spawns per phase |
| Grep | Medium (~20) | Symbol lookups across source tree |
| Glob | Medium (~15) | File discovery within worktree |

#### Sub-Agent Performance

| Agent Type | Invocations | Effectiveness |
|------------|-------------|---------------|
| Spec Writer | 4 | High — specs were detailed enough to drive test writing without ambiguity |
| Test Writer | 4 | High — pre-planned test targets were met; Phase 3 overage was appropriate |
| Coding Agent | 4 | High — Phase 1 blocking issues were caught by review, not leaking to runtime |
| Test Runner / Fixer | ~12 | High — SSE test incompatibility was diagnosed and resolved rather than worked around with mocks |
| Code Reviewer | 4 | High — caught 2 blocking issues in Phase 1 before commit |
| Documentation | 4 | High — `systemPatterns.md` and `techContext.md` updated each phase |

### Command Workflow Evaluation

**Commands Used**: `/banyan-plan` (x1), `/banyan-creative` (x1), `/banyan-build` (x4), `/banyan-reflect` (x1)

**Workflow Efficiency**: Good

**Assessment**:
- The Level 3 workflow (plan → creative → build per phase → reflect) was well-matched to this task. Phase 4 being a distinct "hardening" phase rather than bolted onto Phase 3 was the right structural decision — the race condition hardening required its own spec, tests, and code review cycle.
- The creative phase produced two documents (architecture + UI/UX) that were detailed enough to eliminate ambiguity during all four build phases. This is the workflow's strongest pattern.
- The four-phase build structure created appropriate natural checkpoints. Each phase commit is independently reviewable.
- Minor friction: the task file `Execution State` section showed `Phase Number: 2 of 4` at final state, which appears to be a stale tracking value. The `BUILD_COMPLETE` status is correct. The phase counter field should auto-update or be removed from the template to avoid confusion.

### Context File Effectiveness

**Files Loaded**: `TASK-012.md`, creative architecture doc, creative UI/UX doc, `systemPatterns.md`, `techContext.md`, `productBrief.md`, `agent-rules/_learned/testing-patterns.md`

**Assessment**:
- **Helpful**: The architecture creative doc was the most valuable context file. Its explicit interface contracts (`DomainEventBus`, `InProcessEventBus` internals, SSE wire protocol) meant the coding agents could implement precisely without re-deriving design decisions. The risk assessment in the creative doc flagged the subscribe-before-flush race before it was encountered in code.
- **Helpful**: The UI/UX creative doc's pixel-level specifications (exact CSS values, ARIA attribute names, localStorage key name) eliminated all UI ambiguity.
- **Gaps**: There was no guidance in the build context files about SSE testing patterns with supertest. The testing-patterns learned rule covers supertest for regular HTTP, but not its limitations for long-lived streaming connections. This gap caused the SSE test rewrite (a non-trivial effort).
- **Gaps**: No context about `tsconfig.json` `exclude` patterns for nested test directories. This is a TypeScript project configuration detail that caused the TS2393 collision.

### Memory Bank Organization

**Assessment**:
- **Structure**: Good. Creative docs with task-scoped naming (`TASK-012-activity-feed-architecture.md`) are intuitive. The two-document creative pattern (architecture + UI/UX as separate files) scales well.
- **Navigation**: Good. The task file `## Implementation Roadmap` section with checkbox state and the `## Execution State` section together give a clear picture of build progress.
- **Completeness**: The `Execution State` section's `Phase Number` counter was not updated to reflect the final phase, suggesting the field is either not reliably maintained or its semantics are unclear to sub-agents. Consider removing the `Phase Number` field if it is not auto-managed, since `Current Build` and `Completed Steps` convey the same information more accurately.

### Suggested Improvements to Claude Code System

**High Priority**:

1. **Add SSE testing guidance to build context files** — The `build-test-writer-agent.md` or a new `context/sse-testing-patterns.md` should document the supertest incompatibility with long-lived SSE connections and the native `http.createServer` + `http.get` pattern as the canonical approach. This pattern will recur on any project using SSE or WebSocket endpoints. Without this guidance, every SSE test rewrite requires rediscovering the same supertest limitation.

2. **Add a `context/tsconfig-patterns.md` for common TypeScript configuration pitfalls** — The nested `__tests__` directory exclusion issue (`src/**/__tests__` vs `src/__tests__`) is not obvious and is not specific to this task. A short context file documenting common `tsconfig.json` configuration patterns for projects with test files in multiple directories would prevent this class of error on future tasks.

**Medium Priority**:

3. **Task-indexed agent logs (`by-task/` directory)** — The absence of task-indexed logs meant build session analysis had to rely on conversation context rather than log data. This is the primary gap in reflection quality. The `/banyan-init` upgrade path that creates `by-task/` symlinks should be prioritized so future reflections can report accurate tool utilization metrics.

4. **`Phase Number` field in Execution State should be managed by the build command** — The field was stale at task completion (`Phase Number: 2 of 4` for a 4-phase task). Either the build command should auto-increment this field at each phase start, or the field should be removed from the template since `Current Build` already describes the phase by name.

**Low Priority / Nice to Have**:

5. **Creative phase validation checklist items as acceptance criteria** — Both creative docs have thorough validation checklists at the end. The build sub-agents could be instructed to cross-check their implementation against these checklists before requesting code review. This would close the loop between the creative phase outputs and build verification.

---

## Key Learnings

### Extractable Learnings (for Continuous Learning)

1. **testing-patterns** (`backend/src/routes/__tests__/`, `*.sse.test.ts`): Test SSE endpoints using native `http.createServer` + `http.get()` against a random bound port — supertest 7 blocks `server.close()` on open SSE connections and never sends `buffer(false)` requests.

2. **testing-patterns** (`tsconfig.json`, `tsconfig.test.json`): Add `src/**/__tests__` (recursive glob) to `tsconfig.json` `exclude`, not just `src/__tests__` — nested test helper files cause TS2393 duplicate declaration errors when only the top-level directory is excluded.

3. **api-design** (`backend/src/routes/`, SSE endpoints): In an SSE route that replays history on connect, subscribe to the event bus before issuing the history DB query — events emitted during the async query window are buffered and drained after history flush, preventing silent event loss.

4. **architecture-foundation** (`backend/src/events/`): Implement `DomainEventBus` as a `Map<scopeId, Set<handler>>` rather than a Node.js `EventEmitter` — avoids max-listener warnings, enforces explicit cleanup via returned unsub closures, and has no global state to interfere with test isolation.

### Learned Rules Applied

- **testing-patterns.md**: The rule "Use `supertest` agent in integration tests to avoid port-binding conflicts" was loaded and applied for regular HTTP route tests. However, the existing rule does not cover SSE streaming endpoints — its guidance led to the initial (incorrect) supertest-based SSE test approach before the incompatibility was discovered. The new learning above (learning #1) should be added to this file to close the gap.
- **architecture-foundation.md**: The rule about front-loading architecture decisions was applied — the creative phase was completed fully before any build phase began. This paid off: zero architecture pivots across all four build phases.
- **data-integrity.md**, **service-design.md**, **observability-standards.md**: Loaded by coding agents; the UUID/FK null-safety pattern in data-integrity.md did not prevent the empty-string UUID issue in Phase 1, which suggests the rule may need a more specific directive about looking up FK values from related records rather than assuming the caller provides them.

### For Claude Code Workflow

1. **SSE endpoints need their own test pattern documentation** — The supertest incompatibility is not documented anywhere in the build context system. Any new SSE endpoint will rediscover this problem. The testing-patterns learned rule should be amended and a note added to the build-test-writer-agent instructions.

2. **Phase 4 as a dedicated hardening phase worked well for race conditions** — The pattern of planning a separate hardening phase for non-obvious concurrency issues (subscribe ordering, dedup) during the roadmap/plan phase paid dividends. For future features involving streaming, queues, or websockets, explicitly plan a hardening phase in the implementation roadmap rather than folding it into the main feature phase.

3. **Code review sub-agent should flag UUID field sourcing** — The empty-string UUID issue would be caught by a rule: "for any INSERT into a table with UUID FK columns, verify each FK value is sourced from a DB query or session context — never from user input without validation." This is a specific directive worth adding to data-integrity.md.

---

## Conclusion

TASK-012 delivered a complete, well-tested realtime activity feed that meets all acceptance criteria. The four-phase structure was appropriate — each phase built on a stable foundation from the previous, and the explicit Phase 4 hardening for the subscribe-before-flush race produced a correct implementation of a pattern that is easy to get wrong. The 339 total passing tests across backend and frontend give high confidence in the implementation's correctness.

The most actionable ecosystem learning is the SSE/supertest incompatibility — it is a concrete, recurring issue that will affect any future SSE or WebSocket endpoint and is not currently documented in the build context system. The two new testing-pattern learnings (#1 and #2) should be added to `testing-patterns.md` immediately after this reflection is complete.

**Overall Task Success**: Success

**Overall Workflow Effectiveness**: Highly Effective

**Recommendation**: Ready to archive
