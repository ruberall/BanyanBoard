import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useBoards, useCreateBoard } from '@/api/hooks'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import styles from './BoardListPage.module.css'

export function BoardListPage() {
  const { data, isLoading, isError, error } = useBoards()
  const createBoard = useCreateBoard()
  const [name, setName] = useState('')

  if (isLoading) {
    return <LoadingSpinner label="Loading boards" />
  }

  if (isError && error) {
    return <ErrorBanner message={error instanceof Error ? error.message : 'Failed to load boards'} />
  }

  const boards = data?.data ?? []

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createBoard.mutate(
      { name: name.trim() },
      {
        onSuccess: () => setName(''),
      },
    )
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>My Boards</h1>

      {boards.length === 0 ? (
        <p className={styles.emptyState}>No boards yet</p>
      ) : (
        <ul className={styles.list}>
          {boards.map((b) => (
            <li key={b.id} className={styles.listItem}>
              <Link to={`/boards/${b.id}`}>{b.name}</Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Board name"
          aria-label="Board name"
        />
        <button type="submit" className={styles.submitBtn}>
          Create Board
        </button>
      </form>
    </main>
  )
}
