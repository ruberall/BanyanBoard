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
 *
 * Phase 2 additions (TASK-016):
 *  - AC-HAPPY-1: actorDisplayName takes precedence over actorEmail in card.moved rendering
 *  - AC-HAPPY-2: card.created event type renders "[Name] created card '[Title]'"
 *  - AC-ERROR-1: fallback to actorEmail when actorDisplayName is null
 *  - AC-ERROR-2: fallback to "Someone" when both actorDisplayName and actorEmail are null
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { ActivityFeed } from '@/components/ActivityFeed/ActivityFeed'
import type { ActivityEvent, CardMovedEvent, CardCreatedEvent } from '@/types'

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
    actorDisplayName: 'Rebecca Uberall',
    fromColumnId: 'col-1',
    fromColumnName: 'In Progress',
    toColumnId: 'col-2',
    toColumnName: 'Done',
    occurredAt: '2026-06-18T10:00:00Z',
    ...overrides,
  }
}

function makeCreatedEvent(overrides: Partial<CardCreatedEvent> = {}): CardCreatedEvent {
  return {
    type: 'card.created',
    eventId: 'evt-created-1',
    boardId: 'board-1',
    cardId: 'card-2',
    cardTitle: 'Write tests',
    actorId: 'user-1',
    actorDisplayName: 'Rebecca Uberall',
    columnId: 'col-1',
    columnName: 'Backlog',
    occurredAt: '2026-06-18T10:05:00Z',
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
  it('renders card title, actor identity, and column names for a card.moved event', () => {
    const event = makeEvent()

    render(
      <ActivityFeed events={[event]} connectionStatus="open" />
    )

    // Line 1: actor display name + card title (actorDisplayName takes precedence)
    expect(screen.getByText(/Rebecca Uberall/)).toBeInTheDocument()
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

  it('falls back gracefully when actorEmail and actorDisplayName are both null', () => {
    const event = makeEvent({ actorEmail: null, actorDisplayName: null, actorId: null })

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

    const toggleBtn = screen.getByRole('button', { name: /collapse activity feed|expand activity feed/i })
    fireEvent.click(toggleBtn)

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'activityFeed.open',
      expect.stringMatching(/false/)
    )
  })

  it('restores collapsed state from localStorage on mount', () => {
    localStorageMock.getItem.mockReturnValueOnce('false')

    render(<ActivityFeed events={[makeEvent()]} connectionStatus="open" />)

    // When collapsed the event list should not be visible
    expect(screen.queryByRole('log')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// Phase 2 — Actor attribution + card.created event type (TASK-016)
// ===========================================================================

describe('ActivityFeed — actor attribution (Phase 2)', () => {
  /**
   * AC-HAPPY-1: actorDisplayName takes precedence over actorEmail.
   * When actorDisplayName is populated the feed shows the display name, not the email.
   */
  it('AC-HAPPY-1: shows actorDisplayName (not email) for card.moved when display name is set', () => {
    const event = makeEvent({
      actorDisplayName: 'Rebecca Uberall',
      actorEmail: 'rebecca@example.com',
    })

    render(<ActivityFeed events={[event]} connectionStatus="open" />)

    expect(screen.getByText(/Rebecca Uberall.*moved/i)).toBeInTheDocument()
    // Email must NOT appear when a display name is available
    expect(screen.queryByText(/rebecca@example\.com/)).not.toBeInTheDocument()
  })

  /**
   * AC-ERROR-1: when actorDisplayName is null, fall back to actorEmail.
   */
  it('AC-ERROR-1: falls back to actorEmail when actorDisplayName is null', () => {
    const event = makeEvent({
      actorDisplayName: null,
      actorEmail: 'legacy@example.com',
    })

    render(<ActivityFeed events={[event]} connectionStatus="open" />)

    expect(screen.getByText(/legacy@example\.com.*moved/i)).toBeInTheDocument()
  })

  /**
   * AC-ERROR-2: when both actorDisplayName and actorEmail are null (legacy event),
   * the feed shows "Someone moved '<Title>'".
   */
  it('AC-ERROR-2: shows "Someone" when both actorDisplayName and actorEmail are null', () => {
    const event = makeEvent({
      actorDisplayName: null,
      actorEmail: null,
      actorId: null,
    })

    render(<ActivityFeed events={[event]} connectionStatus="open" />)

    expect(screen.getByText(/Someone.*moved/i)).toBeInTheDocument()
  })
})

describe('ActivityFeed — card.created event type (Phase 2)', () => {
  /**
   * AC-HAPPY-2: card.created event renders "[Name] created card '[Title]'" with timestamp.
   * The component must have a rendering branch for type === 'card.created'.
   */
  it('AC-HAPPY-2: renders "[Name] created card \'[Title]\'" for a card.created event', () => {
    const event = makeCreatedEvent({
      actorDisplayName: 'Rebecca Uberall',
      cardTitle: 'Write tests',
    })

    render(<ActivityFeed events={[event] as ActivityEvent[]} connectionStatus="open" />)

    // Actor + action verb
    expect(screen.getByText(/Rebecca Uberall.*created card/i)).toBeInTheDocument()
    // Card title quoted
    expect(screen.getByText(/Write tests/)).toBeInTheDocument()
  })

  it('falls back to "Someone" for card.created when actorDisplayName is null', () => {
    const event = makeCreatedEvent({ actorDisplayName: null })

    render(<ActivityFeed events={[event] as ActivityEvent[]} connectionStatus="open" />)

    expect(screen.getByText(/Someone.*created card/i)).toBeInTheDocument()
  })
})
