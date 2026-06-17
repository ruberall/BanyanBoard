import type { Column } from '@/types'
import { useCards } from '@/api/hooks'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import { KanbanCard } from '@/components/board/KanbanCard/KanbanCard'
import { CreateCardForm } from '@/components/board/CreateCardForm/CreateCardForm'
import styles from './KanbanColumn.module.css'

interface KanbanColumnProps {
  column: Column
}

export function KanbanColumn({ column }: KanbanColumnProps) {
  const { data: cards, isLoading, isError, error } = useCards(column.id)

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

  return (
    <section aria-label={`Column: ${column.name}`} className={styles.column}>
      <h2 className={styles.heading}>{column.name}</h2>
      {sortedCards.length === 0 ? (
        <p className={styles.empty}>No cards yet</p>
      ) : (
        sortedCards.map((c) => <KanbanCard key={c.id} card={c} />)
      )}
      <CreateCardForm columnId={column.id} />
    </section>
  )
}
