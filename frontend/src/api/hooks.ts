import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  listBoards,
  getBoard,
  createBoard,
  deleteBoard,
  listCards,
  createCard,
} from '@/api/endpoints'
import type { PaginatedResponse, Board, BoardWithColumns, Card } from '@/types'

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
