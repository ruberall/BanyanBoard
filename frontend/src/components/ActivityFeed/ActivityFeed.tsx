import { useState } from 'react'
import type { CardMovedEvent } from '@/types'

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
    <aside aria-label="Activity feed">
      <button
        type="button"
        aria-label={isOpen ? 'Collapse activity feed' : 'Expand activity feed'}
        onClick={handleToggle}
      >
        {isOpen ? '▲' : '▼'}
      </button>

      {connectionStatus === 'error' && (
        <div role="status" style={{ background: '#FFC107', padding: '4px 8px' }}>
          Reconnecting...
        </div>
      )}

      {isOpen && (
        <ul role="log" aria-live="polite" aria-label="Activity events">
          {events.length === 0 ? (
            <li>
              <p>No activity yet</p>
            </li>
          ) : (
            events.map((event) => (
              <li key={event.eventId}>
                <div>
                  {event.actorEmail ?? 'Someone'} moved &apos;{event.cardTitle}&apos;
                </div>
                <div>
                  from {event.fromColumnName ?? '?'} → {event.toColumnName ?? '?'} ·{' '}
                  {formatRelativeTime(event.occurredAt)}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </aside>
  )
}
