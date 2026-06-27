import { useEffect, useRef } from 'react'
import { SWATCHES } from '@/lib/swatches'
import styles from './CardColorPicker.module.css'

interface CardColorPickerProps {
  onColorSelect: (hex: string | null) => void
  onClose: () => void
}

export function CardColorPicker({ onColorSelect, onClose }: CardColorPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const firstSwatchRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstSwatchRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Focus trap: cycle Tab/Shift+Tab within the panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  function handleNoColor() {
    onColorSelect(null)
    onClose()
  }

  function handleSwatchClick(hex: string) {
    onColorSelect(hex)
    onClose()
  }

  return (
    <div className={styles.backdrop}>
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Choose card color"
        aria-modal="true"
        className={styles.panel}
      >
        <button
          type="button"
          aria-label="Close"
          className={styles.closeButton}
          onClick={onClose}
        >
          ×
        </button>
        <div className={styles.swatchGrid}>
          <button
            ref={firstSwatchRef}
            type="button"
            aria-label="No color"
            className={`${styles.swatch} ${styles.noColor}`}
            onClick={handleNoColor}
          />
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              aria-label={swatch.name}
              className={styles.swatch}
              style={{ backgroundColor: swatch.hex }}
              onClick={() => handleSwatchClick(swatch.hex)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
