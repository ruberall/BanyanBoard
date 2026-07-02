/**
 * Tests for CardDetailModal component (TASK-020 Phase 4).
 *
 * CardDetailModal wraps a native <dialog> element (BoardSettingsModal pattern)
 * and renders an "Activity" section backed by useCardActivity(cardId, { enabled: open }).
 *
 * Activity section has 4 states:
 *  - Loading: LoadingSpinner (role="status")
 *  - Error: ErrorBanner (role="alert")
 *  - Empty (data.length === 0): explicit "No activity yet." message
 *  - Populated: list of entries showing message + formatted createdAt
 *
 * Covers (AC-HAPPY-1, AC-EMPTY-1, AC-ERROR-1):
 *  - Loading state renders LoadingSpinner, not an error or empty message
 *  - Empty state renders explicit "No activity yet." message
 *  - Error state renders ErrorBanner with role="alert"
 *  - Populated state renders each entry's message and a formatted createdAt,
 *    in the order returned by the hook (backend already orders DESC)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { CardDetailModal } from '@/components/board/CardDetailModal/CardDetailModal'
import type { CardActivityEntry } from '@/types'

// ---------------------------------------------------------------------------
// Mock the hooks module
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/hooks')>()
  return {
    ...actual,
    useCardActivity: vi.fn(),
  }
})

const mockedUseCardActivity = hooks.useCardActivity as Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function makeQueryMock(overrides: Record<string, unknown> = {}) {
  return {
    data: [] as CardActivityEntry[],
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<CardActivityEntry> = {}): CardActivityEntry {
  return {
    id: 'event-1',
    type: 'card.moved',
    message: 'Jane Doe moved this card from To Do to Done',
    createdAt: '2026-01-01T12:00:00Z',
    ...overrides,
  }
}

function renderModal(props: { open?: boolean; cardId?: string; cardTitle?: string; onClose?: () => void } = {}) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <CardDetailModal
        open={props.open ?? true}
        cardId={props.cardId ?? 'card-1'}
        cardTitle={props.cardTitle ?? 'My Card'}
        onClose={props.onClose ?? vi.fn()}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// Loading state
// ===========================================================================

describe('CardDetailModal — Activity loading state', () => {
  it('renders a loading indicator and no error/empty message while activity is loading', () => {
    mockedUseCardActivity.mockReturnValue(makeQueryMock({ isLoading: true, data: undefined }))

    renderModal()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/no activity yet/i)).not.toBeInTheDocument()
  })
})

// ===========================================================================
// Empty state
// ===========================================================================

describe('CardDetailModal — Activity empty state', () => {
  it('renders an explicit "No activity yet." message when there are no entries', () => {
    mockedUseCardActivity.mockReturnValue(makeQueryMock({ data: [] }))

    renderModal()

    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })
})

// ===========================================================================
// Error state
// ===========================================================================

describe('CardDetailModal — Activity error state', () => {
  it('renders an ErrorBanner (role="alert") when the activity fetch fails', () => {
    mockedUseCardActivity.mockReturnValue(
      makeQueryMock({ isError: true, data: undefined, error: new Error('Network error') }),
    )

    renderModal()

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/network error/i)
  })
})

// ===========================================================================
// Populated state
// ===========================================================================

describe('CardDetailModal — Activity populated state', () => {
  it('renders each entry message and a formatted createdAt, in the order received', () => {
    const entries = [
      makeEntry({ id: 'event-2', message: 'Someone moved this card from Doing to Done', createdAt: '2026-01-02T09:00:00Z' }),
      makeEntry({ id: 'event-1', message: 'Someone created this card', createdAt: '2026-01-01T08:00:00Z' }),
    ]
    mockedUseCardActivity.mockReturnValue(makeQueryMock({ data: entries }))

    renderModal()

    expect(screen.getByText('Someone moved this card from Doing to Done')).toBeInTheDocument()
    expect(screen.getByText('Someone created this card')).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-01-02T09:00:00Z').toLocaleString())).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-01-01T08:00:00Z').toLocaleString())).toBeInTheDocument()

    // Order received (hook/backend already sorts newest-first) — verify first entry
    // in the DOM corresponds to the first entry in the array, not a client re-sort.
    const messages = screen.getAllByText(/moved this card|created this card/i)
    expect(messages[0]).toHaveTextContent('Someone moved this card from Doing to Done')
    expect(messages[1]).toHaveTextContent('Someone created this card')
  })
})
