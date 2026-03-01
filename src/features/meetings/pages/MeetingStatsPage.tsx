import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Card } from '@/components/ui/Card'
import { apiListStats, queryKeys } from '@/services/api'

export function MeetingStatsPage() {
  const { meetingId } = useParams<{ meetingId: string }>()

  const statsQuery = useQuery({
    queryKey: queryKeys.stats(meetingId ?? ''),
    queryFn: () => apiListStats(meetingId ?? ''),
    enabled: Boolean(meetingId),
  })

  if (!meetingId) {
    return null
  }

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-2" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">통계</h1>
        <p className="text-base text-surface-700">완료된 매치 기준 멤버 승률입니다.</p>
      </Card>

      <Card className="space-y-2">
        {statsQuery.data?.length ? (
          statsQuery.data.map((item, index) => (
            <div key={item.profileId} className="flex min-h-[62px] items-center justify-between rounded-xl bg-surface-100 px-3 py-2">
              <div>
                <p className="text-xl font-black">
                  {index + 1}. {item.name}
                </p>
                <p className="text-sm text-surface-600">
                  {item.wins}승 {item.losses}패
                </p>
              </div>
              <p className="font-display text-[2rem] leading-none text-surface-900">{item.winRate}%</p>
            </div>
          ))
        ) : (
          <p className="text-base text-surface-700">완료된 매치가 없어 통계가 없습니다.</p>
        )}
      </Card>
    </PageFrame>
  )
}
