import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  listBoards,
  getBoard,
  createBoard,
  deleteBoard,
  listCards,
  createCard,
  moveCard,
  updateCard,
  deleteCard,
  listAutomationRules,
  createAutomationRule,
  patchAutomationRuleEnabled,
  deleteAutomationRule,
  listWebhookDeliveries,
  getCardActivity,
} from '@/api/endpoints'
import type { PaginatedResponse, Board, BoardWithColumns, Card, Label, ApiError, AutomationRule, WebhookDelivery, CardActivityEntry } from '@/types'

const DONE_COLUMN_NAME = 'Done'
const DONE_CARD_COLOR = '#d4edda'

export function useBoards() {
  return useQuery<PaginatedResponse<Board>>({
    queryKey: queryKeys.boards.list(),
    queryFn: listBoards,
  })
}

export function useBoard(id: string) {
  return useQuery<BoardWithColumns>({
    queryKey: queryKeys.boards.detail(id),
    queryFn: () => getBoard(id),
    enabled: !!id, // skip fetch when id is an empty string (e.g. before router params resolve)
  })
}

export function useCards(columnId: string) {
  return useQuery<Card[]>({
    queryKey: queryKeys.cards.byColumn(columnId),
    queryFn: () => listCards(columnId),
    enabled: !!columnId,
  })
}

export function useCreateBoard() {
  const qc = useQueryClient()
  return useMutation<Board, Error, { name: string }>({
    mutationFn: (data) => createBoard(data.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.boards.all }),
  })
}

export function useDeleteBoard() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: deleteBoard,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.boards.all }),
  })
}

export function useCreateCard(columnId: string) {
  const qc = useQueryClient()
  return useMutation<Card, Error, { title: string; description?: string | null }>({
    mutationFn: (data) => createCard(columnId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.cards.byColumn(columnId) }),
  })
}

type UpdateCardVars = { cardId: string; labels: Label[]; color?: string | null }
type UpdateCardCtx = { prevCards: Card[] | undefined }

export function useUpdateCard(columnId: string) {
  const qc = useQueryClient()
  return useMutation<Card, ApiError, UpdateCardVars, UpdateCardCtx>({
    mutationFn: ({ cardId, labels, color }) => updateCard(cardId, { labels, ...(color !== undefined ? { color } : {}) }),
    onMutate: async ({ cardId, labels, color }) => {
      await qc.cancelQueries({ queryKey: queryKeys.cards.byColumn(columnId) })
      const prevCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(columnId))
      qc.setQueryData<Card[]>(queryKeys.cards.byColumn(columnId), (old) =>
        (old ?? []).map((c) => c.id === cardId ? { ...c, labels, ...(color !== undefined ? { color } : {}) } : c)
      )
      return { prevCards }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevCards !== undefined) {
        qc.setQueryData(queryKeys.cards.byColumn(columnId), ctx.prevCards)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cards.byColumn(columnId) })
    },
  })
}

export function useUpdateCardTitle(cardId: string) {
  const qc = useQueryClient()
  return useMutation<Card, ApiError, { title: string }>({
    mutationFn: ({ title }) => updateCard(cardId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cards.all })
    },
  })
}

type DeleteCardCtx = { prevCards: Card[] | undefined }

export function useDeleteCard(columnId: string) {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string, DeleteCardCtx>({
    mutationFn: (cardId) => deleteCard(cardId),
    onMutate: async (cardId) => {
      await qc.cancelQueries({ queryKey: queryKeys.cards.byColumn(columnId) })
      const prevCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(columnId))
      qc.setQueryData<Card[]>(queryKeys.cards.byColumn(columnId), (old) =>
        (old ?? []).filter((c) => c.id !== cardId)
      )
      // Remove the card detail cache entry so a subsequent navigation to the card
      // detail page doesn't flash stale data from a card that no longer exists.
      // useUpdateCard skips this step because the card still exists after an update.
      qc.removeQueries({ queryKey: queryKeys.cards.detail(cardId) })
      return { prevCards }
    },
    onError: (_err, _cardId, ctx) => {
      if (ctx?.prevCards !== undefined) {
        qc.setQueryData(queryKeys.cards.byColumn(columnId), ctx.prevCards)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cards.byColumn(columnId) })
    },
  })
}

type MoveVars = { cardId: string; column_id: string; after_card_id?: string }
type MoveCtx = {
  srcColumnId: string
  prevSrc: Card[] | undefined
  prevDest: Card[] | undefined
}

function findCardColumn(qc: QueryClient, cardId: string, columnIds: string[]): string {
  for (const colId of columnIds) {
    const cards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(colId))
    if (cards?.some((c) => c.id === cardId)) return colId
  }
  return columnIds[0] ?? ''
}

// Automation hooks

export function useAutomationRules(boardId: string) {
  return useQuery<AutomationRule[]>({
    queryKey: queryKeys.automationRules.byBoard(boardId),
    queryFn: () => listAutomationRules(boardId),
    enabled: !!boardId,
  })
}

export function useWebhookDeliveries(boardId: string, opts?: { enabled?: boolean }) {
  return useQuery<WebhookDelivery[]>({
    queryKey: queryKeys.webhookDeliveries.byBoard(boardId),
    queryFn: async () => {
      const page = await listWebhookDeliveries(boardId)
      return page.data
    },
    enabled: opts?.enabled !== false && !!boardId,
    refetchInterval: opts?.enabled !== false ? 30_000 : false,
    staleTime: 0,
  })
}

