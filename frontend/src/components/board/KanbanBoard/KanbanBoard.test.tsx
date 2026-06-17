/**
 * Tests for KanbanBoard component.
 *
 * KanbanBoard receives a columns prop from BoardPage and renders
 * KanbanColumn components in position order.
 *
 * Note: KanbanColumn renders its own cards (via useCards). In KanbanBoard
 * tests we mock useCards and useCreateCard to prevent real hook calls from
 * failing inside KanbanColumn children.
 *
 * Covers:
 *  - Renders all columns in position order
 *  - Renders column names as headings
 *  - Renders empty state when columns array is empty
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { KanbanBoard } from '@/components/board/KanbanBoard/KanbanBoard'
import type { Column } from '@/types'

// ---------------------------------------------------------------------------
// Mock hooks (KanbanColumn children call useCards / useCreateCard)
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

function mockMutation() {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
  }
}

function renderBoard(columns: Column[]) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <KanbanBoard columns={columns} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Sample data fixtures
// ---------------------------------------------------------------------------

const COL_TODO: Column = { id: 'col-1', name: 'To Do', position: 0, created_at: '2026-01-01T00:00:00Z' }
const COL_IN_PROGRESS: Column = { id: 'col-2', name: 'In Progress', position: 1, created_at: '2026-01-01T00:00:00Z' }
const COL_DONE: Column = { id: 'col-3', name: 'Done', position: 2, created_at: '2026-01-01T00:00:00Z' }

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Default: each column's cards are empty and not loading
  mockedUseCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })
  mockedUseCreateCard.mockReturnValue(mockMutation())
})

// ===========================================================================
// Column rendering
// ===========================================================================

describe('KanbanBoard — renders columns', () => {
  it('renders all columns passed in the columns prop', () => {
    renderBoard([COL_TODO, COL_IN_PROGRESS, COL_DONE])

    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders columns in position order (ascending)', () => {
    // Pass columns out of position order — board should sort them
    renderBoard([COL_DONE, COL_TODO, COL_IN_PROGRESS])

    // Get all heading-like elements with column names and verify order in DOM
    const toDoEl = screen.getByText('To Do')
    const inProgressEl = screen.getByText('In Progress')
    const doneEl = screen.getByText('Done')

    // compareDocumentPosition: 4 means node is following (comes after)
    expect(toDoEl.compareDocumentPosition(inProgressEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(inProgressEl.compareDocumentPosition(doneEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders each column name', () => {
    renderBoard([COL_TODO, COL_IN_PROGRESS])

    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })
})

// ===========================================================================
// Empty state
// ===========================================================================

describe('KanbanBoard — empty state', () => {
  it('renders an empty state message when columns array is empty', () => {
    renderBoard([])

    // No columns → board should show some feedback
    const emptyMsg =
      screen.queryByText(/no columns/i) ??
      screen.queryByText(/empty/i) ??
      screen.queryByText(/add a column/i)
    expect(emptyMsg).toBeInTheDocument()
  })

  it('does not render any column content when columns is empty', () => {
    renderBoard([])

    expect(screen.queryByText('To Do')).not.toBeInTheDocument()
  })
})
