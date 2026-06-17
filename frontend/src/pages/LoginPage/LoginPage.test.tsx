/**
 * Tests for LoginPage.
 *
 * Covers:
 *  AC-RENDER-1  Renders email input, password input, and "Log in" button
 *  AC-RENDER-2  Renders link to /register
 *  AC-HAPPY-1   Successful login calls login mutation with correct credentials and navigates to /
 *  AC-HAPPY-2   Successful login with ?next= redirects to the next URL (starts with /)
 *  AC-HAPPY-3   ?next= with an external URL is ignored; redirects to / instead
 *  AC-ERROR-1   Shows ErrorBanner with "Invalid email or password" on 401 error
 *  AC-ERROR-2   Shows ErrorBanner with server error message on other API errors
 *  AC-SUBMIT-1  Submit button is disabled while mutation is pending
 *  AC-A11Y-1    Email and password inputs have associated labels
 *
 * Mocking strategy:
 *  - vi.mock('@/hooks/useLogin') to return controlled hook states
 *  - Wrap in MemoryRouter with initialEntries to simulate ?next= params
 *  - Wrap in QueryClientProvider with a fresh QueryClient per test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as useLoginModule from '@/hooks/useLogin'
import { LoginPage } from '@/pages/LoginPage/LoginPage'

vi.mock('@/hooks/useLogin')

const mockedUseLogin = useLoginModule.useLogin as Mock

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

interface RenderOptions {
  initialPath?: string
}

function renderPage(options: RenderOptions = {}) {
  const { initialPath = '/login' } = options
  const client = makeQueryClient()

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<div>Register Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
          <Route path="/boards" element={<div>Boards Page</div>} />
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
// AC-RENDER-1: Renders email input, password input, and "Log in" button
// ===========================================================================

describe('LoginPage — rendering (AC-RENDER-1)', () => {
  it('renders an email input', () => {
    mockedUseLogin.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
  })

  it('renders a password input', () => {
    mockedUseLogin.mockReturnValue(mockMutation())
    renderPage()
    // password inputs don't have an implicit ARIA role matching "textbox"
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders a "Log in" submit button', () => {
    mockedUseLogin.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-RENDER-2: Renders link to /register
// ===========================================================================

describe('LoginPage — register link (AC-RENDER-2)', () => {
  it('renders a link that points to /register', () => {
    mockedUseLogin.mockReturnValue(mockMutation())
    renderPage()
    const link = screen.getByRole('link', { name: /register|sign up|create account/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/register')
  })
})

// ===========================================================================
// AC-HAPPY-1: Successful login navigates to /
// ===========================================================================

describe('LoginPage — successful login (AC-HAPPY-1)', () => {
  it('calls mutate with email and password on form submit', async () => {
    const user = userEvent.setup()
    const mutateFn = vi.fn()
    mockedUseLogin.mockReturnValue(mockMutation({ mutate: mutateFn }))

    renderPage()

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(mutateFn).toHaveBeenCalledOnce()
    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com', password: 'secret123' }),
      expect.anything(),
    )
  })

  it('navigates to / after successful login (no ?next=)', async () => {
    const user = userEvent.setup()

    const mutateFn = vi.fn().mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    mockedUseLogin.mockReturnValue(mockMutation({ mutate: mutateFn }))

    renderPage({ initialPath: '/login' })

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-HAPPY-2: ?next= redirects to that path after login
// ===========================================================================

describe('LoginPage — ?next= redirect (AC-HAPPY-2)', () => {
  it('redirects to ?next= path after successful login when next starts with /', async () => {
    const user = userEvent.setup()

    const mutateFn = vi.fn().mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    mockedUseLogin.mockReturnValue(mockMutation({ mutate: mutateFn }))

    renderPage({ initialPath: '/login?next=/boards' })

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(screen.getByText('Boards Page')).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-HAPPY-3: ?next= with external URL is ignored, redirects to /
// ===========================================================================

describe('LoginPage — external ?next= ignored (AC-HAPPY-3)', () => {
  it('redirects to / when ?next= is an external URL', async () => {
    const user = userEvent.setup()

    const mutateFn = vi.fn().mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) => {
      opts?.onSuccess?.()
    })
    mockedUseLogin.mockReturnValue(mockMutation({ mutate: mutateFn }))

    renderPage({ initialPath: '/login?next=http://evil.example.com' })

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-ERROR-1: Shows ErrorBanner on 401
// ===========================================================================

describe('LoginPage — 401 error (AC-ERROR-1)', () => {
  it('shows "Invalid email or password" ErrorBanner on 401', () => {
    const { ApiError } = require('@/types')
    mockedUseLogin.mockReturnValue(
      mockMutation({
        isError: true,
        error: new ApiError(401, 'Unauthorized'),
      }),
    )

    renderPage()

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/invalid email or password/i)
  })
})

// ===========================================================================
// AC-ERROR-2: Shows ErrorBanner with server error message on other errors
// ===========================================================================

describe('LoginPage — generic API error (AC-ERROR-2)', () => {
  it('shows ErrorBanner with server error message on non-401 error', () => {
    const { ApiError } = require('@/types')
    mockedUseLogin.mockReturnValue(
      mockMutation({
        isError: true,
        error: new ApiError(500, 'Internal server error'),
      }),
    )

    renderPage()

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/internal server error/i)
  })
})

// ===========================================================================
// AC-SUBMIT-1: Submit button disabled while pending
// ===========================================================================

describe('LoginPage — pending state (AC-SUBMIT-1)', () => {
  it('disables the submit button while mutation is pending', () => {
    mockedUseLogin.mockReturnValue(mockMutation({ isPending: true }))

    renderPage()

    expect(screen.getByRole('button', { name: /log in/i })).toBeDisabled()
  })

  it('submit button is enabled when not pending', () => {
    mockedUseLogin.mockReturnValue(mockMutation({ isPending: false }))

    renderPage()

    expect(screen.getByRole('button', { name: /log in/i })).not.toBeDisabled()
  })
})

// ===========================================================================
// AC-A11Y-1: Email and password inputs have associated labels
// ===========================================================================

describe('LoginPage — accessibility (AC-A11Y-1)', () => {
  it('email input is accessible via label', () => {
    mockedUseLogin.mockReturnValue(mockMutation())
    renderPage()
    // getByLabelText throws if no label is associated
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('password input is accessible via label', () => {
    mockedUseLogin.mockReturnValue(mockMutation())
    renderPage()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })
})
