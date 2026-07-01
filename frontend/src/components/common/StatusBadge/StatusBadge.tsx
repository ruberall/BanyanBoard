import styles from './StatusBadge.module.css'

type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'exhausted'

interface StatusBadgeProps {
  status: DeliveryStatus
}

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; icon: string }> = {
  pending: { label: 'Pending', icon: '●' },
  delivered: { label: 'Delivered', icon: '✓' },
  failed: { label: 'Failed', icon: '✗' },
  exhausted: { label: 'Exhausted', icon: '⊘' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { label, icon } = STATUS_CONFIG[status]
  return (
    <span className={`${styles.badge} ${styles[status]}`} aria-label={`Status: ${label}`}>
      <span aria-hidden="true" className={styles.icon}>{icon}</span>
      <span className={styles.text}>{label}</span>
    </span>
  )
}
