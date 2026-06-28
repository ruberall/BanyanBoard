/**
 * Type-level tests for WorkflowWarning and BoardWithColumns.warnings (TASK-017 Phase 4).
 *
 * These tests verify the TypeScript shape of the WorkflowWarning type
 * and the optional warnings field on BoardWithColumns.
 *
 * WorkflowWarning matches the backend shape:
 *   { code: string; message: string; details?: Array<{ field: string; error: string }> }
 *
 * Covers:
 *  - WorkflowWarning type has required fields (code, message) and optional details
 *  - BoardWithColumns accepts optional warnings?: WorkflowWarning[]
 *  - BoardWithColumns without warnings is still valid (field is optional)
 */
import { describe, it, expect } from 'vitest'
import type { WorkflowWarning, BoardWithColumns } from '@/types'

// ===========================================================================
// WorkflowWarning type shape
// ===========================================================================

describe('WorkflowWarning type', () => {
  it('accepts a warning with required fields (code, message) and no details', () => {
    const warning: WorkflowWarning = {
      code: 'WORKFLOW_ACTION_FAILED',
      message: 'Stale rule failed for card card-1',
    }

    expect(warning.code).toBe('WORKFLOW_ACTION_FAILED')
    expect(warning.message).toContain('card-1')
    expect(warning.details).toBeUndefined()
  })

  it('accepts a warning with optional details array', () => {
    const warning: WorkflowWarning = {
      code: 'WORKFLOW_ACTION_FAILED',
      message: 'Stale rule failed',
      details: [{ field: 'column_id', error: 'DB write failed' }],
    }

    expect(warning.details).toHaveLength(1)
    expect(warning.details?.[0].field).toBe('column_id')
  })
})

// ===========================================================================
// BoardWithColumns.warnings — optional field
// ===========================================================================

describe('BoardWithColumns type — warnings field', () => {
  it('accepts BoardWithColumns with a populated warnings array', () => {
    const board: BoardWithColumns = {
      id: 'board-1',
      name: 'Test Board',
      created_at: '2026-01-01T00:00:00Z',
      columns: [],
      warnings: [
        {
          code: 'WORKFLOW_ACTION_FAILED',
          message: 'Stale rule failed for card card-1',
          details: [{ field: 'column_id', error: 'DB write failed' }],
        },
      ],
    }

    expect(board.warnings).toHaveLength(1)
    expect(board.warnings?.[0].code).toBe('WORKFLOW_ACTION_FAILED')
  })

  it('accepts BoardWithColumns without warnings (field is optional)', () => {
    const board: BoardWithColumns = {
      id: 'board-2',
      name: 'Board Without Warnings',
      created_at: '2026-01-01T00:00:00Z',
      columns: [],
      // warnings omitted intentionally — must be valid without it
    }

    expect(board.warnings).toBeUndefined()
  })

  it('accepts BoardWithColumns with an empty warnings array', () => {
    const board: BoardWithColumns = {
      id: 'board-3',
      name: 'Board Empty Warnings',
      created_at: '2026-01-01T00:00:00Z',
      columns: [],
      warnings: [],
    }

    expect(board.warnings).toEqual([])
  })
})
