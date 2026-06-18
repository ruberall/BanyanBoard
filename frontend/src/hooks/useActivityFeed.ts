import { useState, useEffect } from 'react'
import type { CardMovedEvent } from '@/types'

type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error'

interface UseActivityFeedResult {
  events: CardMovedEvent[]
  connectionStatus: ConnectionStatus
}

export function useActivityFeed(boardId: string): UseActivityFeedResult {
  const [events, setEvents] = useState<CardMovedEvent[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    setEvents([])
    setConnectionStatus('connecting')
    const url = `/boards/${boardId}/events`
    const es = new EventSource(url)

    es.onopen = () => {
      setConnectionStatus('open')
    }

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as CardMovedEvent
        setEvents((prev) => [data, ...prev])
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
