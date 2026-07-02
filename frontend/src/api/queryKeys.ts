export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  boards: {
    all: ['boards'] as const,
    list: () => [...queryKeys.boards.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.boards.all, id] as const,
  },
  cards: {
    all: ['cards'] as const,
    byColumn: (columnId: string) => ['cards', 'column', columnId] as const,
    detail: (id: string) => ['cards', id] as const,
  },
  automationRules: {
    all: ['automation-rules'] as const,
    byBoard: (boardId: string) => ['automation-rules', 'board', boardId] as const,
  },
  webhookDeliveries: {
    all: ['webhook-deliveries'] as const,
    byBoard: (boardId: string) => ['webhook-deliveries', 'board', boardId] as const,
  },
  cardActivity: {
    byCard: (cardId: string) => ['card-activity', 'card', cardId] as const,
  },
}
