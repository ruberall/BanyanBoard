/**
 * Tests for BoardPage component.
 *
 * BoardPage reads :boardId from useParams and calls useBoard(boardId).
 * It renders KanbanBoard with sorted columns or shows error/loading states.
 *
 * Covers:
 *  AC-5  Board view: columns and cards displayed after board loads
 *  AC-9  API error banner on board load failure
 *  AC-11 NotFoundPage equivalent when board is not found (404)
 *
 * Mocking strategy:
 *  - vi.mock('@/api/hooks') for useBoard, useCards, useCreateCard
 *  - Wrap in MemoryRouter with route /boards/:boardId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { BoardPage } from '@/pages/BoardPage/BoardPage'
import type { BoardWithColumns } from '@/types'

// ---------------------------------------------------------------------------
// Mock the hooks module wholesale
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks')

const mockedUseBoard = hooks.useBoard as Mock
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

function renderBoardPage(boardId = 'board-1') {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/boards/${boardId}`]}>
        <Routes>
          <Route path="/boards/:boardId" element={<BoardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Sample data fixtures
// ---------------------------------------------------------------------------

const BOARD_WITH_COLUMNS: BoardWithColumns = {
  id: 'board-1',
  name: 'Sprint Board',
  created_at: '2026-01-01T00:00:00Z',
  columns: [
    { id: 'col-1', name: 'To Do', position: 0, created_at: '2026-01-01T00:00:00Z' },
    { id: 'col-2', name: 'In Progress', position: 1, created_at: '2026-01-01T00:00:00Z' },
  ],
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Default stub for child hooks (KanbanColumn uses useCards/useCreateCard)
  mockedUseCards.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })
  mockedUseCreateCard.mockReturnValue(mockMutation())
})

// ===========================================================================
// Loading state
// ===========================================================================

describe('BoardPage — loading state', () => {
  it('shows a loading spinner while the board is being fetched', () => {
    mockedUseBoard.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })

    renderBoardPage()

    const spinner = screen.queryByRole('status') ?? screen.queryByRole('progressbar')
    expect(spinner).toBeInTheDocument()
  })

  it('does not render board content while loading', () => {
    mockedUseBoard.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })

    renderBoardPage()

    expect(screen.queryByText('Sprint Board')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC-5: Board view renders after load
// ===========================================================================

describe('BoardPage — board loaded (AC-5)', () => {
  beforeEach(() => {
    mockedUseBoard.mockReturnValue({
      data: BOARD_WITH_COLUMNS,
      isLoading: false,
      isError: false,
      error: null,
    })
  })

  it('renders the board name', () => {
    renderBoardPage()

    expect(screen.getByText('Sprint Board')).toBeInTheDocument()
  })

  it('renders all column names', () => {
    renderBoardPage()

    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('passes columns to KanbanBoard in position order', () => {
    // Board with columns out of order — page should sort before rendering
    const boardOutOfOrder: BoardWithColumns = {
      ...BOARD_WITH_COLUMNS,
      columns: [
        { id: 'col-2', name: 'In Progress', position: 1, created_at: '2026-01-01T00:00:00Z' },
        { id: 'col-1', name: 'To Do', position: 0, created_at: '2026-01-01T00:00:00Z' },
      ],
    }
    mockedUseBoard.mockReturnValue({ data: boardOutOfOrder, isLoading: false, isError: false, error: null })

    renderBoardPage()

    const toDoEl = screen.getByText('To Do')
    const inProgressEl = screen.getByText('In Progress')

    // To Do (position 0) should appear before In Progress (position 1)
    expect(toDoEl.compareDocumentPosition(inProgressEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// ===========================================================================
// AC-9: Error banner on API failure
// ===========================================================================

describe('BoardPage — API error (AC-9)', () => {
  it('shows ErrorBanner when useBoard returns an error', () => {
    mockedUseBoard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Failed to load board' },
    })

    renderBoardPage()

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('does not render board content when there is an error', () => {
    mockedUseBoard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Server error' },
    })

    renderBoardPage()

    expect(screen.queryByText('Sprint Board')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC-11 / 404 state
// ===========================================================================

describe('BoardPage — 404 board not found', () => {
  it('shows a not-found message when useBoard returns a 404-like error', () => {
    mockedUseBoard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Board not found', status: 404 },
    })

    renderBoardPage()

    // Either a dedicated NotFoundPage, an alert, or a "not found" message
    const notFoundMsg =
      screen.queryByText(/not found/i) ??
      screen.queryByText(/404/i) ??
      screen.queryByRole('alert')
    expect(notFoundMsg).toBeInTheDocument()
  })
})
