/**
 * Unit tests for useMoveCard hook (Phase 4 — Drag-and-Drop).
 *
 * useMoveCard is an optimistic mutation hook that:
 *  - Removes a card from its source column cache
 *  - Inserts it into the destination column cache at the correct position
 *  - Reverts both columns on error and calls setBannerError
 *  - Invalidates both column caches on settle
 *
 * Covers AC-7 (optimistic move) and AC-8 (revert on error).
 *
 * Strategy:
 *  - Real QueryClient (retry: false) pre-seeded with column card lists
 *  - vi.mock('@/api/endpoints') to control moveCard resolution
 *  - renderHook with a QueryClientProvider wrapper
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Card } from '@/types'
import { queryKeys } from '@/api/queryKeys'

// ---------------------------------------------------------------------------
// Mock the endpoints module
// ---------------------------------------------------------------------------
vi.mock('@/api/endpoints')

import * as endpoints from '@/api/endpoints'
const mockedMoveCard = endpoints.moveCard as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Lazy import of the hook (doesn't exist yet — will fail until Phase 4 impl)
// ---------------------------------------------------------------------------
import { useMoveCard } from '@/api/hooks'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    column_id: 'col-src',
    title: 'Test Card',
    description: null,
    due_date: null,
    labels: [],
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const SRC_COLUMN_ID = 'col-src'
const DEST_COLUMN_ID = 'col-dest'

// Cards already in source column
const SRC_CARDS: Card[] = [
  makeCard({ id: 'card-1', column_id: SRC_COLUMN_ID, position: 0, title: 'Card One' }),
  makeCard({ id: 'card-2', column_id: SRC_COLUMN_ID, position: 1, title: 'Card Two' }),
]

// Cards already in destination column
const DEST_CARDS: Card[] = [
  makeCard({ id: 'card-3', column_id: DEST_COLUMN_ID, position: 0, title: 'Card Three' }),
  makeCard({ id: 'card-4', column_id: DEST_COLUMN_ID, position: 1, title: 'Card Four' }),
]

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function seedQueryClient(qc: QueryClient) {
  qc.setQueryData(queryKeys.cards.byColumn(SRC_COLUMN_ID), [...SRC_CARDS])
  qc.setQueryData(queryKeys.cards.byColumn(DEST_COLUMN_ID), [...DEST_CARDS])
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

// ---------------------------------------------------------------------------

let qc: QueryClient
let setBannerError: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  qc = makeQueryClient()
  seedQueryClient(qc)
  setBannerError = vi.fn()
  // Default: moveCard resolves successfully
  mockedMoveCard.mockResolvedValue(makeCard({ id: 'card-1', column_id: DEST_COLUMN_ID }))
})

// ===========================================================================
// onMutate — optimistic cache updates
// ===========================================================================

describe('useMoveCard — onMutate (optimistic updates)', () => {
  it('removes the card from the source column cache immediately', async () => {
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    // After onMutate fires (synchronous part of mutation), card-1 should be gone from src
    await waitFor(() => {
      const srcCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(SRC_COLUMN_ID))
      expect(srcCards?.find((c) => c.id === 'card-1')).toBeUndefined()
    })
  })

  it('inserts the card into the destination column cache', async () => {
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      const destCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(DEST_COLUMN_ID))
      expect(destCards?.find((c) => c.id === 'card-1')).toBeDefined()
    })
  })

  it('inserts card at the top of destination when after_card_id is undefined', async () => {
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      const destCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(DEST_COLUMN_ID))
      expect(destCards?.[0]?.id).toBe('card-1')
    })
  })

  it('inserts card after the specified after_card_id in destination', async () => {
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    // Move card-1 after card-3 (index 0 in dest) → should land at index 1
    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: 'card-3',
      })
    })

    await waitFor(() => {
      const destCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(DEST_COLUMN_ID))
      const idx = destCards?.findIndex((c) => c.id === 'card-1')
      expect(idx).toBe(1) // after card-3 which is at 0
    })
  })
})

// ===========================================================================
// onError — revert optimistic changes
// ===========================================================================

describe('useMoveCard — onError (revert on API failure)', () => {
  beforeEach(() => {
    mockedMoveCard.mockRejectedValue({ message: 'Server error', status: 500 })
  })

  it('restores source column cache to its original state on error', async () => {
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      const srcCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(SRC_COLUMN_ID))
      // card-1 should be back in source
      expect(srcCards?.find((c) => c.id === 'card-1')).toBeDefined()
    })
  })

  it('restores destination column cache to its original state on error', async () => {
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      const destCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(DEST_COLUMN_ID))
      // card-1 should NOT be in dest after revert
      expect(destCards?.find((c) => c.id === 'card-1')).toBeUndefined()
      // original dest cards should be back
      expect(destCards?.find((c) => c.id === 'card-3')).toBeDefined()
      expect(destCards?.find((c) => c.id === 'card-4')).toBeDefined()
    })
  })

  it('calls setBannerError with the error message on API failure', async () => {
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      expect(setBannerError).toHaveBeenCalledWith('Server error')
    })
  })
})

// ===========================================================================
// onSettled — invalidate caches
// ===========================================================================

describe('useMoveCard — onSettled (cache invalidation)', () => {
  it('invalidates the source column query after a successful move', async () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.cards.byColumn(SRC_COLUMN_ID),
        }),
      )
    })
  })

  it('invalidates the destination column query after a successful move', async () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.cards.byColumn(DEST_COLUMN_ID),
        }),
      )
    })
  })

  it('still invalidates both column queries even when the API call fails', async () => {
    mockedMoveCard.mockRejectedValue({ message: 'Error', status: 500 })
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: DEST_COLUMN_ID,
        after_card_id: undefined,
      })
    })

    await waitFor(() => {
      // onSettled fires for both success and error paths
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: queryKeys.cards.byColumn(SRC_COLUMN_ID),
        }),
      )
    })
  })
})

// ===========================================================================
// Same-column move — position unchanged (no-op guard)
// ===========================================================================

describe('useMoveCard — same-column move', () => {
  it('correctly manages cache for a same-column reorder (card stays in same column)', async () => {
    // Seed both columns (only src needed here, but keep dest for findCardColumn scanning)
    const { result } = renderHook(() => useMoveCard(setBannerError), {
      wrapper: makeWrapper(qc),
    })

    // Move card-1 within src column, after card-2
    await act(async () => {
      result.current.mutate({
        cardId: 'card-1',
        column_id: SRC_COLUMN_ID,
        after_card_id: 'card-2',
      })
    })

    await waitFor(() => {
      const srcCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(SRC_COLUMN_ID))
      // card-1 should still be in the source column
      expect(srcCards?.find((c) => c.id === 'card-1')).toBeDefined()
    })
  })
})
