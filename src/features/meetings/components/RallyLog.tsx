import { Card } from '@/components/ui/Card'
import type { RallyEvent } from '@/types/domain'

interface RallyLogProps {
  events: RallyEvent[]
  teamNameMap: Map<string, string>
}

export function RallyLog({ events, teamNameMap }: RallyLogProps) {
  return (
    <Card className="space-y-2">
      <h2 className="text-3xl font-black">득점 로그</h2>
      {events.length ? (
        <div className="space-y-1">
          {events
            .slice()
            .reverse()
            .map((event) => {
              const beforePosition = event.servingPositionBefore ?? 1
              const afterPosition = event.servingPositionAfter ?? 1

              return (
                <div key={event.clientEventId} className="rounded-xl bg-surface-100 px-3 py-2 text-sm">
                  <p className="text-lg font-black">{teamNameMap.get(event.scoringTeamId)} 득점</p>
                  <p>
                    {new Date(event.occurredAt).toLocaleTimeString('ko-KR')} · 서브 {teamNameMap.get(event.servingTeamIdBefore)}{' '}
                    {beforePosition}번 → {teamNameMap.get(event.servingTeamIdAfter)} {afterPosition}번
                  </p>
                </div>
              )
            })}
        </div>
      ) : (
        <p className="text-base text-surface-700">아직 득점 기록이 없습니다.</p>
      )}
    </Card>
  )
}
