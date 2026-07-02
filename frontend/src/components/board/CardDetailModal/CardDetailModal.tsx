import { useRef, useEffect } from 'react'
import { useCardActivity } from '@/api/hooks'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import styles from './CardDetailModal.module.css'

interface CardDetailModalProps {
  open: boolean
  cardId: string
  cardTitle: string
  onClose: () => void
}

export function CardDetailModal({ open, cardId, cardTitle, onClose }: CardDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { data, isLoading, isError, error } = useCardActivity(cardId, { enabled: open })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) {
        try {
          dialog.showModal()
        } catch {
          // jsdom does not support showModal — fall back to setting open attribute
          dialog.setAttribute('open', '')
        }
      }
    } else {
      if (dialog.open) {
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => onClose()
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  function handleCloseClick() {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.close === 'function') {
      dialog.close()
    } else {
      dialog.removeAttribute('open')
    }
    onClose()
  }

  const entries = data ?? []

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="card-detail-title">
      <div className={styles.header}>
        <h2 id="card-detail-title" className={styles.title}>{cardTitle}</h2>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={handleCloseClick}
          aria-label="Close card details"
        >
          ×
        </button>
      </div>
      <div className={styles.body}>
        <h3 className={styles.sectionTitle}>Activity</h3>
        {isLoading ? (
          <LoadingSpinner label="Loading activity..." />
        ) : isError ? (
          <ErrorBanner message={error instanceof Error ? error.message : 'Failed to load activity.'} />
        ) : entries.length === 0 ? (
          <p className={styles.empty}>No activity yet.</p>
        ) : (
          <ul className={styles.activityList}>
            {entries.map((entry) => (
              <li key={entry.id} className={styles.activityItem}>
                <span className={styles.activityMessage}>{entry.message}</span>
                <time className={styles.activityDate} dateTime={entry.createdAt}>
                  {new Date(entry.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  )
}
