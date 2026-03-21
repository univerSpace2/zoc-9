import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, Clock, MapPin, Pencil, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { StatusChip } from '@/components/ui/StatusChip'
import { ERR } from '@/lib/constants'
import {
  apiDeleteMeeting,
  apiGetMeetingDetail,
  apiListMembers,
  apiListVenues,
  apiUpdateMeeting,
  apiUpdateMeetingStatus,
  queryKeys,
} from '@/services/api'
import { useAuthStore } from '@/store/auth-store'

export function MeetingInfoPage() {
  const { groupId, meetingId } = useParams<{ groupId: string; meetingId: string }>()
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const meetingQuery = useQuery({
    queryKey: queryKeys.meetingDetail(meetingId ?? ''),
    queryFn: () => apiGetMeetingDetail(meetingId ?? ''),
    enabled: Boolean(meetingId),
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.members(groupId ?? ''),
    queryFn: () => apiListMembers(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const venuesQuery = useQuery({
    queryKey: queryKeys.venues(groupId ?? ''),
    queryFn: () => apiListVenues(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!user || !meetingId) throw new Error(ERR.LOGIN_REQUIRED)
      return apiUpdateMeetingStatus(user.id, meetingId, 'completed')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.meeting(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetingDetail(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!meetingId) throw new Error('모임 ID가 없습니다.')
      return apiDeleteMeeting(meetingId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
      navigate(`/g/${groupId}/meetings`, { replace: true })
    },
  })

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editVenueId, setEditVenueId] = useState<string>('')
  const [editParticipantIds, setEditParticipantIds] = useState<string[]>([])

  useEffect(() => {
    if (meetingQuery.data) {
      const { meeting, venue, participants } = meetingQuery.data
      setEditTitle(meeting.title)
      setEditDate(meeting.date)
      setEditTime(meeting.startTime)
      setEditVenueId(venue?.id ?? '')
      setEditParticipantIds(participants.map((p) => p.id))
    }
  }, [meetingQuery.data])

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!meetingId) throw new Error('모임 ID가 없습니다.')
      return apiUpdateMeeting(meetingId, {
        title: editTitle.trim(),
        date: editDate,
        startTime: editTime,
        venueId: editVenueId || null,
        participantIds: editParticipantIds,
      })
    },
    onSuccess: async () => {
      setEditing(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetingDetail(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  if (!meetingQuery.data) return null

  const { meeting, venue, participants } = meetingQuery.data
  const isCompleted = meeting.status === 'completed'

  const toggleParticipant = (profileId: string) => {
    setEditParticipantIds((prev) =>
      prev.includes(profileId) ? prev.filter((id) => id !== profileId) : [...prev, profileId],
    )
  }

  // ── Edit Mode ──
  if (editing) {
    return (
      <PageFrame className="space-y-5 pt-6 pb-32">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-tight">모임 수정</h1>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-surface-600 transition hover:bg-surface-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <Input label="모임 이름" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />

          {/* Date / Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">DATE</span>
              <input
                type="date"
                className="mt-1 block min-h-10 w-full bg-transparent text-lg font-bold text-text-primary outline-none"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">TIME</span>
              <input
                type="time"
                className="mt-1 block min-h-10 w-full bg-transparent text-lg font-bold text-text-primary outline-none"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
              />
            </div>
          </div>

          {/* Venue */}
          <div className="space-y-2">
            <span className="font-display text-base font-bold text-text-primary">장소 선택</span>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                type="button"
                onClick={() => setEditVenueId('')}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                  !editVenueId ? 'bg-[#d1fc00] text-[#3c4a00]' : 'bg-surface-200 text-surface-600'
                }`}
              >
                미지정
              </button>
              {(venuesQuery.data ?? []).map((v) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => setEditVenueId(v.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                    editVenueId === v.id ? 'bg-[#d1fc00] text-[#3c4a00]' : 'bg-surface-200 text-surface-600'
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold text-text-primary">
                참가 멤버 <span className="ml-1 text-[#516200]">{editParticipantIds.length}</span>
              </span>
              <button
                type="button"
                className="text-xs font-bold text-[#516200]"
                onClick={() => {
                  const allIds = (membersQuery.data ?? []).map((m) => m.profileId)
                  setEditParticipantIds(
                    editParticipantIds.length === allIds.length ? [] : allIds,
                  )
                }}
              >
                {editParticipantIds.length === (membersQuery.data ?? []).length ? '전체 해제' : '전체 선택'}
              </button>
            </div>
            <div className="space-y-1 rounded-2xl bg-white p-3 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
              {(membersQuery.data ?? []).map((member, idx) => {
                const selected = editParticipantIds.includes(member.profileId)
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleParticipant(member.profileId)}
                    className={`flex w-full min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      idx % 2 === 1 ? 'bg-surface-100' : ''
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-300 text-sm font-bold text-surface-700">
                      {member.profile.name.charAt(0)}
                    </div>
                    <span className="min-w-0 flex-1 text-sm font-bold text-text-primary">
                      {member.profile.name}
                    </span>
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ${
                        selected ? 'bg-[#d1fc00] text-[#3c4a00]' : 'bg-surface-200 text-surface-400'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Error */}
        {updateMutation.error && (
          <p className="text-sm font-semibold text-danger">{(updateMutation.error as Error).message}</p>
        )}

        {/* Save */}
        <button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || !editTitle.trim()}
          className="flex min-h-14 w-full items-center justify-center rounded-2xl text-lg font-bold text-[#3c4a00] shadow-lg shadow-[#516200]/20 transition active:scale-[0.98] disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)' }}
        >
          {updateMutation.isPending ? '저장 중...' : '변경사항 저장'}
        </button>
      </PageFrame>
    )
  }

  // ── View Mode ──
  return (
    <PageFrame className="space-y-6 pt-6 pb-32">
      {/* Header */}
      <div className="px-1">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-tight">모임 정보</h1>
          <div className="flex items-center gap-2">
            <StatusChip status={meeting.status} emphasize />
            {!isCompleted && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-200 text-surface-600 transition hover:bg-surface-300"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Venue */}
      {venue ? (
        <div className="overflow-hidden rounded-xl bg-surface-50 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
          <div className="relative flex h-40 items-center justify-center bg-surface-200">
            <div className="flex flex-col items-center gap-1 text-surface-600">
              <MapPin className="h-8 w-8" />
              <span className="text-xs font-semibold uppercase tracking-widest">
                {venue.name.toUpperCase().slice(0, 20)}
              </span>
            </div>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger shadow-lg">
                <div className="h-3 w-3 rounded-full bg-white" />
              </div>
            </div>
          </div>
          <div className="space-y-3 p-5">
            <h2 className="font-display text-xl font-bold">{venue.name}</h2>
            {venue.address && (
              <a
                href={`https://map.naver.com/v5/search/${encodeURIComponent(venue.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-[#516200] underline underline-offset-2"
              >
                <MapPin className="h-4 w-4 shrink-0" />
                {venue.address}
              </a>
            )}
            {venue.memo && (
              <p className="text-sm text-surface-600">{venue.memo}</p>
            )}
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
            {venue.address && (
              <a
                href={`https://map.naver.com/v5/search/${encodeURIComponent(venue.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button fullWidth intent="primary" size="lg">
                  네이버 지도에서 보기
                </Button>
              </a>
            )}
            {venue.reservationUrl && (
              <a href={venue.reservationUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button fullWidth intent="secondary" size="lg">
                  예약 페이지 열기
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
      {!isCompleted && (
        <>
          <Button
            fullWidth
            size="lg"
            intent="primary"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
          >
            모임 완료
          </Button>
          {completeMutation.error && (
            <p className="text-base text-danger">{(completeMutation.error as Error).message}</p>
          )}
        </>
      )}

      {/* Delete */}
      {!showDeleteConfirm ? (
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full rounded-xl py-3 text-sm font-semibold text-danger transition hover:bg-danger/5"
        >
          모임 삭제
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-danger/20 bg-danger/5 p-4">
          <p className="text-sm font-bold text-danger">모임을 삭제하시겠습니까?</p>
          <p className="text-xs text-surface-600">모임에 포함된 모든 경기, 세트, 기록이 함께 삭제됩니다.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              intent="neutral"
              size="sm"
              fullWidth
              onClick={() => setShowDeleteConfirm(false)}
            >
              취소
            </Button>
            <Button
              intent="danger"
              size="sm"
              fullWidth
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '삭제 중...' : '삭제'}
            </Button>
          </div>
          {deleteMutation.error && (
            <p className="text-xs text-danger">{(deleteMutation.error as Error).message}</p>
          )}
        </div>
      )}
    </PageFrame>
  )
}
