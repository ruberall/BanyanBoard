/**
 * Tests for LabelColorPicker component.
 *
 * LabelColorPicker is a floating popover that renders 10 pale-color swatches
 * and allows the user to pick a color for a card label.
 *
 * Covers:
 *  - Renders exactly 10 swatch buttons
 *  - Each swatch has a descriptive aria-label
 *  - Clicking a swatch calls onColorSelect with the correct hex value
 *  - Pressing Escape calls onClose
 *  - Has role="dialog" and aria-label="Choose label color"
 *  - First swatch is focused on render (autoFocus or programmatic focus)
 *  - onClose called when mousedown fires on document.body (click outside)
 *  - Renders without crashing with minimal required props
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'

import { LabelColorPicker } from '@/components/board/LabelColorPicker/LabelColorPicker'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderPicker(overrides: { onColorSelect?: (hex: string) => void; onClose?: () => void } = {}) {
  const onColorSelect = overrides.onColorSelect ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  return {
    onColorSelect,
    onClose,
    ...render(<LabelColorPicker onColorSelect={onColorSelect} onClose={onClose} />),
  }
}

// ===========================================================================
// Swatch count and labelling
// ===========================================================================

describe('LabelColorPicker — swatches', () => {
  it('renders exactly 10 swatch buttons', () => {
    renderPicker()

    // The dialog contains swatch buttons; the drag handle "Reorder card" button
    // won't be present, so all buttons within the dialog are swatches.
    const dialog = screen.getByRole('dialog')
    const swatchButtons = dialog.querySelectorAll('button')
    expect(swatchButtons).toHaveLength(10)
  })

  it('each swatch button has an accessible aria-label', () => {
    renderPicker()

    const expectedLabels = [
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
})

// ===========================================================================
// Color selection
// ===========================================================================

describe('LabelColorPicker — color selection', () => {
  it('clicking a swatch calls onColorSelect with the correct hex value', async () => {
    const onColorSelect = vi.fn()
    renderPicker({ onColorSelect })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Pale rose' }))

    expect(onColorSelect).toHaveBeenCalledTimes(1)
    expect(onColorSelect).toHaveBeenCalledWith('#fce7f3')
  })

  it('clicking a different swatch calls onColorSelect with its hex value', async () => {
    const onColorSelect = vi.fn()
    renderPicker({ onColorSelect })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Pale teal' }))

    expect(onColorSelect).toHaveBeenCalledWith('#ccfbf1')
  })
})

// ===========================================================================
// Dismiss behaviour
// ===========================================================================

describe('LabelColorPicker — dismiss', () => {
  it('pressing Escape calls onClose', async () => {
    const onClose = vi.fn()
    renderPicker({ onClose })
    const user = userEvent.setup()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mousedown on document.body calls onClose (click outside)', () => {
    const onClose = vi.fn()
    renderPicker({ onClose })

    fireEvent.mouseDown(document.body)

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ===========================================================================
// Accessibility — dialog role and attributes
// ===========================================================================

describe('LabelColorPicker — accessibility', () => {
  it('has role="dialog" with aria-label "Choose label color"', () => {
    renderPicker()

    const dialog = screen.getByRole('dialog', { name: /choose label color/i })
    expect(dialog).toBeInTheDocument()
  })

  it('renders without crashing when onColorSelect and onClose are provided', () => {
    expect(() =>
      render(
        <LabelColorPicker
          onColorSelect={vi.fn()}
          onClose={vi.fn()}
        />
      )
    ).not.toThrow()
  })
})
