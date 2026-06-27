/**
 * Tests for the API client transport layer and endpoint functions.
 *
 * Covers:
 *  - request<T>() transport: URL construction, method, headers, JSON parsing, ApiError on non-2xx, network failure
 *  - VITE_API_URL wiring: reads from env, falls back to localhost:3000
 *  - Endpoint functions: listBoards, createBoard, deleteBoard, listCards, createCard,
 *    getBoard, getCard, updateCard, deleteCard, moveCard
 *
 * Mocking strategy: vi.stubGlobal('fetch', vi.fn()) — no msw needed for unit tests.
 * import.meta.env is patched via vi.stubEnv() before each test.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import type { Board, BoardWithColumns, Card, PaginatedResponse } from '../../types';
import { ApiError } from '../../types';
import { request } from '../client';
import {
  listBoards,
  getBoard,
  createBoard,
  deleteBoard,
  listCards,
  createCard,
  getCard,
  updateCard,
  deleteCard,
  moveCard,
} from '../endpoints';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

function mockFetchError(status: number, errorBody: { message?: string; error?: string }): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
    json: async () => errorBody,
  }));
}

function mockFetchNoContent(): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    json: async () => { throw new Error('No content'); },
  }));
}

function lastCall(): Request | [string, RequestInit] {
  const mockFetch = vi.mocked(fetch);
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1] as unknown as [string, RequestInit];
}

function lastUrl(): string {
  const call = lastCall() as unknown as [string, RequestInit];
  return call[0];
}

function lastInit(): RequestInit {
  const call = lastCall() as unknown as [string, RequestInit];
  return call[1] ?? {};
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://test-api.example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ===========================================================================
// 1. request<T>() — transport layer
// ===========================================================================

describe('request<T>() transport', () => {
  it('builds URL from VITE_API_URL base + path', async () => {
    mockFetchOk({ data: [] });

    await request<unknown>('GET', '/boards');

    expect(lastUrl()).toBe('http://test-api.example.com/boards');
  });

  it('passes the HTTP method through to fetch', async () => {
    mockFetchOk({ id: '1', name: 'Test', created_at: '' });

    await request<unknown>('POST', '/boards', { body: JSON.stringify({ name: 'Test' }) });

    expect(lastInit().method).toBe('POST');
  });

  it('sets Content-Type: application/json on requests with a body', async () => {
    mockFetchOk({ id: '1', name: 'Test', created_at: '' });

    await request<unknown>('POST', '/boards', { body: JSON.stringify({ name: 'Test' }) });

    const headers = lastInit().headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns parsed JSON body on 2xx response', async () => {
    const payload = { data: [{ id: '1', name: 'Board A', created_at: '2026-01-01' }], total: 1, page: 1, limit: 20 };
    mockFetchOk(payload);

    const result = await request<PaginatedResponse<Board>>('GET', '/boards');

    expect(result).toEqual(payload);
  });

  it('throws ApiError with correct status and message on 404', async () => {
    mockFetchError(404, { message: 'Board not found', error: 'not_found' });

    await expect(request('GET', '/boards/missing-id')).rejects.toMatchObject({
      status: 404,
      message: 'Board not found',
    });
    await expect(request('GET', '/boards/missing-id')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with correct status on 400 and 500', async () => {
    mockFetchError(400, { message: 'Validation failed' });
    await expect(request('POST', '/boards', { body: '{}' })).rejects.toMatchObject({ status: 400 });

    mockFetchError(500, { message: 'Internal server error' });
    await expect(request('GET', '/boards')).rejects.toMatchObject({ status: 500 });
  });

  it('throws ApiError on network failure (fetch rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(request('GET', '/boards')).rejects.toBeInstanceOf(ApiError);
  });
});

// ===========================================================================
// 2. VITE_API_URL wiring
// ===========================================================================

describe('VITE_API_URL wiring', () => {
  it('defaults to http://localhost:3000 when VITE_API_URL is not set', async () => {
    vi.unstubAllEnvs();
    // VITE_API_URL is unset — import.meta.env.VITE_API_URL should be undefined
    mockFetchOk({ data: [], total: 0, page: 1, limit: 20 });

    await listBoards();

    expect(lastUrl()).toMatch(/^http:\/\/localhost:3000\//);
  });
});

// ===========================================================================
// 3. Board endpoint functions
// ===========================================================================

describe('listBoards()', () => {
  it('calls GET /boards and returns a PaginatedResponse<Board>', async () => {
    const payload: PaginatedResponse<Board> = {
      data: [{ id: 'b1', name: 'Sprint Board', created_at: '2026-01-01T00:00:00Z' }],
      total: 1,
      page: 1,
      limit: 20,
    };
    mockFetchOk(payload);

    const result = await listBoards();

    expect(lastUrl()).toMatch(/\/boards$/);
    expect(lastInit().method ?? 'GET').toBe('GET');
    expect(result).toEqual(payload);
  });
});

describe('getBoard(boardId)', () => {
  it('calls GET /boards/:id and returns a BoardWithColumns', async () => {
    const payload: BoardWithColumns = {
      id: 'b1', name: 'Sprint Board', created_at: '2026-01-01T00:00:00Z',
      columns: [{ id: 'c1', name: 'To Do', position: 0, created_at: '2026-01-01T00:00:00Z' }],
    };
    mockFetchOk(payload);

    const result = await getBoard('b1');

    expect(lastUrl()).toMatch(/\/boards\/b1$/);
    expect(result).toEqual(payload);
  });
});

describe('createBoard(name)', () => {
  it('calls POST /boards with { name } body and returns a Board', async () => {
    const payload: Board = { id: 'b2', name: 'My Board', created_at: '2026-01-02T00:00:00Z' };
    mockFetchOk(payload, 201);

    const result = await createBoard('My Board');

    expect(lastUrl()).toMatch(/\/boards$/);
    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(lastInit().body as string)).toEqual({ name: 'My Board' });
    expect(result).toEqual(payload);
  });
});

describe('deleteBoard(boardId)', () => {
  it('calls DELETE /boards/:id and resolves to void (no body required)', async () => {
    mockFetchNoContent();

    const result = await deleteBoard('b1');

    expect(lastUrl()).toMatch(/\/boards\/b1$/);
    expect(lastInit().method).toBe('DELETE');
    expect(result).toBeUndefined();
  });
});

// ===========================================================================
// 4. Card endpoint functions
// ===========================================================================

describe('listCards(columnId)', () => {
  it('calls GET /columns/:id/cards and returns Card[]', async () => {
    const cards: Card[] = [{
      id: 'card1', column_id: 'col1', title: 'Implement login',
      description: null, due_date: null, labels: [], position: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }];
    mockFetchOk(cards);

    const result = await listCards('col1');

    expect(lastUrl()).toMatch(/\/columns\/col1\/cards$/);
    expect(lastInit().method ?? 'GET').toBe('GET');
    expect(result).toEqual(cards);
  });
});

describe('createCard(columnId, data)', () => {
  it('calls POST /columns/:id/cards with title and optional description', async () => {
    const card: Card = {
      id: 'card2', column_id: 'col1', title: 'New Card',
      description: 'Some details', due_date: null, labels: [], position: 1,
      created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    };
    mockFetchOk(card, 201);

    const result = await createCard('col1', { title: 'New Card', description: 'Some details' });

    expect(lastUrl()).toMatch(/\/columns\/col1\/cards$/);
    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(lastInit().body as string)).toEqual({ title: 'New Card', description: 'Some details' });
    expect(result).toEqual(card);
  });
});

describe('getCard(cardId)', () => {
  it('calls GET /cards/:id and returns a Card', async () => {
    const card: Card = {
      id: 'card1', column_id: 'col1', title: 'A card',
      description: null, due_date: null, labels: [], position: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    mockFetchOk(card);

    const result = await getCard('card1');

    expect(lastUrl()).toMatch(/\/cards\/card1$/);
    expect(result).toEqual(card);
  });
});

describe('updateCard(cardId, data)', () => {
  it('calls PATCH /cards/:id with partial update fields', async () => {
    const updated: Card = {
      id: 'card1', column_id: 'col1', title: 'Updated Title',
      description: 'New desc', due_date: '2026-12-31', labels: [{ name: 'bug', color: '#ff0000' }], position: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
    };
    mockFetchOk(updated);

    const result = await updateCard('card1', { title: 'Updated Title', description: 'New desc' });

    expect(lastUrl()).toMatch(/\/cards\/card1$/);
    expect(lastInit().method).toBe('PATCH');
    const body = JSON.parse(lastInit().body as string);
    expect(body.title).toBe('Updated Title');
    expect(result).toEqual(updated);
  });
});

describe('deleteCard(cardId)', () => {
  it('calls DELETE /cards/:id and resolves to void', async () => {
    mockFetchNoContent();

    const result = await deleteCard('card1');

    expect(lastUrl()).toMatch(/\/cards\/card1$/);
    expect(lastInit().method).toBe('DELETE');
    expect(result).toBeUndefined();
  });
});

describe('moveCard(cardId, moveData)', () => {
  it('calls PATCH /cards/:id/move with column_id and after_card_id when both provided', async () => {
    const moved: Card = {
      id: 'card1', column_id: 'col2', title: 'A card',
      description: null, due_date: null, labels: [], position: 1,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
    };
    mockFetchOk(moved);

    const result = await moveCard('card1', { column_id: 'col2', after_card_id: 'card0' });

    expect(lastUrl()).toMatch(/\/cards\/card1\/move$/);
    expect(lastInit().method).toBe('PATCH');
    const body = JSON.parse(lastInit().body as string);
    expect(body).toEqual({ column_id: 'col2', after_card_id: 'card0' });
    expect(result).toEqual(moved);
  });

  it('omits after_card_id from body when not provided (move to top of column)', async () => {
    mockFetchOk({
      id: 'card1', column_id: 'col2', title: 'A card',
      description: null, due_date: null, labels: [], position: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
    });

    await moveCard('card1', { column_id: 'col2' });

    const body = JSON.parse(lastInit().body as string);
    expect(body.column_id).toBe('col2');
    expect('after_card_id' in body).toBe(false);
  });
});
