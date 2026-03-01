import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { MemberCapsuleSelect } from '@/components/ui/MemberCapsuleSelect'
import { SelectField } from '@/components/ui/SelectField'
import { StatusChip } from '@/components/ui/StatusChip'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'
import { WinnerBadge } from '@/components/ui/WinnerBadge'
import { computeDisabledMemberIds, stripRefereeFromTeamSelections } from '@/features/meetings/lib/match-form'
import { apiCreateMatch, apiGetMeeting, apiListMatches, apiListMembers, queryKeys } from '@/services/api'
import { useAuthStore } from '@/store/auth-store'
import type { MatchFormat, TeamSize } from '@/types/domain'

const schema = z.object({
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
}).superRefine((value, ctx) => {
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
})

type FormValues = z.infer<typeof schema>
type FormInput = z.input<typeof schema>

const formatLabel: Record<MatchFormat, string> = {
  single: '단판',
  best_of_3: '3판 2선승',
  best_of_5: '5판 3선승',
}

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

function resolveMatchWinnerTeamId(match: { requiredSetWins: number; winnerTeamId?: string }, sets: Array<{
  status: string
  winnerTeamId?: string
  teamIds: [string, string]
  score: Record<string, number>
}>): string | null {
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
  const memberNameMap = new Map((membersQuery.data ?? []).map((member) => [member.profileId, member.profile.name]))
  const memberIds = memberOptions.map((member) => member.id)
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
    if (teamASelection.length > selectedTeamSize) {
      setValue('teamAPlayerIds', teamASelection.slice(0, selectedTeamSize), {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    if (teamBSelection.length > selectedTeamSize) {
      setValue('teamBPlayerIds', teamBSelection.slice(0, selectedTeamSize), {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [selectedTeamSize, setValue, teamASelection, teamBSelection])

  const createMatchMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user || !groupId || !meetingId) {
        throw new Error('유효한 사용자/그룹/모임이 필요합니다.')
      }

      if (meetingQuery.data?.status === 'completed') {
        throw new Error('완료된 모임에서는 매치를 생성할 수 없습니다.')
      }

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
            playerIds: values.teamAPlayerIds,
          },
          {
            name: values.teamBName,
            playerIds: values.teamBPlayerIds,
          },
        ],
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.meeting(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeMeeting(groupId ?? '') })
    },
  })

  if (!groupId || !meetingId) {
    return null
  }

  const handleRefereeChange = (value: string) => {
    const normalized = value.trim()
    const nextRefereeId = normalized || undefined
    const { teamAIds, teamBIds } = stripRefereeFromTeamSelections(teamASelection, teamBSelection, nextRefereeId)

    if (teamAIds.length !== teamASelection.length) {
      setValue('teamAPlayerIds', teamAIds, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    if (teamBIds.length !== teamBSelection.length) {
      setValue('teamBPlayerIds', teamBIds, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    setValue('refereeProfileId', value, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const handleToggleTeamMember = (team: 'A' | 'B', profileId: string) => {
    if (team === 'A') {
      const selected = teamASelection.includes(profileId)
      if (!selected && teamADisabledIds.has(profileId)) {
        return
      }

      const nextIds = selected ? teamASelection.filter((id) => id !== profileId) : [...teamASelection, profileId]
      setValue('teamAPlayerIds', nextIds, {
        shouldDirty: true,
        shouldValidate: true,
      })
      return
    }

    const selected = teamBSelection.includes(profileId)
    if (!selected && teamBDisabledIds.has(profileId)) {
      return
    }

    const nextIds = selected ? teamBSelection.filter((id) => id !== profileId) : [...teamBSelection, profileId]
    setValue('teamBPlayerIds', nextIds, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const meetingCompleted = meetingQuery.data?.status === 'completed'

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
              onToggle={(memberId) => handleToggleTeamMember('A', memberId)}
              error={errors.teamAPlayerIds?.message}
            />
            <MemberCapsuleSelect
              testId="team-b-capsules"
              title="팀 B 멤버"
              members={memberOptions}
              selectedIds={teamBSelection}
              disabledIds={teamBDisabledIds}
              maxSelectable={selectedTeamSize}
              teamTone="b"
              onToggle={(memberId) => handleToggleTeamMember('B', memberId)}
              error={errors.teamBPlayerIds?.message}
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
        {matchesQuery.data?.map(({ match, teams, players, sets }) => {
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

          return (
            <Card key={match.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-display leading-none">
                    {teams[0]?.name} vs {teams[1]?.name}
                  </p>
                  <p className="text-base text-surface-600">{formatLabel[match.format]}</p>
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

                  return (
                    <Link key={set.id} to={`/g/${groupId}/m/${meetingId}/match/${match.id}/set/${set.id}/live`}>
                      <Card className="rounded-2xl border-surface-200 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xl font-black">세트 {set.setNo}</span>
                          <StatusChip status={set.status} />
                        </div>
                        <p className="mt-1 text-base text-surface-700">
                          {teams[0]?.name}: {set.score[teams[0]?.id ?? ''] ?? 0} / {teams[1]?.name}:{' '}
                          {set.score[teams[1]?.id ?? ''] ?? 0}
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
    </PageFrame>
  )
}
