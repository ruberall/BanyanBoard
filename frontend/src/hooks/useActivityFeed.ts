import { useState, useEffect } from 'react'
import type { ActivityEvent, CardMovedEvent, CardCreatedEvent } from '@/types'

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

interface UseActivityFeedResult {
  events: ActivityEvent[]
  connectionStatus: ConnectionStatus
}

export function useActivityFeed(boardId: string): UseActivityFeedResult {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const seenIds = new Set<string>()
    const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
    const url = `${baseUrl}/boards/${boardId}/events`
    const es = new EventSource(url, { withCredentials: true })

    es.onopen = () => {
      setConnectionStatus('open')
    }

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; eventId?: string }
        if (!data.eventId) return
        if (seenIds.has(data.eventId)) return
        seenIds.add(data.eventId)
        if (data.type === 'card.moved' && typeof (data as CardMovedEvent).cardId === 'string') {
          setEvents((prev) => [data as CardMovedEvent, ...prev])
        } else if (data.type === 'card.created' && typeof (data as CardCreatedEvent).cardId === 'string') {
          setEvents((prev) => [data as CardCreatedEvent, ...prev])
        }
      } catch {
        // ignore malformed messages
      }
    }

    es.onerror = () => {
      setConnectionStatus('error')
    }

    return () => {
      es.close()
    }
  }, [boardId])

  return { events, connectionStatus }
}
