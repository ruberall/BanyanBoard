import type { Column } from '@/types'
import { KanbanColumn } from '@/components/board/KanbanColumn/KanbanColumn'
import styles from './KanbanBoard.module.css'

interface KanbanBoardProps {
  columns: Column[]
  filterText?: string
}

export function KanbanBoard({ columns, filterText }: KanbanBoardProps) {
  const sorted = [...columns].sort((a, b) => a.position - b.position)

  if (sorted.length === 0) {
    return (
      <div className={styles.board}>
        <p className={styles.empty}>No columns yet</p>
      </div>
    )
  }

  return (
    <div className={styles.board}>
      {sorted.map((c) => (
        <KanbanColumn key={c.id} column={c} filterText={filterText} />
      ))}
    </div>
  )
}
