import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusChip } from '@/components/ui/StatusChip'
import { apiGetMeetingDetail, apiUpdateMeetingStatus, queryKeys } from '@/services/api'
import { useAuthStore } from '@/store/auth-store'

export function MeetingInfoPage() {
  const { groupId, meetingId } = useParams<{ groupId: string; meetingId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const meetingQuery = useQuery({
    queryKey: queryKeys.meetingDetail(meetingId ?? ''),
    queryFn: () => apiGetMeetingDetail(meetingId ?? ''),
    enabled: Boolean(meetingId),
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !meetingId) {
        throw new Error('로그인이 필요합니다.')
      }

      return apiUpdateMeetingStatus(user.id, meetingId, 'completed')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.meeting(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetingDetail(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  if (!meetingQuery.data) {
    return null
  }

  const { meeting, venue, participants } = meetingQuery.data

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-3" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">모임 정보</h1>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-black">{meeting.title}</p>
            <p className="text-base text-surface-700">
              {meeting.date} {meeting.startTime}
            </p>
            <p className="mt-1 text-base text-surface-700">구장: {venue?.name ?? '미지정'}</p>
          </div>
          <StatusChip status={meeting.status} emphasize />
        </div>
        <div className="rounded-xl bg-surface-100 px-3 py-2">
          <p className="text-sm font-semibold text-surface-700">참여 멤버</p>
          {participants.length > 0 ? (
            <p className="mt-1 text-base text-surface-800">{participants.map((participant) => participant.name).join(', ')}</p>
          ) : (
            <p className="mt-1 text-sm text-surface-700">참여 멤버 정보가 없습니다.</p>
          )}
        </div>
        <Button fullWidth size="lg" intent="primary" onClick={() => completeMutation.mutate()} disabled={meeting.status === 'completed'}>
          모임 완료
        </Button>
        {completeMutation.error ? (
          <p className="text-base text-danger">{(completeMutation.error as Error).message}</p>
        ) : null}
      </Card>
    </PageFrame>
  )
}
