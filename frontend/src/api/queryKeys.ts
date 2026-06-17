export const queryKeys = {
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
}
