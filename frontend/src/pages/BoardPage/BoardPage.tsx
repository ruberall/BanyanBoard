import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import { ActivityFeed } from '@/components/ActivityFeed/ActivityFeed'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { FilterBar } from '@/components/board/FilterBar/FilterBar'
import { BoardSettingsModal } from '@/components/BoardSettings/BoardSettingsModal'
import { SettingsErrorBoundary } from '@/components/BoardSettings/SettingsErrorBoundary'
import type { Card } from '@/types'
import styles from './BoardPage.module.css'

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const { data: board, isLoading, isError, error } = useBoard(boardId ?? '')
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [filterText, setFilterText] = useState('')
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const gearButtonRef = useRef<HTMLButtonElement>(null)
  const moveCard = useMoveCard(setBannerError)
  const { events: activityEvents, connectionStatus } = useActivityFeed(boardId ?? '')
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
      <div className={styles.headingRow}>
        <button type="button" onClick={() => navigate('/')}>Back</button>
        <h1 className={styles.heading}>{board.name}</h1>
        <FilterBar value={filterText} onChange={setFilterText} />
        <button
          ref={gearButtonRef}
          type="button"
          aria-label="Board settings"
          aria-haspopup="dialog"
          onClick={() => setIsSettingsOpen(true)}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <KanbanBoard columns={sortedColumns} filterText={filterText} />
        <DragOverlay>
          {activeCard ? <KanbanCard card={activeCard} overlay /> : null}
        </DragOverlay>
      </DndContext>
      <SettingsErrorBoundary onClose={() => { setIsSettingsOpen(false); gearButtonRef.current?.focus() }}>
        <BoardSettingsModal
          open={isSettingsOpen}
          boardId={boardId ?? ''}
          onClose={() => {
            setIsSettingsOpen(false)
            gearButtonRef.current?.focus()
          }}
        />
      </SettingsErrorBoundary>
      <ActivityFeed events={activityEvents} connectionStatus={connectionStatus} />
    </div>
  )
}
