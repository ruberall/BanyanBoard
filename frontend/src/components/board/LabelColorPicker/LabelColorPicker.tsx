import { useEffect, useRef } from 'react'
import { SWATCHES } from '@/lib/swatches'
import styles from './LabelColorPicker.module.css'

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
