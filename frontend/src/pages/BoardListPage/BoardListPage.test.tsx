/**
 * Tests for BoardListPage.
 *
 * Covers:
 *  AC-1  Smoke: page renders without throwing
 *  AC-2  Board list: each board renders as a <Link> to /boards/:id
 *  AC-3  Empty state: shows "No boards yet" copy and a create affordance
 *  AC-4  Create board: form submit calls createBoard mutation; list re-renders
 *  AC-9  Error state: API failure shows ErrorBanner, not blank screen
 *  AC-10 Keyboard nav: create form button reachable via Tab; board links accessible
 *
 * Mocking strategy:
 *  - vi.mock('@/api/hooks') to return controlled hook states
 *  - Wrap in MemoryRouter (React Router v6) and a fresh QueryClient
 *
 * We mock the hooks module rather than fetch so tests are fast and deterministic.
 * Hook internals (fetch, cache) are covered separately in hooks.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

// These will be mocked — the real implementations do not exist yet
import * as hooks from '@/api/hooks'
import { BoardListPage } from '@/pages/BoardListPage/BoardListPage'

// ---------------------------------------------------------------------------
// Mock the hooks module wholesale
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks')

const mockedUseBoards = hooks.useBoards as Mock
const mockedUseCreateBoard = hooks.useCreateBoard as Mock

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

interface RenderOptions {
  initialPath?: string
}

function renderPage(options: RenderOptions = {}) {
  const { initialPath = '/' } = options
  const client = makeQueryClient()

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <BoardListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Default no-op mutation mock used by most tests (overridden where needed)
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


// ---------------------------------------------------------------------------
// Sample data fixtures
// ---------------------------------------------------------------------------

const BOARD_A = { id: 'b1', name: 'Sprint Board', created_at: '2026-01-01T00:00:00Z' }
const BOARD_B = { id: 'b2', name: 'Design Board', created_at: '2026-01-02T00:00:00Z' }

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// AC-1: Smoke test
// ===========================================================================

describe('BoardListPage — smoke test', () => {
  it('renders without throwing when data is loading', () => {
    mockedUseBoards.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    expect(() => renderPage()).not.toThrow()
  })
})

// ===========================================================================
// Loading state
// ===========================================================================

describe('BoardListPage — loading state', () => {
  it('shows a loading spinner while boards are being fetched', () => {
    mockedUseBoards.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    renderPage()

    // LoadingSpinner renders an element with role="status" or "progressbar"
    const spinner =
      screen.queryByRole('status') ?? screen.queryByRole('progressbar')
    expect(spinner).toBeInTheDocument()
  })

  it('does not render a board list while loading', () => {
    mockedUseBoards.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    renderPage()

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC-2: Board list renders with links
// ===========================================================================

describe('BoardListPage — board list (AC-2)', () => {
  beforeEach(() => {
    mockedUseBoards.mockReturnValue({
      data: { data: [BOARD_A, BOARD_B], total: 2, page: 1, limit: 20 },
      isLoading: false,
      isError: false,
      error: null,
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation())
  })

  it('renders a link for each board', () => {
    renderPage()

    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(2)
  })

  it('renders each board name as visible text', () => {
    renderPage()

    expect(screen.getByText('Sprint Board')).toBeInTheDocument()
    expect(screen.getByText('Design Board')).toBeInTheDocument()
  })

  it('each board link points to /boards/:id', () => {
    renderPage()

    const sprintLink = screen.getByRole('link', { name: /Sprint Board/i })
    expect(sprintLink).toHaveAttribute('href', '/boards/b1')

    const designLink = screen.getByRole('link', { name: /Design Board/i })
    expect(designLink).toHaveAttribute('href', '/boards/b2')
  })

  it('does not show the empty-state message when boards exist', () => {
    renderPage()

    expect(screen.queryByText(/no boards yet/i)).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC-3: Empty state
// ===========================================================================

describe('BoardListPage — empty state (AC-3)', () => {
  beforeEach(() => {
    mockedUseBoards.mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 20 },
      isLoading: false,
      isError: false,
      error: null,
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation())
  })

  it('shows "No boards yet" message when there are no boards', () => {
    renderPage()

    expect(screen.getByText(/no boards yet/i)).toBeInTheDocument()
  })

  it('shows a create-board affordance (button or form) in empty state', () => {
    renderPage()

    // There must be a way to create a board even when the list is empty
    const createButton = screen.queryByRole('button', { name: /create board/i })
    const createInput = screen.queryByRole('textbox')
    expect(createButton || createInput).toBeTruthy()
  })
})

// ===========================================================================
// AC-4: Create board form
// ===========================================================================

describe('BoardListPage — create board form (AC-4)', () => {
  let mutateFn: Mock

  beforeEach(() => {
    mutateFn = vi.fn()
    mockedUseBoards.mockReturnValue({
      data: { data: [BOARD_A], total: 1, page: 1, limit: 20 },
      isLoading: false,
      isError: false,
      error: null,
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation({ mutate: mutateFn }))
  })

  it('submitting the form with a board name calls mutate with that name', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = screen.getByRole('textbox')
    await user.type(input, 'My New Board')

    const submitBtn = screen.getByRole('button', { name: /create board/i })
    await user.click(submitBtn)

    expect(mutateFn).toHaveBeenCalledOnce()
    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My New Board' }),
      expect.anything(),
    )
  })

  it('does not navigate away on form submit (no full-page reload)', async () => {
    const user = userEvent.setup()
    renderPage()

    const input = screen.getByRole('textbox')
    await user.type(input, 'Board Name')
    await user.click(screen.getByRole('button', { name: /create board/i }))

    // Page-level elements still present — no navigation occurred
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('does not submit the form when the board name is empty', async () => {
    const user = userEvent.setup()
    renderPage()

    const submitBtn = screen.getByRole('button', { name: /create board/i })
    await user.click(submitBtn)

    expect(mutateFn).not.toHaveBeenCalled()
  })

  it('input clears after a successful board creation', async () => {
    const user = userEvent.setup()

    // Simulate mutate calling onSuccess immediately
    mutateFn.mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })

    renderPage()

    const input = screen.getByRole('textbox')
    await user.type(input, 'Temp Board')
    await user.click(screen.getByRole('button', { name: /create board/i }))

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })
})

// ===========================================================================
// AC-9: Error banner on API failure
// ===========================================================================

describe('BoardListPage — API error (AC-9)', () => {
  it('shows ErrorBanner when useBoards returns an error', () => {
    mockedUseBoards.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Network error' },
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    renderPage()

    // ErrorBanner renders with role="alert"
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('does not show a blank screen on error — alert text contains the error', () => {
    mockedUseBoards.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Failed to fetch boards' },
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    renderPage()

    const alert = screen.getByRole('alert')
    expect(alert).not.toBeEmptyDOMElement()
  })

  it('dismissing the error banner removes it from view', async () => {
    const user = userEvent.setup()

    mockedUseBoards.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Transient error' },
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    renderPage()

    const dismissBtn = screen.getByRole('button', { name: /dismiss|close|×|✕/i })
    await user.click(dismissBtn)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})

// ===========================================================================
// AC-10: Keyboard navigation
// ===========================================================================

describe('BoardListPage — keyboard navigation (AC-10)', () => {
  it('the create-board submit button is reachable via Tab', async () => {
    const user = userEvent.setup()
    mockedUseBoards.mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 20 },
      isLoading: false,
      isError: false,
      error: null,
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    renderPage()

    // Tab through focusable elements until we find the submit button
    const submitBtn = screen.getByRole('button', { name: /create board/i })
    let found = false

    for (let i = 0; i < 10; i++) {
      await user.tab()
      if (document.activeElement === submitBtn) {
        found = true
        break
      }
    }

    expect(found).toBe(true)
  })

  it('board links are focusable and keyboard-accessible', async () => {
    mockedUseBoards.mockReturnValue({
      data: { data: [BOARD_A], total: 1, page: 1, limit: 20 },
      isLoading: false,
      isError: false,
      error: null,
    })
    mockedUseCreateBoard.mockReturnValue(mockMutation())

    renderPage()

    const boardLink = screen.getByRole('link', { name: /Sprint Board/i })

    // Links are natively keyboard accessible; verify it is a real anchor
    expect(boardLink.tagName).toBe('A')
    expect(boardLink).toHaveAttribute('href')
  })
})
