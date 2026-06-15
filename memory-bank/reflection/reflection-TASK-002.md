# Reflection: TASK-002 — Board & Column API

**Date**: 2026-06-15
**Complexity**: Level 2
**Status at reflection**: BUILD_COMPLETE
**Branch**: feature/FEAT-002-board-column-api
**Phases completed**: 2 (DB + Repo, Service + Routes)

---

## 1. Requirements Coverage

All seven acceptance criteria are met:

| AC | Status | Evidence |
|----|--------|----------|
| AC-ENTRY-1 | PASS | `POST /boards` → `service.createBoard` → `201` + board JSON |
| AC-HAPPY-1 | PASS | `DEFAULT_COLUMNS` constant; `Promise.all` seeds all three columns on insert |
| AC-HAPPY-2 | PASS | `GET /boards` → `getAllBoards` → 200 + array |
| AC-HAPPY-3 | PASS | `GET /boards/:id` → two-query `findBoardById` returns board + `columns[]` |
| AC-HAPPY-4 | PASS | `DELETE /boards/:id` → cascade via FK `ON DELETE CASCADE`; 204 |
| AC-ERROR-1 | PASS | `trim().length === 0` → `ValidationError` → `errorHandler` → 400 `{ error, message }` |
| AC-ERROR-2 | PASS | `boardResult.rows.length === 0` → `NotFoundError` → `errorHandler` → 404 |

No acceptance criteria were left incomplete or deferred.

---

## 2. Implementation Quality

### What went well

**Layering discipline**: The three-layer separation (repository → service → route) is clean and consistent. The route file is a thin orchestration layer — it constructs the dependency chain (`new BoardRepository(db)`, `new BoardService(repo)`) and delegates everything else. No business logic leaked into route handlers.

**Validation placement**: Trimming and length enforcement live in `BoardService.createBoard`, not in the route or the repository. This is the right layer — validation belongs in the service where it travels with the behaviour regardless of transport.

**Parallel column seeding**: `Promise.all` over three inserts is the correct approach for independent concurrent writes. A for-await loop would have been subtly slower and semantically wrong (the inserts have no order dependency at creation time).

**Two-query `findBoardById`**: Choosing two queries over a LEFT JOIN eliminates the multi-row flattening problem and makes the zero-column edge case trivially correct. The code comment explains the intent, making the trade-off self-documenting.

**UUID PKs**: `gen_random_uuid()` default on both tables eliminates row-count enumeration and is future-safe for distributed ID generation. Narrowing the TypeScript `id` field to `string` (not `number | string`) locks in this invariant at compile time.

**Error propagation via `asyncHandler`**: Route handlers have no try/catch; all errors propagate to the central `errorHandler`. This is the correct pattern — adding per-route catch blocks would either duplicate error mapping logic or silently swallow errors.

**Structured logging**: `logger.info({ boardId })` on create and delete gives operational visibility without noise on read-only paths. No `console.log` in production code.

### What could be improved

**`createBoard` response omits columns**: `POST /boards` returns the bare `Board` shape (no `columns[]`), but the board now has three auto-seeded columns. A consumer wanting to display the columns immediately must make a second `GET /boards/:id` call. This is a minor UX friction for the first consumer (the frontend). The fix would be to return `BoardWithColumns` from `createBoard` by calling `findBoardById` after insert — or by combining the two inserts + select into a single transaction. This was not in the acceptance criteria, so it is not a defect, but it should be captured for FEAT-003.

**No uniqueness constraint on board name**: The schema allows duplicate board names. This may be intentional for MVP, but it was never explicitly noted as a deliberate decision. If it matters, a `UNIQUE` constraint on `boards.name` should be added in a follow-up migration.

**`deleteBoard` rowCount check uses nullish coalescing**: `(result.rowCount ?? 0) === 0` is correct but silently tolerates a null `rowCount`, which `node-postgres` should never return for a DELETE. A stricter assertion (`result.rowCount !== 1`) would make the contract explicit. Low priority — this is defensive code.

**Integration tests deferred**: 7 `describeIfDb` tests will not run until `DATABASE_URL` is set. This is an environment constraint, not a code quality issue. However, there is no CI gate that enforces a database is available in pull request builds. The tests can pass locally in CI silence; this should be addressed when the CI pipeline is configured.

