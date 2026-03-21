import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/auth-store'

export function TopBar() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const signOut = useAuthStore((state) => state.signOut)

  return (
    <header className="sticky top-0 z-30 glass px-5 py-3">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <Link to="/groups" className="font-display text-[2rem] leading-none tracking-[0.06em] text-text-primary">
          ZOC9
        </Link>
        {user ? (
          <div className="flex items-center gap-2">
            <Link
              to="/profile"
              className="inline-flex min-h-12 items-center rounded-[0.75rem] bg-surface-200 px-4 text-base font-bold text-text-primary"
            >
              {user.name}
            </Link>
            <Button
              intent="neutral"
              size="sm"
              className="px-4"
              onClick={() => {
                void signOut()
                navigate('/login')
              }}
            >
              로그아웃
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
