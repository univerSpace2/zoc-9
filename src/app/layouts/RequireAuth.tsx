import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth-store'

export function RequireAuth() {
  const user = useAuthStore((state) => state.user)
  const initialized = useAuthStore((state) => state.initialized)
  const location = useLocation()

  if (!initialized) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 text-center text-surface-700">
        세션 정보를 확인하는 중입니다...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
