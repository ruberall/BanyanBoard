import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '@/types'
import styles from './KanbanCard.module.css'

interface KanbanCardProps {
  card: Card
  overlay?: boolean
}

export function KanbanCard({ card, overlay }: KanbanCardProps) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: card.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !overlay ? 0.4 : 1,
  }

  return (
    <article ref={setNodeRef} style={style} className={styles.card}>
      <button
        type="button"
        className={styles.dragHandle}
        aria-label={`Reorder card: ${card.title}`}
        {...(overlay ? {} : { ...attributes, ...listeners })}
        aria-roledescription="draggable"
      >
        ⠿
      </button>
      <h3 className={styles.title}>{card.title}</h3>
      {card.labels.length > 0 && (
        <div className={styles.labels}>
          {card.labels.map((label) => (
            <span key={label} className={styles.label}>
              {label}
            </span>
          ))}
        </div>
      )}
      {card.due_date !== null && (
        <time className={styles.dueDate} dateTime={card.due_date}>
          {card.due_date}
        </time>
      )}
      {card.description !== null && (
        <p className={styles.description}>{card.description}</p>
      )}
    </article>
  )
}
