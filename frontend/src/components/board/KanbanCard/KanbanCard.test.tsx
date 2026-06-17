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
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    render(<KanbanCard card={makeCard({ labels: ['bug', 'urgent'] })} />)

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
// Phase 4 — Drag handle (accessible affordances)
// ===========================================================================
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
