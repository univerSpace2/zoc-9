import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import { ERR } from '@/lib/constants'
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
        throw new Error(ERR.LOGIN_REQUIRED)
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
    <PageFrame className="space-y-6 pt-6 pb-32">
      {/* Header */}
      <div className="px-1">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-tight">장소 정보</h1>
          <StatusChip status={meeting.status} emphasize />
        </div>
        <p className="mt-1 text-sm text-surface-600">이번 경기가 열리는 장소 안내입니다.</p>
      </div>

      {/* Venue Map Placeholder */}
      {venue ? (
        <div className="overflow-hidden rounded-xl bg-surface-50 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
          {/* Map placeholder */}
          <div className="relative flex h-40 items-center justify-center bg-surface-200">
            <div className="flex flex-col items-center gap-1 text-surface-600">
              <MapPin className="h-8 w-8" />
              <span className="text-xs font-semibold uppercase tracking-widest">
                {venue.name.toUpperCase().slice(0, 20)}
              </span>
            </div>
            {/* Map pin marker */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger shadow-lg">
                <div className="h-3 w-3 rounded-full bg-white" />
              </div>
            </div>
          </div>

          {/* Venue details */}
          <div className="space-y-3 p-5">
            <h2 className="font-display text-xl font-bold">{venue.name}</h2>

            <div className="flex flex-wrap gap-3">
              {venue.reservationRequired && (
                <div className="flex items-center gap-1.5 text-sm text-surface-600">
                  <span className="flex h-6 items-center rounded-full bg-[#d1fc00]/20 px-2 text-[10px] font-bold uppercase tracking-wider text-[#516200]">
                    예약
                  </span>
                  <span>예약 필요</span>
                </div>
              )}
            </div>

            {venue.reservationUrl && (
              <a
                href={venue.reservationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button fullWidth intent="primary" size="lg">
                  길찾기 (Find Directions)
                </Button>
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl bg-surface-50 py-12 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
          <MapPin className="mb-2 h-10 w-10 text-surface-400" />
          <p className="text-base font-semibold text-surface-600">구장이 지정되지 않았습니다.</p>
        </div>
      )}

      {/* Meeting Details */}
      <div className="space-y-3">
        <h2 className="px-1 font-display text-lg font-bold">이용 안내</h2>

        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl bg-surface-50 px-4 py-3">
            <CalendarDays className="h-5 w-5 text-[#516200]" />
            <div>
              <p className="text-sm font-bold text-text-primary">{meeting.date}</p>
              <p className="text-xs text-surface-600">모임 날짜</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-surface-50 px-4 py-3">
            <Clock className="h-5 w-5 text-[#516200]" />
            <div>
              <p className="text-sm font-bold text-text-primary">{meeting.startTime}</p>
              <p className="text-xs text-surface-600">시작 시간</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-surface-50 px-4 py-3">
            <Users className="h-5 w-5 text-[#516200]" />
            <div>
              <p className="text-sm font-bold text-text-primary">참여 멤버 {participants.length}명</p>
              <p className="text-xs text-surface-600">
                {participants.length > 0
                  ? participants.map((p) => p.name).join(', ')
                  : '참여 멤버 정보가 없습니다.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Notice */}
      <div className="space-y-2 rounded-xl bg-surface-200 px-4 py-3">
        <p className="text-sm font-semibold text-surface-700">실내 전용 운동화 지참 필수입니다.</p>
        <p className="text-sm text-surface-600">경기 시작 15분 전까지 입실을 완료해 주세요.</p>
      </div>

      {/* Complete Button */}
      <Button
        fullWidth
        size="lg"
        intent="primary"
        onClick={() => completeMutation.mutate()}
        disabled={meeting.status === 'completed' || completeMutation.isPending}
      >
        모임 완료
      </Button>
      {completeMutation.error ? (
        <p className="text-base text-danger">{(completeMutation.error as Error).message}</p>
      ) : null}
    </PageFrame>
  )
}
