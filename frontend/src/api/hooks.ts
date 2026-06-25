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
} from '@/api/endpoints'
import type { PaginatedResponse, Board, BoardWithColumns, Card, Label, ApiError } from '@/types'

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

type UpdateCardVars = { cardId: string; labels: Label[] }
type UpdateCardCtx = { prevCards: Card[] | undefined }

export function useUpdateCard(columnId: string) {
  const qc = useQueryClient()
  return useMutation<Card, ApiError, UpdateCardVars, UpdateCardCtx>({
    mutationFn: ({ cardId, labels }) => updateCard(cardId, { labels }),
    onMutate: async ({ cardId, labels }) => {
      await qc.cancelQueries({ queryKey: queryKeys.cards.byColumn(columnId) })
      const prevCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(columnId))
      qc.setQueryData<Card[]>(queryKeys.cards.byColumn(columnId), (old) =>
        (old ?? []).map((c) => c.id === cardId ? { ...c, labels } : c)
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

      const destAfter = [
        ...destBase.slice(0, insertAt),
        { ...moving, column_id: destColumnId },
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
