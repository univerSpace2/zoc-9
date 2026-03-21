import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { MemberCapsuleSelect } from '@/components/ui/MemberCapsuleSelect'
import { PositionPickerSheet } from '@/components/ui/PositionPickerSheet'
import { SelectField } from '@/components/ui/SelectField'
import { StatusChip } from '@/components/ui/StatusChip'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { WinnerBadge } from '@/components/ui/WinnerBadge'
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
import type { MatchFormat, SetPositionSnapshot, TeamSize } from '@/types/domain'

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

function buildLineupNamesByTeam(
  teamIds: [string, string],
  snapshots: SetPositionSnapshot[],
  memberNameMap: Map<string, string>,
): Map<string, string[]> {
  const result = new Map<string, string[]>()

  for (const teamId of teamIds) {
    const names = snapshots
      .filter((item) => item.teamId === teamId)
      .sort((left, right) => left.positionNo - right.positionNo)
      .map((item) => memberNameMap.get(item.profileId) ?? `포지션 ${item.positionNo}`)

    result.set(teamId, names)
  }

  return result
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

  return (
    <PageFrame className="space-y-4 pt-6">
      <Card className="space-y-3" tone="elevated">
        <h1 className="font-display text-4xl leading-none tracking-[0.03em]">매치</h1>
        <p className="text-base text-surface-700">{meetingQuery.data?.title ?? '모임'}의 매치를 운영합니다.</p>
      </Card>

      <Card className="space-y-3" tone="info">
        <h2 className="text-2xl font-black">매치 생성</h2>
        <p className="text-sm text-surface-600">심판/팀/포지션을 수동 지정해 매치를 생성합니다.</p>
        <form className="space-y-3" onSubmit={handleSubmit((values) => createMatchMutation.mutate(values))}>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="경기 방식"
              value={selectedFormat}
              options={[
                { value: 'single', label: '단판' },
                { value: 'best_of_3', label: '3판 2선승' },
                { value: 'best_of_5', label: '5판 3선승' },
              ]}
              onChange={(value) =>
                setValue('format', value as MatchFormat, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <SelectField
              label="인원 구성"
              value={String(selectedTeamSize)}
              options={[
                { value: '2', label: '2 vs 2' },
                { value: '3', label: '3 vs 3' },
                { value: '4', label: '4 vs 4' },
              ]}
              onChange={(value) =>
                setValue('teamSize', Number(value), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label="팀 A 이름" error={errors.teamAName?.message} {...register('teamAName')} />
            <Input label="팀 B 이름" error={errors.teamBName?.message} {...register('teamBName')} />
          </div>
          <SelectField
            label="심판 (선택)"
            value={selectedRefereeId}
            options={[
              { value: '', label: '미지정' },
              ...memberOptions.map((member) => ({
                value: member.id,
                label: member.name,
              })),
            ]}
            onChange={handleRefereeChange}
          />
          <p className="text-xs text-surface-600">심판으로 지정된 멤버는 팀 선택에서 자동 제외됩니다.</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="목표 점수"
              type="number"
              min={5}
              max={50}
              error={errors.targetScore?.message}
              {...register('targetScore', { valueAsNumber: true })}
            />
            <SelectField
              label="첫 서브 팀"
              value={selectedFirstServingTeamIndex}
              options={[
                { value: '0', label: '팀 A' },
                { value: '1', label: '팀 B' },
              ]}
              onChange={(value) =>
                setValue('firstServingTeamIndex', Number(value), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MemberCapsuleSelect
              testId="team-a-capsules"
              title="팀 A 멤버"
              members={memberOptions}
              selectedIds={teamASelection}
              disabledIds={teamADisabledIds}
              maxSelectable={selectedTeamSize}
              teamTone="a"
              onPressMember={(memberId) => handlePressTeamMember('A', memberId)}
              positionByMemberId={normalizedTeamAPositionMap}
              error={teamAErrorMessage}
            />
            <MemberCapsuleSelect
              testId="team-b-capsules"
              title="팀 B 멤버"
              members={memberOptions}
              selectedIds={teamBSelection}
              disabledIds={teamBDisabledIds}
              maxSelectable={selectedTeamSize}
              teamTone="b"
              onPressMember={(memberId) => handlePressTeamMember('B', memberId)}
              positionByMemberId={normalizedTeamBPositionMap}
              error={teamBErrorMessage}
            />
          </div>
          <ToggleSwitch
            label="듀스 적용"
            description={`현재: ${deuceEnabled ? '적용' : '미적용'}`}
            checked={deuceEnabled}
            onChange={(checked) =>
              setValue('deuce', checked, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <Input label="벌칙 (선택)" error={errors.penaltyText?.message} {...register('penaltyText')} />

          {createMatchMutation.error ? (
            <p className="text-base text-danger">{(createMatchMutation.error as Error).message}</p>
          ) : null}

          <Button type="submit" intent="secondary" size="lg" fullWidth disabled={createMatchMutation.isPending || meetingCompleted}>
            {createMatchMutation.isPending ? '생성 중...' : '매치 생성'}
          </Button>
          {meetingCompleted ? (
            <p className="text-sm font-semibold text-surface-700">완료된 모임에서는 매치를 생성할 수 없습니다.</p>
          ) : null}
        </form>
      </Card>

      <div className="space-y-2">
        {matchesQuery.data?.map(({ match, teams, players, setPositions, sets }) => {
          const winnerTeamId = resolveMatchWinnerTeamId(match, sets)
          const winnerTeamName = teams.find((team) => team.id === winnerTeamId)?.name
          const teamMemberNames = new Map(
            teams.map((team) => [
              team.id,
              players
                .filter((player) => player.teamId === team.id)
                .sort((left, right) => left.positionNo - right.positionNo)
                .map((player) => memberNameMap.get(player.profileId) ?? `포지션 ${player.positionNo}`),
            ]),
          )

          const teamIds: [string, string] = [teams[0]?.id ?? '', teams[1]?.id ?? '']
          const snapshotsBySetId = new Map<string, SetPositionSnapshot[]>(
            sets.map((set) => [set.id, setPositions.filter((position) => position.setId === set.id)]),
          )

          const baseLineup = buildLineupNamesByTeam(teamIds, setPositions.filter((item) => item.setId === sets[0]?.id), memberNameMap)
          if ((baseLineup.get(teamIds[0]) ?? []).length === 0) {
            baseLineup.set(
              teamIds[0],
              players
                .filter((player) => player.teamId === teamIds[0])
                .sort((left, right) => left.positionNo - right.positionNo)
                .map((player) => memberNameMap.get(player.profileId) ?? `포지션 ${player.positionNo}`),
            )
          }
          if ((baseLineup.get(teamIds[1]) ?? []).length === 0) {
            baseLineup.set(
              teamIds[1],
              players
                .filter((player) => player.teamId === teamIds[1])
                .sort((left, right) => left.positionNo - right.positionNo)
                .map((player) => memberNameMap.get(player.profileId) ?? `포지션 ${player.positionNo}`),
            )
          }

          return (
            <Card key={match.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-display leading-none">
                    {teams[0]?.name} vs {teams[1]?.name}
                  </p>
                  <p className="text-base text-surface-600">{FORMAT_LABEL[match.format]}</p>
                  <div className="mt-1">
                    <WinnerBadge teamName={winnerTeamName} compact />
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {teams.map((team) => (
                      <p key={team.id} className="text-xs text-surface-600">
                        <span className="font-semibold text-surface-700">{team.name}</span>:{' '}
                        {(teamMemberNames.get(team.id) ?? []).length ? (teamMemberNames.get(team.id) ?? []).join(' · ') : '멤버 미지정'}
                      </p>
                    ))}
                  </div>
                </div>
                <StatusChip status={match.status} emphasize />
              </div>

              <div className="grid grid-cols-1 gap-2">
                {sets.map((set) => {
                  const setWinnerTeamId = resolveCompletedSetWinnerTeamId(set)
                  const setWinnerTeamName = teams.find((team) => team.id === setWinnerTeamId)?.name
                  let targetSnapshots = snapshotsBySetId.get(set.id) ?? []
                  let predicted = false

                  if (!targetSnapshots.length && set.status === 'pending') {
                    const previousWithSnapshot = sets
                      .filter((item) => item.setNo < set.setNo)
                      .sort((left, right) => right.setNo - left.setNo)
                      .find((item) => (snapshotsBySetId.get(item.id) ?? []).length > 0)

                    if (previousWithSnapshot) {
                      targetSnapshots = snapshotsBySetId.get(previousWithSnapshot.id) ?? []
                    }
                    predicted = true
                  }

                  const lineupByTeam = targetSnapshots.length
                    ? buildLineupNamesByTeam(set.teamIds, targetSnapshots, memberNameMap)
                    : baseLineup

                  return (
                    <Link key={set.id} to={`/g/${groupId}/m/${meetingId}/match/${match.id}/set/${set.id}/live`}>
                      <Card className="rounded-xl px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xl font-black">세트 {set.setNo}</span>
                          <StatusChip status={set.status} />
                        </div>
                        <p className="mt-1 text-base text-surface-700">
                          {teams[0]?.name}: {set.score[teams[0]?.id ?? ''] ?? 0} / {teams[1]?.name}:{' '}
                          {set.score[teams[1]?.id ?? ''] ?? 0}
                        </p>
                        <p className="mt-1 text-xs text-surface-600">
                          {predicted ? '예상 포지션' : '포지션'} · {teams[0]?.name}: {(lineupByTeam.get(set.teamIds[0]) ?? []).join(' · ') || '미지정'}
                        </p>
                        <p className="text-xs text-surface-600">
                          {predicted ? '예상 포지션' : '포지션'} · {teams[1]?.name}: {(lineupByTeam.get(set.teamIds[1]) ?? []).join(' · ') || '미지정'}
                        </p>
                        {setWinnerTeamName ? (
                          <p className="mt-1 text-sm font-semibold text-winner">승리: {setWinnerTeamName}</p>
                        ) : null}
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>

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
