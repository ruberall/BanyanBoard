import { useParams } from 'react-router-dom'
import { useBoard } from '@/api/hooks'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import { KanbanBoard } from '@/components/board/KanbanBoard/KanbanBoard'
import styles from './BoardPage.module.css'

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const { data: board, isLoading, isError, error } = useBoard(boardId ?? '')

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
      <h1 className={styles.heading}>{board.name}</h1>
      <KanbanBoard columns={sortedColumns} />
    </div>
  )
}
