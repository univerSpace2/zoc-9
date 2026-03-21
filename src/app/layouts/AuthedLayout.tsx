import { Outlet } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'

export function AuthedLayout() {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <TopBar />
      <main className="relative z-10">
        <Outlet />
      </main>
    </div>
  )
}
