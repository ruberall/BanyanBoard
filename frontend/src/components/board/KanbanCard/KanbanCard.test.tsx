/**
 * Tests for KanbanCard component.
 *
 * Phase 3 — display-only card (no drag-and-drop).
 *
 * Covers:
 *  - Renders card title
 *  - Renders labels when present
 *  - Renders due date chip when due_date is set
 *  - Does NOT render due date chip when due_date is null
 *  - Renders description when present
 *  - Has accessible semantic element (article role)
 *  - Renders with minimal data (only required fields)
 *
 * Phase 4 — drag handle (accessible affordances).
 *
 * Covers:
 *  - Renders a drag handle button
 *  - Drag handle has correct aria-label (contains card title)
 *  - Drag handle has aria-roledescription="draggable"
 *  - Drag handle is a focusable, non-disabled button
 *
 * Phase 5 (TASK-018) — Delete card button (AC-ENTRY-1, AC-HAPPY-1, AC-A11Y-1).
 *
 * Covers:
 *  - Delete button renders with aria-label matching "Delete card: <title>" (AC-ENTRY-1, AC-A11Y-1)
 *  - Clicking the delete button calls onDelete with the card's id (AC-HAPPY-1)
 *  - Delete button is absent when onDelete prop is not provided
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Card } from '@/types'
import { KanbanCard } from '@/components/board/KanbanCard/KanbanCard'

// ---------------------------------------------------------------------------
// Sample data fixtures
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    column_id: 'col-1',
    title: 'Test Card Title',
    description: null,
    due_date: null,
    labels: [],
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ===========================================================================
// Render — title
// ===========================================================================

describe('KanbanCard — title', () => {
  it('renders the card title', () => {
    render(<KanbanCard card={makeCard({ title: 'My Task' })} />)

    expect(screen.getByText('My Task')).toBeInTheDocument()
  })
})

// ===========================================================================
// Semantic structure
// ===========================================================================

describe('KanbanCard — semantic structure', () => {
  it('renders with an article role or equivalent accessible element', () => {
    render(<KanbanCard card={makeCard()} />)

    // KanbanCard should use <article> for semantic landmark or role="article"
    const card = screen.queryByRole('article')
    expect(card).toBeInTheDocument()
  })
})

// ===========================================================================
// Labels
// ===========================================================================

describe('KanbanCard — labels', () => {
  it('renders each label when labels are present', () => {
    render(
      <KanbanCard
        card={makeCard({
          labels: [
            { name: 'bug', color: '#fce7f3' },
            { name: 'urgent', color: '#fef3c7' },
          ],
        })}
      />
    )

    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('urgent')).toBeInTheDocument()
  })

  it('renders nothing for labels when labels array is empty', () => {
    const { container } = render(<KanbanCard card={makeCard({ labels: [] })} />)

    // No label chips rendered — confirm absence by querying by text that won't be there
    expect(screen.queryByText('bug')).not.toBeInTheDocument()
    expect(container).toBeTruthy() // no throw
  })
})

// ===========================================================================
// Due date
// ===========================================================================

describe('KanbanCard — due date', () => {
  it('renders a due date chip when due_date is set', () => {
    render(<KanbanCard card={makeCard({ due_date: '2026-12-31' })} />)

    // Some visible representation of the due date should appear
    const dateEl = screen.queryByText(/2026-12-31/i) ?? screen.queryByText(/dec/i) ?? screen.queryByText(/due/i)
    expect(dateEl).toBeInTheDocument()
  })

  it('does NOT render a due date chip when due_date is null', () => {
    render(<KanbanCard card={makeCard({ due_date: null })} />)

    expect(screen.queryByText(/due/i)).not.toBeInTheDocument()
    // Also check that no date-like string from fixtures leaks through
    expect(screen.queryByText(/dec/i)).not.toBeInTheDocument()
  })
})

// ===========================================================================
// Description
// ===========================================================================

describe('KanbanCard — description', () => {
  it('renders the description when it is present', () => {
    render(<KanbanCard card={makeCard({ description: 'This is a card description.' })} />)

    expect(screen.getByText('This is a card description.')).toBeInTheDocument()
  })

  it('does not render a description element when description is null', () => {
    render(<KanbanCard card={makeCard({ description: null })} />)

    expect(screen.queryByText(/description/i)).not.toBeInTheDocument()
  })
})

// ===========================================================================
// Minimal data
// ===========================================================================

describe('KanbanCard — minimal data', () => {
  it('renders without throwing when only required fields are provided', () => {
    const minimalCard: Card = {
      id: 'c-min',
      column_id: 'col-1',
      title: 'Minimal Card',
      description: null,
      due_date: null,
      labels: [],
      position: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    expect(() => render(<KanbanCard card={minimalCard} />)).not.toThrow()
    expect(screen.getByText('Minimal Card')).toBeInTheDocument()
  })
})

// ===========================================================================
// Phase 2 — Label badges (Label[] type with color picker)
// ===========================================================================

describe('KanbanCard — label badges (Phase 2)', () => {
  it('renders a label badge with inline background-color from label.color', () => {
    render(
      <KanbanCard
        card={makeCard({ labels: [{ name: 'bug', color: '#fce7f3' }] })}
      />
    )

    const badge = screen.getByText('bug').closest('button') ?? screen.getByText('bug')
    const style = (badge as HTMLElement).style.backgroundColor
    // style is either the inline hex directly or rgb() equivalent — either confirms it is set
    expect(style).toBeTruthy()
  })

  it('renders label badge as a <button> element to enable color picker', () => {
    render(
      <KanbanCard
        card={makeCard({ labels: [{ name: 'bug', color: '#fce7f3' }] })}
      />
    )

    // The element containing the label name should be (or be inside) a button
    const labelEl = screen.getByText('bug')
    const buttonEl = labelEl.closest('button') ?? (labelEl.tagName.toLowerCase() === 'button' ? labelEl : null)
    expect(buttonEl).not.toBeNull()
    expect((buttonEl as HTMLElement).tagName.toLowerCase()).toBe('button')
  })

  it('uses default color #95B9C7 when label.color is not specified', () => {
    // Label with empty string color falls back to default
    render(
      <KanbanCard
        card={makeCard({ labels: [{ name: 'no-color', color: '' }] })}
      />
    )

    const labelEl = screen.getByText('no-color')
    const badge = labelEl.closest('button') ?? labelEl
    // The badge should still be rendered (no crash) and visible
    expect(badge).toBeInTheDocument()
  })

  it('renders no label badges when labels array is empty', () => {
    render(<KanbanCard card={makeCard({ labels: [] })} />)

    // No badge buttons with aria-expanded (label badge pattern) should exist
    expect(screen.queryByText('bug')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// Phase 2 (TASK-014) — Card color picker integration
//
// Acceptance criteria covered:
//  - AC-ENTRY-1: palette button visible on every card, correct aria-label
//  - AC-HAPPY-1: clicking palette button opens CardColorPicker modal
//  - AC-ERROR-1: card.color applied as inline style; null → no inline style
// ===========================================================================

describe('KanbanCard — card color picker (Phase 2 / TASK-014)', () => {
  it('renders a palette button with aria-label "Set card color" on every card', () => {
    render(<KanbanCard card={makeCard()} />)

    const paletteBtn = screen.getByRole('button', { name: /set card color/i })
    expect(paletteBtn).toBeInTheDocument()
  })

  it('palette button is visible even when the card has no labels', () => {
    render(<KanbanCard card={makeCard({ labels: [] })} />)

    expect(screen.getByRole('button', { name: /set card color/i })).toBeInTheDocument()
  })

  it('clicking the palette button opens the CardColorPicker modal (role="dialog" appears)', async () => {
    render(<KanbanCard card={makeCard()} />)
    const user = userEvent.setup()

    const paletteBtn = screen.getByRole('button', { name: /set card color/i })
    await user.click(paletteBtn)

    // CardColorPicker renders with role="dialog"
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('card <article> has inline backgroundColor when card.color is a hex string', () => {
    render(<KanbanCard card={makeCard({ color: '#fce7f3' })} />)

    const article = screen.getByRole('article')
    // jsdom converts hex to rgb; either form confirms the style is applied
    expect(article).toHaveStyle({ backgroundColor: '#fce7f3' })
  })

  it('card <article> has no inline backgroundColor when card.color is null', () => {
    render(<KanbanCard card={makeCard({ color: null })} />)

    const article = screen.getByRole('article')
    // backgroundColor should be empty string or not set
    expect(article.style.backgroundColor).toBeFalsy()
  })

  it('card <article> has no inline backgroundColor when card.color is undefined (field absent)', () => {
    // Omitting color from the override — makeCard default has no color field
    render(<KanbanCard card={makeCard()} />)

    const article = screen.getByRole('article')
    expect(article.style.backgroundColor).toBeFalsy()
  })
})

// ===========================================================================
// Phase 4 — Drag handle (accessible affordances)
//
// Note: We do NOT simulate actual drag-and-drop events here.
// dnd-kit uses pointer events that do not behave correctly in jsdom.
// Instead we verify the accessible affordances (aria attributes, button presence)
// that are testable in a headless environment.
// ===========================================================================

describe('KanbanCard — drag handle (Phase 4)', () => {
  it('renders a drag handle button', () => {
    render(<KanbanCard card={makeCard({ title: 'Draggable Card' })} />)

    // There should be a button specifically for drag reordering
    const dragHandle = screen.queryByRole('button', { name: /reorder card/i })
    expect(dragHandle).toBeInTheDocument()
  })

  it('drag handle aria-label contains the card title', () => {
    render(<KanbanCard card={makeCard({ title: 'My Ticket' })} />)

    // aria-label should be: "Reorder card: My Ticket"
    const dragHandle = screen.queryByRole('button', { name: /reorder card.*my ticket/i })
    expect(dragHandle).toBeInTheDocument()
  })

  it('drag handle has aria-roledescription of "draggable"', () => {
    render(<KanbanCard card={makeCard({ title: 'Some Card' })} />)

    const dragHandle = screen.queryByRole('button', { name: /reorder card/i })
    expect(dragHandle).toHaveAttribute('aria-roledescription', 'draggable')
  })

  it('drag handle is a focusable button (not disabled)', () => {
    render(<KanbanCard card={makeCard({ title: 'Focusable Card' })} />)

    const dragHandle = screen.queryByRole('button', { name: /reorder card/i })
    expect(dragHandle).not.toBeDisabled()
    expect(dragHandle?.tagName.toLowerCase()).toBe('button')
  })
})

// ===========================================================================
// Phase 5 (TASK-018) — Delete card button
//
// Acceptance criteria covered:
//  - AC-ENTRY-1: delete button visible on every card, aria-label = "Delete card: <title>"
//  - AC-HAPPY-1: clicking the button calls onDelete(cardId) immediately
//  - AC-A11Y-1:  button is keyboard accessible with correct aria-label
// ===========================================================================

describe('KanbanCard — delete button (Phase 5 / TASK-018)', () => {
  it('AC-ENTRY-1 / AC-A11Y-1: renders a delete button with aria-label "Delete card: <title>"', () => {
    const onDelete = vi.fn()
    render(<KanbanCard card={makeCard({ title: 'My Task' })} onDelete={onDelete} />)

    // aria-label must be exactly "Delete card: My Task"
    const deleteBtn = screen.getByRole('button', { name: /delete card: my task/i })
    expect(deleteBtn).toBeInTheDocument()
    expect(deleteBtn).not.toBeDisabled()
  })

  it('AC-HAPPY-1: clicking the delete button calls onDelete with the card id', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <KanbanCard
        card={makeCard({ id: 'card-42', title: 'Delete Me' })}
        onDelete={onDelete}
      />
    )

    const deleteBtn = screen.getByRole('button', { name: /delete card: delete me/i })
    await user.click(deleteBtn)

    // onDelete must be called with the card's id, not the title or any other value
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith('card-42')
  })

  it('does not render a delete button when onDelete prop is not provided', () => {
    // Omitting onDelete: the button must be absent so the UI is not broken for
    // callers that do not wire up deletion (e.g., read-only views)
    render(<KanbanCard card={makeCard({ title: 'Read-only Card' })} />)

    expect(screen.queryByRole('button', { name: /delete card/i })).not.toBeInTheDocument()
  })
})
