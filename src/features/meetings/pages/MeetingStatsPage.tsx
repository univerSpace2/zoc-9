import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
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

  const stats = statsQuery.data ?? []
  const topThree = stats.slice(0, 3)
  const rest = stats.slice(3)

  return (
    <PageFrame className="space-y-6 pt-6 pb-32">
      {/* Header */}
      <div className="px-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">멤버 통계</h1>
        <p className="mt-1 text-sm text-surface-600">완료된 매치 기준 멤버 승률</p>
      </div>

      {stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-200">
            <span className="text-2xl text-surface-600">📊</span>
          </div>
          <p className="text-base font-semibold text-surface-700">완료된 매치가 없어 통계가 없습니다.</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {topThree.map((item, index) => {
                const medals = ['🥇', '🥈', '🥉']
                const bgColors = [
                  'bg-[#d1fc00]/15',
                  'bg-surface-50',
                  'bg-surface-50',
                ]
                const scoreColors = [
                  'text-[#516200]',
                  'text-text-primary',
                  'text-text-primary',
                ]

                return (
                  <div
                    key={item.profileId}
                    className={`flex flex-col items-center rounded-xl ${bgColors[index]} px-3 py-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)]`}
                  >
                    <span className="mb-1 text-xl">{medals[index]}</span>
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-300 font-display text-lg font-bold text-surface-700">
                      {item.name.charAt(0)}
                    </div>
                    <p className="text-sm font-bold text-text-primary">{item.name}</p>
                    <p className="mt-0.5 text-xs text-surface-600">
                      {item.wins}승 {item.losses}패
                    </p>
                    <p className={`mt-1 font-display text-2xl font-black ${scoreColors[index]}`}>
                      {item.winRate}%
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Rest of the list */}
          {rest.length > 0 && (
            <div className="space-y-2">
              {rest.map((item, index) => (
                <div
                  key={item.profileId}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                    index % 2 === 0 ? 'bg-surface-50' : 'bg-surface-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-300 text-xs font-bold text-surface-700">
                      {index + 4}
                    </span>
                    <div>
                      <p className="font-bold text-text-primary">{item.name}</p>
                      <p className="text-xs text-surface-600">
                        {item.wins}승 {item.losses}패
                      </p>
                    </div>
                  </div>
                  <p className="font-display text-lg font-black text-text-primary">
                    {item.winRate}<span className="text-xs">%</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </PageFrame>
  )
}
