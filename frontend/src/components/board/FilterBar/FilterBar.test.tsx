/**
 * Tests for FilterBar component.
 *
 * FilterBar is a controlled text input with an × clear button.
 * It is rendered in the BoardPage heading row and used to filter
 * cards client-side across all KanbanColumns.
 *
 * Covers:
 *  AC-FILTER-ENTRY-1  Input with aria-label="Filter cards" is rendered
 *  AC-FILTER-ENTRY-1  × clear button is NOT visible when input is empty
 *  AC-FILTER-HAPPY-3  × clear button appears when input has text
 *  AC-FILTER-HAPPY-3  Clicking × clears the input and calls onChange with ''
 *  AC-FILTER-A11Y-1   Input has aria-label="Filter cards"
 *  AC-FILTER-A11Y-1   × button has aria-label="Clear filter"
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FilterBar } from '@/components/board/FilterBar/FilterBar'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderFilterBar(value = '', onChange = vi.fn()) {
  return render(<FilterBar value={value} onChange={onChange} />)
}

// ===========================================================================
// Accessibility & initial render
// ===========================================================================

describe('FilterBar — accessibility and initial render', () => {
  it('renders a text input with aria-label "Filter cards"', () => {
    renderFilterBar()

    expect(screen.getByRole('textbox', { name: /filter cards/i })).toBeInTheDocument()
  })

  it('does NOT render the clear button when the input is empty', () => {
    renderFilterBar('')

    expect(screen.queryByRole('button', { name: /clear filter/i })).not.toBeInTheDocument()
  })

  it('renders the clear button with aria-label "Clear filter" when input has text', () => {
    renderFilterBar('fix')

    expect(screen.getByRole('button', { name: /clear filter/i })).toBeInTheDocument()
  })
})

// ===========================================================================
// Controlled input behaviour
// ===========================================================================

describe('FilterBar — controlled input', () => {
  it('displays the value passed via the value prop', () => {
    renderFilterBar('auth')

    expect(screen.getByRole('textbox', { name: /filter cards/i })).toHaveValue('auth')
  })

  it('calls onChange with the new value when the user types', async () => {
    const onChange = vi.fn()
    renderFilterBar('', onChange)
    const user = userEvent.setup()

    await user.type(screen.getByRole('textbox', { name: /filter cards/i }), 'fix')

    // onChange should have been called with 'f', 'fi', 'fix' in sequence
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenLastCalledWith('fix')
  })

  it('calls onChange with empty string when × is clicked', async () => {
    const onChange = vi.fn()
    renderFilterBar('bug', onChange)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /clear filter/i }))

    expect(onChange).toHaveBeenCalledWith('')
  })
})
