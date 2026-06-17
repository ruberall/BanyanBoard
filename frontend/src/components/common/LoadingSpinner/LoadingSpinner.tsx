import styles from './LoadingSpinner.module.css'

interface LoadingSpinnerProps {
  label?: string
}

export function LoadingSpinner({ label = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div role="status" className={styles.container}>
      <span className={styles['sr-only']}>{label}</span>
    </div>
  )
}
