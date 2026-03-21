import { BarChart3, Info, Swords } from 'lucide-react'
import { Outlet, useParams } from 'react-router-dom'
import { BottomTabs } from '@/components/layout/BottomTabs'
import { TopBar } from '@/components/layout/TopBar'

export function MeetingLayout() {
  const { groupId, meetingId } = useParams<{ groupId: string; meetingId: string }>()

  if (!groupId || !meetingId) {
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
          { label: '경기', to: `/g/${groupId}/m/${meetingId}/matches`, icon: Swords },
          { label: '통계', to: `/g/${groupId}/m/${meetingId}/stats`, icon: BarChart3 },
          { label: '정보', to: `/g/${groupId}/m/${meetingId}/info`, icon: Info },
        ]}
      />
    </div>
  )
}
