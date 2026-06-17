/**
 * Tests for ErrorBanner component.
 *
 * Covers:
 *  - Renders the provided error message
 *  - Has accessible role="alert" so screen readers announce it immediately
 *  - Contains a dismiss button that hides the banner when clicked
 *
 * AC-9: API error surfaces as a visible, dismissable banner rather than a blank screen.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'

describe('ErrorBanner', () => {
  it('renders the error message passed as a prop', () => {
    render(<ErrorBanner message="Failed to load boards" onDismiss={vi.fn()} />)

    expect(screen.getByText('Failed to load boards')).toBeInTheDocument()
  })

  it('has role="alert" so assistive technology announces it immediately', () => {
    render(<ErrorBanner message="Something went wrong" onDismiss={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('contains a dismiss button', () => {
    render(<ErrorBanner message="An error occurred" onDismiss={vi.fn()} />)

    // Accept any accessible label that conveys dismissal intent
    const dismissBtn = screen.getByRole('button', { name: /dismiss|close|×|✕/i })
    expect(dismissBtn).toBeInTheDocument()
  })

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<ErrorBanner message="An error occurred" onDismiss={onDismiss} />)

    const dismissBtn = screen.getByRole('button', { name: /dismiss|close|×|✕/i })
    await user.click(dismissBtn)

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('is reachable and activatable via keyboard alone (Tab + Enter)', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<ErrorBanner message="Keyboard test" onDismiss={onDismiss} />)

    // Tab into the dismiss button and activate it with Enter
    await user.tab()
    const focused = document.activeElement
    expect(focused).toHaveAttribute('type')  // button element has type attribute

    await user.keyboard('{Enter}')
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
