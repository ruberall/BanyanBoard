# Archive: Webhook Delivery for Workflow Rules

## Metadata
- **Task ID**: TASK-019
- **Roadmap Link**: FEAT-016
- **Complexity**: Level 4
- **Started**: 2026-06-30
- **Completed**: 2026-07-01
- **Duration**: 2 days (planning + creative in prior session, 4 build phases + reflection)
- **Branch**: feature/FEAT-016-webhook-delivery
- **Reflection**: `memory-bank/reflection/reflection-TASK-019.md`

## Executive Summary

TASK-019 delivered end-to-end webhook automation for BanyanBoard, allowing board owners to configure user-defined rules that POST a JSON payload to a webhook URL when a card moves to Done. The feature spans three new DB tables, a CRUD API, a trigger evaluation engine, a fault-tolerant webhook dispatcher with manual retry loop, and a React settings panel — all fully additive to the FEAT-014 workflow infrastructure without modifying any existing table or route.

Final test count: **590 passing** (311 backend, 279 frontend). All acceptance criteria met. TypeScript clean across all four phases. Four Code Review cycles completed; security review caught and fixed three credential-exposure defects before commit.

## System Overview

### Purpose
Enable board owners to pipe board events (card moves to Done) into external systems (CI pipelines, Slack relays, internal dashboards) via outbound HTTP webhooks, without polling the API. Retried delivery with per-attempt audit tracking gives operators observability into integration health.

### Scope
- `automation_rules` — user-configurable webhook rules (trigger type, webhook URL, enabled flag, board FK)
- `trigger_executions` — one row per rule trigger fire, decoupled from delivery status
- `webhook_deliveries` — full delivery lifecycle: `pending → delivered | failed → exhausted`
- `AutomationRepository` / `AutomationService` / `WebhookDispatcher` / `WebhookTransport`
- `POST /boards/:boardId/automation-rules`, `GET /boards/:boardId/automation-rules`, `DELETE /boards/:boardId/automation-rules/:ruleId`
- `GET /boards/:boardId/webhook-deliveries` with cursor pagination
- SSRF guard (`isPrivateHost` + `WEBHOOK_BLOCK_PRIVATE_RANGES` toggle)
- Frontend: `BoardSettingsModal` (native `<dialog>`), `AutomationTab`, `NewRuleForm`, `RulesList` (URL masking), `DeliveryHistoryPanel`, `StatusBadge`, `SettingsErrorBoundary`

**Out of scope**: User-configurable trigger types beyond "card moved to Done", rule enable/disable toggle UI, push-based SSE delivery status updates, delivery cursor pagination UI ("Load more"), DNS-rebind SSRF mitigation.

### Key Capabilities
- Per-rule retry up to `WEBHOOK_MAX_ATTEMPTS` (default: 3) with `WEBHOOK_BACKOFF_MS` (default: 30 000) between attempts
- Per-attempt delivery row writes (not just terminal state) for audit trail completeness
- SSRF guard blocking delivery to private/loopback IPs at dispatch time (configurable)
- W3C `traceparent` header injection on all outbound webhook requests
- URL masking in UI (`${host}/***`) to prevent credential exposure
- `SettingsErrorBoundary` isolating settings modal failures from `BoardPage`
- Conditional 30-second polling (`refetchInterval`) — active only when the settings modal is open

## Architecture

### Overview
Webhook delivery is layered on top of the existing FEAT-014 Optional DI injection pattern. `AutomationService` is injected into `CardService` via the same optional constructor parameter used for `WorkflowService` and `EventService`. All rule evaluation is a side effect of `CardService.moveCard` — the HTTP response is never delayed. `WebhookDispatcher` orchestrates the retry loop and DB lifecycle writes; `WebhookTransport` is the only component that touches `fetch`. The layered decomposition keeps each component unit-testable with mock injections.

### Component Relationships

```
routes/index.ts
  └─ creates AutomationService(db)
       └─ passed to createCardsRouter(db, eventService, workflowService?, automationService?)
            └─ CardService(repo, eventService, workflowService?, automationService?)
                 └─ moveCard() → evaluateCardMovedToDone() [fire-and-forget]

evaluateCardMovedToDone(boardId, cardId):
  automationService.getRulesForBoard(boardId)
  → Promise.allSettled(rules.map(r => dispatcher.dispatch(r, payload)))

AutomationService(db)
  └─ AutomationRepository(db) — all SQL, all INSERTs use RETURNING

WebhookDispatcher(repo, transport)
  └─ manual retry loop: pending → attempt → [delivered | failed] → … → exhausted
       └─ WebhookTransport — fetch + AbortController, returns TransportResult discriminated union
```

