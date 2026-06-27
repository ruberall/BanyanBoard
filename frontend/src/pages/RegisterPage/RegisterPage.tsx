import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRegister } from '@/hooks/useRegister'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import styles from './RegisterPage.module.css'

function getErrorMessage(error: unknown): string {
  if (error != null && typeof error === 'object' && 'status' in error && 'message' in error) {
    const apiErr = error as { status: number; message: string }
    if (apiErr.status === 409) return 'Email already registered'
    return apiErr.message
  }
  return 'An error occurred'
}

export function RegisterPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const register = useRegister()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    register.reset()
    register.mutate(
      {
        email,
        password,
        // Omit name fields entirely when blank so the backend stores NULL rather than an empty string.
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
      },
      {
        onSuccess: () => navigate('/', { replace: true }),
      },
    )
  }

  return (
    <div className={styles.page}>
      <h1>Create Account</h1>
      {register.isError && (
        <ErrorBanner message={getErrorMessage(register.error)} onDismiss={() => register.reset()} />
      )}
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="first_name">First name</label>
          <input
            id="first_name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="last_name">Last name</label>
          <input
            id="last_name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={register.isPending}>
          Create Account
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  )
}
