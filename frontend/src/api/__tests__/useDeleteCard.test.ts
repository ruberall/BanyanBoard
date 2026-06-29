/**
 * Tests for useDeleteCard() hook (TASK-018 Phase 1).
 *
 * useDeleteCard(columnId) is a TanStack Query mutation hook that:
 *  - Calls deleteCard(cardId) as its mutationFn
 *  - Optimistically removes the card from queryKeys.cards.byColumn(columnId) on mutate
 *  - Saves a cache snapshot before the optimistic update (onMutate returns context)
 *  - Restores the snapshot from context when the mutation errors (onError)
 *
 * Mocking strategy: vi.stubGlobal('fetch', vi.fn()) — same pattern as hooks.test.ts.
 * renderHook() inside a real QueryClientProvider drives the hook. The QueryClient
 * is seeded with card data so onMutate cache manipulation can be observed.
 *
 * Covers:
 *  - mutationFn calls DELETE /cards/:id via deleteCard(cardId)
 *  - onMutate removes the target card from the column cache (AC-OPTIMISTIC-1)
 *  - onMutate returns a snapshot of the pre-mutation cache
 *  - onError restores the snapshot from context (AC-ERROR-1 snapshot restore)
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'

import { useDeleteCard } from '@/api/hooks'
import { queryKeys } from '@/api/queryKeys'
import type { Card } from '@/types'

// ---------------------------------------------------------------------------
// Fetch helpers (mirrors hooks.test.ts style)
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown = null, status = 204): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: async () => body,
    text: async () => (body == null ? '' : JSON.stringify(body)),
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
// Card fixtures
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    column_id: 'col-1',
    title: 'A Test Card',
    description: null,
    due_date: null,
    labels: [],
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
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
// useDeleteCard() — mutationFn
// ===========================================================================

describe('useDeleteCard() — mutationFn', () => {
  it('calls DELETE /cards/:cardId via deleteCard when mutate is called', async () => {
    // deleteCard returns void; a 204 No Content is the success case
    mockFetchOk(null, 204)

    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useDeleteCard('col-1'), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate('card-42')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const mockFetchImpl = vi.mocked(fetch)
    const lastCall = mockFetchImpl.mock.calls[mockFetchImpl.mock.calls.length - 1] as [string, RequestInit]
    // URL must include the card id and the method must be DELETE
    expect(lastCall[0]).toContain('card-42')
    expect(lastCall[1].method).toBe('DELETE')
  })
})

// ===========================================================================
// useDeleteCard() — optimistic update (onMutate)
// ===========================================================================

describe('useDeleteCard() — optimistic update (onMutate)', () => {
  it('AC-OPTIMISTIC-1: removes the target card from the column cache before the server responds', async () => {
    // Fetch never resolves so we can observe the optimistic state mid-flight
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})))

    const columnId = 'col-1'
    const cards: Card[] = [
      makeCard({ id: 'card-to-delete', title: 'Remove Me', position: 0 }),
      makeCard({ id: 'card-to-keep', title: 'Keep Me', position: 1 }),
    ]

    const { client, Wrapper } = makeWrapper()
    // Seed the column cache
    client.setQueryData(queryKeys.cards.byColumn(columnId), cards)

    const { result } = renderHook(() => useDeleteCard(columnId), { wrapper: Wrapper })

    act(() => {
      result.current.mutate('card-to-delete')
    })

    // Wait for onMutate to run (cache update is synchronous within onMutate)
    await waitFor(() => {
      const cached = client.getQueryData<Card[]>(queryKeys.cards.byColumn(columnId))
      return cached?.every((c) => c.id !== 'card-to-delete')
    })

    const cached = client.getQueryData<Card[]>(queryKeys.cards.byColumn(columnId))
    expect(cached?.map((c) => c.id)).not.toContain('card-to-delete')
    expect(cached?.map((c) => c.id)).toContain('card-to-keep')
  })

  it('onMutate saves the pre-mutation snapshot so onError can restore it', async () => {
    // This test verifies the snapshot (context) mechanism by triggering an error
    // and checking the cache is restored to the original state.
    const columnId = 'col-1'
    const originalCards: Card[] = [
      makeCard({ id: 'card-a', title: 'Card A', position: 0 }),
      makeCard({ id: 'card-b', title: 'Card B', position: 1 }),
    ]

    mockFetchError(500, { message: 'Internal server error' })

    const { client, Wrapper } = makeWrapper()
    client.setQueryData(queryKeys.cards.byColumn(columnId), originalCards)

    const { result } = renderHook(() => useDeleteCard(columnId), { wrapper: Wrapper })

    await act(async () => {
      result.current.mutate('card-a')
    })

    // After the error, onError should restore the snapshot
    await waitFor(() => expect(result.current.isError).toBe(true))

    const restoredCache = client.getQueryData<Card[]>(queryKeys.cards.byColumn(columnId))
    // Both cards must be back in the cache (snapshot restored)
    expect(restoredCache?.map((c) => c.id)).toContain('card-a')
    expect(restoredCache?.map((c) => c.id)).toContain('card-b')
  })
})