### Data Flow — Webhook Trigger

1. `PATCH /cards/:id/move` → card moved → HTTP 200 returned
2. `CardService.moveCard` checks destination column name === "Done"
3. `evaluateCardMovedToDone(boardId, cardId)` called (fire-and-forget, `.catch()` + warn)
4. `automationService.getRulesForBoard` fetches enabled `automation_rules` rows
5. `Promise.allSettled` fans out one `dispatcher.dispatch(rule, payload)` per rule — failures are isolated
6. Inside `dispatcher.dispatch`:
   - Inserts `trigger_executions` row (rule_id, card_id, board_id, trigger_type, status=pending)
   - SSRF guard: if `WEBHOOK_BLOCK_PRIVATE_RANGES=true` and hostname is private → status=exhausted, attempt_count=0, return
   - Manual loop up to `maxAttempts`: `transport.post(url, payload, headers)` → updates delivery row at each step
   - On 2xx: status=delivered, http_response_code=status
   - On non-2xx or timeout: status=failed, http_response_code=status or null, error=jsonb detail
   - After all attempts fail: status=exhausted

### Security Properties

| Concern | Mitigation |
|---------|------------|
| SSRF | `isPrivateHost()` blocks RFC1918/loopback at dispatch; `WEBHOOK_BLOCK_PRIVATE_RANGES` default on |
| Credential exposure (URL in UI) | `maskWebhookUrl()` renders `${host}/***` — raw URL never rendered |
| Credential exposure (URL in logs) | Logger receives `new URL(url).host` only, never full URL |
| onError echoing server messages | `NewRuleForm.onError` uses fixed generic string, not `err.message` |
| Trace context | `propagation.inject(context.active(), headers)` before every `fetch` call |
| SQL injection | All queries use `$N` parameterization; no string interpolation |

## Key Design Decisions

### 1. Separate `trigger_executions` Table (not reusing `workflow_rule_triggers`)

The existing `workflow_rule_triggers` table stores rule identity as a varchar constant (`'done-color-rule'`, `'stale-rule'`) with no FK to a user-defined rule table. Reusing it for user-configurable rules with UUID FKs would conflate two fundamentally different identity models. A separate `trigger_executions` table allows the two engines to evolve independently without nullable FK awkwardness.

### 2. Manual Retry Loop in `WebhookDispatcher`

`retryWithBackoff` (TASK-017 utility) cannot interleave per-attempt DB writes and uses exponential backoff — both violate the spec (linear 30s backoff, per-attempt row writes). The manual imperative for-loop mirrors the proven `triggerDoneColorRule` pattern and was identified as the correct choice in the architecture creative document before any code was written.

### 3. `WebhookTransport` as Injected Infrastructure

Isolating `fetch` + `AbortController` into a dedicated class keeps `WebhookDispatcher` free of I/O, enabling full unit testing with a mock transport. The discriminated `TransportResult` type cleanly handles `http_response_code = null` on timeout vs numeric code on non-2xx.

### 4. Native `<dialog>` for Board Settings Modal

Avoids importing Radix/Headless UI for a single surface. Provides `role="dialog"`, Escape-dismiss, and `::backdrop` natively. The jsdom `showModal()` fallback in tests is handled via a `beforeAll` polyfill.

### 5. URL Masking (`maskWebhookUrl`)

Raw webhook URLs may embed query-string tokens; displaying them in the UI would expose credentials on shared screens or screenshots. `maskWebhookUrl()` is tested explicitly — asserting both that the raw URL is absent and the masked form is present.

## Implementation Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Data model + CRUD API | ✅ Complete | `automation_rules`, `trigger_executions`, `webhook_deliveries` tables; full CRUD routes |
| Phase 2: Trigger evaluation engine | ✅ Complete | Event listener, rule matching, `evaluateCardMovedToDone`, `Promise.allSettled` fan-out |
| Phase 3: Webhook dispatcher + retry | ✅ Complete | `WebhookDispatcher`, `WebhookTransport`, SSRF guard, `traceparent` injection, delivery lifecycle |
| Phase 4: UI settings panel | ✅ Complete | `BoardSettingsModal`, `AutomationTab`, `NewRuleForm`, `RulesList` (URL masking), `DeliveryHistoryPanel`, `SettingsErrorBoundary` |

