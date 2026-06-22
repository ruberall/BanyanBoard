import { useState } from 'react'
import type { CardMovedEvent } from '@/types'
import styles from './ActivityFeed.module.css'

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

const STORAGE_KEY = 'activityFeed.open'

interface ActivityFeedProps {
  events: CardMovedEvent[]
  connectionStatus: ConnectionStatus
}

function getInitialOpen(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      return stored !== 'false'
    }
  } catch {
    // ignore storage errors
  }
  return true
}

function formatRelativeTime(occurredAt: string): string {
  const now = Date.now()
  const then = new Date(occurredAt).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export function ActivityFeed({ events, connectionStatus }: ActivityFeedProps) {
  const [isOpen, setIsOpen] = useState<boolean>(getInitialOpen)

  function handleToggle() {
    const next = !isOpen
    setIsOpen(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // ignore storage errors
    }
  }

  return (
    <aside className={styles.sidebar} aria-label="Activity feed">
      <button
        type="button"
        className={styles.toggleBtn}
        aria-label={isOpen ? 'Collapse activity feed' : 'Expand activity feed'}
        onClick={handleToggle}
      >
        <span className={styles.title}>Activity</span>
        {isOpen ? '▲' : '▼'}
      </button>

      {connectionStatus === 'error' && (
        <div role="status" className={styles.reconnectBanner}>
          Reconnecting…
        </div>
      )}

      {isOpen && (
        <ul role="log" aria-live="polite" aria-label="Activity events" className={styles.list}>
          {events.length === 0 ? (
            <li className={styles.emptyState}>No activity yet</li>
          ) : (
            events.map((event) => (
              <li key={event.eventId} className={styles.entry}>
                <div className={styles.entryActor}>
                  {event.actorEmail ?? 'Someone'} moved &apos;{event.cardTitle}&apos;
                </div>
                <div className={styles.entryMeta}>
                  {event.fromColumnName ?? '?'} → {event.toColumnName ?? '?'} · {formatRelativeTime(event.occurredAt)}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </aside>
  )
}
