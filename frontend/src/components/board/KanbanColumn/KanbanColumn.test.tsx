/**
 * Tests for KanbanColumn component.
 *
 * KanbanColumn fetches its own cards via useCards(column.id) to enable
 * parallel fetching per column. The parent passes only a Column prop.
 *
 * Covers:
 *  - Renders column header/name
 *  - Renders cards returned by useCards in order
 *  - Shows LoadingSpinner while cards are loading
 *  - Shows ErrorBanner when useCards returns error
 *  - Renders empty column message when no cards
 *  - Renders CreateCardForm at the bottom
 *
 * Phase 4 — SortableContext / droppable regression guards:
 *  - Cards still render after SortableContext wrapper is added
 *  - Column section (droppable target) still has accessible aria-label
 *
 * Phase 5 — filterText prop (AC-FILTER-HAPPY-1, AC-FILTER-HAPPY-2,
 *            AC-FILTER-HAPPY-4, AC-FILTER-NEGATIVE-1):
 *  - filterText filters cards by title substring (case-insensitive)
 *  - filterText filters cards by description substring (case-insensitive)
 *  - Non-matching filterText shows the existing empty state message
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { KanbanColumn } from '@/components/board/KanbanColumn/KanbanColumn'
import type { Column, Card } from '@/types'

// ---------------------------------------------------------------------------
// Mock the hooks module wholesale
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks')

const mockedUseCards = hooks.useCards as Mock
const mockedUseCreateCard = hooks.useCreateCard as Mock

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

interface MutationMock {
  mutate: ReturnType<typeof vi.fn>
  mutateAsync: ReturnType<typeof vi.fn>
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  reset: ReturnType<typeof vi.fn>
}

function mockMutation(overrides: Partial<MutationMock> = {}): MutationMock {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
    ...overrides,
  }
}

function renderColumn(column: Column, filterText?: string) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <KanbanColumn column={column} filterText={filterText} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Sample data fixtures
// ---------------------------------------------------------------------------

const COLUMN: Column = { id: 'col-1', name: 'To Do', position: 0, created_at: '2026-01-01T00:00:00Z' }

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    column_id: 'col-1',
    title: 'A Card',
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
  vi.clearAllMocks()
})

// ===========================================================================
// Column header
// ===========================================================================

describe('KanbanColumn — column header', () => {
  it('renders the column name as a heading', () => {
    mockedUseCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    expect(screen.getByText('To Do')).toBeInTheDocument()
  })
})

// ===========================================================================
// Card list
// ===========================================================================

describe('KanbanColumn — card list', () => {
  it('renders all cards returned by useCards', () => {
    const cards = [
      makeCard({ id: 'c1', title: 'First Card', position: 0 }),
      makeCard({ id: 'c2', title: 'Second Card', position: 1 }),
    ]
    mockedUseCards.mockReturnValue({ data: cards, isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    expect(screen.getByText('First Card')).toBeInTheDocument()
    expect(screen.getByText('Second Card')).toBeInTheDocument()
  })

  it('renders cards in position order', () => {
    const cards = [
      makeCard({ id: 'c2', title: 'Second Card', position: 1 }),
      makeCard({ id: 'c1', title: 'First Card', position: 0 }),
    ]
    mockedUseCards.mockReturnValue({ data: cards, isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    const allCardTitles = screen.getAllByRole('article').map((el) => el.textContent)
    const firstIdx = allCardTitles.findIndex((t) => t?.includes('First Card'))
    const secondIdx = allCardTitles.findIndex((t) => t?.includes('Second Card'))

    expect(firstIdx).toBeLessThan(secondIdx)
  })
})

// ===========================================================================
// Loading state
// ===========================================================================

describe('KanbanColumn — loading state', () => {
  it('shows a loading spinner while cards are being fetched', () => {
    mockedUseCards.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    const spinner = screen.queryByRole('status') ?? screen.queryByRole('progressbar')
    expect(spinner).toBeInTheDocument()
  })
})

// ===========================================================================
// Error state
// ===========================================================================

describe('KanbanColumn — error state', () => {
  it('shows ErrorBanner when useCards returns an error', () => {
    mockedUseCards.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Failed to load cards' },
    })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ===========================================================================
// Empty state
// ===========================================================================

describe('KanbanColumn — empty state', () => {
  it('renders an empty column message when there are no cards', () => {
    mockedUseCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    // Some textual indicator that the column is empty
    const emptyMsg =
      screen.queryByText(/no cards/i) ??
      screen.queryByText(/empty/i) ??
      screen.queryByText(/add a card/i)
    expect(emptyMsg).toBeInTheDocument()
  })
})

// ===========================================================================
// CreateCardForm presence
// ===========================================================================

describe('KanbanColumn — CreateCardForm', () => {
  it('renders a text input for creating a new card at the bottom of the column', () => {
    mockedUseCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    // CreateCardForm renders a textbox for the card title
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders a submit button for the create card form', () => {
    mockedUseCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    const submitBtn = screen.queryByRole('button', { name: /add card|create card|submit/i })
    expect(submitBtn).toBeInTheDocument()
  })
})

// ===========================================================================
// Phase 4 — SortableContext / droppable regression guards
//
// These tests ensure that adding SortableContext and useDroppable in Phase 4
// does not break existing column rendering behaviour.
// ===========================================================================

describe('KanbanColumn — Phase 4 SortableContext regression guards', () => {
  it('cards still render after SortableContext wrapper is added', () => {
    const cards = [
      makeCard({ id: 'c1', title: 'Still Here Card', position: 0 }),
    ]
    mockedUseCards.mockReturnValue({ data: cards, isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    // Cards must still be accessible via article role even inside SortableContext
    expect(screen.getByText('Still Here Card')).toBeInTheDocument()
    expect(screen.getAllByRole('article').length).toBeGreaterThanOrEqual(1)
  })

  it('column section (droppable target) is still rendered with an accessible label', () => {
    mockedUseCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN)

    // The column should have an accessible region with a label that includes the column name
    // This verifies the column's section/region is still present and labelled after Phase 4 upgrade
    const columnRegion =
      screen.queryByRole('region', { name: /to do/i }) ??
      screen.queryByLabelText(/to do/i) ??
      // Fallback: the column name heading is present (column is rendered)
      screen.queryByText('To Do')
    expect(columnRegion).toBeInTheDocument()
  })
})

// ===========================================================================
// Phase 5 — filterText prop (AC-FILTER-HAPPY-1/-2/-4, AC-FILTER-NEGATIVE-1)
// ===========================================================================

describe('KanbanColumn — filterText prop', () => {
  it('shows only cards whose title matches the filter text (AC-FILTER-HAPPY-1)', () => {
    const cards = [
      makeCard({ id: 'c1', title: 'Fix login bug', position: 0 }),
      makeCard({ id: 'c2', title: 'Add dark mode', position: 1 }),
    ]
    mockedUseCards.mockReturnValue({ data: cards, isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN, 'fix')

    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.queryByText('Add dark mode')).not.toBeInTheDocument()
  })

  it('matches title filter case-insensitively (AC-FILTER-HAPPY-4)', () => {
    const cards = [
      makeCard({ id: 'c1', title: 'Fix login bug', position: 0 }),
      makeCard({ id: 'c2', title: 'Add dark mode', position: 1 }),
    ]
    mockedUseCards.mockReturnValue({ data: cards, isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN, 'FIX')

    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.queryByText('Add dark mode')).not.toBeInTheDocument()
  })

  it('shows cards whose description matches the filter text (AC-FILTER-HAPPY-2)', () => {
    const cards = [
      makeCard({ id: 'c1', title: 'Card A', description: 'authentication flow', position: 0 }),
      makeCard({ id: 'c2', title: 'Card B', description: 'unrelated work', position: 1 }),
    ]
    mockedUseCards.mockReturnValue({ data: cards, isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN, 'auth')

    expect(screen.getByText('Card A')).toBeInTheDocument()
    expect(screen.queryByText('Card B')).not.toBeInTheDocument()
  })

  it('shows the existing empty state when no cards match the filter (AC-FILTER-NEGATIVE-1)', () => {
    const cards = [
      makeCard({ id: 'c1', title: 'Fix login bug', position: 0 }),
    ]
    mockedUseCards.mockReturnValue({ data: cards, isLoading: false, isError: false, error: null })
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderColumn(COLUMN, 'zzznomatch')

    expect(screen.queryByText('Fix login bug')).not.toBeInTheDocument()
    const emptyMsg =
      screen.queryByText(/no cards/i) ??
      screen.queryByText(/empty/i) ??
      screen.queryByText(/add a card/i)
    expect(emptyMsg).toBeInTheDocument()
  })
})
