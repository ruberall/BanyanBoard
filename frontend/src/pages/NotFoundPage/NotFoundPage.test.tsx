/**
 * Tests for NotFoundPage component.
 *
 * Covers:
 *  AC-11 404 route — renders "Not Found" heading or message with a link back to /
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from '@/pages/NotFoundPage/NotFoundPage'

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/some/missing/route']}>
      <NotFoundPage />
    </MemoryRouter>,
  )
}

// ===========================================================================
// AC-11: 404 Not Found
// ===========================================================================

describe('NotFoundPage — AC-11', () => {
  it('renders a "Not Found" heading or message', () => {
    renderPage()

    const heading =
      screen.queryByRole('heading', { name: /not found/i }) ??
      screen.queryByText(/not found/i) ??
      screen.queryByText(/404/i)
    expect(heading).toBeInTheDocument()
  })

  it('renders a link back to the home page (/)', () => {
    renderPage()

    const homeLink = screen.queryByRole('link', { name: /home|back|go to/i }) ??
      screen.queryByRole('link')
    expect(homeLink).toBeInTheDocument()
  })

  it('home link points to /', () => {
    renderPage()

    // Find all links and check at least one points to /
    const links = screen.getAllByRole('link')
    const homeLink = links.find((el) => el.getAttribute('href') === '/')
    expect(homeLink).toBeDefined()
  })

  it('renders without throwing', () => {
    expect(() => renderPage()).not.toThrow()
  })
})
