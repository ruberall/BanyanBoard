import { useState } from 'react'
import styles from './ErrorBanner.module.css'

interface ErrorBannerProps {
  message: string
  onDismiss?: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  // internal state handles dismiss when caller doesn't need to know (uncontrolled usage)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  function handleDismiss() {
    if (onDismiss) {
      onDismiss()
    } else {
      setDismissed(true)
    }
  }

  return (
    <div role="alert" className={styles.banner}>
      <span className={styles.message}>{message}</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss"
        onClick={handleDismiss}
      >
        ×
      </button>
    </div>
  )
}
