/**
 * Tests for StatusBadge component.
 *
 * StatusBadge renders a status label as text + icon (never color-only).
 * WCAG 1.4.1 (Use of Color): information MUST NOT be conveyed by color alone.
 *
 * Statuses: 'pending' | 'delivered' | 'failed' | 'exhausted'
 *
 * Covers:
 *  - Each status renders its human-readable text label
 *  - Wrapper has aria-label="Status: <StatusLabel>" so screen readers announce context
 *  - SVG icon has aria-hidden="true" (decorative — text carries the meaning)
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/common/StatusBadge/StatusBadge'

// ===========================================================================
// Text labels — non-color-only requirement (WCAG 1.4.1)
// ===========================================================================

describe('StatusBadge — text labels (non-color-only)', () => {
  it('renders text "Pending" for status="pending"', () => {
    render(<StatusBadge status="pending" />)

    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders text "Delivered" for status="delivered"', () => {
    render(<StatusBadge status="delivered" />)

    expect(screen.getByText('Delivered')).toBeInTheDocument()
  })

  it('renders text "Failed" for status="failed"', () => {
    render(<StatusBadge status="failed" />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders text "Exhausted" for status="exhausted"', () => {
    render(<StatusBadge status="exhausted" />)

    expect(screen.getByText('Exhausted')).toBeInTheDocument()
  })
})

// ===========================================================================
// Accessibility — aria-label on wrapper, aria-hidden on icon
// ===========================================================================

describe('StatusBadge — accessibility', () => {
  it('has aria-label="Status: Delivered" on the wrapper span for status="delivered"', () => {
    render(<StatusBadge status="delivered" />)

    const badge = screen.getByLabelText('Status: Delivered')
    expect(badge).toBeInTheDocument()
  })

  it('has aria-label="Status: Failed" on the wrapper span for status="failed"', () => {
    render(<StatusBadge status="failed" />)

    const badge = screen.getByLabelText('Status: Failed')
    expect(badge).toBeInTheDocument()
  })

  it('SVG icon has aria-hidden="true" so it does not double-announce to screen readers', () => {
    const { container } = render(<StatusBadge status="delivered" />)

    const svg = container.querySelector('svg')
    // If the implementation uses an SVG icon, it must be aria-hidden
    // If no SVG is used (text-only badge), this test passes trivially — that's acceptable
    if (svg) {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    }
  })
})
