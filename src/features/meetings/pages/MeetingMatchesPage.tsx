import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, Timer, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { MemberCapsuleSelect } from '@/components/ui/MemberCapsuleSelect'
import { PositionPickerSheet } from '@/components/ui/PositionPickerSheet'
import { SelectField } from '@/components/ui/SelectField'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import {
  assignMemberPositionWithSwap,
  buildOrderedPlayerIdsByPosition,
  computeDisabledMemberIds,
  isCompleteTeamPositionAssignment,
  normalizeTeamPositionMap,
  removeMemberFromTeamSelection,
  stripRefereeFromTeamPositionMaps,
  stripRefereeFromTeamSelections,
  type PositionMap,
} from '@/features/meetings/lib/match-form'
import { ERR, FORMAT_LABEL } from '@/lib/constants'
import { apiCreateMatch, apiGetMeeting, apiListMatches, apiListMembers, queryKeys } from '@/services/api'
import { useAuthStore } from '@/store/auth-store'
import type { MatchFormat, TeamSize } from '@/types/domain'

const schema = z
  .object({
    format: z.enum(['single', 'best_of_3', 'best_of_5']),
    teamSize: z.number().int().min(2).max(4),
    targetScore: z.number().int().min(5).max(50),
    deuce: z.boolean(),
    teamAName: z.string().min(1, '팀 A 이름을 입력하세요.'),
    teamBName: z.string().min(1, '팀 B 이름을 입력하세요.'),
    firstServingTeamIndex: z.number().int().min(0).max(1),
    penaltyText: z.string().optional(),
    refereeProfileId: z.string().optional(),
    teamAPlayerIds: z.array(z.string()).default([]),
    teamBPlayerIds: z.array(z.string()).default([]),
    teamAPositionMap: z.record(z.string(), z.number().int().min(1).max(4)).default({}),
    teamBPositionMap: z.record(z.string(), z.number().int().min(1).max(4)).default({}),
  })
  .superRefine((value, ctx) => {
    if (value.teamAPlayerIds.length !== value.teamSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamAPlayerIds'],
        message: `팀 A는 ${value.teamSize}명을 선택해야 합니다.`,
      })
    }

    if (value.teamBPlayerIds.length !== value.teamSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamBPlayerIds'],
        message: `팀 B는 ${value.teamSize}명을 선택해야 합니다.`,
      })
    }

    const duplicate = value.teamAPlayerIds.find((profileId) => value.teamBPlayerIds.includes(profileId))
    if (duplicate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamBPlayerIds'],
        message: '한 멤버를 두 팀에 중복 배정할 수 없습니다.',
      })
    }

    if (!isCompleteTeamPositionAssignment(value.teamAPlayerIds, value.teamAPositionMap, value.teamSize)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamAPositionMap'],
        message: '팀 A 포지션을 모두 지정하세요.',
      })
    }

    if (!isCompleteTeamPositionAssignment(value.teamBPlayerIds, value.teamBPositionMap, value.teamSize)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['teamBPositionMap'],
        message: '팀 B 포지션을 모두 지정하세요.',
      })
    }
  })

type FormValues = z.infer<typeof schema>
type FormInput = z.input<typeof schema>


function resolveCompletedSetWinnerTeamId(set: {
  status: string
  winnerTeamId?: string
  teamIds: [string, string]
  score: Record<string, number>
}): string | null {
  if (set.winnerTeamId) {
    return set.winnerTeamId
  }

  if (set.status !== 'completed') {
    return null
  }

  const [teamAId, teamBId] = set.teamIds
  const scoreA = set.score[teamAId] ?? 0
  const scoreB = set.score[teamBId] ?? 0

  if (scoreA === scoreB) {
    return null
  }

  return scoreA > scoreB ? teamAId : teamBId
}

