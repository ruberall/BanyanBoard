# E2E Test Specification — TASK-009

**Generated from UAT run**: task-009-20260617-001 (PASS)
**Date**: 2026-06-17
**Journey**: memory-bank/creative/TASK-009-board-flow-user-journey.md
**Framework**: Framework-agnostic (target: Playwright or Cypress — see techContext.md)
**Base URL**: `http://localhost:5173`

> Implement these specs using the project's E2E test framework. All selectors are
> confirmed working from the UAT run. Use `data-testid` attributes where brittle
> selectors are noted.

---

## Test Suite: Board Flow (TASK-009)

### Setup / Teardown

```
beforeAll:
  - Ensure backend is running at http://localhost:3000 (GET /health → 200)
  - Ensure frontend is running at http://localhost:5173

afterEach:
  - DELETE any boards created during the test via API:
      DELETE http://localhost:3000/boards/<boardId>

afterAll:
  - No browser state to clear (no auth, no localStorage usage)
```

---

### Spec 1: Board List Page

**File**: `e2e/board-list.spec.ts`

```
describe("Board List Page")

test("renders heading and create board form")
  navigate to "/"
  assert: heading text "My Boards" is visible
  assert: input[aria-label="Board name"] is visible
  assert: button "Create Board" is visible

test("creates a board and shows it in the list")
  navigate to "/"
  type "E2E Test Board" into input[aria-label="Board name"]
  click button "Create Board"
  assert: link "E2E Test Board" is visible in the board list
  assert: input[aria-label="Board name"] value is empty (cleared on success)
  cleanup: DELETE /boards/<new board id>

test("blank board name is a no-op — no request fires, list unchanged")
  navigate to "/"
  record board count = count(ul li)
  click button "Create Board" (input empty)
  assert: board count unchanged
  assert: no POST /boards request was made
  assert: no error message visible
```

---

### Spec 2: Board Page

**File**: `e2e/board-page.spec.ts`

```
describe("Board Page")

beforeEach:
  POST http://localhost:3000/boards { name: "E2E Board" }
  store boardId from response

afterEach:
  DELETE http://localhost:3000/boards/<boardId>

test("renders board heading and three default columns")
  navigate to "/boards/<boardId>"
  assert: heading text "E2E Board" is visible
  assert: section[aria-label="Column: To Do"] is visible
  assert: section[aria-label="Column: In Progress"] is visible
  assert: section[aria-label="Column: Done"] is visible

test("adds a card to a column")
  navigate to "/boards/<boardId>"
  type "My test card" into section[aria-label="Column: To Do"] input[placeholder="Card title..."]
  click section[aria-label="Column: To Do"] button "Add card"
  assert: article with heading "My test card" is visible in "Column: To Do"
  assert: input[placeholder="Card title..."] in "Column: To Do" is empty

test("blank card title shows validation error — no card created")
  navigate to "/boards/<boardId>"
  click section[aria-label="Column: To Do"] button "Add card" (input empty)
  assert: alert "Title is required" is visible in "Column: To Do"
  assert: no article card was added to "Column: To Do"

test("moves a card between columns via keyboard DnD and persists")
  navigate to "/boards/<boardId>"
  -- create card first --
  type "Keyboard move card" into "Column: To Do" input
  click "Add card"
  wait for article "Keyboard move card" in "Column: To Do"
  -- keyboard drag --
  focus button[aria-label="Reorder card: Keyboard move card"]
  press Space  (lifts card)
  press ArrowRight  (moves over "In Progress")
  press Space  (drops card)
  assert: article "Keyboard move card" is in section[aria-label="Column: In Progress"]
  assert: section[aria-label="Column: To Do"] shows "No cards yet"
  assert: no role="alert" error banner visible
  -- verify persistence --
  reload page
  assert: article "Keyboard move card" is still in "Column: In Progress"
```

---

### Spec 3: 404 / Error Pages

**File**: `e2e/error-pages.spec.ts`

```
describe("Error Pages")

test("unknown route renders NotFoundPage with back link")
  navigate to "/this-route-does-not-exist"
  assert: heading "Not Found" is visible
  assert: text "The page you were looking for does not exist." is visible
  assert: link "Back to boards" is visible
  click link "Back to boards"
  assert: URL is "/"
  assert: heading "My Boards" is visible

test("invalid board UUID renders ErrorBanner without crash")
  navigate to "/boards/00000000-0000-0000-0000-000000000000"
  wait for loading to resolve (wait for role="status" to disappear or role="alert" to appear)
  assert: element with role="alert" is visible
  assert: text "Board not found" (or similar error) is visible
  assert: no board heading rendered
  assert: no column sections rendered
```

---

## Confirmed Selectors (from UAT run)

| Element | Selector | Notes |
|---------|----------|-------|
| Board name input | `input[aria-label="Board name"]` | On board list page |
| Create Board button | `button:has-text("Create Board")` | |
| Board link | `ul li a:has-text("<board name>")` | |
| Column section | `section[aria-label="Column: <name>"]` | e.g. "Column: To Do" |
| Column heading | `section[aria-label="Column: <name>"] h2` | |
| Card title input | `section[aria-label="Column: <name>"] input[placeholder="Card title..."]` | |
| Add card button | `section[aria-label="Column: <name>"] button:has-text("Add card")` | |
| Card article | `section[aria-label="Column: <name>"] article` | |
| Card heading | `article h3:has-text("<title>")` | |
| Drag handle | `button[aria-label="Reorder card: <title>"]` | Also has `aria-roledescription="draggable"` |
| Inline validation alert | `section[aria-label="Column: <name>"] [role="alert"]` | "Title is required" |
| Error banner | `[role="alert"]` (page-level) | Dismissable via `button[aria-label="Dismiss"]` or button "Dismiss" |
| Loading status | `[role="status"]` | "Loading board" or "Loading boards" |
| DnD instructions | `[aria-live]` generic below columns | Keyboard DnD instructions |

---

## Observed Wait Conditions

| Transition | Wait Condition |
|------------|---------------|
| After "Create Board" | New `li a` with board name appears in list |
| After "Add card" | New `article h3` with card title appears in column |
| After keyboard drop | `role="status"` announces "was dropped over droppable area"; card appears in dest column |
| After page load | `role="status" "Loading board"` disappears; columns render |
| After invalid UUID load | `role="alert"` appears (may take up to 3s for TanStack Query retry) |

---

## Infrastructure Requirements

The following must be resolved before E2E tests run in CI:

1. **CORS**: `CORS_ORIGINS=http://localhost:5173` must be set in the api container env (already added to `docker-compose.yml`).
2. **Database**: `docker compose up` must complete migrations before tests begin. Use a `wait-for-healthy` check on the api container.
3. **Test isolation**: Each spec that creates boards must DELETE them in `afterEach` via the API. No shared state between tests.
4. **Mobile viewport**: True 375px layout testing requires `page.setViewportSize({ width: 375, height: 667 })` (Playwright) or `cy.viewport(375, 667)` (Cypress) — the `resize_window` MCP tool does not affect CSS layout viewport.