export function useCardActivity(cardId: string, opts?: { enabled?: boolean }) {
  return useQuery<CardActivityEntry[]>({
    queryKey: queryKeys.cardActivity.byCard(cardId),
    queryFn: () => getCardActivity(cardId),
    enabled: opts?.enabled !== false && !!cardId,
  })
}

type CreateRuleVars = { boardId: string; triggerType: string; webhookUrl: string; enabled?: boolean }

export function useCreateAutomationRule() {
  const qc = useQueryClient()
  return useMutation<AutomationRule, Error, CreateRuleVars>({
    mutationFn: (data) =>
      createAutomationRule(data.boardId, {
        trigger_type: data.triggerType,
        webhook_url: data.webhookUrl,
        enabled: data.enabled ?? true,
      }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: queryKeys.automationRules.byBoard(vars.boardId) }),
  })
}

type DeleteRuleVars = { boardId: string; ruleId: string }

export function useDeleteAutomationRule() {
  const qc = useQueryClient()
  return useMutation<void, Error, DeleteRuleVars>({
    mutationFn: ({ boardId, ruleId }) => deleteAutomationRule(boardId, ruleId),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: queryKeys.automationRules.byBoard(vars.boardId) }),
  })
}

type PatchRuleVars = { boardId: string; ruleId: string; enabled: boolean }

export function usePatchAutomationRuleEnabled() {
  const qc = useQueryClient()
  return useMutation<AutomationRule, Error, PatchRuleVars>({
    mutationFn: ({ boardId, ruleId, enabled }) => patchAutomationRuleEnabled(boardId, ruleId, enabled),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: queryKeys.automationRules.byBoard(vars.boardId) }),
  })
}

export function useMoveCard(setBannerError: (m: string | null) => void) {
  const qc = useQueryClient()
  return useMutation<Card, ApiError, MoveVars, MoveCtx>({
    mutationFn: ({ cardId, column_id, after_card_id }) =>
      moveCard(cardId, { column_id, after_card_id }),

    onMutate: async ({ cardId, column_id: destColumnId, after_card_id }) => {
      const allQueries = qc.getQueriesData<Card[]>({ queryKey: queryKeys.cards.all })
      const colIds = allQueries.map(([key]) => {
        const k = key as string[]
        return k[k.length - 1]
      }).filter(Boolean)

      const srcColumnId = findCardColumn(qc, cardId, colIds)

      await qc.cancelQueries({ queryKey: queryKeys.cards.byColumn(srcColumnId) })
      if (destColumnId !== srcColumnId) {
        await qc.cancelQueries({ queryKey: queryKeys.cards.byColumn(destColumnId) })
      }

      const prevSrc = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(srcColumnId))
      const prevDest = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(destColumnId))

      const moving = (prevSrc ?? []).find((c) => c.id === cardId)
      if (!moving) return { srcColumnId, prevSrc, prevDest }

      const srcAfter = (prevSrc ?? []).filter((c) => c.id !== cardId)

      const destBase = srcColumnId === destColumnId
        ? srcAfter
        : (prevDest ?? []).filter((c) => c.id !== cardId)

      const insertAt = after_card_id == null
        ? 0
        : destBase.findIndex((c) => c.id === after_card_id) + 1

      // Check if the destination column is named 'Done' to apply workflow color
      const allBoardQueries = qc.getQueriesData<BoardWithColumns>({ queryKey: queryKeys.boards.all })
      let isDoneColumn = false
      for (const [, boardData] of allBoardQueries) {
        if (boardData?.columns?.some((col) => col.id === destColumnId && col.name === DONE_COLUMN_NAME)) {
          isDoneColumn = true
          break
        }
      }

      const movedCard = isDoneColumn
        ? { ...moving, column_id: destColumnId, color: DONE_CARD_COLOR }
        : { ...moving, column_id: destColumnId }

      const destAfter = [
        ...destBase.slice(0, insertAt),
        movedCard,
        ...destBase.slice(insertAt),
      ]

      if (srcColumnId === destColumnId) {
        qc.setQueryData(queryKeys.cards.byColumn(destColumnId), destAfter)
      } else {
        qc.setQueryData(queryKeys.cards.byColumn(srcColumnId), srcAfter)
        qc.setQueryData(queryKeys.cards.byColumn(destColumnId), destAfter)
      }

      return { srcColumnId, prevSrc, prevDest }
    },

    onError: (err, vars, ctx) => {
      if (!ctx) return
      qc.setQueryData(queryKeys.cards.byColumn(ctx.srcColumnId), ctx.prevSrc)
      qc.setQueryData(queryKeys.cards.byColumn(vars.column_id), ctx.prevDest)
      setBannerError(err.message)
    },

    onSettled: (_data, _err, vars, ctx) => {
      qc.invalidateQueries({ queryKey: queryKeys.cards.byColumn(vars.column_id) })
      if (ctx && ctx.srcColumnId !== vars.column_id) {
        qc.invalidateQueries({ queryKey: queryKeys.cards.byColumn(ctx.srcColumnId) })
      }
    },
  })
}