function resolveMatchWinnerTeamId(
  match: { requiredSetWins: number; winnerTeamId?: string },
  sets: Array<{
    status: string
    winnerTeamId?: string
    teamIds: [string, string]
    score: Record<string, number>
  }>,
): string | null {
  if (match.winnerTeamId) {
    return match.winnerTeamId
  }

  const wins = new Map<string, number>()
  for (const set of sets) {
    const winnerTeamId = resolveCompletedSetWinnerTeamId(set)
    if (!winnerTeamId) {
      continue
    }

    wins.set(winnerTeamId, (wins.get(winnerTeamId) ?? 0) + 1)
    if ((wins.get(winnerTeamId) ?? 0) >= match.requiredSetWins) {
      return winnerTeamId
    }
  }

  return null
}

export function MeetingMatchesPage() {
  const { groupId, meetingId } = useParams<{ groupId: string; meetingId: string }>()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [positionPickerState, setPositionPickerState] = useState<{
    open: boolean
    team: 'A' | 'B'
    memberId: string
  } | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const meetingQuery = useQuery({
    queryKey: queryKeys.meeting(meetingId ?? ''),
    queryFn: () => apiGetMeeting(meetingId ?? ''),
    enabled: Boolean(meetingId),
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.members(groupId ?? ''),
    queryFn: () => apiListMembers(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const matchesQuery = useQuery({
    queryKey: queryKeys.matches(meetingId ?? ''),
    queryFn: () => apiListMatches(meetingId ?? ''),
    enabled: Boolean(meetingId),
  })

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      format: 'best_of_3',
      teamSize: 3,
      targetScore: 15,
      deuce: true,
      teamAName: 'A팀',
      teamBName: 'B팀',
      firstServingTeamIndex: 0,
      penaltyText: '',
      refereeProfileId: '',
      teamAPlayerIds: [],
      teamBPlayerIds: [],
      teamAPositionMap: {},
      teamBPositionMap: {},
    },
  })

  const teamASelection =
    useWatch({
      control,
      name: 'teamAPlayerIds',
      defaultValue: [],
    }) as string[]

  const teamBSelection =
    useWatch({
      control,
      name: 'teamBPlayerIds',
      defaultValue: [],
    }) as string[]

  const teamAPositionMap =
    useWatch({
      control,
      name: 'teamAPositionMap',
      defaultValue: {},
    }) as PositionMap

  const teamBPositionMap =
    useWatch({
      control,
      name: 'teamBPositionMap',
      defaultValue: {},
    }) as PositionMap

  const selectedFormat =
    useWatch({
      control,
      name: 'format',
    }) ?? 'best_of_3'

  const selectedTeamSize =
    useWatch({
      control,
      name: 'teamSize',
    }) ?? 3

  const selectedRefereeId =
    useWatch({
      control,
      name: 'refereeProfileId',
    }) ?? ''

  const deuceEnabled =
    useWatch({
      control,
      name: 'deuce',
    }) ?? true

  const selectedFirstServingTeamIndex = String(
    useWatch({
      control,
      name: 'firstServingTeamIndex',
    }) ?? 0,
  )

  const memberOptions = (membersQuery.data ?? []).map((member) => ({
    id: member.profileId,
    name: member.profile.name,
  }))

  const memberNameMap = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.profileId, member.profile.name])),
    [membersQuery.data],
  )
  const memberIds = memberOptions.map((member) => member.id)

  const normalizedTeamAPositionMap = normalizeTeamPositionMap(teamASelection, teamAPositionMap, selectedTeamSize)
  const normalizedTeamBPositionMap = normalizeTeamPositionMap(teamBSelection, teamBPositionMap, selectedTeamSize)

  const teamADisabledIds = computeDisabledMemberIds({
    memberIds,
    selectedIds: teamASelection,
    opponentSelectedIds: teamBSelection,
    selectedRefereeId: selectedRefereeId || undefined,
    teamSize: selectedTeamSize,
  })

  const teamBDisabledIds = computeDisabledMemberIds({
    memberIds,
    selectedIds: teamBSelection,
    opponentSelectedIds: teamASelection,
    selectedRefereeId: selectedRefereeId || undefined,
    teamSize: selectedTeamSize,
  })

  useEffect(() => {
    const nextTeamASelection = teamASelection.slice(0, selectedTeamSize)
    const nextTeamBSelection = teamBSelection.slice(0, selectedTeamSize)
    const nextTeamAPositionMap = normalizeTeamPositionMap(nextTeamASelection, teamAPositionMap, selectedTeamSize)
    const nextTeamBPositionMap = normalizeTeamPositionMap(nextTeamBSelection, teamBPositionMap, selectedTeamSize)

    if (nextTeamASelection.length !== teamASelection.length) {
      setValue('teamAPlayerIds', nextTeamASelection, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    if (nextTeamBSelection.length !== teamBSelection.length) {
      setValue('teamBPlayerIds', nextTeamBSelection, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    if (JSON.stringify(nextTeamAPositionMap) !== JSON.stringify(teamAPositionMap)) {
      setValue('teamAPositionMap', nextTeamAPositionMap, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    if (JSON.stringify(nextTeamBPositionMap) !== JSON.stringify(teamBPositionMap)) {
      setValue('teamBPositionMap', nextTeamBPositionMap, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [selectedTeamSize, setValue, teamASelection, teamBSelection, teamAPositionMap, teamBPositionMap])

  const createMatchMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user || !groupId || !meetingId) {
        throw new Error(ERR.INVALID_USER_GROUP_MEETING)
      }

      if (meetingQuery.data?.status === 'completed') {
        throw new Error('완료된 모임에서는 매치를 생성할 수 없습니다.')
      }

      const teamAPlayerIds = buildOrderedPlayerIdsByPosition(values.teamAPlayerIds, values.teamAPositionMap, values.teamSize)
      const teamBPlayerIds = buildOrderedPlayerIdsByPosition(values.teamBPlayerIds, values.teamBPositionMap, values.teamSize)

      return apiCreateMatch(user.id, {
        groupId,
        meetingId,
        format: values.format,
        teamSize: values.teamSize as TeamSize,
        targetScore: values.targetScore,
        deuce: values.deuce,
        penaltyText: values.penaltyText,
        refereeProfileId: values.refereeProfileId?.trim() || undefined,
        firstServingTeamIndex: values.firstServingTeamIndex as 0 | 1,
        teams: [
          {
            name: values.teamAName,
            playerIds: teamAPlayerIds,
          },
          {
            name: values.teamBName,
            playerIds: teamBPlayerIds,
          },
        ],
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.meeting(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
      setValue('teamAPlayerIds', [], { shouldDirty: true })
      setValue('teamBPlayerIds', [], { shouldDirty: true })
      setValue('teamAPositionMap', {}, { shouldDirty: true })
      setValue('teamBPositionMap', {}, { shouldDirty: true })
    },
  })

  if (!groupId || !meetingId) {
    return null
  }

  const handleRefereeChange = (value: string) => {
    const normalized = value.trim()
    const nextRefereeId = normalized || undefined
    const { teamAIds, teamBIds } = stripRefereeFromTeamSelections(teamASelection, teamBSelection, nextRefereeId)
    const { teamAPositionMap: nextTeamAPositionMap, teamBPositionMap: nextTeamBPositionMap } = stripRefereeFromTeamPositionMaps(
      teamAPositionMap,
      teamBPositionMap,
      nextRefereeId,
    )

    setValue('teamAPlayerIds', teamAIds, {
      shouldDirty: true,
      shouldValidate: true,
    })
    setValue('teamBPlayerIds', teamBIds, {
      shouldDirty: true,
      shouldValidate: true,
    })
    setValue('teamAPositionMap', normalizeTeamPositionMap(teamAIds, nextTeamAPositionMap, selectedTeamSize), {
      shouldDirty: true,
      shouldValidate: true,
    })
    setValue('teamBPositionMap', normalizeTeamPositionMap(teamBIds, nextTeamBPositionMap, selectedTeamSize), {
      shouldDirty: true,
      shouldValidate: true,
    })
    setValue('refereeProfileId', value, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const handlePressTeamMember = (team: 'A' | 'B', profileId: string) => {
    const selected = team === 'A' ? teamASelection.includes(profileId) : teamBSelection.includes(profileId)
    const disabled = team === 'A' ? teamADisabledIds.has(profileId) : teamBDisabledIds.has(profileId)

    if (!selected && disabled) {
      return
    }

    setPositionPickerState({
      open: true,
      team,
      memberId: profileId,
    })
  }

  const applyPositionSelection = (positionNo: number) => {
    if (!positionPickerState) {
      return
    }

    if (positionPickerState.team === 'A') {
      const next = assignMemberPositionWithSwap({
        selectedIds: teamASelection,
        positionMap: teamAPositionMap,
        memberId: positionPickerState.memberId,
        positionNo,
        teamSize: selectedTeamSize,
      })

      setValue('teamAPlayerIds', next.selectedIds, {
        shouldDirty: true,
        shouldValidate: true,
      })
      setValue('teamAPositionMap', next.positionMap, {
        shouldDirty: true,
        shouldValidate: true,
      })
    } else {
      const next = assignMemberPositionWithSwap({
        selectedIds: teamBSelection,
        positionMap: teamBPositionMap,
        memberId: positionPickerState.memberId,
        positionNo,
        teamSize: selectedTeamSize,
      })

      setValue('teamBPlayerIds', next.selectedIds, {
        shouldDirty: true,
        shouldValidate: true,
      })
      setValue('teamBPositionMap', next.positionMap, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }

  const handleClearMember = () => {
    if (!positionPickerState) {
      return
    }

    if (positionPickerState.team === 'A') {
      const next = removeMemberFromTeamSelection({
        selectedIds: teamASelection,
        positionMap: teamAPositionMap,
        memberId: positionPickerState.memberId,
        teamSize: selectedTeamSize,
      })

      setValue('teamAPlayerIds', next.selectedIds, {
        shouldDirty: true,
        shouldValidate: true,
      })
      setValue('teamAPositionMap', next.positionMap, {
        shouldDirty: true,
        shouldValidate: true,
      })
      return
    }

    const next = removeMemberFromTeamSelection({
      selectedIds: teamBSelection,
      positionMap: teamBPositionMap,
      memberId: positionPickerState.memberId,
      teamSize: selectedTeamSize,
    })

    setValue('teamBPlayerIds', next.selectedIds, {
      shouldDirty: true,
      shouldValidate: true,
    })
    setValue('teamBPositionMap', next.positionMap, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const meetingCompleted = meetingQuery.data?.status === 'completed'

  const pickerSelected = positionPickerState?.team === 'A'
    ? teamASelection.includes(positionPickerState.memberId)
    : positionPickerState?.team === 'B'
      ? teamBSelection.includes(positionPickerState.memberId)
      : false

  const pickerPositionMap = positionPickerState?.team === 'A' ? normalizedTeamAPositionMap : normalizedTeamBPositionMap
  const pickerSelectedPositionNo = positionPickerState ? pickerPositionMap[positionPickerState.memberId] : undefined

  let pickerOccupancyByPosition: Record<number, string> = {}
  if (positionPickerState) {
    const map = positionPickerState.team === 'A' ? normalizedTeamAPositionMap : normalizedTeamBPositionMap
    const occupancy: Record<number, string> = {}

    for (const [memberId, positionNo] of Object.entries(map)) {
      occupancy[positionNo] = memberNameMap.get(memberId) ?? '멤버'
    }

    pickerOccupancyByPosition = occupancy
  }

  const teamAErrorMessage =
    typeof errors.teamAPlayerIds?.message === 'string'
      ? errors.teamAPlayerIds.message
      : typeof errors.teamAPositionMap?.message === 'string'
        ? errors.teamAPositionMap.message
        : undefined

  const teamBErrorMessage =
    typeof errors.teamBPlayerIds?.message === 'string'
      ? errors.teamBPlayerIds.message
      : typeof errors.teamBPositionMap?.message === 'string'
        ? errors.teamBPositionMap.message
        : undefined

  // Split matches into live vs rest
  const liveMatches = (matchesQuery.data ?? []).filter((m) => m.match.status === 'in_progress')

  return (
    <PageFrame className="space-y-8 pt-6 pb-32">
      {/* ── Section: 진행 중인 경기 ─────────────────────── */}
      {liveMatches.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between px-1">
            <h2 className="font-display text-xl font-bold tracking-tight">진행 중인 경기</h2>
            <span className="rounded-full bg-[#f95630] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white animate-pulse">
              Live Now
            </span>
          </div>

          {liveMatches.map(({ match, teams, sets }) => {
            const activeSet = sets.find((s) => s.status === 'in_progress')
              ?? sets.filter((s) => s.status === 'completed').sort((a, b) => b.setNo - a.setNo)[0]
              ?? sets[0]
            const teamA = teams[0]
            const teamB = teams[1]
            const scoreA = activeSet ? (activeSet.score[teamA?.id ?? ''] ?? 0) : 0
            const scoreB = activeSet ? (activeSet.score[teamB?.id ?? ''] ?? 0) : 0
            const targetScore = activeSet?.targetScore ?? match.targetScore
            const progress = targetScore > 0 ? Math.round((Math.max(scoreA, scoreB) / targetScore) * 100) : 0

            return (
              <Link key={match.id} to={`/g/${groupId}/m/${meetingId}/match/${match.id}/set/${activeSet?.id ?? ''}/live`}>
                <div className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                  {/* Kinetic blur */}
                  <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#d1fc00]/30 blur-2xl" />

                  <div className="relative z-10 flex flex-col items-center gap-4">
                    {/* Match info */}
                    <div className="flex items-center gap-2 text-surface-600">
                      <Timer className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-bold tracking-wider">
                        {activeSet?.setNo ?? 1}세트: {FORMAT_LABEL[match.format]} / {match.teamSize}v{match.teamSize} / {targetScore}점
                      </span>
                    </div>

                    {/* Scores */}
                    <div className="flex w-full items-center justify-between px-2">
                      <div className="flex flex-1 flex-col items-center gap-2">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-300 text-xl font-black text-[#516200] shadow-inner">
                          A
                        </div>
                        <span className="text-xs font-bold text-surface-600">{teamA?.name ?? 'Team A'}</span>
                      </div>

                      <div className="flex flex-1 flex-col items-center">
                        <div className="flex items-center gap-3">
                          <span className="font-display text-5xl font-black tracking-tighter">{String(scoreA).padStart(2, '0')}</span>
                          <span className="text-2xl font-black text-surface-400">:</span>
                          <span className="font-display text-5xl font-black tracking-tighter">{String(scoreB).padStart(2, '0')}</span>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col items-center gap-2">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-300 text-xl font-black text-[#0059b6] shadow-inner">
                          B
                        </div>
                        <span className="text-xs font-bold text-surface-600">{teamB?.name ?? 'Team B'}</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 w-full rounded-2xl bg-[#d1fc00]/30 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#516200]">SET PROGRESS</span>
                        <span className="text-[10px] font-bold text-[#516200]">{progress}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/50">
                        <div className="h-full rounded-full bg-[#516200] transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </section>
      )}

      {/* ── Section: 경기 기록 ──────────────────────────── */}
      {(matchesQuery.data ?? []).length > 0 && (
        <section className="space-y-4">
          <h2 className="px-1 font-display text-xl font-bold tracking-tight">경기 기록</h2>
          <div className="space-y-4">
            {(matchesQuery.data ?? []).map(({ match, teams, sets }) => {
              const teamA = teams[0]
              const teamB = teams[1]
              const winnerTeamId = resolveMatchWinnerTeamId(match, sets)

              // Aggregate set wins or show current set score for live
              let winsA = 0
              let winsB = 0
              const activeSet = sets.find((s) => s.status === 'in_progress')
              if (activeSet && match.status === 'in_progress') {
                winsA = activeSet.score[teamA?.id ?? ''] ?? 0
                winsB = activeSet.score[teamB?.id ?? ''] ?? 0
              } else {
                for (const set of sets) {
                  const swId = resolveCompletedSetWinnerTeamId(set)
                  if (swId === teamA?.id) winsA++
                  else if (swId === teamB?.id) winsB++
                }
              }

              const statusLabel = match.status === 'completed' ? 'FIN' : match.status === 'in_progress' ? 'LIVE' : 'PLN'
              const statusColor = match.status === 'in_progress' ? 'text-[#516200]' : 'text-surface-500'

              return (
                <div key={match.id} className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.03)] transition hover:shadow-lg">
                  {/* Match summary row */}
                  <div className="flex items-center justify-between p-5">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-center">
                        <span className={`text-[10px] font-black ${statusColor}`}>{statusLabel}</span>
                        <span className="text-xs font-bold text-surface-400">{FORMAT_LABEL[match.format]}</span>
                      </div>
                      <div className="h-8 w-[2px] bg-surface-200" />
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-surface-700">{teamA?.name ?? 'Team A'}</span>
                        <span className="text-xs font-bold text-surface-700">{teamB?.name ?? 'Team B'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end">
                        <span className={`font-display text-lg font-black ${winnerTeamId === teamA?.id ? 'text-[#516200]' : 'text-surface-500'}`}>
                          {String(winsA).padStart(2, '0')}
                        </span>
                        <span className={`font-display text-lg font-black ${winnerTeamId === teamB?.id ? 'text-[#516200]' : 'text-surface-500'}`}>
                          {String(winsB).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Set list */}
                  <div className="space-y-0 border-t border-[#abadae]/10 px-4 pb-3 pt-2">
                    {sets.map((set) => {
                      const setScoreA = set.score[teamA?.id ?? ''] ?? 0
                      const setScoreB = set.score[teamB?.id ?? ''] ?? 0
                      const setWinner = resolveCompletedSetWinnerTeamId(set)
                      const isSetLive = set.status === 'in_progress'

                      return (
                        <Link
                          key={set.id}
                          to={`/g/${groupId}/m/${meetingId}/match/${match.id}/set/${set.id}/live`}
                          className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition ${
                            isSetLive ? 'bg-[#d1fc00]/10' : 'hover:bg-surface-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {isSetLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#516200]" />}
                            <span className="text-sm font-bold text-text-primary">세트 {set.setNo}</span>
                            <span className={`text-[10px] font-bold ${
                              isSetLive ? 'text-[#516200]' : set.status === 'completed' ? 'text-surface-500' : 'text-surface-400'
                            }`}>
                              {isSetLive ? 'LIVE' : set.status === 'completed' ? 'FIN' : 'WAIT'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-display text-sm font-black ${setWinner === teamA?.id ? 'text-[#516200]' : 'text-surface-500'}`}>
                              {setScoreA}
                            </span>
                            <span className="text-[10px] text-surface-400">:</span>
                            <span className={`font-display text-sm font-black ${setWinner === teamB?.id ? 'text-[#516200]' : 'text-surface-500'}`}>
                              {setScoreB}
                            </span>
                            <ChevronRight className="h-4 w-4 text-surface-400" />
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!(matchesQuery.data?.length) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-200">
            <span className="text-2xl text-surface-600">⚽</span>
          </div>
          <p className="text-base font-semibold text-surface-700">아직 경기가 없습니다.</p>
          <p className="mt-1 text-sm text-surface-600">+ 버튼으로 새 경기를 만들어 보세요.</p>
        </div>
      )}

      {/* ── FAB Button ─────────────────────────────────── */}
      {!meetingCompleted && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="fixed bottom-24 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#d1fc00] text-[#3c4a00] shadow-xl shadow-[#516200]/20 transition active:scale-95"
        >
          <Plus className="h-8 w-8" strokeWidth={2.5} />
        </button>
      )}

      {/* ── Match Creation Bottom Sheet ────────────────── */}
      {formOpen
        ? createPortal(
            <div className="fixed inset-0 z-[80]">
              <button
                type="button"
                className="absolute inset-0 bg-[#0c0f10]/45"
                aria-label="매치 생성 닫기"
                onClick={() => setFormOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface-50 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                <div className="flex items-center justify-between px-5 py-4">
                  <h2 className="font-display text-xl font-bold">매치 생성</h2>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-200 text-surface-700"
                    onClick={() => setFormOpen(false)}
                    aria-label="닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[72vh] space-y-3 overflow-y-auto px-5 pb-4">
                  <form className="space-y-3" onSubmit={handleSubmit((values) => { createMatchMutation.mutate(values); setFormOpen(false) })}>
                    <div className="grid grid-cols-2 gap-2">
                      <SelectField
                        label="경기 방식"
                        value={selectedFormat}
                        options={[
                          { value: 'single', label: '단판' },
                          { value: 'best_of_3', label: '3판 2선승' },
                          { value: 'best_of_5', label: '5판 3선승' },
                        ]}
                        onChange={(value) => setValue('format', value as MatchFormat, { shouldDirty: true, shouldValidate: true })}
                      />
                      <SelectField
                        label="인원 구성"
                        value={String(selectedTeamSize)}
                        options={[
                          { value: '2', label: '2 vs 2' },
                          { value: '3', label: '3 vs 3' },
                          { value: '4', label: '4 vs 4' },
                        ]}
                        onChange={(value) => setValue('teamSize', Number(value), { shouldDirty: true, shouldValidate: true })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="팀 A 이름" error={errors.teamAName?.message} {...register('teamAName')} />
                      <Input label="팀 B 이름" error={errors.teamBName?.message} {...register('teamBName')} />
                    </div>
                    <SelectField
                      label="심판 (선택)"
                      value={selectedRefereeId}
                      options={[{ value: '', label: '미지정' }, ...memberOptions.map((m) => ({ value: m.id, label: m.name }))]}
                      onChange={handleRefereeChange}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="목표 점수" type="number" min={5} max={50} error={errors.targetScore?.message} {...register('targetScore', { valueAsNumber: true })} />
                      <SelectField
                        label="첫 서브 팀"
                        value={selectedFirstServingTeamIndex}
                        options={[{ value: '0', label: '팀 A' }, { value: '1', label: '팀 B' }]}
                        onChange={(value) => setValue('firstServingTeamIndex', Number(value), { shouldDirty: true, shouldValidate: true })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <MemberCapsuleSelect testId="team-a-capsules" title="팀 A 멤버" members={memberOptions} selectedIds={teamASelection} disabledIds={teamADisabledIds} maxSelectable={selectedTeamSize} teamTone="a" onPressMember={(id) => handlePressTeamMember('A', id)} positionByMemberId={normalizedTeamAPositionMap} error={teamAErrorMessage} />
                      <MemberCapsuleSelect testId="team-b-capsules" title="팀 B 멤버" members={memberOptions} selectedIds={teamBSelection} disabledIds={teamBDisabledIds} maxSelectable={selectedTeamSize} teamTone="b" onPressMember={(id) => handlePressTeamMember('B', id)} positionByMemberId={normalizedTeamBPositionMap} error={teamBErrorMessage} />
                    </div>
                    <ToggleSwitch label="듀스 적용" description={`현재: ${deuceEnabled ? '적용' : '미적용'}`} checked={deuceEnabled} onChange={(c) => setValue('deuce', c, { shouldDirty: true, shouldValidate: true })} />
                    <Input label="벌칙 (선택)" error={errors.penaltyText?.message} {...register('penaltyText')} />
                    {createMatchMutation.error ? <p className="text-sm text-danger">{(createMatchMutation.error as Error).message}</p> : null}
                    <Button type="submit" intent="primary" size="lg" fullWidth disabled={createMatchMutation.isPending}>
                      {createMatchMutation.isPending ? '생성 중...' : '매치 생성'}
                    </Button>
                  </form>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <PositionPickerSheet
        open={Boolean(positionPickerState?.open)}
        title={
          positionPickerState
            ? `${positionPickerState.team === 'A' ? '팀 A' : '팀 B'} · ${memberNameMap.get(positionPickerState.memberId) ?? '멤버'} 포지션`
            : '포지션 선택'
        }
        maxPosition={selectedTeamSize}
        selectedPositionNo={pickerSelectedPositionNo}
        occupancyByPosition={pickerOccupancyByPosition}
        allowClear={Boolean(positionPickerState && pickerSelected)}
        clearLabel="선택 해제"
        onSelect={applyPositionSelection}
        onClear={handleClearMember}
        onClose={() => setPositionPickerState(null)}
      />
    </PageFrame>
  )
}
