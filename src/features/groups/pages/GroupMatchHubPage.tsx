import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusChip } from '@/components/ui/StatusChip'
import { apiGetActiveMeeting, queryKeys } from '@/services/api'

export function GroupMatchHubPage() {
  const { groupId } = useParams<{ groupId: string }>()

  const activeMeetingQuery = useQuery({
    queryKey: queryKeys.activeMeeting(groupId ?? ''),
    queryFn: () => apiGetActiveMeeting(groupId ?? ''),
    enabled: Boolean(groupId),
    refetchInterval: 10_000,
  })

  if (!groupId) {
    return null
  }

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-3" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">매치 허브</h1>
        <p className="text-base text-surface-700">진행 중 모임이 있으면 바로 매치 탭으로 이동할 수 있습니다.</p>
      </Card>

      {activeMeetingQuery.data ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-2xl font-black">{activeMeetingQuery.data.title}</p>
            <StatusChip status={activeMeetingQuery.data.status} emphasize />
          </div>
          <p className="text-base text-surface-600">
            {activeMeetingQuery.data.date} {activeMeetingQuery.data.startTime}
          </p>
          <Link to={`/g/${groupId}/m/${activeMeetingQuery.data.id}/matches`}>
            <Button fullWidth size="lg" intent="primary">
              진행중 모임 매치로 이동
            </Button>
          </Link>
        </Card>
      ) : (
        <Card>
          <p className="text-base text-surface-700">현재 진행중 모임이 없습니다. 모임 탭에서 시작 후 이용하세요.</p>
        </Card>
      )}
    </PageFrame>
  )
}
