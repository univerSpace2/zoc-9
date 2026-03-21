import { Outlet } from 'react-router-dom'
import { NavigationProgress } from '@/components/ui/NavigationProgress'

export function RootLayout() {
  return (
    <>
      <NavigationProgress />
      <Outlet />
    </>
  )
}
