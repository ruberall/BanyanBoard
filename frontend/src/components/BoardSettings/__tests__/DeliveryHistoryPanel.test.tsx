/**
 * Tests for DeliveryHistoryPanel component.
 *
 * DeliveryHistoryPanel displays recent webhook_deliveries rows for a board.
 * It uses useWebhookDeliveries(boardId). Statuses: pending | delivered | failed | exhausted.
 * Status cells MUST show text (non-color-only) via StatusBadge.
 *
 * Covers:
 *  - Empty state renders when deliveries array is empty
 *  - A delivered row renders StatusBadge with visible "Delivered" text
 *  - Status cells always contain text (non-color-only — WCAG 1.4.1)
 *  - All 4 status text labels are present when deliveries include all statuses
 *  - Refresh button calls the refetch function
 *  - Loading state renders a loading indicator (not an error)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { DeliveryHistoryPanel } from '@/components/BoardSettings/DeliveryHistoryPanel'
import type { WebhookDelivery } from '@/types'

// ---------------------------------------------------------------------------
// Mock the hooks module
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/hooks')>()
  return {
    ...actual,
    useWebhookDeliveries: vi.fn(),
  }
})

const mockedUseWebhookDeliveries = hooks.useWebhookDeliveries as Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function makeQueryMock(overrides: Record<string, unknown> = {}) {
  return {
    data: [] as WebhookDelivery[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderPanel(boardId = 'board-1') {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <DeliveryHistoryPanel boardId={boardId} />
    </QueryClientProvider>,
  )
}

function makeDelivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
  return {
    id: 'delivery-1',
    trigger_execution_id: 'exec-1',
    automation_rule_id: 'rule-1',
    board_id: 'board-1',
    attempt_count: 1,
    status: 'delivered',
    http_response_code: 200,
    error: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// Empty state
// ===========================================================================

describe('DeliveryHistoryPanel — empty state', () => {
  it('renders an empty state message when there are no deliveries', () => {
    mockedUseWebhookDeliveries.mockReturnValue(makeQueryMock({ data: [] }))

    renderPanel()

    // Some empty state text should be visible
    const emptyMsg =
      screen.queryByText(/no deliveries/i) ??
      screen.queryByText(/no history/i) ??
      screen.queryByText(/nothing yet/i)
    expect(emptyMsg).toBeInTheDocument()
  })
})

// ===========================================================================
// Rows with StatusBadge
// ===========================================================================

describe('DeliveryHistoryPanel — rows with StatusBadge', () => {
  it('renders StatusBadge text "Delivered" for a delivered row', () => {
    mockedUseWebhookDeliveries.mockReturnValue(
      makeQueryMock({ data: [makeDelivery({ status: 'delivered' })] }),
    )

    renderPanel()

    expect(screen.getByText('Delivered')).toBeInTheDocument()
  })

  it('status cell contains text, not just a color div (non-color-only constraint)', () => {
    mockedUseWebhookDeliveries.mockReturnValue(
      makeQueryMock({ data: [makeDelivery({ status: 'failed' })] }),
    )

    renderPanel()

    // If the status is text-only color, getByText would fail — this is the red state
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders all 4 status text labels when deliveries include all 4 statuses', () => {
    mockedUseWebhookDeliveries.mockReturnValue(
      makeQueryMock({
        data: [
          makeDelivery({ id: 'd-1', status: 'pending' }),
          makeDelivery({ id: 'd-2', status: 'delivered' }),
          makeDelivery({ id: 'd-3', status: 'failed' }),
          makeDelivery({ id: 'd-4', status: 'exhausted' }),
        ],
      }),
    )

    renderPanel()

    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Delivered')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Exhausted')).toBeInTheDocument()
  })
})

// ===========================================================================
// Refresh button
// ===========================================================================

describe('DeliveryHistoryPanel — refresh button', () => {
  it('calls refetch when the Refresh button is clicked', async () => {
    const refetchFn = vi.fn()
    mockedUseWebhookDeliveries.mockReturnValue(makeQueryMock({ refetch: refetchFn }))

    const user = userEvent.setup()
    renderPanel()

    const refreshBtn = screen.getByRole('button', { name: /refresh/i })
    await user.click(refreshBtn)

    expect(refetchFn).toHaveBeenCalledOnce()
  })
})

// ===========================================================================
// Loading state
// ===========================================================================

describe('DeliveryHistoryPanel — loading state', () => {
  it('renders a loading indicator (not an error) when isLoading is true', () => {
    mockedUseWebhookDeliveries.mockReturnValue(
      makeQueryMock({ isLoading: true, data: undefined }),
    )

    renderPanel()

    // Should show a loading indicator — not show an error alert
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Either a spinner role or loading text should be present
    const loadingIndicator =
      screen.queryByRole('status') ??
      screen.queryByRole('progressbar') ??
      screen.queryByText(/loading/i)
    expect(loadingIndicator).toBeInTheDocument()
  })
})
