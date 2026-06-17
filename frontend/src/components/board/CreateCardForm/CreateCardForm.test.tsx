/**
 * Tests for CreateCardForm component.
 *
 * CreateCardForm uses useCreateCard(columnId) internally.
 * On submit, calls mutate({ title }). Clears input on success.
 *
 * Covers:
 *  - Renders title input and submit button
 *  - Calls mutate with correct title on form submit (AC-6)
 *  - Clears input after successful submission
 *  - Shows validation error when title is blank on submit
 *  - Disables submit button while mutation isPending
 *  - Does NOT call mutate when title is blank
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { CreateCardForm } from '@/components/board/CreateCardForm/CreateCardForm'

// ---------------------------------------------------------------------------
// Mock the hooks module wholesale
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks')

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

function renderForm(columnId = 'col-1') {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateCardForm columnId={columnId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// Renders
// ===========================================================================

describe('CreateCardForm — renders', () => {
  it('renders a title text input', () => {
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderForm()

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders a submit button', () => {
    mockedUseCreateCard.mockReturnValue(mockMutation())

    renderForm()

    const btn = screen.queryByRole('button', { name: /add card|create card|submit/i })
    expect(btn).toBeInTheDocument()
  })
})

// ===========================================================================
// Submit — AC-6
// ===========================================================================

describe('CreateCardForm — form submit (AC-6)', () => {
  it('calls mutate with the typed title when form is submitted', async () => {
    const mutateFn = vi.fn()
    mockedUseCreateCard.mockReturnValue(mockMutation({ mutate: mutateFn }))

    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByRole('textbox'), 'New Card Title')
    await user.click(screen.getByRole('button', { name: /add card|create card|submit/i }))

    expect(mutateFn).toHaveBeenCalledOnce()
    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New Card Title' }),
      expect.anything(),
    )
  })

  it('does NOT call mutate when the title input is blank', async () => {
    const mutateFn = vi.fn()
    mockedUseCreateCard.mockReturnValue(mockMutation({ mutate: mutateFn }))

    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add card|create card|submit/i }))

    expect(mutateFn).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Clear on success
// ===========================================================================

describe('CreateCardForm — clears after success', () => {
  it('clears the title input after a successful card creation', async () => {
    const mutateFn = vi.fn().mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    mockedUseCreateCard.mockReturnValue(mockMutation({ mutate: mutateFn }))

    const user = userEvent.setup()
    renderForm()

    const input = screen.getByRole('textbox')
    await user.type(input, 'Card to Clear')
    await user.click(screen.getByRole('button', { name: /add card|create card|submit/i }))

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })
})

// ===========================================================================
// Validation
// ===========================================================================

describe('CreateCardForm — validation', () => {
  it('shows a validation error message when title is blank and form is submitted', async () => {
    mockedUseCreateCard.mockReturnValue(mockMutation())

    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add card|create card|submit/i }))

    // Some form of validation feedback should appear
    const errMsg =
      screen.queryByText(/required/i) ??
      screen.queryByText(/title/i) ??
      screen.queryByRole('alert')
    expect(errMsg).toBeInTheDocument()
  })
})

// ===========================================================================
// Pending state
// ===========================================================================

describe('CreateCardForm — pending state', () => {
  it('disables the submit button while the mutation is pending', () => {
    mockedUseCreateCard.mockReturnValue(mockMutation({ isPending: true }))

    renderForm()

    const btn = screen.getByRole('button', { name: /add card|create card|submit/i })
    expect(btn).toBeDisabled()
  })
})
