/**
 * Tests for BoardSettingsModal component.
 *
 * BoardSettingsModal wraps a native <dialog> element.
 * The Automation tab is the default active tab.
 *
 * Constraints from UI/UX design doc:
 *  - Native <dialog> element (NOT a div with role="dialog")
 *  - Automation tab is default active
 *  - Close button calls onClose
 *
 * Covers:
 *  - Modal content renders when open=true
 *  - Modal does not render visible content when open=false
 *  - Close button calls onClose callback
 *  - Automation tab is the default active tab when modal opens
 *  - Automation panel contains a webhook URL input (NewRuleForm is present)
 *  - Automation panel contains Delivery History section
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mock } from 'vitest'

import * as hooks from '@/api/hooks'
import { BoardSettingsModal } from '@/components/BoardSettings/BoardSettingsModal'

// ---------------------------------------------------------------------------
// Mock all automation hooks so child components don't throw
// ---------------------------------------------------------------------------
vi.mock('@/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/hooks')>()
  return {
    ...actual,
    useAutomationRules: vi.fn(),
    useCreateAutomationRule: vi.fn(),
    useDeleteAutomationRule: vi.fn(),
    usePatchAutomationRuleEnabled: vi.fn(),
    useWebhookDeliveries: vi.fn(),
  }
})

const mockedUseAutomationRules = hooks.useAutomationRules as Mock
const mockedUseCreateAutomationRule = hooks.useCreateAutomationRule as Mock
const mockedUseDeleteAutomationRule = hooks.useDeleteAutomationRule as Mock
const mockedUsePatchAutomationRuleEnabled = hooks.usePatchAutomationRuleEnabled as Mock
const mockedUseWebhookDeliveries = hooks.useWebhookDeliveries as Mock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function makeMutationMock() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null, reset: vi.fn() }
}

function makeQueryMock(data: unknown[] = []) {
  return { data, isLoading: false, isError: false, refetch: vi.fn() }
}

function renderModal(props: { open: boolean; onClose?: () => void; boardId?: string }) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <BoardSettingsModal
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        boardId={props.boardId ?? 'board-1'}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseAutomationRules.mockReturnValue(makeQueryMock())
  mockedUseCreateAutomationRule.mockReturnValue(makeMutationMock())
  mockedUseDeleteAutomationRule.mockReturnValue(makeMutationMock())
  mockedUsePatchAutomationRuleEnabled.mockReturnValue(makeMutationMock())
  mockedUseWebhookDeliveries.mockReturnValue(makeQueryMock())
})

// ===========================================================================
// Open / closed state
// ===========================================================================

describe('BoardSettingsModal — open/closed state', () => {
  it('renders modal content when open=true', () => {
    renderModal({ open: true })

    // Should find a heading or recognizable modal content
    const heading =
      screen.queryByRole('heading', { name: /board settings/i }) ??
      screen.queryByText(/board settings/i) ??
      screen.queryByText(/automation/i)
    expect(heading).toBeInTheDocument()
  })

  it('does not render visible modal content when open=false', () => {
    renderModal({ open: false })

    // Either absent from DOM or hidden via the <dialog> element's closed state
    const heading =
      screen.queryByRole('heading', { name: /board settings/i }) ??
      screen.queryByText(/board settings/i)

    // The dialog may be in the DOM but invisible (hidden attribute), or absent entirely
    if (heading) {
      // If present, the dialog element must not be open (native <dialog> behavior)
      const dialog = document.querySelector('dialog')
      expect(dialog).not.toHaveAttribute('open')
    }
    // If heading not found at all, the test passes — content is not visible
  })
})

// ===========================================================================
// Close button
// ===========================================================================

describe('BoardSettingsModal — close button', () => {
  it('calls onClose when the close (×) button is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderModal({ open: true, onClose })

    const closeBtn = screen.getByRole('button', { name: /close|dismiss|×|✕/i })
    await user.click(closeBtn)

    expect(onClose).toHaveBeenCalledOnce()
  })
})

// ===========================================================================
// Automation tab is default active
// ===========================================================================

describe('BoardSettingsModal — Automation tab default', () => {
  it('shows the Automation tab/panel by default when the modal opens', () => {
    renderModal({ open: true })

    // The Automation tab label or panel heading should be visible
    expect(
      screen.queryByText(/automation/i) ?? screen.queryByRole('tab', { name: /automation/i }),
    ).toBeInTheDocument()
  })

  it('renders a webhook URL input in the Automation panel (NewRuleForm is present)', () => {
    renderModal({ open: true })

    // NewRuleForm should be visible as the default content
    const urlInput = screen.queryByRole('textbox', { name: /webhook url/i })
    expect(urlInput).toBeInTheDocument()
  })

  it('renders a Delivery History section in the Automation panel', () => {
    renderModal({ open: true })

    const historySection =
      screen.queryByText(/delivery history/i) ??
      screen.queryByRole('heading', { name: /delivery history/i })
    expect(historySection).toBeInTheDocument()
  })
})
