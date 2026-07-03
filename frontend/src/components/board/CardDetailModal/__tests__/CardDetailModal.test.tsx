/**
 * Tests for CardDetailModal component (TASK-020 Phase 4, TASK-021 edit-title).
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
 *
 * Edit-title (TASK-021):
 *  - Clicking "Edit title" swaps the heading for an editable input + Save/Cancel
 *  - Save calls useUpdateCardTitle(cardId).mutate with the trimmed value
 *  - Cancel discards the draft and restores the original title, no mutation call
 *  - Empty/whitespace-only title shows an inline validation error, no mutation call
 *  - Mutation failure shows an inline error and keeps edit mode open for retry
 *  - Mutation success exits edit mode and displays the new title
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    useUpdateCardTitle: vi.fn(),
  }
})

const mockedUseCardActivity = hooks.useCardActivity as Mock
const mockedUseUpdateCardTitle = hooks.useUpdateCardTitle as Mock

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

function makeMutationMock(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
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
  mockedUseUpdateCardTitle.mockReturnValue(makeMutationMock())
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

// ===========================================================================
// Edit title (TASK-021)
// ===========================================================================

describe('CardDetailModal — Edit title', () => {
  beforeEach(() => {
    mockedUseCardActivity.mockReturnValue(makeQueryMock({ data: [] }))
  })

  it('shows the title as a heading with an "Edit title" button, not editable by default', () => {
    renderModal({ cardTitle: 'My Card' })

    expect(screen.getByRole('heading', { name: 'My Card' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit title/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /card title/i })).not.toBeInTheDocument()
  })

  it('clicking "Edit title" swaps the heading for an input pre-filled with the current title', async () => {
    const user = userEvent.setup()
    renderModal({ cardTitle: 'My Card' })

    await user.click(screen.getByRole('button', { name: /edit title/i }))

    const input = screen.getByRole('textbox', { name: /card title/i })
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('My Card')
    expect(screen.queryByRole('heading', { name: 'My Card' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
  })

  it('Cancel discards the draft, restores the heading, and does not call mutate', async () => {
    const mutate = vi.fn()
    mockedUseUpdateCardTitle.mockReturnValue(makeMutationMock({ mutate }))
    const user = userEvent.setup()
    renderModal({ cardTitle: 'My Card' })

    await user.click(screen.getByRole('button', { name: /edit title/i }))
    await user.clear(screen.getByRole('textbox', { name: /card title/i }))
    await user.type(screen.getByRole('textbox', { name: /card title/i }), 'Changed but discarded')
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'My Card' })).toBeInTheDocument()
  })

  it('Save with an empty/whitespace-only title shows a validation error and does not call mutate', async () => {
    const mutate = vi.fn()
    mockedUseUpdateCardTitle.mockReturnValue(makeMutationMock({ mutate }))
    const user = userEvent.setup()
    renderModal({ cardTitle: 'My Card' })

    await user.click(screen.getByRole('button', { name: /edit title/i }))
    await user.clear(screen.getByRole('textbox', { name: /card title/i }))
    await user.type(screen.getByRole('textbox', { name: /card title/i }), '   ')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/title is required/i)
  })

  it('Save with a valid title calls mutate with the trimmed value', async () => {
    const mutate = vi.fn()
    mockedUseUpdateCardTitle.mockReturnValue(makeMutationMock({ mutate }))
    const user = userEvent.setup()
    renderModal({ cardId: 'card-42', cardTitle: 'My Card' })

    await user.click(screen.getByRole('button', { name: /edit title/i }))
    await user.clear(screen.getByRole('textbox', { name: /card title/i }))
    await user.type(screen.getByRole('textbox', { name: /card title/i }), '  Renamed Card  ')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    const [vars] = mutate.mock.calls[0]
    expect(vars).toEqual({ title: 'Renamed Card' })
  })

  it('on mutation success, exits edit mode and displays the new title', async () => {
    const mutate = vi.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    mockedUseUpdateCardTitle.mockReturnValue(makeMutationMock({ mutate }))
    const user = userEvent.setup()
    renderModal({ cardTitle: 'My Card' })

    await user.click(screen.getByRole('button', { name: /edit title/i }))
    await user.clear(screen.getByRole('textbox', { name: /card title/i }))
    await user.type(screen.getByRole('textbox', { name: /card title/i }), 'Renamed Card')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(screen.getByRole('heading', { name: 'Renamed Card' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /card title/i })).not.toBeInTheDocument()
  })

  it('on mutation failure, shows an inline error and keeps edit mode open for retry', async () => {
    const mutate = vi.fn()
    mockedUseUpdateCardTitle.mockReturnValue(
      makeMutationMock({ mutate, isError: true, error: new Error('Network error') }),
    )
    const user = userEvent.setup()
    renderModal({ cardTitle: 'My Card' })

    await user.click(screen.getByRole('button', { name: /edit title/i }))
    await user.clear(screen.getByRole('textbox', { name: /card title/i }))
    await user.type(screen.getByRole('textbox', { name: /card title/i }), 'Renamed Card')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(/network error/i)
    expect(screen.getByRole('textbox', { name: /card title/i })).toBeInTheDocument()
  })

  it('Save button is disabled while the mutation is pending', async () => {
    mockedUseUpdateCardTitle.mockReturnValue(makeMutationMock({ isPending: true }))
    const user = userEvent.setup()
    renderModal({ cardTitle: 'My Card' })

    await user.click(screen.getByRole('button', { name: /edit title/i }))

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })
})
