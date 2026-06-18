/**
 * Tests for AppHeader.
 *
 * Covers:
 *  AC-RENDER-1  Renders app name (BanyanBoard or similar)
 *  AC-RENDER-2  Renders "Sign out" button
 *  AC-LOGOUT-1  Clicking "Sign out" calls the logout mutation
 *  AC-LOADING   "Sign out" button is disabled while logout is pending
 *
 * Mocking strategy:
 *  - vi.mock('@/hooks/useLogout') to control logout mutation state
 *  - Wrap in MemoryRouter and QueryClientProvider
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as useLogoutModule from '@/hooks/useLogout'
import { AppHeader } from '@/components/AppHeader/AppHeader'

vi.mock('@/hooks/useLogout')

const mockedUseLogout = useLogoutModule.useLogout as Mock

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

function renderHeader(children?: React.ReactNode) {
  const client = makeQueryClient()

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppHeader>{children}</AppHeader>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// AC-RENDER-1: Renders app name
// ===========================================================================

describe('AppHeader — app name (AC-RENDER-1)', () => {
  it('renders the app name "BanyanBoard"', () => {
    mockedUseLogout.mockReturnValue(mockMutation())
    renderHeader()
    expect(screen.getByText(/banyanboard/i)).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-RENDER-2: Renders "Sign out" button
// ===========================================================================

describe('AppHeader — sign out button (AC-RENDER-2)', () => {
  it('renders a "Sign out" button', () => {
    mockedUseLogout.mockReturnValue(mockMutation())
    renderHeader()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-LOGOUT-1: Clicking "Sign out" calls logout mutation
// ===========================================================================

describe('AppHeader — logout action (AC-LOGOUT-1)', () => {
  it('calls the logout mutate function when "Sign out" is clicked', async () => {
    const user = userEvent.setup()
    const mutateFn = vi.fn()
    mockedUseLogout.mockReturnValue(mockMutation({ mutate: mutateFn }))

    renderHeader()

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    expect(mutateFn).toHaveBeenCalledOnce()
  })
})

// ===========================================================================
// AC-LOADING: "Sign out" button disabled while logout is pending
// ===========================================================================

describe('AppHeader — pending logout state (AC-LOADING)', () => {
  it('disables the "Sign out" button while logout is pending', () => {
    mockedUseLogout.mockReturnValue(mockMutation({ isPending: true }))
    renderHeader()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDisabled()
  })

  it('"Sign out" button is enabled when logout is not pending', () => {
    mockedUseLogout.mockReturnValue(mockMutation({ isPending: false }))
    renderHeader()
    expect(screen.getByRole('button', { name: /sign out/i })).not.toBeDisabled()
  })
})

// ===========================================================================
// Additional: AppHeader renders children (slot for Outlet content)
// ===========================================================================

describe('AppHeader — children slot', () => {
  it('renders children passed to AppHeader', () => {
    mockedUseLogout.mockReturnValue(mockMutation())
    renderHeader(<div>Child Content</div>)
    expect(screen.getByText('Child Content')).toBeInTheDocument()
  })
})
