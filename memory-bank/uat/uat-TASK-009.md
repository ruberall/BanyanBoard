# UAT Report — TASK-009

**Run ID**: task-009-20260617-001
**Date**: 2026-06-17
**Task**: TASK-009 — React Frontend Scaffold (FEAT-005)
**Journey**: memory-bank/creative/TASK-009-board-flow-user-journey.md
**Environment**: dev — http://localhost:5173
**Sections Walked**: happy, negatives (4 paths), mobile (layout measurement)
**Skip UX Check**: true (--skip-ux-check)
**Result**: **PASS**
**Plugin Version**: Banyan Memory Bank 1.8.0

---

## Summary

| Severity | Count |
|----------|-------|
| Required | 0 |
| Recommended | 2 |
| Optional | 0 |

**Confidence distribution**: high=1, medium=1, low=0

No Required findings. All acceptance criteria passed. Two Recommended findings logged (responsive layout + mobile test infrastructure gap). UAT PASS.

---

## Findings

### [REC-1] No responsive breakpoints — horizontal scroll required on mobile

- **Severity**: Recommended
- **Confidence**: medium
- **Section**: mobile
- **Description**: The board page renders columns side-by-side with no CSS breakpoints. At 375px viewport, three columns at ~304px each (total ~912px) exceed the viewport width, requiring horizontal scrolling to reach "In Progress" and "Done" columns. This matches the journey doc's expectation ("expect horizontal overflow / scrolling") but is noted as a UX limitation for mobile users.
- **Evidence (DOM measurement)**:
  ```json
  {
    "viewport": {"w": 1352, "h": 855},
    "columnCount": 3,
    "columnWidths": [304, 304, 304],
    "boardScrollWidth": 1336,
    "hasHorizontalOverflow": false
  }
  ```
  At 375px the combined column width (912px) would exceed the viewport. No media queries found in codebase per techContext.md ("no documented breakpoints").
- **Recommendation**: Add a responsive layout for the board page — stack columns vertically or enable horizontal scroll with `overflow-x: auto` and a min-width on the column container. Consider this for FEAT-005 polish or a future responsive-design task.

---

### [REC-2] Mobile viewport testing infrastructure gap

- **Severity**: Recommended
- **Confidence**: high
- **Section**: mobile
- **Description**: The `resize_window` MCP tool resizes the OS window but does not change Chrome's CSS layout viewport (`window.innerWidth`). True mobile layout verification requires Chrome DevTools device emulation (CDP `Emulation.setDeviceMetricsOverride`). The mobile section of this UAT run could not observe actual 375px rendering.
- **Evidence**: `resize_window` reported success at 375×667; `window.innerWidth` returned 1352 throughout. Screenshot confirmed 1352×855 pixel dimensions.
- **Recommendation**: For future UAT runs requiring mobile layout verification, use `javascript_tool` to invoke `chrome.debugger` / CDP directly, or use a separate Playwright/Cypress E2E run with `--viewport 375x667`. Document this limitation in `uat-config.md`.

---

## Acceptance Criteria Results

| AC | Description | Result |
|----|-------------|--------|
| AC-ENTRY-1 | `/` renders `h1 "My Boards"` and Create Board form | ✅ PASS |
| AC-HAPPY-1 | Full flow: create board → open → add card → drag to In Progress → persists after reload | ✅ PASS |
| AC-ERROR-1 | Blank card title → inline `role="alert"` "Title is required", no card created | ✅ PASS |
| AC-404-1 | Unknown route → NotFoundPage with working "Back to boards" | ✅ PASS |
| AC-10 | Keyboard DnD: Space lift → ArrowRight → Space drop; card moves and persists | ✅ PASS |

---

## Happy Path Walk (Step-by-Step)

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | Navigate to `http://localhost:5173/` | `h1 "My Boards"`, Create Board form | ✅ |
| 2 | Type "UAT Sprint Board", click "Create Board" | Board appears in list, input clears | ✅ |
| 3 | Click "UAT Sprint Board" link | URL → `/boards/<uuid>`, 3 columns render | ✅ |
| 4 | Type "Wire up auth" in To Do input, click "Add card" | Card article appears, input clears | ✅ |
| 5 | Focus drag handle, Space (lift), ArrowRight (move), Space (drop) | Card moves to In Progress, status announces drop | ✅ |
| 6 | Reload board URL | "Wire up auth" still in In Progress | ✅ |

---

## Negative Paths Walk

| Path | Action | Expected | Result |
|------|--------|----------|--------|
| Blank board name | Click "Create Board" with empty input | No POST request, board count unchanged | ✅ |
| Blank card title | Click "Add card" with empty input | `alert "Title is required"`, no card | ✅ |
| Unknown route | Navigate to `/this-route-does-not-exist` | `h1 "Not Found"`, "Back to boards" returns to `/` | ✅ |
| Invalid board UUID | Navigate to `/boards/00000000-0000-0000-0000-000000000000` | `role="alert"` "Board not found", no crash | ✅ |

---

## Accessibility Observations

- Drag handle present as `<button aria-label="Reorder card: Wire up auth">` — keyboard-focusable ✅
- DnD keyboard instructions rendered in `aria-live` region ✅
- Loading state: `role="status"` "Loading board" ✅
- Error states: `role="alert"` for inline validation and ErrorBanner ✅
- Form inputs: `aria-label="Board name"` on create-board input; `<label>Add a card</label>` on card inputs ✅

---

## Infrastructure Notes

- **CORS**: `CORS_ORIGINS` was missing from `docker-compose.yml` — added `http://localhost:5173` to api service env. Without this fix the frontend cannot reach the backend.
- **Frontend deps**: `node_modules` must be installed inside `frontend/` before `npm run dev` works. `npm --prefix frontend install` or `cd frontend && npm install`.
- **Docker volume reset**: A stale `postgres_data` volume caused "database banyan does not exist" on startup. Fixed with `docker compose down -v`.

---

## Cleanup

Test board "UAT Sprint Board" (id: `c78ab1af-5d6b-4001-851e-ff6f76b41dc3`) remains in the database. To clean up:
```bash
curl -X DELETE http://localhost:3000/boards/c78ab1af-5d6b-4001-851e-ff6f76b41dc3
```
Or reset the full database:
```bash
docker compose down -v && docker compose up
```
