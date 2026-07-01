/**
 * Tests for RulesList component.
 *
 * RulesList displays existing automation rules for a board.
 * Each rule has: webhook URL, enable toggle, delete button.
 * Uses useDeleteAutomationRule and usePatchAutomationRuleEnabled hooks.
 *
 * Covers:
 *  - Empty state when rules array is empty
 *  - Rule webhook URL is visible in the list
 *  - Delete button calls delete mutation with the rule id
 *  - Enable toggle calls patch mutation with { ruleId, enabled: !current }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { RulesList } from '@/components/BoardSettings/RulesList'
import type { AutomationRule } from '@/types'

// ---------------------------------------------------------------------------
// Mock the hooks module
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/hooks')>()
  return {
    ...actual,
    useDeleteAutomationRule: vi.fn(),
    usePatchAutomationRuleEnabled: vi.fn(),
  }
})

const mockedUseDeleteAutomationRule = hooks.useDeleteAutomationRule as Mock
const mockedUsePatchAutomationRuleEnabled = hooks.usePatchAutomationRuleEnabled as Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function makeMutationMock(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
    ...overrides,
  }
}

function renderList(rules: AutomationRule[]) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <RulesList rules={rules} />
    </QueryClientProvider>,
  )
}

function makeRule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: 'rule-1',
    board_id: 'board-1',
    trigger_type: 'card.moved.done',
    webhook_url: 'https://hooks.example.com/abc',
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// Empty state
// ===========================================================================

describe('RulesList — empty state', () => {
  it('renders an empty state message when no rules are provided', () => {
    mockedUseDeleteAutomationRule.mockReturnValue(makeMutationMock())
    mockedUsePatchAutomationRuleEnabled.mockReturnValue(makeMutationMock())

    renderList([])

    const emptyMsg =
      screen.queryByText(/no rules/i) ??
      screen.queryByText(/no automations/i) ??
      screen.queryByText(/none yet/i)
    expect(emptyMsg).toBeInTheDocument()
  })
})

// ===========================================================================
// Renders rule content
// ===========================================================================

describe('RulesList — rule content', () => {
  it('renders the webhook URL masked for security', () => {
    mockedUseDeleteAutomationRule.mockReturnValue(makeMutationMock())
    mockedUsePatchAutomationRuleEnabled.mockReturnValue(makeMutationMock())

    renderList([makeRule({ webhook_url: 'https://hooks.example.com/abc' })])

    // Full URL must not appear — only host + masked path
    expect(screen.queryByText('https://hooks.example.com/abc')).not.toBeInTheDocument()
    expect(screen.getByText('https://hooks.example.com/***')).toBeInTheDocument()
  })
})

// ===========================================================================
// Delete mutation
// ===========================================================================

describe('RulesList — delete rule', () => {
  it('calls delete mutation with the rule id when the delete button is clicked', async () => {
    const deleteMutateFn = vi.fn()
    mockedUseDeleteAutomationRule.mockReturnValue(
      makeMutationMock({ mutate: deleteMutateFn }),
    )
    mockedUsePatchAutomationRuleEnabled.mockReturnValue(makeMutationMock())

    const user = userEvent.setup()
    renderList([makeRule({ id: 'rule-42' })])

    const deleteBtn = screen.getByRole('button', { name: /delete|remove/i })
    await user.click(deleteBtn)

    expect(deleteMutateFn).toHaveBeenCalledOnce()
    expect(deleteMutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule-42' }),
      expect.anything(),
    )
  })
})

// ===========================================================================
// Enable toggle mutation
// ===========================================================================

describe('RulesList — enable toggle', () => {
  it('calls patch mutation with { ruleId, enabled: false } when toggling an enabled rule off', async () => {
    const patchMutateFn = vi.fn()
    mockedUseDeleteAutomationRule.mockReturnValue(makeMutationMock())
    mockedUsePatchAutomationRuleEnabled.mockReturnValue(
      makeMutationMock({ mutate: patchMutateFn }),
    )

    const user = userEvent.setup()
    renderList([makeRule({ id: 'rule-1', enabled: true })])

    // Find the toggle (checkbox or switch) and click it
    const toggle = screen.getByRole('checkbox', { name: /enable|enabled|active/i })
    await user.click(toggle)

    expect(patchMutateFn).toHaveBeenCalledOnce()
    expect(patchMutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule-1', enabled: false }),
      expect.anything(),
    )
  })

  it('calls patch mutation with { ruleId, enabled: true } when toggling a disabled rule on', async () => {
    const patchMutateFn = vi.fn()
    mockedUseDeleteAutomationRule.mockReturnValue(makeMutationMock())
    mockedUsePatchAutomationRuleEnabled.mockReturnValue(
      makeMutationMock({ mutate: patchMutateFn }),
    )

    const user = userEvent.setup()
    renderList([makeRule({ id: 'rule-2', enabled: false })])

    const toggle = screen.getByRole('checkbox', { name: /enable|enabled|active/i })
    await user.click(toggle)

    expect(patchMutateFn).toHaveBeenCalledOnce()
    expect(patchMutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule-2', enabled: true }),
      expect.anything(),
    )
  })
})
