import { request } from './client'
import type { Board, BoardWithColumns, Card, PaginatedResponse, User, AutomationRule, WebhookDelivery, CardActivityEntry } from '@/types'

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
  data: Partial<Pick<Card, 'title' | 'description' | 'due_date' | 'labels' | 'position' | 'color'>>,
): Promise<Card> {
  return request<Card>('PATCH', `/cards/${cardId}`, { body: JSON.stringify(data) })
}

export function deleteCard(cardId: string): Promise<void> {
  return request<void>('DELETE', `/cards/${cardId}`)
}

export function getCardActivity(cardId: string): Promise<CardActivityEntry[]> {
  return request<CardActivityEntry[]>('GET', `/cards/${cardId}/activity`)
}

// Auth endpoints

export function fetchMe(): Promise<User> {
  return request<User>('GET', '/auth/me')
}

export function login(data: { email: string; password: string }): Promise<User> {
  return request<User>('POST', '/auth/login', { body: JSON.stringify(data) })
}

export function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout')
}

export function register(data: {
  email: string
  password: string
  first_name?: string
  last_name?: string
}): Promise<User> {
  return request<User>('POST', '/auth/register', { body: JSON.stringify(data) })
}

export function moveCard(
  cardId: string,
  moveData: { column_id: string; after_card_id?: string },
): Promise<Card> {
  return request<Card>('PATCH', `/cards/${cardId}/move`, {
    body: JSON.stringify(moveData),
  })
}

// Automation Rules endpoints

export function listAutomationRules(boardId: string): Promise<AutomationRule[]> {
  return request<AutomationRule[]>('GET', `/boards/${boardId}/automation-rules`)
}

export function createAutomationRule(
  boardId: string,
  data: { trigger_type: string; webhook_url: string; enabled?: boolean },
): Promise<AutomationRule> {
  return request<AutomationRule>('POST', `/boards/${boardId}/automation-rules`, {
    body: JSON.stringify(data),
  })
}

export function patchAutomationRuleEnabled(
  boardId: string,
  ruleId: string,
  enabled: boolean,
): Promise<AutomationRule> {
  return request<AutomationRule>('PATCH', `/boards/${boardId}/automation-rules/${ruleId}`, {
    body: JSON.stringify({ enabled }),
  })
}

export function deleteAutomationRule(boardId: string, ruleId: string): Promise<void> {
  return request<void>('DELETE', `/boards/${boardId}/automation-rules/${ruleId}`)
}

// Webhook Deliveries endpoints

export interface DeliveryPage {
  data: WebhookDelivery[]
  hasMore: boolean
  nextCursor?: string
}

export function listWebhookDeliveries(boardId: string, limit?: number): Promise<DeliveryPage> {
  const params = limit ? `?limit=${limit}` : ''
  return request<DeliveryPage>('GET', `/boards/${boardId}/webhook-deliveries${params}`)
}
