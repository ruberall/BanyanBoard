# Archive: TASK-007 — Card Management API

**Archived**: 2026-06-16
**Complexity**: Level 2
**Feature**: FEAT-003
**Branch**: feature/FEAT-003-card-management-api (merged, deleted)
**Commits**: af1feef, 2ec06ac, 6c21e44

---

## Summary

Delivered a complete 5-endpoint Card Management REST API for BanyanBoard, enabling the frontend to create, list, retrieve, update, and delete cards within kanban columns.

---

## Implementation Phases

### Phase 1: Migration, CardRepository, and CardService

**Files created:**
- `backend/migrations/1750003200000_create-cards.js` — cards table (uuid PK, column_id FK CASCADE, title, description, due_date, labels text[], position int, created_at, updated_at)
- `backend/src/repositories/card.repository.ts` — CardRepository with 5 methods; FK violation (pg 23503) caught and re-thrown as NotFoundError
- `backend/src/services/card.service.ts` — CardService thin pass-through with pino structured logging
- `backend/src/repositories/__tests__/card.repository.test.ts` — 14 unit tests
- `backend/src/services/__tests__/card.service.test.ts` — 5 unit tests

### Phase 2: Route Handlers, Validation, and index.ts Mounting

**Files created/modified:**
- `backend/src/routes/cards.ts` — `createColumnCardsRouter` (POST/GET `/:columnId/cards`) + `createCardsRouter` (GET/PATCH/DELETE `/:id`)
- `backend/src/routes/index.ts` — mounted both routers at `/columns` and `/cards`
- `backend/src/routes/__tests__/cards.routes.test.ts` — 18 HTTP integration tests via supertest

---

## API Surface

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| POST | `/columns/:columnId/cards` | 201 | Create card in column |
| GET | `/columns/:columnId/cards` | 200 | List cards in column |
| GET | `/cards/:id` | 200 | Get single card |
| PATCH | `/cards/:id` | 200 | Partial update |
| DELETE | `/cards/:id` | 204 | Delete card |

---

## Test Results

- **Total**: 95 passing, 8 skipped (describeIfDb integration guards)
- **New tests**: 37 (14 repo + 5 service + 18 HTTP)
- **Regressions**: 0
- **TypeScript**: clean (tsc --noEmit)

---

## Key Decisions

1. **Two router factories in one file** — `createColumnCardsRouter` + `createCardsRouter` avoids Express mount-prefix ambiguity when a resource has two URL shapes
2. **FK violation at repository layer** — pg error code `23503` caught in `createCard` and re-thrown as `NotFoundError('Column not found')`; consistent with where all other NotFoundErrors originate
3. **Dynamic SQL in updateCard** — only SET fields present in the updates object; `updated_at = now()` always appended

---

## Reflection Summary

Task Quality: Excellent. All 16 ACs covered, clean two-phase flow, no escalations.
Ecosystem: Effective. Both phases ran clean on first attempt (minor TypeScript inference fix in Phase 1).

Full reflection: `memory-bank/reflection/reflection-TASK-007.md`
