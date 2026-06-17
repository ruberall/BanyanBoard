/**
 * Tests for LoadingSpinner component.
 *
 * Covers:
 *  - Renders an element with an accessible role (status or progressbar)
 *  - Provides a meaningful accessible label so screen readers convey state
 *  - Default label can be overridden via prop
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders an element with role="status" or role="progressbar"', () => {
    render(<LoadingSpinner />)

    // At least one of these roles must be present
    const spinner =
      screen.queryByRole('status') ?? screen.queryByRole('progressbar')
    expect(spinner).toBeInTheDocument()
  })

  it('has an accessible label so screen readers describe the loading state', () => {
    render(<LoadingSpinner />)

    // Either aria-label directly, or visually-hidden text that RTL can find
    const spinner =
      screen.queryByRole('status') ?? screen.queryByRole('progressbar')

    // aria-label is set, or visually-hidden text is present somewhere in the tree
    const hasAriaLabel = spinner?.hasAttribute('aria-label') || spinner?.hasAttribute('aria-labelledby')
    const hasVisuallyHiddenText = !!screen.queryByText(/loading/i)

    expect(hasAriaLabel || hasVisuallyHiddenText).toBe(true)
  })

  it('accepts a custom label prop and surfaces it accessibly', () => {
    render(<LoadingSpinner label="Loading boards…" />)

    // The custom label text should appear (either as aria-label or visible/hidden text)
    const hasCustomText =
      !!screen.queryByText('Loading boards…') ||
      !!screen.queryByRole('status', { name: 'Loading boards…' }) ||
      !!screen.queryByRole('progressbar', { name: 'Loading boards…' })

    expect(hasCustomText).toBe(true)
  })

  it('does not render any interactive focusable elements (spinners are not buttons)', () => {
    render(<LoadingSpinner />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
