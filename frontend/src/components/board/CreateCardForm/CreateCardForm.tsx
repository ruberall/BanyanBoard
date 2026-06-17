import { useState } from 'react'
import { useCreateCard } from '@/api/hooks'
import styles from './CreateCardForm.module.css'

interface CreateCardFormProps {
  columnId: string
}

export function CreateCardForm({ columnId }: CreateCardFormProps) {
  const [title, setTitle] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const createCard = useCreateCard(columnId)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim() === '') {
      setValidationError('Title is required')
      return
    }
    setValidationError(null)
    createCard.mutate(
      { title: title.trim() },
      {
        onSuccess: () => {
          setTitle('')
        },
      },
    )
  }

  const mutationError =
    createCard.isError
      ? createCard.error instanceof Error
        ? createCard.error.message
        : 'Failed to create card'
      : null

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <label htmlFor={`add-card-${columnId}`} className={styles.label}>
        Add a card
      </label>
      <input
        id={`add-card-${columnId}`}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Card title..."
        className={styles.input}
      />
      <button
        type="submit"
        disabled={createCard.isPending}
        className={styles.button}
      >
        Add card
      </button>
      {validationError !== null && (
        <span role="alert" className={styles.error}>
          {validationError}
        </span>
      )}
      {mutationError !== null && (
        <span role="alert" className={styles.error}>
          {mutationError}
        </span>
      )}
    </form>
  )
}
