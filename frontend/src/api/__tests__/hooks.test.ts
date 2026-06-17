/**
 * Tests for TanStack Query hooks: useBoards() and useCreateBoard().
 *
 * Covers:
 *  - useBoards() calls listBoards and returns data
 *  - useBoards() surfaces error when listBoards rejects
 *  - useCreateBoard() calls createBoard with the supplied name
 *  - useCreateBoard() invalidates queryKeys.boards.all on success so BoardListPage refetches
 *
 * Mocking strategy: vi.stubGlobal('fetch', vi.fn()) — same pattern as client.test.ts.
 * The hooks call the real endpoint functions (which call fetch) so this exercises
 * the full hook → endpoint → client chain without a running server.
 *
 * We use @testing-library/react renderHook() to drive hooks inside a real
 * QueryClientProvider with retry: false to keep tests fast.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

import { useBoards, useCreateBoard } from '@/api/hooks'
import { queryKeys } from '@/api/queryKeys'
import type { Board, PaginatedResponse } from '@/types'

// ---------------------------------------------------------------------------
// Fetch helpers (mirrors client.test.ts style)
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }))
}

function mockFetchError(status: number, errorBody: { message?: string }): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: `HTTP ${status}`,
    json: async () => errorBody,
  }))
}

// ---------------------------------------------------------------------------
// Wrapper factory — fresh QueryClient per test
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children)
  }

  return { client, Wrapper }
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://test-api.example.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ===========================================================================
// useBoards()
// ===========================================================================

describe('useBoards()', () => {
  it('calls GET /boards via listBoards and returns data on success', async () => {
    const payload: PaginatedResponse<Board> = {
      data: [{ id: 'b1', name: 'Sprint Board', created_at: '2026-01-01T00:00:00Z' }],
      total: 1,
      page: 1,
      limit: 20,
    }
    mockFetchOk(payload)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useBoards(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(payload)
  })

  it('starts in a loading state before the request resolves', () => {
    // Fetch never resolves during this test
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useBoards(), { wrapper: Wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('surfaces an error when listBoards rejects', async () => {
    mockFetchError(500, { message: 'Internal server error' })

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useBoards(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeTruthy()
  })

  it('uses the correct query key (queryKeys.boards.list())', async () => {
    const payload: PaginatedResponse<Board> = { data: [], total: 0, page: 1, limit: 20 }
    mockFetchOk(payload)

    const { client, Wrapper } = makeWrapper()
    const { result } = renderHook(() => useBoards(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The data should be accessible via the canonical query key
    const cachedData = client.getQueryData(queryKeys.boards.list())
    expect(cachedData).toEqual(payload)
  })
})

// ===========================================================================
// useCreateBoard()
// ===========================================================================

describe('useCreateBoard()', () => {
  it('calls POST /boards via createBoard with the supplied name', async () => {
    const createdBoard: Board = { id: 'b2', name: 'New Board', created_at: '2026-01-02T00:00:00Z' }
    mockFetchOk(createdBoard, 201)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateBoard(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ name: 'New Board' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Verify the request body contained the name
    const mockFetchImpl = vi.mocked(fetch)
    const lastCall = mockFetchImpl.mock.calls[mockFetchImpl.mock.calls.length - 1] as [string, RequestInit]
    expect(lastCall[1].method).toBe('POST')
    expect(JSON.parse(lastCall[1].body as string)).toEqual({ name: 'New Board' })
  })

  it('invalidates queryKeys.boards.all on success so dependent queries refetch', async () => {
    const createdBoard: Board = { id: 'b3', name: 'Another Board', created_at: '2026-01-03T00:00:00Z' }
    mockFetchOk(createdBoard, 201)

    const { client, Wrapper } = makeWrapper()

    // Seed existing board list cache so we can observe invalidation
    const listPayload: PaginatedResponse<Board> = {
      data: [{ id: 'b1', name: 'Old Board', created_at: '2026-01-01T00:00:00Z' }],
      total: 1,
      page: 1,
      limit: 20,
    }
    client.setQueryData(queryKeys.boards.list(), listPayload)

    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateBoard(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ name: 'Another Board' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // invalidateQueries must have been called with the boards root key
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.boards.all,
      }),
    )
  })

  it('surfaces mutation error when createBoard rejects', async () => {
    mockFetchError(422, { message: 'Board name too long' })

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateBoard(), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate({ name: 'X'.repeat(300) })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeTruthy()
  })
})
