import { CalendarDays, MoreHorizontal, Swords, Users } from 'lucide-react'
import { Outlet, useParams } from 'react-router-dom'
import { BottomTabs } from '@/components/layout/BottomTabs'
import { TopBar } from '@/components/layout/TopBar'

export function GroupLayout() {
  const { groupId } = useParams<{ groupId: string }>()

  if (!groupId) {
    return null
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <TopBar />
      <main className="relative z-10">
        <Outlet />
      </main>
      <BottomTabs
        items={[
          { label: '모임', to: `/g/${groupId}/meetings`, icon: CalendarDays },
          { label: '경기', to: `/g/${groupId}/match`, icon: Swords },
          { label: '멤버', to: `/g/${groupId}/members`, icon: Users },
          { label: '더보기', to: `/g/${groupId}/more`, icon: MoreHorizontal },
        ]}
      />
    </div>
  )
}
