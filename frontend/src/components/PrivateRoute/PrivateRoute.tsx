import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { LoadingSpinner } from '@/components/common/LoadingSpinner/LoadingSpinner'
import { ErrorBanner } from '@/components/common/ErrorBanner/ErrorBanner'
import { AppHeader } from '@/components/AppHeader/AppHeader'

export function PrivateRoute() {
  const { data: user, isLoading, isError } = useCurrentUser()
  const location = useLocation()

  if (isLoading) {
    return <LoadingSpinner label="Loading..." />
  }

  if (isError) {
    return <ErrorBanner message="Unable to verify your session. Please refresh." />
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return (
    <AppHeader>
      <Outlet />
    </AppHeader>
  )
}
