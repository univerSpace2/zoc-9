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
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(29,78,216,0.18),transparent_38%),radial-gradient(circle_at_88%_18%,rgba(5,150,105,0.14),transparent_40%)]" />
      <TopBar />
      <main className="relative z-10">
        <Outlet />
      </main>
      <BottomTabs
        items={[
          { label: '매치', to: `/g/${groupId}/m/${meetingId}/matches` },
          { label: '통계', to: `/g/${groupId}/m/${meetingId}/stats` },
          { label: '정보', to: `/g/${groupId}/m/${meetingId}/info` },
        ]}
      />
    </div>
  )
}
