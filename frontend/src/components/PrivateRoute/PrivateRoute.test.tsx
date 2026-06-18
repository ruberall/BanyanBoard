/**
 * Tests for PrivateRoute.
 *
 * Covers:
 *  AC-LOADING    While useCurrentUser isLoading, renders LoadingSpinner (role="status")
 *  AC-UNAUTH     When no user (not loading), redirects to /login
 *  AC-UNAUTH-NEXT When no user and at /boards/123, redirects to /login?next=/boards/123
 *  AC-AUTH       When user is present, renders <Outlet /> child route content
 *  AC-AUTH-HEADER When user is present, AppHeader is rendered
 *
 * Mocking strategy:
 *  - vi.mock('@/hooks/useCurrentUser') for auth state control
 *  - vi.mock('@/components/AppHeader/AppHeader') to isolate PrivateRoute behavior
 *  - Use MemoryRouter with Routes including PrivateRoute wrapping a test child route
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as useCurrentUserModule from '@/hooks/useCurrentUser'
import { PrivateRoute } from '@/components/PrivateRoute/PrivateRoute'

vi.mock('@/hooks/useCurrentUser')
// Mock AppHeader so PrivateRoute tests don't depend on its implementation
vi.mock('@/components/AppHeader/AppHeader', () => ({
  AppHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-header">{children}</div>
  ),
}))

const mockedUseCurrentUser = useCurrentUserModule.useCurrentUser as Mock

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

interface CurrentUserMock {
  data: { id: string; email: string } | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
}

function mockCurrentUser(overrides: Partial<CurrentUserMock> = {}): CurrentUserMock {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  }
}

interface RenderOptions {
  initialPath?: string
}

function renderWithRoutes(options: RenderOptions = {}) {
  const { initialPath = '/' } = options
  const client = makeQueryClient()

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<div>Login Page</div>} />
          {/* Protected routes wrapped in PrivateRoute */}
          <Route element={<PrivateRoute />}>
            <Route path="/" element={<div>Home Page</div>} />
            <Route path="/boards" element={<div>Boards Page</div>} />
            <Route path="/boards/:id" element={<div>Board Detail Page</div>} />
          </Route>
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
// AC-LOADING: Shows LoadingSpinner while auth is resolving
// ===========================================================================

describe('PrivateRoute — loading state (AC-LOADING)', () => {
  it('renders a loading spinner while useCurrentUser is loading', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ isLoading: true }))

    renderWithRoutes({ initialPath: '/' })

    const spinner = screen.queryByRole('status') ?? screen.queryByRole('progressbar')
    expect(spinner).toBeInTheDocument()
  })

  it('does not render the child route content while loading', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ isLoading: true }))

    renderWithRoutes({ initialPath: '/' })

    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })

  it('does not render AppHeader while loading', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ isLoading: true }))

    renderWithRoutes({ initialPath: '/' })

    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC-UNAUTH: Unauthenticated user redirects to /login
// ===========================================================================

describe('PrivateRoute — unauthenticated redirect (AC-UNAUTH)', () => {
  it('redirects to /login when no user and not loading', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: undefined, isLoading: false }))

    renderWithRoutes({ initialPath: '/' })

    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('does not render the protected route content when unauthenticated', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: undefined, isLoading: false }))

    renderWithRoutes({ initialPath: '/' })

    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC-UNAUTH-NEXT: Redirect includes ?next= with original path
// ===========================================================================

describe('PrivateRoute — ?next= in redirect (AC-UNAUTH-NEXT)', () => {
  it('redirects to /login?next=/boards/123 when unauthenticated at /boards/123', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: undefined, isLoading: false }))

    // Render a route setup that can capture the redirect target
    const client = makeQueryClient()
    let capturedSearch = ''

    const CaptureLoginPage = () => {
      const location = useLocation()
      capturedSearch = location.search
      return <div>Login Page</div>
    }

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/boards/123']}>
          <Routes>
            <Route path="/login" element={<CaptureLoginPage />} />
            <Route element={<PrivateRoute />}>
              <Route path="/boards/:id" element={<div>Board Detail Page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(capturedSearch).toContain('next=%2Fboards%2F123')
  })

  it('does not include ?next= when redirecting from /', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: undefined, isLoading: false }))

    const client = makeQueryClient()
    let capturedSearch = ''

    const CaptureLoginPage = () => {
      const location = useLocation()
      capturedSearch = location.search
      return <div>Login Page</div>
    }

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/login" element={<CaptureLoginPage />} />
            <Route element={<PrivateRoute />}>
              <Route path="/" element={<div>Home Page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    // / path should either have no next param or next=/ — not a meaningful deep-link
    // Accept either no param or next=%2F
    expect(capturedSearch === '' || capturedSearch === '?next=%2F').toBe(true)
  })
})

// ===========================================================================
// AC-AUTH: Authenticated user sees child route content
// ===========================================================================

describe('PrivateRoute — authenticated (AC-AUTH)', () => {
  const MOCK_USER = { id: 'u1', email: 'user@example.com' }

  it('renders the child route content when user is authenticated', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: MOCK_USER, isLoading: false }))

    renderWithRoutes({ initialPath: '/' })

    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('does not redirect to login when user is authenticated', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: MOCK_USER, isLoading: false }))

    renderWithRoutes({ initialPath: '/' })

    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })

  it('renders child content for a nested route when authenticated', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: MOCK_USER, isLoading: false }))

    renderWithRoutes({ initialPath: '/boards' })

    expect(screen.getByText('Boards Page')).toBeInTheDocument()
  })
})

// ===========================================================================
// AC-ERROR: Network/API error shows error banner, not redirect
// ===========================================================================

describe('PrivateRoute — error state (AC-ERROR)', () => {
  it('renders an error message when useCurrentUser returns isError', () => {
    mockedUseCurrentUser.mockReturnValue(
      mockCurrentUser({ isError: true, error: new Error('Network error') }),
    )

    renderWithRoutes({ initialPath: '/' })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC-AUTH-HEADER: AppHeader is rendered when authenticated
// ===========================================================================

describe('PrivateRoute — AppHeader rendered (AC-AUTH-HEADER)', () => {
  const MOCK_USER = { id: 'u1', email: 'user@example.com' }

  it('renders AppHeader when user is authenticated', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: MOCK_USER, isLoading: false }))

    renderWithRoutes({ initialPath: '/' })

    expect(screen.getByTestId('app-header')).toBeInTheDocument()
  })

  it('AppHeader wraps the child route content', () => {
    mockedUseCurrentUser.mockReturnValue(mockCurrentUser({ data: MOCK_USER, isLoading: false }))

    renderWithRoutes({ initialPath: '/' })

    const header = screen.getByTestId('app-header')
    // Child content rendered inside the header wrapper
    expect(header).toHaveTextContent('Home Page')
  })
})
