/**
 * Tests for RegisterPage.
 *
 * Covers:
 *  AC-RENDER-1  Renders email input, password input, and "Create Account" button
 *  AC-RENDER-2  Renders link to /login
 *  AC-HAPPY-1   Successful register calls register mutation and navigates to /
 *  AC-ERROR-1   Shows ErrorBanner with "Email already registered" on 409 conflict error
 *  AC-ERROR-2   Shows ErrorBanner with validation message on 400 error
 *  AC-SUBMIT-1  Submit button is disabled while mutation is pending
 *  AC-A11Y-1    Email and password inputs have associated labels
 *
 * Mocking strategy:
 *  - vi.mock('@/hooks/useRegister') to return controlled hook states
 *  - Wrap in MemoryRouter and QueryClientProvider
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as useRegisterModule from '@/hooks/useRegister'
import { RegisterPage } from '@/pages/RegisterPage/RegisterPage'
import { ApiError } from '@/types'

vi.mock('@/hooks/useRegister')

const mockedUseRegister = useRegisterModule.useRegister as Mock

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
  error: unknown
  reset: ReturnType<typeof vi.fn>
}

function mockMutation(overrides: Partial<MutationMock> = {}): MutationMock {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  const client = makeQueryClient()

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// AC-RENDER-1: Renders email input, password input, and "Create Account" button
// ===========================================================================

describe('RegisterPage — rendering (AC-RENDER-1)', () => {
  it('renders an email input', () => {
    mockedUseRegister.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
  })

  it('renders a password input', () => {
    mockedUseRegister.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders a "Create Account" submit button', () => {
    mockedUseRegister.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-RENDER-2: Renders link to /login
// ===========================================================================

describe('RegisterPage — login link (AC-RENDER-2)', () => {
  it('renders a link that points to /login', () => {
    mockedUseRegister.mockReturnValue(mockMutation())
    renderPage()
    const link = screen.getByRole('link', { name: /log in|sign in|already have an account/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/login')
  })
})

// ===========================================================================
// AC-HAPPY-1: Successful register calls mutation and navigates to /
// ===========================================================================

describe('RegisterPage — successful registration (AC-HAPPY-1)', () => {
  it('calls mutate with email and password on form submit', async () => {
    const user = userEvent.setup()
    const mutateFn = vi.fn()
    mockedUseRegister.mockReturnValue(mockMutation({ mutate: mutateFn }))

    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'mypassword')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(mutateFn).toHaveBeenCalledOnce()
    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', password: 'mypassword' }),
      expect.anything(),
    )
  })

  it('navigates to / after successful registration', async () => {
    const user = userEvent.setup()

    const mutateFn = vi.fn().mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    mockedUseRegister.mockReturnValue(mockMutation({ mutate: mutateFn }))

    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'mypassword')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-ERROR-1: Shows ErrorBanner with "Email already registered" on 409 conflict
// ===========================================================================

describe('RegisterPage — 409 conflict error (AC-ERROR-1)', () => {
  it('shows "Email already registered" ErrorBanner on 409 conflict', () => {
    // ApiError imported at top of file
    mockedUseRegister.mockReturnValue(
      mockMutation({
        isError: true,
        error: new ApiError(409, 'Conflict'),
      }),
    )

    renderPage()

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/email already registered/i)
  })
})

// ===========================================================================
// AC-ERROR-2: Shows ErrorBanner with validation message on 400 error
// ===========================================================================

describe('RegisterPage — 400 validation error (AC-ERROR-2)', () => {
  it('shows ErrorBanner with the server validation message on 400 error', () => {
    // ApiError imported at top of file
    mockedUseRegister.mockReturnValue(
      mockMutation({
        isError: true,
        error: new ApiError(400, 'Password must be at least 8 characters'),
      }),
    )

    renderPage()

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/password must be at least 8 characters/i)
  })
})

// ===========================================================================
// AC-SUBMIT-1: Submit button disabled while pending
// ===========================================================================

describe('RegisterPage — pending state (AC-SUBMIT-1)', () => {
  it('disables the submit button while mutation is pending', () => {
    mockedUseRegister.mockReturnValue(mockMutation({ isPending: true }))

    renderPage()

    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled()
  })

  it('submit button is enabled when not pending', () => {
    mockedUseRegister.mockReturnValue(mockMutation({ isPending: false }))

    renderPage()

    expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled()
  })
})

// ===========================================================================
// AC-A11Y-1: Email and password inputs have associated labels
// ===========================================================================

describe('RegisterPage — accessibility (AC-A11Y-1)', () => {
  it('email input is accessible via label', () => {
    mockedUseRegister.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('password input is accessible via label', () => {
    mockedUseRegister.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })
})
