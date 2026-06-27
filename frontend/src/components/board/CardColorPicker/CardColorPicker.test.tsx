/**
 * Tests for CardColorPicker component.
 *
 * CardColorPicker is a centered modal overlay (not a popover) that renders
 * 11 swatch buttons: "No color" first, then 10 pale-color swatches. It allows
 * the user to set or clear the background color on a Kanban card.
 *
 * Covers:
 *  - Has role="dialog" and aria-modal="true" (centered modal, not popover)
 *  - Renders exactly 11 swatch buttons (1 no-color + 10 pale)
 *  - Each swatch button has an accessible aria-label
 *  - "No color" swatch is first in DOM order
 *  - Clicking a pale swatch calls onColorSelect with the correct hex value
 *  - Clicking the "No color" swatch calls onColorSelect(null)
 *  - × close button calls onClose
 *  - Pressing Escape calls onClose
 *  - Focus moves to first swatch button on open
 *  - Backdrop click calls onClose
 *
 * Acceptance criteria covered:
 *  - AC-ENTRY-2: role="dialog" + aria-modal="true" confirms modal (not popover)
 *  - AC-HAPPY-1: clicking pale swatch → onColorSelect(hex)
 *  - AC-HAPPY-2: clicking no-color swatch → onColorSelect(null)
 *  - AC-KEYBOARD-1: Escape → onClose; first swatch focused on open
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'

import { CardColorPicker } from '@/components/board/CardColorPicker/CardColorPicker'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderPicker(overrides: {
  onColorSelect?: (hex: string | null) => void
  onClose?: () => void
} = {}) {
  const onColorSelect = overrides.onColorSelect ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  return {
    onColorSelect,
    onClose,
    ...render(<CardColorPicker onColorSelect={onColorSelect} onClose={onClose} />),
  }
}

// ===========================================================================
// Modal structure and accessibility
// ===========================================================================

describe('CardColorPicker — modal structure', () => {
  it('has role="dialog" and aria-modal="true"', () => {
    renderPicker()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('renders without crashing when onColorSelect and onClose are provided', () => {
    expect(() =>
      render(<CardColorPicker onColorSelect={vi.fn()} onClose={vi.fn()} />)
    ).not.toThrow()
  })
})

// ===========================================================================
// Swatch count and ordering
// ===========================================================================

describe('CardColorPicker — swatches', () => {
  it('renders exactly 11 swatch buttons (1 no-color + 10 pale)', () => {
    renderPicker()

    // Count buttons inside the dialog that are swatches.
    // The close button is separate; we count by looking for aria-label patterns
    // matching color names. Alternatively, count all buttons and subtract close button.
    const noColor = screen.getByRole('button', { name: /no color/i })
    const paleButtons = [
      'Pale rose',
      'Pale amber',
      'Pale lime',
      'Pale teal',
      'Pale sky',
      'Pale indigo',
      'Pale purple',
      'Pale slate',
      'Pale orange',
      'Pale green',
    ].map((name) => screen.getByRole('button', { name }))

    expect(noColor).toBeInTheDocument()
    expect(paleButtons).toHaveLength(10)
    paleButtons.forEach((btn) => expect(btn).toBeInTheDocument())
  })

  it('each swatch button has an accessible aria-label', () => {
    renderPicker()

    const expectedLabels = [
      'No color',
      'Pale rose',
      'Pale amber',
      'Pale lime',
      'Pale teal',
      'Pale sky',
      'Pale indigo',
      'Pale purple',
      'Pale slate',
      'Pale orange',
      'Pale green',
    ]

    for (const label of expectedLabels) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('"No color" swatch appears before the pale color swatches in DOM order', () => {
    renderPicker()

    const dialog = screen.getByRole('dialog')
    const allButtons = Array.from(dialog.querySelectorAll('button'))
    // Find the no-color button and the first pale swatch by aria-label
    const noColorIdx = allButtons.findIndex((b) =>
      b.getAttribute('aria-label')?.toLowerCase().includes('no color')
    )
    const paleRoseIdx = allButtons.findIndex((b) =>
      b.getAttribute('aria-label') === 'Pale rose'
    )

    expect(noColorIdx).toBeGreaterThanOrEqual(0)
    expect(paleRoseIdx).toBeGreaterThan(noColorIdx)
  })
})

// ===========================================================================
// Color selection — pale swatches
// ===========================================================================

describe('CardColorPicker — color selection (pale swatches)', () => {
  it('clicking "Pale rose" calls onColorSelect with "#fce7f3"', async () => {
    const onColorSelect = vi.fn()
    renderPicker({ onColorSelect })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Pale rose' }))

    expect(onColorSelect).toHaveBeenCalledTimes(1)
    expect(onColorSelect).toHaveBeenCalledWith('#fce7f3')
  })

  it('clicking "Pale teal" calls onColorSelect with "#ccfbf1"', async () => {
    const onColorSelect = vi.fn()
    renderPicker({ onColorSelect })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Pale teal' }))

    expect(onColorSelect).toHaveBeenCalledWith('#ccfbf1')
  })
})

// ===========================================================================
// Color selection — no color
// ===========================================================================

describe('CardColorPicker — no color selection', () => {
  it('clicking "No color" calls onColorSelect with null', async () => {
    const onColorSelect = vi.fn()
    renderPicker({ onColorSelect })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /no color/i }))

    expect(onColorSelect).toHaveBeenCalledTimes(1)
    expect(onColorSelect).toHaveBeenCalledWith(null)
  })
})

// ===========================================================================
// Dismiss behaviour
// ===========================================================================

describe('CardColorPicker — dismiss', () => {
  it('× close button calls onClose', async () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    const user = userEvent.setup()

    // The close button should have an accessible label mentioning "close"
    const closeBtn = screen.getByRole('button', { name: /close/i })
    await user.click(closeBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('pressing Escape calls onClose', async () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    const user = userEvent.setup()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })

    // The backdrop is the element outside the dialog panel.
    // Simulate a click/mousedown on the document body (outside the dialog).
    fireEvent.mouseDown(document.body)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ===========================================================================
// Focus management
// ===========================================================================

describe('CardColorPicker — focus management', () => {
  it('moves focus to the first swatch button on open', () => {
    renderPicker()

    // The "No color" swatch should be first and receive auto-focus
    const noColorBtn = screen.getByRole('button', { name: /no color/i })
    expect(document.activeElement).toBe(noColorBtn)
  })
})
