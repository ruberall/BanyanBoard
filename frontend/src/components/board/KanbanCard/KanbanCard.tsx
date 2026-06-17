import type { Card } from '@/types'
import styles from './KanbanCard.module.css'

interface KanbanCardProps {
  card: Card
}

export function KanbanCard({ card }: KanbanCardProps) {
  return (
    <article className={styles.card}>
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