## Test Coverage

- **Backend** (311 tests): `AutomationRepository`, `AutomationService`, `WebhookDispatcher` (delivery lifecycle, no-throw guarantee, SSRF block, URL-not-in-log), API route tests, `trigger_executions` schema assertions
- **Frontend** (279 tests): `NewRuleForm` (submission, error handling), `RulesList` (URL masking), `DeliveryHistoryPanel` (conditional polling, status badges), `SettingsErrorBoundary`, `BoardSettingsModal` (aria-modal, Escape handling)
- **Notable patterns**: Phase 3 uses fake timers to test 30s retry backoff; asserts delivery row state after each attempt (not just terminal); explicitly tests URL absence from log output

## Code Review Findings Resolved

| Issue | Severity | Resolution |
|-------|----------|------------|
| `refetchInterval: 30_000` unconditional — polled when modal closed | Blocking | Changed to `opts?.enabled !== false ? 30_000 : false` |
| `RulesList` rendered raw `webhook_url` — credential exposure | Blocking | Added `maskWebhookUrl()` → `${host}/***` |
| `NewRuleForm.onError` passed `err.message` — could echo URL fragments | Blocking | Fixed to static generic string |
| No error boundary around `BoardSettingsModal` | Blocking | Added `SettingsErrorBoundary` class component |
| `Promise.allSettled` absent from multi-rule fan-out | Blocking | Added to `evaluateCardMovedToDone` |
| Missing `traceparent` injection in `WebhookTransport` | Blocking | Added `propagation.inject(context.active(), headers)` before fetch |

## Technical Debt & Future Work

- **Frontend pagination gap**: `DeliveryHistoryPanel` does not consume `nextCursor`; only the first page of deliveries is shown. Add "Load more" via `useInfiniteQuery` in a future iteration.
- **In-process retry durability**: A process restart mid-backoff abandons in-flight retries. A startup-time recovery sweep querying non-terminal deliveries older than `maxAttempts * backoffMs` would resolve stale rows without requiring a message bus.
- **DNS-rebind SSRF gap**: `isPrivateHost()` checks the URL hostname at dispatch time, not the resolved IP. A DNS-rebind attack is not defended. Future hardening: resolve the IP at dispatch time and re-check private-range rules.

## Key Learnings

1. **Architecture creative pays compound dividends on Level 4 features.** Every Phase 1–3 implementation decision (table schemas, retry mechanism, transport discrimination, config fields, SSRF strategy, Promise.allSettled fan-out) was pre-resolved in the creative document. The team did not make architectural judgment calls mid-build; they executed a known plan.

2. **Code review is the primary security gate, not spec completeness.** Three credential-exposure defects (raw URL in UI, err.message echoing, unconditional polling) were absent from the implementation spec but caught by code review before commit. Security-sensitive features benefit from a dedicated code reviewer pass with an explicit checklist.

3. **Per-step DB write assertions prevent partial delivery silently passing tests.** The Phase 3 test suite explicitly asserts delivery row state after each retry attempt, not just the terminal state. This pattern prevented a scenario where a single terminal INSERT replaced all per-step INSERTs without any test failure.

4. **Additive Optional DI prevents regression creep.** The `AutomationService → CardService` Optional DI injection required zero changes to existing `CardService` tests. TASK-017's Optional DI pattern has now been applied twice — it's a proven low-risk integration pattern for new services that trigger on existing flows.

## Creative Documents

- `memory-bank/creative/TASK-016-activity-feed-attribution-architecture.md` — Architecture design: table selection, retry mechanism, transport layer, SSRF strategy
- `memory-bank/creative/TASK-016-activity-feed-uiux.md` — UI/UX design: modal vs drawer, tab layout, rule form, delivery history panel

## References

- **Reflection**: `memory-bank/reflection/reflection-TASK-019.md`
- **Task file**: `memory-bank/tasks/TASK-019.md`
- **Related task (workflow engine)**: `memory-bank/archive/archive-TASK-017.md`
- **systemPatterns**: Webhook Delivery Pattern, Fire-and-Forget Trigger Pattern, Optional DI Pattern, Rule Manual Retry Loop Pattern
