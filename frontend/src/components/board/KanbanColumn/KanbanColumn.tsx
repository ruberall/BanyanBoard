import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Column, Label, Card } from '@/types'
import { useCards, useUpdateCard } from '@/api/hooks'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import { KanbanCard } from '@/components/board/KanbanCard/KanbanCard'
import { CreateCardForm } from '@/components/board/CreateCardForm/CreateCardForm'
import styles from './KanbanColumn.module.css'

interface KanbanColumnProps {
  column: Column
  filterText?: string
}

export function KanbanColumn({ column, filterText }: KanbanColumnProps) {
  const { data: cards, isLoading, isError, error } = useCards(column.id)
  const { setNodeRef } = useDroppable({ id: column.id })
  const updateCard = useUpdateCard(column.id)

  function handleLabelColorChange(cardId: string, newLabels: Label[]) {
    updateCard?.mutate({ cardId, labels: newLabels })
  }

  function handleCardColorChange(cardId: string, color: string | null) {
    const card = (cards ?? []).find((c: Card) => c.id === cardId)
    if (!card) return
    updateCard?.mutate({ cardId, labels: card.labels, color })
  }

  if (isLoading) {
    return <LoadingSpinner label="Loading cards" />
  }

  if (isError) {
    return (
      <ErrorBanner
        message={error instanceof Error ? error.message : 'Failed to load cards'}
      />
    )
  }

  const sortedCards = [...(cards ?? [])].sort((a, b) => a.position - b.position)

  // Lowercase once outside the filter predicate so we don't repeat the
  // transformation for every card × field on each render.
  const lowerFilter = filterText ? filterText.toLowerCase() : ''
  const visibleCards = lowerFilter
    ? sortedCards.filter(
        (card) =>
          card.title.toLowerCase().includes(lowerFilter) ||
          (card.description ?? '').toLowerCase().includes(lowerFilter),
      )
    : sortedCards

  return (
    <section ref={setNodeRef} aria-label={`Column: ${column.name}`} className={styles.column}>
      <h2 className={styles.heading}>{column.name}</h2>
      <SortableContext items={visibleCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {visibleCards.length === 0 ? (
          <p className={styles.empty}>No cards yet</p>
        ) : (
          visibleCards.map((c) => <KanbanCard key={c.id} card={c} onLabelColorChange={handleLabelColorChange} onCardColorChange={handleCardColorChange} />)
        )}
      </SortableContext>
      <CreateCardForm columnId={column.id} />
    </section>
  )
}
