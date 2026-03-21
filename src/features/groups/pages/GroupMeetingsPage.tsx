import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, MapPin, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Input } from '@/components/ui/Input'
import { StatusChip } from '@/components/ui/StatusChip'
import {
  apiCreateMeeting,
  apiListMatches,
  apiListMeetings,
  apiListMembers,
  apiListVenues,
  apiUpdateMeetingStatus,
  queryKeys,
} from '@/services/api'
import { ERR } from '@/lib/constants'
import { useAuthStore } from '@/store/auth-store'
import type { Meeting } from '@/types/domain'

const schema = z.object({
  title: z.string().min(2, '모임명을 입력하세요.'),
  date: z.string().min(1, '날짜를 입력하세요.'),
  startTime: z.string().min(1, '시작시간을 입력하세요.'),
  venueId: z.string().optional(),
  participantIds: z.array(z.string()).default([]),
})

type FormValues = z.infer<typeof schema>
type FormInput = z.input<typeof schema>

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function parseDateBlock(dateStr: string) {
  const d = new Date(dateStr)
  return {
    month: MONTH_ABBR[d.getMonth()] ?? '',
    day: String(d.getDate()),
  }
}

export function GroupMeetingsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const meetingsQuery = useQuery({
    queryKey: queryKeys.meetings(groupId ?? ''),
    queryFn: () => apiListMeetings(groupId ?? ''),
    enabled: Boolean(groupId),
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      date: new Date().toISOString().slice(0, 10),
      startTime: '19:00',
      venueId: '',
      participantIds: [],
    },
  })
  const selectedVenueId = useWatch({
    control,
    name: 'venueId',
  })

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user || !groupId) {
        throw new Error(ERR.INVALID_USER_GROUP)
      }

      const participantIds = values.participantIds.length > 0 ? values.participantIds : [user.id]

      return apiCreateMeeting(user.id, {
        groupId,
        title: values.title,
        date: values.date,
        startTime: values.startTime,
        participantIds,
        venueId: values.venueId || undefined,
      })
    },
    onSuccess: async () => {
      reset()
      setShowCreateForm(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ meetingId, status }: { meetingId: string; status: 'scheduled' | 'in_progress' | 'completed' }) => {
      if (!user) {
        throw new Error(ERR.LOGIN_REQUIRED)
      }

      return apiUpdateMeetingStatus(user.id, meetingId, status)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.meetings(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  if (!groupId) {
    return null
  }

  const allMeetings = meetingsQuery.data ?? []
  const inProgressMeetings = allMeetings.filter((m) => m.status === 'in_progress')
  const scheduledMeetings = allMeetings.filter((m) => m.status === 'scheduled')
  const completedMeetings = allMeetings.filter((m) => m.status === 'completed')

  // Fetch matches for first in-progress meeting to show live score
  const liveMeetingId = inProgressMeetings[0]?.id
  const liveMatchesQuery = useQuery({
    queryKey: queryKeys.matches(liveMeetingId ?? ''),
    queryFn: () => apiListMatches(liveMeetingId ?? ''),
    enabled: Boolean(liveMeetingId),
    refetchInterval: 10_000,
  })

  const venueName = (meeting: Meeting) => {
    if (!meeting.venueId) return null
    return venuesQuery.data?.find((v) => v.id === meeting.venueId)?.name ?? null
  }

  // Compute aggregate match score for live meeting (wins per team across all matches)
  const liveScoreDisplay = useMemo(() => {
    const matches = liveMatchesQuery.data
    if (!matches?.length) return null

    let teamAWins = 0
    let teamBWins = 0
    let teamAName = ''
    let teamBName = ''

    for (const { match, teams, sets } of matches) {
      if (!teamAName && teams[0]) teamAName = teams[0].name
      if (!teamBName && teams[1]) teamBName = teams[1].name

      if (match.status === 'completed' && match.winnerTeamId) {
        if (match.winnerTeamId === teams[0]?.id) teamAWins++
        else teamBWins++
      } else {
        // Count set wins for in-progress matches
        for (const set of sets) {
          if (set.status === 'completed' && set.winnerTeamId) {
            if (set.winnerTeamId === teams[0]?.id) teamAWins++
            else teamBWins++
          }
        }
      }
    }

    return { teamAWins, teamBWins, teamAName, teamBName }
  }, [liveMatchesQuery.data])

  return (
    <PageFrame className="space-y-6 pt-6">
      {/* ── 진행 중인 모임 ── */}
      {inProgressMeetings.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold tracking-wide text-text-secondary">
            진행 중인 모임
          </h2>

          {inProgressMeetings.map((meeting) => (
            <div key={meeting.id} className="relative">
              {/* Kinetic gradient glow */}
              <div
                className="absolute -inset-2 rounded-[2rem] opacity-50 blur-2xl"
                style={{
                  background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)',
                }}
                aria-hidden
              />

              {/* Hero card */}
              <div className="relative overflow-hidden rounded-[1.5rem] bg-surface-50 p-5 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                {/* Top row: status badge + participant avatars */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f95630] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
                    경기 진행 중
                  </span>
                  {/* Participant avatars */}
                  <div className="flex -space-x-2">
                    {(membersQuery.data ?? []).slice(0, 3).map((m) => (
                      <div
                        key={m.id}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-300 text-[9px] font-bold text-surface-700 ring-2 ring-white"
                      >
                        {m.profile.name.charAt(0)}
                      </div>
                    ))}
                    {(membersQuery.data ?? []).length > 3 && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-300 text-[9px] font-bold text-surface-700 ring-2 ring-white">
                        +{(membersQuery.data ?? []).length - 3}
                      </div>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="mt-3 font-display text-2xl font-extrabold leading-tight text-text-primary">
                  {meeting.title}
                </h3>

                {/* Location */}
                {venueName(meeting) && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                    <MapPin className="h-4 w-4" aria-hidden />
                    {venueName(meeting)}
                  </p>
                )}

                {/* Match Score */}
                {liveScoreDisplay && meeting.id === liveMeetingId && (
                  <div className="mt-4 flex items-end justify-between">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-surface-600">
                        MATCH SCORE
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-4xl font-black text-[#516200]">
                          {liveScoreDisplay.teamAWins}
                        </span>
                        <span className="text-xl font-black text-surface-400">:</span>
                        <span className="font-display text-4xl font-black text-surface-600">
                          {liveScoreDisplay.teamBWins}
                        </span>
                      </div>
                    </div>

                    {/* CTA Button */}
                    <Link to={`/g/${groupId}/m/${meeting.id}/matches`}>
                      <button
                        type="button"
                        className="flex min-h-12 items-center justify-center rounded-xl px-6 text-sm font-bold text-[#3c4a00] shadow-lg shadow-[#516200]/20 transition hover:brightness-95 active:scale-95"
                        style={{
                          background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)',
                        }}
                      >
                        실시간 중계 보기
                      </button>
                    </Link>
                  </div>
                )}

                {/* Fallback CTA when no live score */}
                {(!liveScoreDisplay || meeting.id !== liveMeetingId) && (
                  <Link to={`/g/${groupId}/m/${meeting.id}/matches`} className="mt-4 block">
                    <button
                      type="button"
                      className="flex min-h-14 w-full items-center justify-center rounded-[0.75rem] text-lg font-bold text-[#0c0f10] transition hover:brightness-95 active:translate-y-px"
                      style={{
                        background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)',
                      }}
                    >
                      실시간 중계 보기
                    </button>
                  </Link>
                )}

                {/* Admin actions (small, top-right) */}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      statusMutation.mutate({ meetingId: meeting.id, status: 'scheduled' })
                    }
                    disabled={statusMutation.isPending}
                    className="inline-flex min-h-8 items-center rounded-full bg-surface-200 px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-300 disabled:opacity-50"
                  >
                    예정으로
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      statusMutation.mutate({ meetingId: meeting.id, status: 'completed' })
                    }
                    disabled={statusMutation.isPending}
                    className="inline-flex min-h-8 items-center rounded-full bg-surface-900 px-3 text-xs font-semibold text-white transition hover:bg-surface-800 disabled:opacity-50"
                  >
                    모임 완료
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── 예정된 모임 ── */}
      {scheduledMeetings.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold tracking-wide text-text-secondary">
              예정된 모임
            </h2>
            {scheduledMeetings.length > 3 && (
              <span className="flex items-center gap-0.5 text-sm font-semibold text-primary">
                전체보기 <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            )}
          </div>

          <div className="space-y-2">
            {scheduledMeetings.map((meeting, idx) => {
              const { month, day } = parseDateBlock(meeting.date)
              const opacity = idx <= 1 ? 1 : Math.max(0.45, 1 - idx * 0.15)

              return (
                <div
                  key={meeting.id}
                  className="flex items-center gap-3 rounded-2xl bg-surface-50 p-4 shadow-[0_20px_40px_rgba(44,47,48,0.06)] transition"
                  style={{ opacity }}
                >
                  {/* Date block */}
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-200">
                    <span className="text-[10px] font-bold uppercase leading-none tracking-wider text-text-secondary">
                      {month}
                    </span>
                    <span className="font-display text-xl font-black leading-tight text-text-primary">
                      {day}
                    </span>
                  </div>

                  {/* Meeting info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-text-primary">
                      {meeting.title}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-text-secondary">
                      {meeting.startTime}
                      {venueName(meeting) ? ` · ${venueName(meeting)}` : ''}
                    </p>
                  </div>

                  {/* Action button */}
                  <Link
                    to={`/g/${groupId}/m/${meeting.id}/matches`}
                    className="inline-flex shrink-0 min-h-9 items-center justify-center rounded-lg bg-[#d1fc00] px-4 text-xs font-bold text-[#3c4a00] transition hover:bg-[#c4ec00] active:scale-95"
                  >
                    모임 보기
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 완료된 모임 ── */}
      {completedMeetings.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold tracking-wide text-text-secondary">
            지난 모임
          </h2>

          <div className="space-y-2">
            {completedMeetings.map((meeting) => {
              const { month, day } = parseDateBlock(meeting.date)

              return (
                <Link
                  key={meeting.id}
                  to={`/g/${groupId}/m/${meeting.id}/matches`}
                  className="flex items-center gap-3 rounded-2xl bg-surface-50 p-4 opacity-60 shadow-[0_20px_40px_rgba(44,47,48,0.06)] transition hover:opacity-80"
                >
                  {/* Date block */}
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-200">
                    <span className="text-[10px] font-bold uppercase leading-none tracking-wider text-text-secondary">
                      {month}
                    </span>
                    <span className="font-display text-xl font-black leading-tight text-text-primary">
                      {day}
                    </span>
                  </div>

                  {/* Meeting info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-text-primary">
                      {meeting.title}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-text-secondary">
                      {meeting.startTime}
                      {venueName(meeting) ? ` · ${venueName(meeting)}` : ''}
                    </p>
                  </div>

                  <StatusChip status="completed" />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Empty state ── */}
      {allMeetings.length === 0 && !meetingsQuery.isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-200">
            <CalendarDays className="h-8 w-8 text-surface-600" />
          </div>
          <p className="mt-4 font-display text-lg font-bold text-text-primary">아직 모임이 없습니다</p>
          <p className="mt-1 text-sm text-text-secondary">
            아래 + 버튼을 눌러 새 모임을 만들어 보세요.
          </p>
        </div>
      )}

      {/* ── FAB: create meeting ── */}
      <button
        type="button"
        onClick={() => setShowCreateForm(true)}
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full text-[#0c0f10] shadow-[0_8px_24px_rgba(81,98,0,0.3)] transition hover:brightness-95 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)',
        }}
        aria-label="새 모임 만들기"
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </button>

      {/* ── Create Meeting Full-Screen Form ── */}
      {showCreateForm &&
        createPortal(
          <div className="fixed inset-0 z-[80] bg-surface-100">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center text-surface-700"
                onClick={() => setShowCreateForm(false)}
                aria-label="닫기"
              >
                <X className="h-6 w-6" />
              </button>
              <h2 className="font-display text-lg font-bold text-text-primary">새로운 모임 만들기</h2>
              <button type="button" className="inline-flex h-10 w-10 items-center justify-center text-surface-700">
                <span className="text-lg">⋮</span>
              </button>
            </div>

            {/* Scrollable Form */}
            <form
              className="flex h-[calc(100%-4rem)] flex-col overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))]"
              onSubmit={handleSubmit((values) => createMutation.mutate(values))}
            >
              {/* Toggle: 정기모임 / 번개모임 */}
              <div className="mb-6 flex gap-2">
                <span className="rounded-full bg-[#d1fc00] px-5 py-2 text-sm font-bold text-[#3c4a00]">
                  정기모임
                </span>
                <span className="rounded-full bg-surface-200 px-5 py-2 text-sm font-medium text-surface-600">
                  번개모임
                </span>
              </div>

              {/* Moim Name */}
              <Input label="모임 이름" error={errors.title?.message} {...register('title')} />

              {/* Date / Time side by side */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">DATE</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="date"
                      className="min-h-10 w-full bg-transparent text-lg font-bold text-text-primary outline-none"
                      {...register('date')}
                    />
                    <CalendarDays className="h-5 w-5 shrink-0 text-surface-500" />
                  </div>
                  {errors.date?.message && <p className="mt-1 text-xs text-danger">{errors.date.message}</p>}
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">TIME</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="time"
                      className="min-h-10 w-full bg-transparent text-lg font-bold text-text-primary outline-none"
                      {...register('startTime')}
                    />
                  </div>
                  {errors.startTime?.message && <p className="mt-1 text-xs text-danger">{errors.startTime.message}</p>}
                </div>
              </div>

              {/* 장소 선택 */}
              <div className="mb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-base font-bold text-text-primary">장소 선택</span>
                  <Link to={`/g/${groupId}/more`} className="text-xs font-bold text-[#516200]" onClick={() => setShowCreateForm(false)}>
                    관리
                  </Link>
                </div>
                {/* Venue chips (horizontal scroll) */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <button
                    type="button"
                    onClick={() => setValue('venueId', '', { shouldDirty: true })}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                      !selectedVenueId
                        ? 'bg-[#d1fc00] text-[#3c4a00]'
                        : 'bg-surface-200 text-surface-600'
                    }`}
                  >
                    미지정
                  </button>
                  {(venuesQuery.data ?? []).map((venue) => (
                    <button
                      type="button"
                      key={venue.id}
                      onClick={() => setValue('venueId', venue.id, { shouldDirty: true })}
                      className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                        selectedVenueId === venue.id
                          ? 'bg-[#d1fc00] text-[#3c4a00]'
                          : 'bg-surface-200 text-surface-600'
                      }`}
                    >
                      {venue.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 참가 멤버 선택 */}
              <div className="mb-6 flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-base font-bold text-text-primary">
                    참가 멤버 선택 <span className="ml-1 text-[#516200]">{membersQuery.data?.length ?? 0}</span>
                  </span>
                  <span className="text-xs font-bold text-[#516200]">전체선택</span>
                </div>

                {/* Member list */}
                <div className="space-y-1 rounded-2xl bg-white p-3 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
                  {membersQuery.data?.length ? (
                    membersQuery.data.map((member, idx) => (
                      <label
                        key={member.id}
                        className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition ${
                          idx % 2 === 1 ? 'bg-surface-100' : ''
                        }`}
                      >
                        <input
                          className="h-0 w-0 opacity-0"
                          type="checkbox"
                          value={member.profileId}
                          {...register('participantIds')}
                        />
                        {/* Avatar */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-300 text-sm font-bold text-surface-700">
                          {member.profile.name.charAt(0)}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-text-primary">
                            {member.profile.name}
                            {member.role === 'owner' && (
                              <span className="ml-1 text-xs font-medium text-[#516200]">(Captain)</span>
                            )}
                          </p>
                          <p className="text-[11px] text-surface-600">
                            {member.role} · LV.{Math.floor(Math.random() * 5) + 1}
                          </p>
                        </div>
                        {/* Check indicator */}
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d1fc00] text-[#3c4a00] opacity-0 transition [input:checked~&]:opacity-100">
                          <span className="text-xs font-bold">✓</span>
                        </div>
                      </label>
                    ))
                  ) : (
                    <p className="py-4 text-center text-sm text-surface-600">멤버 정보를 불러오는 중입니다.</p>
                  )}
                </div>
                {errors.participantIds?.message && (
                  <p className="text-sm font-semibold text-danger">{errors.participantIds.message}</p>
                )}
              </div>

              {/* Error */}
              {createMutation.error && (
                <p className="mb-3 text-sm font-semibold text-danger">{(createMutation.error as Error).message}</p>
              )}

              {/* CTA */}
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex min-h-14 w-full items-center justify-center rounded-2xl text-lg font-bold text-[#3c4a00] shadow-lg shadow-[#516200]/20 transition active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)' }}
              >
                {createMutation.isPending ? '생성 중...' : '모임 생성하기 →'}
              </button>
            </form>
          </div>,
          document.body,
        )}
    </PageFrame>
  )
}
