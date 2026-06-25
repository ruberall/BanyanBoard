import { useState } from 'react'
import styles from './FilterBar.module.css'

interface FilterBarProps {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
}

export function FilterBar({ value, onChange, onClear }: FilterBarProps) {
  const [internalValue, setInternalValue] = useState(value)
  // Track the previous prop value so we can detect parent-driven resets
  // (e.g. clear button in BoardPage). This is the React-recommended pattern
  // for "derived state from props that can also be mutated locally":
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevPropValue, setPrevPropValue] = useState(value)

  if (value !== prevPropValue) {
    setPrevPropValue(value)
    setInternalValue(value)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setInternalValue(next)
    onChange(next)
  }

  function handleClear() {
    onChange('')
    onClear?.()
  }

  return (
    <div className={styles.filterBar}>
      <input
        type="text"
        aria-label="Filter cards"
        value={internalValue}
        onChange={handleChange}
        className={styles.input}
        placeholder="Filter cards…"
      />
      {internalValue.length > 0 && (
        <button
          aria-label="Clear filter"
          onClick={handleClear}
          className={styles.clearButton}
          type="button"
        >
          ×
        </button>
      )}
    </div>
  )
}
