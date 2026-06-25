import { useEffect, useRef } from 'react'
import styles from './LabelColorPicker.module.css'

const SWATCHES = [
  { name: 'Pale rose', hex: '#fce7f3' },
  { name: 'Pale amber', hex: '#fef3c7' },
  { name: 'Pale lime', hex: '#ecfccb' },
  { name: 'Pale teal', hex: '#ccfbf1' },
  { name: 'Pale sky', hex: '#e0f2fe' },
  { name: 'Pale indigo', hex: '#e0e7ff' },
  { name: 'Pale purple', hex: '#f3e8ff' },
  { name: 'Pale slate', hex: '#f1f5f9' },
  { name: 'Pale orange', hex: '#ffedd5' },
  { name: 'Pale green', hex: '#dcfce7' },
]

interface LabelColorPickerProps {
  onColorSelect: (hex: string) => void
  onClose: () => void
  anchorRect?: DOMRect
}

export function LabelColorPicker({ onColorSelect, onClose, anchorRect }: LabelColorPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstSwatchRef = useRef<HTMLButtonElement>(null)

  const positionStyle: React.CSSProperties = {}
  if (anchorRect) {
    const popoverWidth = 192
    const activityFeedMargin = 284
    if (anchorRect.right + popoverWidth > window.innerWidth - activityFeedMargin) {
      positionStyle.top = anchorRect.bottom + 4
      positionStyle.left = anchorRect.right - popoverWidth
    } else {
      positionStyle.top = anchorRect.bottom + 4
      positionStyle.left = anchorRect.left
    }
  }

  useEffect(() => {
    firstSwatchRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Choose label color"
      aria-modal="true"
      className={styles.picker}
      style={{ position: 'fixed', ...positionStyle }}
    >
      <div className={styles.swatchGrid}>
        {SWATCHES.map((swatch, i) => (
          <button
            key={swatch.hex}
            ref={i === 0 ? firstSwatchRef : undefined}
            type="button"
            aria-label={swatch.name}
            className={styles.swatch}
            style={{ backgroundColor: swatch.hex }}
            onClick={() => onColorSelect(swatch.hex)}
          />
        ))}
      </div>
    </div>
  )
}
