import { request } from './client'
import type { Board, BoardWithColumns, Card, PaginatedResponse } from '@/types'

// Board endpoints

export function listBoards(): Promise<PaginatedResponse<Board>> {
  return request<PaginatedResponse<Board>>('GET', '/boards')
}

export function getBoard(boardId: string): Promise<BoardWithColumns> {
  return request<BoardWithColumns>('GET', `/boards/${boardId}`)
}

export function createBoard(name: string): Promise<Board> {
  return request<Board>('POST', '/boards', { body: JSON.stringify({ name }) })
}

export function deleteBoard(boardId: string): Promise<void> {
  return request<void>('DELETE', `/boards/${boardId}`)
}

// Card endpoints

export function listCards(columnId: string): Promise<Card[]> {
  return request<Card[]>('GET', `/columns/${columnId}/cards`)
}

export function createCard(
  columnId: string,
  data: { title: string; description?: string | null },
): Promise<Card> {
  return request<Card>('POST', `/columns/${columnId}/cards`, {
    body: JSON.stringify(data),
  })
}

export function getCard(cardId: string): Promise<Card> {
  return request<Card>('GET', `/cards/${cardId}`)
}

export function updateCard(
  cardId: string,
  data: Partial<Pick<Card, 'title' | 'description' | 'due_date' | 'labels' | 'position'>>,
): Promise<Card> {
  return request<Card>('PATCH', `/cards/${cardId}`, { body: JSON.stringify(data) })
}

export function deleteCard(cardId: string): Promise<void> {
  return request<void>('DELETE', `/cards/${cardId}`)
}

export function moveCard(
  cardId: string,
  moveData: { column_id: string; after_card_id?: string },
): Promise<Card> {
  return request<Card>('PATCH', `/cards/${cardId}/move`, {
    body: JSON.stringify(moveData),
  })
}
