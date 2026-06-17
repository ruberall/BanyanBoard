import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { useBoard, useMoveCard } from '@/api/hooks'
import { queryKeys } from '@/api/queryKeys'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import { KanbanBoard } from '@/components/board/KanbanBoard/KanbanBoard'
import { KanbanCard } from '@/components/board/KanbanCard/KanbanCard'
import type { Card } from '@/types'
import styles from './BoardPage.module.css'

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { data: board, isLoading, isError, error } = useBoard(boardId ?? '')
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const moveCard = useMoveCard(setBannerError)
  const qc = useQueryClient()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragStart({ active }: DragStartEvent) {
    const cardId = String(active.id)
    const allCardQueries = qc.getQueriesData<Card[]>({ queryKey: queryKeys.cards.all })
    const found = allCardQueries
      .flatMap(([, cards]) => cards ?? [])
      .find((c) => c.id === cardId)
    setActiveCard(found ?? null)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null)
    if (!over) return

    const cardId = String(active.id)
    const overId = String(over.id)

    const overIsColumn = (board?.columns ?? []).some((c) => c.id === overId)

    const allCardQueries = qc.getQueriesData<Card[]>({ queryKey: queryKeys.cards.all })
    const srcColumnId = allCardQueries
      .filter(([, cards]) => cards?.some((c) => c.id === cardId))
      .map(([key]) => { const k = key as string[]; return k[k.length - 1] })[0] ?? ''

    const destColumnId = overIsColumn
      ? overId
      : (allCardQueries
          .filter(([, cards]) => cards?.some((c) => c.id === overId))
          .map(([key]) => { const k = key as string[]; return k[k.length - 1] })[0] ?? '')

    const destCards = (qc.getQueryData<Card[]>(queryKeys.cards.byColumn(destColumnId)) ?? [])
      .filter((c) => c.id !== cardId)

    const overIndex = overIsColumn
      ? destCards.length
      : destCards.findIndex((c) => c.id === overId)
    const restingIndex = overIndex < 0 ? destCards.length : overIndex

    const after_card_id = restingIndex === 0 ? undefined : destCards[restingIndex - 1].id

    if (srcColumnId === destColumnId) {
      const srcCards = qc.getQueryData<Card[]>(queryKeys.cards.byColumn(srcColumnId)) ?? []
      const curIdx = srcCards.findIndex((c) => c.id === cardId)
      const curAfter = curIdx <= 0 ? undefined : srcCards[curIdx - 1].id
      if (curAfter === after_card_id) return
    }

    setBannerError(null)
    moveCard.mutate({ cardId, column_id: destColumnId, after_card_id })
  }

  function onDragCancel() {
    setActiveCard(null)
  }

  if (isLoading) {
    return <LoadingSpinner label="Loading board" />
  }

  if (isError) {
    return (
      <ErrorBanner
        message={error instanceof Error ? error.message : 'Failed to load board'}
      />
    )
  }

  if (!board) return null

  const sortedColumns = [...board.columns].sort((a, b) => a.position - b.position)

  return (
    <div className={styles.page}>
      {bannerError && (
        <ErrorBanner message={bannerError} onDismiss={() => setBannerError(null)} />
      )}
      <h1 className={styles.heading}>{board.name}</h1>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <KanbanBoard columns={sortedColumns} />
        <DragOverlay>
          {activeCard ? <KanbanCard card={activeCard} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
