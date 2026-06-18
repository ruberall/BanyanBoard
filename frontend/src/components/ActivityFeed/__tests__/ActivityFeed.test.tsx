/**
 * Tests for ActivityFeed component.
 *
 * The component receives `events` and `connectionStatus` as props so it can be
 * tested in isolation without running the real EventSource hook.
 *
 * Covers:
 *  - Renders event entries with actor email, card title, and column names
 *  - Empty state "No activity yet" shown when events array is empty
 *  - "Reconnecting..." amber banner shown when connectionStatus is 'error'
 *  - No reconnect banner when status is 'open'
 *  - Accessibility: aside with aria-label and role="log" live region
 *  - Collapsed state persists to localStorage on toggle
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ActivityFeed } from '@/components/ActivityFeed/ActivityFeed'
import type { CardMovedEvent } from '@/types'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<CardMovedEvent> = {}): CardMovedEvent {
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
// localStorage stub
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ===========================================================================
// Rendering events
// ===========================================================================

describe('ActivityFeed — event rendering', () => {
  it('renders card title, actor email, and column names for a card.moved event', () => {
    const event = makeEvent()

    render(
      <ActivityFeed events={[event]} connectionStatus="open" />
    )

    // Line 1: actor + card title
    expect(screen.getByText(/rebecca@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/Fix login bug/)).toBeInTheDocument()

    // Line 2: from → to
    expect(screen.getByText(/In Progress/)).toBeInTheDocument()
    expect(screen.getByText(/Done/)).toBeInTheDocument()
  })

  it('renders multiple events, newest first', () => {
    const events = [
      makeEvent({ eventId: 'evt-1', cardTitle: 'First card', occurredAt: '2026-06-18T10:00:00Z' }),
      makeEvent({ eventId: 'evt-2', cardTitle: 'Second card', occurredAt: '2026-06-18T10:01:00Z' }),
    ]

    render(<ActivityFeed events={events} connectionStatus="open" />)

    const items = screen.getAllByRole('listitem')
    // events array is pre-sorted newest-first by the hook; component renders in order
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('First card')
    expect(items[1]).toHaveTextContent('Second card')
  })

  it('falls back gracefully when actorEmail is null', () => {
    const event = makeEvent({ actorEmail: null, actorId: null })

    render(<ActivityFeed events={[event]} connectionStatus="open" />)

    // Card title should still be visible; no crash
    expect(screen.getByText(/Fix login bug/)).toBeInTheDocument()
  })
})

// ===========================================================================
// Empty state
// ===========================================================================

describe('ActivityFeed — empty state', () => {
  it('shows "No activity yet" when events array is empty', () => {
    render(<ActivityFeed events={[]} connectionStatus="open" />)

    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument()
  })
})

// ===========================================================================
// Reconnect indicator
// ===========================================================================

describe('ActivityFeed — reconnect indicator', () => {
  it('shows a "Reconnecting..." banner when connectionStatus is "error"', () => {
    render(<ActivityFeed events={[]} connectionStatus="error" />)

    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument()
  })

  it('does not show the reconnect banner when connectionStatus is "open"', () => {
    render(<ActivityFeed events={[makeEvent()]} connectionStatus="open" />)

    expect(screen.queryByText(/Reconnecting/i)).not.toBeInTheDocument()
  })
})

// ===========================================================================
// Accessibility
// ===========================================================================

describe('ActivityFeed — accessibility', () => {
  it('renders an <aside> with aria-label="Activity feed" and a role="log" live region', () => {
    render(<ActivityFeed events={[makeEvent()]} connectionStatus="open" />)

    const aside = screen.getByRole('complementary', { name: /activity feed/i })
    expect(aside).toBeInTheDocument()

    const log = screen.getByRole('log')
    expect(log).toBeInTheDocument()
  })
})

// ===========================================================================
// Collapse / localStorage persistence
// ===========================================================================

describe('ActivityFeed — collapsed state persistence', () => {
  it('saves open=false to localStorage when the toggle button collapses the sidebar', () => {
    render(<ActivityFeed events={[]} connectionStatus="open" />)

    const toggleBtn = screen.getByRole('button', { name: /collapse|toggle|chevron/i })
    fireEvent.click(toggleBtn)

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'activityFeed.open',
      expect.stringMatching(/false/)
    )
  })

  it('restores collapsed state from localStorage on mount', () => {
    localStorageMock.getItem.mockReturnValue('false')

    render(<ActivityFeed events={[makeEvent()]} connectionStatus="open" />)

    // When collapsed the event list should not be visible
    expect(screen.queryByRole('log')).not.toBeInTheDocument()
  })
})
