import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Label } from '@/types'
import { LabelColorPicker } from '@/components/board/LabelColorPicker/LabelColorPicker'
import { CardColorPicker } from '@/components/board/CardColorPicker/CardColorPicker'
import styles from './KanbanCard.module.css'

interface KanbanCardProps {
  card: Card
  overlay?: boolean
  onLabelColorChange?: (cardId: string, newLabels: Label[]) => void
  onCardColorChange?: (cardId: string, color: string | null) => void
}

interface PickerState {
  labelName: string
  rect: DOMRect
}

const DEFAULT_LABEL_COLOR = '#95B9C7'

export function KanbanCard({ card, overlay, onLabelColorChange, onCardColorChange }: KanbanCardProps) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id: card.id })
  const [pickerState, setPickerState] = useState<PickerState | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [prevDragging, setPrevDragging] = useState(false)

  // React derived-state pattern: close picker the moment a drag starts so the
  // popover doesn't float at a stale position while the card is in flight.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (isDragging !== prevDragging) {
    setPrevDragging(isDragging)
    if (isDragging) {
      setPickerState(null)
      setColorPickerOpen(false)
    }
  }

  const style: React.CSSProperties = {
    ...(card.color ? { backgroundColor: card.color } : {}),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !overlay ? 0.4 : 1,
  }

  function handleLabelClick(labelName: string, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setPickerState({ labelName, rect })
  }

  function handleColorSelect(hex: string) {
    if (pickerState && onLabelColorChange) {
      const newLabels = card.labels.map((l) =>
        l.name === pickerState.labelName ? { ...l, color: hex } : l,
      )
      onLabelColorChange(card.id, newLabels)
    }
    setPickerState(null)
  }

  function handlePickerClose() {
    setPickerState(null)
  }

  function handleCardColorSelect(hex: string | null) {
    if (onCardColorChange) {
      onCardColorChange(card.id, hex)
    }
    setColorPickerOpen(false)
  }

  function handleCardColorClose() {
    setColorPickerOpen(false)
  }

  return (
    <article ref={setNodeRef} style={style} className={styles.card}>
      <div className={styles.cardHeader}>
        <button
          type="button"
          className={styles.dragHandle}
          aria-label={`Reorder card: ${card.title}`}
          {...(overlay ? {} : { ...attributes, ...listeners })}
          aria-roledescription="draggable"
        >
          ⠿
        </button>
        {card.labels.map((label) => (
          <button
            key={label.name}
            type="button"
            className={styles.labelBadge}
            style={{ backgroundColor: label.color || DEFAULT_LABEL_COLOR }}
            aria-label={`${label.name} — click to change color`}
            aria-expanded={pickerState?.labelName === label.name}
            onClick={(e) => handleLabelClick(label.name, e)}
          >
            {label.name}
          </button>
        ))}
        <button
          type="button"
          aria-label="Set card color"
          className={styles.colorButton}
          onClick={() => setColorPickerOpen(true)}
        >
          🎨
        </button>
        <h3 className={styles.title} title={card.title}>{card.title}</h3>
      </div>
      {pickerState !== null && (
        <LabelColorPicker
          anchorRect={pickerState.rect}
          onColorSelect={handleColorSelect}
          onClose={handlePickerClose}
        />
      )}
      {colorPickerOpen && (
        <CardColorPicker
          onColorSelect={handleCardColorSelect}
          onClose={handleCardColorClose}
        />
      )}
      {card.due_date !== null && (
        <time className={styles.dueDate} dateTime={card.due_date}>{card.due_date}</time>
      )}
      {card.description !== null && (
        <p className={styles.description}>{card.description}</p>
      )}
    </article>
  )
}
