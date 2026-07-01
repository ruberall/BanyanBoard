import { useRef, useEffect } from 'react'
import { AutomationTab } from './AutomationTab'
import styles from './BoardSettingsModal.module.css'

interface BoardSettingsModalProps {
  open: boolean
  boardId: string
  onClose: () => void
}

export function BoardSettingsModal({ open, boardId, onClose }: BoardSettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

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

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="settings-title">
      <div className={styles.header}>
        <h2 id="settings-title" className={styles.title}>Board Settings</h2>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={handleCloseClick}
          aria-label="Close settings"
        >
          ×
        </button>
      </div>
      <div className={styles.tabs}>
        <button type="button" className={styles.tab} role="tab" aria-selected="true">
          Automation
        </button>
      </div>
      <div role="tabpanel">
        <AutomationTab boardId={boardId} settingsOpen={open} />
      </div>
    </dialog>
  )
}