---

## 3. Test Coverage

**Phase 1**: 14/14 unit tests passing. Repository methods covered with mock `Queryable`.
**Phase 2**: 26/26 unit tests passing (cumulative; 7 integration skips expected).

Coverage gaps (acceptable for MVP):
- No test for the 255-char boundary condition from above the limit (only at and below). Low risk.
- No test for concurrent `createBoard` calls (race condition on column seeding). Not realistic at this stage.
- Integration tests blocked by environment — mitigated by thorough unit coverage of the same paths.

The test-first discipline was maintained across both phases. No production code was merged without a corresponding test.

---

## 4. Technical Decisions & Trade-offs

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| UUID PKs | Prevents enumeration; future distributed-ID compatible | Slightly larger FK size vs. serial; negligible at MVP scale |
| Two-query `findBoardById` | Handles zero-column boards; no multi-row flattening | Two round-trips instead of one; acceptable for single-board lookups |
| Column seeding in repository | Keeps seeding transactionally close to insert | Couples seed behaviour to the repository; if seed logic becomes configurable, it must move to the service |
| No transaction wrapping `createBoard` | Simplicity for MVP | If board insert succeeds but a column insert fails, the board exists with partial columns. Acceptable risk at this scale; revisit if column seeding becomes complex |
| OpenAPI spec deferred | No toolchain scaffolded | Consumer contracts are implicit; adds risk of contract drift before FEAT-003 |

---

## 5. Workflow Effectiveness (Claude Code Ecosystem)

### What worked well

**Phase-gated builds**: Splitting into Phase 1 (DB + repo) and Phase 2 (service + routes) was appropriate. Phase 1 code-reviewed cleanly before Phase 2 began, so no cross-phase rework cascaded.

**In-sprint code review**: The code review agent caught real issues (serial PKs → UUID, sequential inserts → `Promise.all`, echoed IDs in error messages, no name length validation). All blocking findings were resolved within the same session. This is the correct use of the review gate — catch issues before they accumulate.

**Parallel Phase 2 sub-agents**: Running service and route sub-agents concurrently in Phase 2 worked because the route's only dependency on the service was the interface shape, which was defined first. This is a reusable pattern for service + route pairs that have no circular dependency.

### What did not work well

**Command navigation errors**: `/banyan-build` was invoked without a task ID twice, and `/banyan-plan` was invoked with a task ID instead of a feature ID. These are mechanical errors that wasted session turns. The command syntax (`/banyan-build TASK-002`, not `/banyan-build`) should be reinforced at workflow entry points — ideally by the command files printing usage on bare invocation.

**No `createBoard` transaction boundary**: The absence of a transaction around board + column inserts was not flagged by the code reviewer or the planning phase. This is a gap in the review checklist for multi-statement writes.

**OpenAPI spec not planned**: The plan did not include OpenAPI spec generation as a deliverable. The deferred item was caught during Phase 2 build but only as a note, not as a tracked backlog item. It should have been added to the roadmap as a sub-item of FEAT-003 during planning.

---

## 6. Deferred Items (Action Required)

| Item | Priority | Suggested Resolution |
|------|----------|---------------------|
| `POST /boards` should return `BoardWithColumns` | Medium | Return `findBoardById` result from `createBoard`; update route and tests |
| OpenAPI spec for `/boards` endpoints | Medium | Scaffold before FEAT-003 column endpoints; add as FEAT-003 prerequisite |
| `createBoard` transaction | Low | Wrap board insert + column inserts in `BEGIN/COMMIT`; revisit if seed logic grows |
| Board name uniqueness | Low | Decide intentionally; add `UNIQUE` constraint or document as MVP bypass |
| DATABASE_URL in CI | Low | Configure in CI environment; integration tests will activate automatically |

---

## 7. Extractable Learnings

- **multi-statement-write** (repositories): Always wrap multi-statement writes (insert + dependent inserts) in an explicit transaction — partial failure leaves data in an inconsistent state even when individual statements succeed.
- **api-response-shape** (routes/services): When a create endpoint auto-seeds child records, return the full parent+children shape in the 201 response to avoid forcing consumers into an immediate second GET.
