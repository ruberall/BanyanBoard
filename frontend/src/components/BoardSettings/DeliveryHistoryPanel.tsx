import { useWebhookDeliveries } from '@/api/hooks'
import { StatusBadge } from '@/components/common/StatusBadge/StatusBadge'
import styles from './DeliveryHistoryPanel.module.css'

interface DeliveryHistoryPanelProps {
  boardId: string
  settingsOpen?: boolean
}

export function DeliveryHistoryPanel({ boardId, settingsOpen = true }: DeliveryHistoryPanelProps) {
  const { data, isLoading, refetch } = useWebhookDeliveries(boardId, { enabled: settingsOpen })

  const deliveries = data ?? []

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <button type="button" onClick={() => refetch()} className={styles.refresh}>
          Refresh
        </button>
      </div>
      {isLoading ? (
        <div>Loading...</div>
      ) : deliveries.length === 0 ? (
        <p className={styles.empty}>No deliveries yet. Deliveries will appear here after a rule triggers.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Attempt</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>
                  <StatusBadge status={d.status} />
                </td>
                <td>{d.attempt_count}</td>
                <td>{new Date(d.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
