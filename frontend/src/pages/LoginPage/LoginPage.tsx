import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLogin } from '@/hooks/useLogin'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import styles from './LoginPage.module.css'

function getErrorMessage(error: unknown): string {
  if (error != null && typeof error === 'object' && 'status' in error && 'message' in error) {
    const apiErr = error as { status: number; message: string }
    if (apiErr.status === 401) return 'Invalid email or password'
    return apiErr.message
  }
  return 'An error occurred'
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useLogin()

  function getRedirectPath(): string {
    const next = searchParams.get('next') ?? ''
    return next.startsWith('/') ? next : '/'
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    login.reset()
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate(getRedirectPath(), { replace: true }),
      },
    )
  }

  return (
    <div className={styles.page}>
      <h1>Log in</h1>
      {login.isError && (
        <ErrorBanner message={getErrorMessage(login.error)} onDismiss={() => login.reset()} />
      )}
      <form onSubmit={handleSubmit}>
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
        <button type="submit" disabled={login.isPending}>
          Log in
        </button>
      </form>
      <p>
        Don&apos;t have an account? <Link to="/register">Register</Link>
      </p>
    </div>
  )
}
