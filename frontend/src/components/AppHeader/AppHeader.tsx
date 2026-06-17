import styles from './AppHeader.module.css'
import { useLogout } from '@/hooks/useLogout'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'

interface AppHeaderProps {
  children?: React.ReactNode
}

export function AppHeader({ children }: AppHeaderProps) {
  const logout = useLogout()

  return (
    <>
      <header className={styles.header}>
        <span className={styles.appName}>BanyanBoard</span>
        <button
          type="button"
          className={styles.signOut}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Sign out
        </button>
      </header>
      {logout.isError && (
        <ErrorBanner
          message="Sign out failed. Please try again."
          onDismiss={() => logout.reset()}
        />
      )}
      <main>{children}</main>
    </>
  )
}
