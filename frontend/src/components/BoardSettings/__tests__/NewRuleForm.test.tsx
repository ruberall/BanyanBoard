/**
 * Tests for NewRuleForm component.
 *
 * NewRuleForm is a controlled form inside the BoardSettings Automation tab.
 * It collects: trigger type (select), webhook URL (text input), enabled (checkbox).
 * On valid submit it calls useCreateAutomationRule.mutate.
 * Client-side URL validation fires on blur (before submit).
 *
 * Covers:
 *  - AC-ENTRY-1: submitting a valid form calls mutate with correct args
 *  - Form inputs reset after onSuccess callback fires
 *  - URL validation on blur: invalid URL shows inline error
 *  - Empty URL is blocked: mutate NOT called
 *  - Non-HTTP scheme (ftp://) is blocked on blur with inline error
 *  - API error displays via ErrorBanner with role="alert"
 *  - Enable checkbox defaults to checked
 *
 * Mocking strategy:
 *  - vi.mock('@/api/hooks') — mock useCreateAutomationRule
 *  - Wrap in QueryClientProvider (the hook internally calls useQueryClient)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { NewRuleForm } from '@/components/BoardSettings/NewRuleForm'

// ---------------------------------------------------------------------------
// Module mock — only override automation hooks; keep the rest from actual module
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/hooks')>()
  return {
    ...actual,
    useCreateAutomationRule: vi.fn(),
  }
})

const mockedUseCreateAutomationRule = hooks.useCreateAutomationRule as Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
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

function renderForm(boardId = 'board-1') {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <NewRuleForm boardId={boardId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// AC-ENTRY-1: Happy path submit
// ===========================================================================

describe('NewRuleForm — happy path submit (AC-ENTRY-1)', () => {
  it('calls mutate with correct args when trigger + valid URL are filled and submitted', async () => {
    const mutateFn = vi.fn()
    mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock({ mutate: mutateFn }))

    const user = userEvent.setup()
    renderForm('board-1')

    // Select trigger type
    const triggerSelect = screen.getByRole('combobox')
    await user.selectOptions(triggerSelect, 'card.moved.done')

    // Fill webhook URL
    const urlInput = screen.getByRole('textbox', { name: /webhook url/i })
    await user.clear(urlInput)
    await user.type(urlInput, 'https://example.com/hook')

    // Submit
    await user.click(screen.getByRole('button', { name: /add rule|save rule|create rule|submit/i }))

    expect(mutateFn).toHaveBeenCalledOnce()
    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: 'board-1',
        triggerType: 'card.moved.done',
        webhookUrl: 'https://example.com/hook',
        enabled: true,
      }),
      expect.anything(),
    )
  })
})

// ===========================================================================
// Form reset after success
// ===========================================================================

describe('NewRuleForm — resets after success', () => {
  it('clears the URL input after onSuccess fires', async () => {
    const mutateFn = vi.fn().mockImplementation(
      (_vars: unknown, opts: { onSuccess?: () => void }) => {
        opts?.onSuccess?.()
      },
    )
    mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock({ mutate: mutateFn }))

    const user = userEvent.setup()
    renderForm()

    const urlInput = screen.getByRole('textbox', { name: /webhook url/i })
    await user.type(urlInput, 'https://example.com/hook')
    await user.click(screen.getByRole('button', { name: /add rule|save rule|create rule|submit/i }))

    await waitFor(() => {
      expect(urlInput).toHaveValue('')
    })
  })
})

// ===========================================================================
// URL validation on blur
// ===========================================================================

describe('NewRuleForm — URL validation on blur', () => {
  it('shows an inline error when an invalid URL is entered and the field is blurred', async () => {
    mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock())

    const user = userEvent.setup()
    renderForm()

    const urlInput = screen.getByRole('textbox', { name: /webhook url/i })
    await user.type(urlInput, 'not-a-url')
    await user.tab() // blur

    // Some inline error mentioning URL or validity should appear
    const errMsg =
      screen.queryByText(/url/i) ??
      screen.queryByText(/valid/i) ??
      screen.queryByText(/invalid/i)
    expect(errMsg).toBeInTheDocument()
  })

  it('shows an inline error for a non-HTTP scheme (ftp://) on blur', async () => {
    mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock())

    const user = userEvent.setup()
    renderForm()

    const urlInput = screen.getByRole('textbox', { name: /webhook url/i })
    await user.type(urlInput, 'ftp://example.com')
    await user.tab() // blur

    const errMsg =
      screen.queryByText(/url/i) ??
      screen.queryByText(/http/i) ??
      screen.queryByText(/valid/i) ??
      screen.queryByText(/invalid/i)
    expect(errMsg).toBeInTheDocument()
  })

  it('does NOT call mutate when URL is empty and form is submitted', async () => {
    const mutateFn = vi.fn()
    mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock({ mutate: mutateFn }))

    const user = userEvent.setup()
    renderForm()

    // Don't fill URL — submit directly
    await user.click(screen.getByRole('button', { name: /add rule|save rule|create rule|submit/i }))

    expect(mutateFn).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// API error renders ErrorBanner
// ===========================================================================

describe('NewRuleForm — API error', () => {
  it('renders ErrorBanner with role="alert" when the mutation returns an error', async () => {
    const mutateFn = vi.fn().mockImplementation(
      (_vars: unknown, opts: { onError?: (err: Error) => void }) => {
        opts?.onError?.(new Error('Webhook URL is not reachable'))
      },
    )
    mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock({ mutate: mutateFn }))

    const user = userEvent.setup()
    renderForm()

    // Fill a valid URL so validation passes and mutate is called
    const urlInput = screen.getByRole('textbox', { name: /webhook url/i })
    await user.type(urlInput, 'https://example.com/hook')
    await user.click(screen.getByRole('button', { name: /add rule|save rule|create rule|submit/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // Generic message used to avoid echoing back server messages that may contain the webhook URL
    expect(screen.getByText(/Failed to add rule/i)).toBeInTheDocument()
  })
})

// ===========================================================================
// Enable checkbox defaults to checked
// ===========================================================================

describe('NewRuleForm — enable checkbox default', () => {
  it('renders the "Enable rule immediately" checkbox checked by default', () => {
    mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock())

    renderForm()

    // Look for a checkbox labeled "Enable rule immediately" or similar
    const checkbox = screen.getByRole('checkbox', { name: /enable rule/i })
    expect(checkbox).toBeChecked()
  })
})
