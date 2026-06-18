/**
 * Tests for useActivityFeed(boardId) hook.
 *
 * useActivityFeed opens a native EventSource to GET /boards/:boardId/events.
 * EventSource is a browser API — we stub it via vi.stubGlobal so the hook
 * exercises its own callback wiring without a real SSE server.
 *
 * Covers:
 *  - Opens EventSource at the correct URL on mount
 *  - Returns connectionStatus 'connecting' initially, then 'open' after onopen
 *  - Prepends new CardMovedEvent to events array on each message
 *  - Sets connectionStatus to 'error' on EventSource error event
 *  - Closes the EventSource on unmount (no leak)
 *  - Closes and re-opens EventSource when boardId changes
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useActivityFeed } from '@/hooks/useActivityFeed'
import type { CardMovedEvent } from '@/types'

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

type EventSourceEventType = 'open' | 'message' | 'error'

class MockEventSource {
  static instances: MockEventSource[] = []

  url: string
  readyState: number = 0 // CONNECTING

  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  close = vi.fn(() => {
    this.readyState = 2 // CLOSED
  })

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  /** Test helper: simulate SSE lifecycle events */
  simulateOpen() {
    this.readyState = 1 // OPEN
    this.onopen?.()
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }

  static reset() {
    MockEventSource.instances = []
  }
}

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

function makeCardMovedEvent(overrides: Partial<CardMovedEvent> = {}): CardMovedEvent {
  return {
    type: 'card.moved',
    eventId: 'evt-1',
    boardId: 'board-1',
    cardId: 'card-1',
    cardTitle: 'Fix login bug',
    actorId: 'user-1',
    actorEmail: 'rebecca@example.com',
    fromColumnId: 'col-1',
    fromColumnName: 'In Progress',
    toColumnId: 'col-2',
    toColumnName: 'Done',
    occurredAt: '2026-06-18T10:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  MockEventSource.reset()
  vi.stubGlobal('EventSource', MockEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ===========================================================================
// Connection lifecycle
// ===========================================================================

describe('useActivityFeed() — connection lifecycle', () => {
  it('opens EventSource at /boards/:boardId/events and starts in "connecting" status', () => {
    const { result } = renderHook(() => useActivityFeed('board-1'))

    expect(MockEventSource.instances).toHaveLength(1)
    expect(MockEventSource.instances[0].url).toContain('/boards/board-1/events')
    expect(result.current.connectionStatus).toBe('connecting')
  })

  it('transitions to "open" when EventSource fires onopen', () => {
    const { result } = renderHook(() => useActivityFeed('board-1'))

    act(() => {
      MockEventSource.instances[0].simulateOpen()
    })

    expect(result.current.connectionStatus).toBe('open')
  })

  it('closes EventSource and re-opens it when boardId changes', () => {
    const { rerender } = renderHook(({ boardId }) => useActivityFeed(boardId), {
      initialProps: { boardId: 'board-1' },
    })

    const first = MockEventSource.instances[0]

    rerender({ boardId: 'board-2' })

    expect(first.close).toHaveBeenCalledOnce()
    expect(MockEventSource.instances).toHaveLength(2)
    expect(MockEventSource.instances[1].url).toContain('/boards/board-2/events')
  })

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useActivityFeed('board-1'))
    const es = MockEventSource.instances[0]

    unmount()

    expect(es.close).toHaveBeenCalledOnce()
  })
})

// ===========================================================================
// Event accumulation
// ===========================================================================

describe('useActivityFeed() — event accumulation', () => {
  it('prepends new CardMovedEvent to events array on each message (newest first)', () => {
    const { result } = renderHook(() => useActivityFeed('board-1'))
    const es = MockEventSource.instances[0]

    act(() => {
      es.simulateOpen()
      es.simulateMessage(makeCardMovedEvent({ eventId: 'evt-1', cardTitle: 'First card' }))
    })

    act(() => {
      es.simulateMessage(makeCardMovedEvent({ eventId: 'evt-2', cardTitle: 'Second card' }))
    })

    expect(result.current.events).toHaveLength(2)
    // Newest first — evt-2 was added last so it should be at index 0
    expect(result.current.events[0].eventId).toBe('evt-2')
    expect(result.current.events[1].eventId).toBe('evt-1')
  })
})

// ===========================================================================
// Error handling
// ===========================================================================

describe('useActivityFeed() — error handling', () => {
  it('sets connectionStatus to "error" when EventSource fires onerror', () => {
    const { result } = renderHook(() => useActivityFeed('board-1'))

    act(() => {
      MockEventSource.instances[0].simulateError()
    })

    expect(result.current.connectionStatus).toBe('error')
  })
})
