import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DeuceBadge } from '@/components/ui/DeuceBadge'
import { Input } from '@/components/ui/Input'
import { MemberCapsuleSelect } from '@/components/ui/MemberCapsuleSelect'
import { PositionPickerSheet } from '@/components/ui/PositionPickerSheet'
import { ScoreBoard } from '@/components/ui/ScoreBoard'
import { SelectField } from '@/components/ui/SelectField'
import { StatusChip } from '@/components/ui/StatusChip'
import { WinnerBadge } from '@/components/ui/WinnerBadge'
import {
  assignMemberPositionWithSwap,
  isCompleteTeamPositionAssignment,
  normalizeTeamPositionMap,
  toTeamPositionAssignments,
  type PositionMap,
} from '@/features/meetings/lib/match-form'
import { enqueueRallyEvent, listQueuedRallyEvents, removeQueuedRallyEvent } from '@/lib/offline-queue'
import { applyRally } from '@/lib/rules-engine'
import { createId, nowIso } from '@/lib/utils'
import { useVisibilityAndOnlineSync } from '@/lib/visibility-sync'
import {
  apiEditCompletedSet,
  apiGetMeeting,
  apiGetSet,
  apiHasPermission,
  apiListMembers,
  apiRecordRally,
  apiStartSet,
  queryKeys,
} from '@/services/api'
import { useAuthStore } from '@/store/auth-store'
import { useUiStore } from '@/store/ui-store'
import type { SetPositionSnapshot, TeamPositionAssignments } from '@/types/domain'

const EMPTY_DISABLED_IDS = new Set<string>()

const scoreSchema = z.object({
  teamA: z.coerce.number().min(0).max(99),
  teamB: z.coerce.number().min(0).max(99),
})

function isTerminalRallySyncError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return (
    message.includes('완료된 모임에서는 득점을 기록할 수 없습니다.') ||
    message.includes('완료된 매치에서는 득점을 기록할 수 없습니다.') ||
    message.includes('진행 중인 세트가 아닙니다.')
  )
}

function buildPositionMapByTeam(teamId: string, snapshots: SetPositionSnapshot[], teamSize: number): PositionMap {
  const map: PositionMap = {}
  for (const snapshot of snapshots) {
    if (snapshot.teamId !== teamId) {
      continue
    }

    map[snapshot.profileId] = snapshot.positionNo
  }

  return normalizeTeamPositionMap(Object.keys(map), map, teamSize)
}

export function SetLivePage() {
  const { groupId, meetingId, setId } = useParams<{
    groupId: string
    meetingId: string
    matchId: string
    setId: string
  }>()

  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const syncing = useUiStore((state) => state.syncingOfflineQueue)
  const setSyncing = useUiStore((state) => state.setSyncingOfflineQueue)
  const [queueCount, setQueueCount] = useState(0)
  const [manualScore, setManualScore] = useState<{ teamA: string; teamB: string }>({ teamA: '', teamB: '' })
  const [manualError, setManualError] = useState<string | null>(null)
  const [selectedServingTeamId, setSelectedServingTeamId] = useState<string>('')
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [startConfirmOpen, setStartConfirmOpen] = useState(false)
  const [startConfirmError, setStartConfirmError] = useState<string | null>(null)
  const [confirmServingTeamId, setConfirmServingTeamId] = useState<string>('')
  const [confirmTeamAPositionMap, setConfirmTeamAPositionMap] = useState<PositionMap>({})
  const [confirmTeamBPositionMap, setConfirmTeamBPositionMap] = useState<PositionMap>({})
  const [confirmPickerState, setConfirmPickerState] = useState<{ team: 'A' | 'B'; memberId: string } | null>(null)
  const confirmTeamAPositionMapRef = useRef<PositionMap>({})
  const confirmTeamBPositionMapRef = useRef<PositionMap>({})

  const setQuery = useQuery({
    queryKey: queryKeys.set(setId ?? ''),
    queryFn: () => apiGetSet(setId ?? ''),
    enabled: Boolean(setId),
    refetchInterval: 12_000,
  })

  const permissionQuery = useQuery({
    queryKey: ['permission', user?.id, groupId, 'edit_completed_records'],
    queryFn: () => apiHasPermission(user!.id, groupId!, 'edit_completed_records'),
    enabled: Boolean(user && groupId),
  })

  const meetingQuery = useQuery({
    queryKey: queryKeys.meeting(meetingId ?? ''),
    queryFn: () => apiGetMeeting(meetingId ?? ''),
    enabled: Boolean(meetingId),
    refetchInterval: 12_000,
  })

  const membersQuery = useQuery({
    queryKey: queryKeys.members(groupId ?? ''),
    queryFn: () => apiListMembers(groupId ?? ''),
    enabled: Boolean(groupId),
  })

  const refreshQueueCount = useCallback(async () => {
    const queued = await listQueuedRallyEvents()
    setQueueCount(queued.length)
  }, [])

  const syncOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) {
      return
    }

    setSyncing(true)
    try {
      setSyncNotice(null)

      const queued = await listQueuedRallyEvents()
      let droppedCount = 0

      for (const event of queued) {
        try {
          await apiRecordRally(event)
          await removeQueuedRallyEvent(event.clientEventId)
        } catch (error) {
          if (isTerminalRallySyncError(error)) {
            await removeQueuedRallyEvent(event.clientEventId)
            droppedCount += 1
            continue
          }

          throw error
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats(meetingId ?? '') })
      await refreshQueueCount()

      if (droppedCount > 0) {
        setSyncNotice(`종료된 경기의 오프라인 기록 ${droppedCount}건을 정리했습니다.`)
      }
    } catch (error) {
      setSyncNotice((error as Error).message ?? '오프라인 기록 동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncing(false)
    }
  }, [meetingId, queryClient, refreshQueueCount, setId, setSyncing])

  useVisibilityAndOnlineSync(() => {
    void syncOfflineQueue()
  })

  useEffect(() => {
    void refreshQueueCount()
  }, [refreshQueueCount])

  useEffect(() => {
    if (setQuery.data?.set.initialServingTeamId) {
      setSelectedServingTeamId(setQuery.data.set.initialServingTeamId)
    }
  }, [setQuery.data?.set.id, setQuery.data?.set.initialServingTeamId])

  const startMutation = useMutation({
    mutationFn: async (input?: { firstServingTeamId?: string; positionAssignments?: TeamPositionAssignments }) => {
      if (!setId) {
        throw new Error('세트를 찾을 수 없습니다.')
      }

      return apiStartSet(setId, input?.firstServingTeamId, input?.positionAssignments)
    },
    onSuccess: async (_set, input) => {
      if (input?.positionAssignments) {
        setStartConfirmOpen(false)
        setStartConfirmError(null)
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
    },
    onError: (error) => {
      setStartConfirmError((error as Error).message)
    },
  })

  const rallyMutation = useMutation({
    mutationFn: async (scoringTeamId: string) => {
      if (!setId) {
        throw new Error('세트를 찾을 수 없습니다.')
      }

      const event = {
        clientEventId: createId('evt'),
        setId,
        scoringTeamId,
        occurredAt: nowIso(),
      }

      await enqueueRallyEvent(event)
      await refreshQueueCount()

      if (!navigator.onLine) {
        const cached = queryClient.getQueryData<Awaited<ReturnType<typeof apiGetSet>>>(queryKeys.set(setId ?? ''))
        if (cached?.set) {
          return cached.set
        }

        throw new Error('오프라인 상태입니다. 네트워크 복귀 후 자동 동기화됩니다.')
      }

      let updatedSet
      try {
        updatedSet = await apiRecordRally(event)
      } catch (error) {
        if (isTerminalRallySyncError(error)) {
          await removeQueuedRallyEvent(event.clientEventId)
          await refreshQueueCount()
          await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
          await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
          throw new Error('경기가 종료되어 득점을 기록할 수 없습니다.')
        }

        throw error
      }

      await removeQueuedRallyEvent(event.clientEventId)
      await refreshQueueCount()

      return updatedSet
    },
    onMutate: async (scoringTeamId) => {
      const previous = queryClient.getQueryData(queryKeys.set(setId ?? ''))

      queryClient.setQueryData(queryKeys.set(setId ?? ''), (current: Awaited<ReturnType<typeof apiGetSet>> | undefined) => {
        if (!current || current.set.status !== 'in_progress') {
          return current
        }

        try {
          const optimisticSet = applyRally(current.set, scoringTeamId, createId('evt_optimistic'), nowIso())

          return {
            ...current,
            set: optimisticSet,
          }
        } catch {
          return current
        }
      })

      return { previous }
    },
    onError: (_error, _scoringTeamId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.set(setId ?? ''), context.previous)
      }
    },
    onSuccess: async () => {
      if (!navigator.onLine) {
        return
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats(meetingId ?? '') })
    },
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!user || !setId) {
        throw new Error('로그인이 필요합니다.')
      }

      setManualError(null)

      const parsed = scoreSchema.safeParse({
        teamA: Number(manualScore.teamA),
        teamB: Number(manualScore.teamB),
      })

      if (!parsed.success) {
        throw new Error('유효한 점수를 입력하세요.')
      }

      if (parsed.data.teamA === parsed.data.teamB) {
        throw new Error('완료 세트는 동점으로 저장할 수 없습니다.')
      }

      return apiEditCompletedSet(user.id, setId, {
        teamA: parsed.data.teamA,
        teamB: parsed.data.teamB,
      })
    },
    onSuccess: async () => {
      setManualScore({ teamA: '', teamB: '' })
      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.auditLogs(groupId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats(meetingId ?? '') })
    },
    onError: (error) => {
      setManualError((error as Error).message)
    },
  })

  const payload = setQuery.data

  const teamNameMap = useMemo(() => {
    if (!payload) {
      return new Map<string, string>()
    }

    return new Map(payload.teams.map((team) => [team.id, team.name]))
  }, [payload])

  const memberNameMap = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.profileId, member.profile.name])),
    [membersQuery.data],
  )

  if (!setId || !payload) {
    return (
      <PageFrame className="pt-6">
        <Card>세트 정보를 찾을 수 없습니다.</Card>
      </PageFrame>
    )
  }

  const { set, sets, match, setPositions } = payload
  const [teamAId, teamBId] = set.teamIds
  const teamAName = teamNameMap.get(teamAId) ?? '팀 A'
  const teamBName = teamNameMap.get(teamBId) ?? '팀 B'

  const teamAMemberIds = payload.players
    .filter((player) => player.teamId === teamAId)
    .sort((left, right) => left.positionNo - right.positionNo)
    .map((player) => player.profileId)
  const teamBMemberIds = payload.players
    .filter((player) => player.teamId === teamBId)
    .sort((left, right) => left.positionNo - right.positionNo)
    .map((player) => player.profileId)

  const teamAMembers = teamAMemberIds.map((profileId) => ({ id: profileId, name: memberNameMap.get(profileId) ?? profileId }))
  const teamBMembers = teamBMemberIds.map((profileId) => ({ id: profileId, name: memberNameMap.get(profileId) ?? profileId }))

  const resolvePositionMapsForTargetSet = (targetSetId: string, targetSetNo: number, targetTeamSize: number): {
    teamAPositionMap: PositionMap
    teamBPositionMap: PositionMap
    predicted: boolean
  } => {
    const currentSnapshots = setPositions.filter((item) => item.setId === targetSetId)
    const currentTeamAPositionMap = buildPositionMapByTeam(teamAId, currentSnapshots, targetTeamSize)
    const currentTeamBPositionMap = buildPositionMapByTeam(teamBId, currentSnapshots, targetTeamSize)

    if (
      isCompleteTeamPositionAssignment(teamAMemberIds, currentTeamAPositionMap, targetTeamSize) &&
      isCompleteTeamPositionAssignment(teamBMemberIds, currentTeamBPositionMap, targetTeamSize)
    ) {
      return {
        teamAPositionMap: currentTeamAPositionMap,
        teamBPositionMap: currentTeamBPositionMap,
        predicted: false,
      }
    }

    const previousSets = sets
      .filter((item) => item.setNo < targetSetNo)
      .sort((left, right) => right.setNo - left.setNo)

    for (const previousSet of previousSets) {
      const previousSnapshots = setPositions.filter((item) => item.setId === previousSet.id)
      const previousTeamAPositionMap = buildPositionMapByTeam(teamAId, previousSnapshots, targetTeamSize)
      const previousTeamBPositionMap = buildPositionMapByTeam(teamBId, previousSnapshots, targetTeamSize)

      if (
        isCompleteTeamPositionAssignment(teamAMemberIds, previousTeamAPositionMap, targetTeamSize) &&
        isCompleteTeamPositionAssignment(teamBMemberIds, previousTeamBPositionMap, targetTeamSize)
      ) {
        return {
          teamAPositionMap: previousTeamAPositionMap,
          teamBPositionMap: previousTeamBPositionMap,
          predicted: true,
        }
      }
    }

    const initialTeamAPositionMap = normalizeTeamPositionMap(
      teamAMemberIds,
      Object.fromEntries(
        payload.players
          .filter((player) => player.teamId === teamAId)
          .map((player) => [player.profileId, player.positionNo]),
      ),
      targetTeamSize,
    )

    const initialTeamBPositionMap = normalizeTeamPositionMap(
      teamBMemberIds,
      Object.fromEntries(
        payload.players
          .filter((player) => player.teamId === teamBId)
          .map((player) => [player.profileId, player.positionNo]),
      ),
      targetTeamSize,
    )

    return {
      teamAPositionMap: initialTeamAPositionMap,
      teamBPositionMap: initialTeamBPositionMap,
      predicted: true,
    }
  }

  const resolvedCurrentSetPositions = resolvePositionMapsForTargetSet(set.id, set.setNo, set.teamSize)
  const teamAScore = set.score[teamAId] ?? 0
  const teamBScore = set.score[teamBId] ?? 0
  const meetingCompleted = meetingQuery.data?.status === 'completed'
  const readOnly = Boolean(meetingCompleted) || match.status === 'completed' || set.status === 'completed' || set.status === 'ignored'
  const canEditCompleted = Boolean(permissionQuery.data)
  const deuceThreshold = Math.max(1, set.targetScore - 1)
  const inDeuceZone = set.deuce && teamAScore >= deuceThreshold && teamBScore >= deuceThreshold
  const isDeuce = inDeuceZone && teamAScore === teamBScore
  const advantageTeamName = inDeuceZone && Math.abs(teamAScore - teamBScore) === 1 ? (teamAScore > teamBScore ? teamAName : teamBName) : null
  const servingTeamKey = set.servingTeamId === teamAId ? 'A' : 'B'
  const winnerTeamKey = set.winnerTeamId === teamAId ? 'A' : set.winnerTeamId === teamBId ? 'B' : undefined
  const winnerTeamName = set.winnerTeamId === teamAId ? teamAName : set.winnerTeamId === teamBId ? teamBName : undefined

  const teamRosterMap = new Map<string, Array<{ positionNo: number; profileId: string; name: string }>>()
  const addRoster = (teamId: string, memberIds: string[], positionMap: PositionMap) => {
    const list = memberIds
      .map((profileId) => ({
        profileId,
        positionNo: positionMap[profileId],
      }))
      .filter((item) => Number.isInteger(item.positionNo))
      .sort((left, right) => left.positionNo - right.positionNo)
      .map((item) => ({
        ...item,
        name: memberNameMap.get(item.profileId) ?? item.profileId,
      }))

    teamRosterMap.set(teamId, list)
  }
  addRoster(teamAId, teamAMemberIds, resolvedCurrentSetPositions.teamAPositionMap)
  addRoster(teamBId, teamBMemberIds, resolvedCurrentSetPositions.teamBPositionMap)

  const servingPosition = set.rotation[set.servingTeamId] ?? 0
  const servingMemberName =
    servingPosition > 0
      ? teamRosterMap.get(set.servingTeamId)?.find((player) => player.positionNo === servingPosition)?.name
      : undefined

  const openStartConfirmation = () => {
    const previousSet = sets.find((item) => item.setNo === set.setNo - 1)
    if (!previousSet || (previousSet.status !== 'completed' && previousSet.status !== 'ignored')) {
      setStartConfirmError('이전 세트가 완료되어야 시작할 수 있습니다.')
      return
    }

    const resolved = resolvePositionMapsForTargetSet(set.id, set.setNo, set.teamSize)
    setConfirmServingTeamId(selectedServingTeamId || set.initialServingTeamId)
    setConfirmTeamAPositionMap(resolved.teamAPositionMap)
    setConfirmTeamBPositionMap(resolved.teamBPositionMap)
    confirmTeamAPositionMapRef.current = resolved.teamAPositionMap
    confirmTeamBPositionMapRef.current = resolved.teamBPositionMap
    setStartConfirmError(null)
    setStartConfirmOpen(true)
  }

  const handleConfirmPositionSelection = (positionNo: number) => {
    if (!confirmPickerState) {
      return
    }

    if (confirmPickerState.team === 'A') {
      const next = assignMemberPositionWithSwap({
        selectedIds: teamAMemberIds,
        positionMap: confirmTeamAPositionMap,
        memberId: confirmPickerState.memberId,
        positionNo,
        teamSize: set.teamSize,
      })
      setConfirmTeamAPositionMap(next.positionMap)
      confirmTeamAPositionMapRef.current = next.positionMap
      return
    }

    const next = assignMemberPositionWithSwap({
      selectedIds: teamBMemberIds,
      positionMap: confirmTeamBPositionMap,
      memberId: confirmPickerState.memberId,
      positionNo,
      teamSize: set.teamSize,
    })
    setConfirmTeamBPositionMap(next.positionMap)
    confirmTeamBPositionMapRef.current = next.positionMap
  }

  const handleConfirmStart = () => {
    setStartConfirmError(null)
    const teamAMap = normalizeTeamPositionMap(teamAMemberIds, confirmTeamAPositionMapRef.current, set.teamSize)
    const teamBMap = normalizeTeamPositionMap(teamBMemberIds, confirmTeamBPositionMapRef.current, set.teamSize)

    if (!isCompleteTeamPositionAssignment(teamAMemberIds, teamAMap, set.teamSize)) {
      setStartConfirmError('A팀 포지션을 모두 지정하세요.')
      return
    }

    if (!isCompleteTeamPositionAssignment(teamBMemberIds, teamBMap, set.teamSize)) {
      setStartConfirmError('B팀 포지션을 모두 지정하세요.')
      return
    }

    const assignments: TeamPositionAssignments = {
      teamA: toTeamPositionAssignments(teamAMemberIds, teamAMap, set.teamSize),
      teamB: toTeamPositionAssignments(teamBMemberIds, teamBMap, set.teamSize),
    }

    startMutation.mutate({
      firstServingTeamId: confirmServingTeamId || set.initialServingTeamId,
      positionAssignments: assignments,
    })
  }

  const confirmPickerPositionMap = confirmPickerState?.team === 'A' ? confirmTeamAPositionMap : confirmTeamBPositionMap
  let confirmPickerOccupancy: Record<number, string> = {}
  if (confirmPickerState) {
    const source = confirmPickerState.team === 'A' ? confirmTeamAPositionMap : confirmTeamBPositionMap
    const occupancy: Record<number, string> = {}

    for (const [profileId, positionNo] of Object.entries(source)) {
      occupancy[positionNo] = memberNameMap.get(profileId) ?? profileId
    }

    confirmPickerOccupancy = occupancy
  }

  return (
    <PageFrame className="space-y-4 pt-6">
      {readOnly ? (
        <Card className="space-y-2 border-warning/30 bg-[#FFFBEB]" tone="warning">
          <p className="text-lg font-black text-warning">읽기 전용 상태</p>
          <p className="text-base text-warning">완료되었거나 종료된 경기라 득점 입력이 잠겨 있습니다.</p>
        </Card>
      ) : null}

      <Card className="space-y-3" tone="elevated">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl leading-none tracking-[0.03em]">세트 {set.setNo} 라이브</h1>
          <StatusChip status={set.status} emphasize />
        </div>
        <p className="text-xl text-surface-700">
          목표 {set.targetScore}점 · 듀스 {set.deuce ? '적용' : '미적용'} · 포지션 {set.teamSize}인
        </p>
        <ScoreBoard
          teamAName={teamAName}
          teamBName={teamBName}
          teamAScore={teamAScore}
          teamBScore={teamBScore}
          servingTeam={servingTeamKey}
          winnerTeam={winnerTeamKey}
        />
        <Card className="rounded-2xl border-surface-200 bg-surface-50/60 px-3 py-2">
          <details>
            <summary className="cursor-pointer text-lg font-black text-surface-800">
              멤버 보기 {resolvedCurrentSetPositions.predicted ? '(예상)' : ''}
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[teamAId, teamBId].map((teamId) => (
                <div key={teamId} className="rounded-xl border border-surface-200 bg-white px-2 py-1.5">
                  <p className="text-sm font-semibold text-surface-700">{teamNameMap.get(teamId)}</p>
                  {(teamRosterMap.get(teamId) ?? []).length ? (
                    <div className="mt-1 space-y-0.5">
                      {(teamRosterMap.get(teamId) ?? []).map((player) => (
                        <p key={`${teamId}-${player.positionNo}`} className="text-xs text-surface-600">
                          {player.positionNo}번 · {player.name}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-surface-500">등록된 멤버가 없습니다.</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        </Card>
        <p className="text-xl text-surface-700">
          현재 서브: {teamNameMap.get(set.servingTeamId)} (
          {servingPosition > 0 ? `포지션 ${servingPosition} · ${servingMemberName ?? '이름 미확인'}` : '포지션 미정'})
        </p>
        {isDeuce ? <DeuceBadge state="deuce" /> : null}
        {!isDeuce && advantageTeamName ? <DeuceBadge state="advantage" teamName={advantageTeamName} /> : null}
        <WinnerBadge teamName={winnerTeamName} />
        <p className="text-base text-surface-600">
          오프라인 큐: {queueCount}건 {syncing ? '(동기화 중...)' : ''}
        </p>
        {syncNotice ? <p className="text-base font-semibold text-warning">{syncNotice}</p> : null}
      </Card>

      {set.status === 'pending' ? (
        <Card className="space-y-2">
          {set.setNo < 2 ? (
            <>
              <SelectField
                label="첫 서브 팀"
                value={selectedServingTeamId}
                options={[
                  { value: teamAId, label: teamAName },
                  { value: teamBId, label: teamBName },
                ]}
                onChange={setSelectedServingTeamId}
                disabled={readOnly}
              />
              <Button
                fullWidth
                size="lg"
                intent="primary"
                onClick={() =>
                  startMutation.mutate({
                    firstServingTeamId: selectedServingTeamId || set.initialServingTeamId,
                  })
                }
                disabled={startMutation.isPending || readOnly}
              >
                세트 시작
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-surface-700">2세트 이상은 포지션 확인 후 시작할 수 있습니다.</p>
              {startConfirmError ? <p className="text-sm font-semibold text-danger">{startConfirmError}</p> : null}
              <Button
                fullWidth
                size="lg"
                intent="primary"
                onClick={openStartConfirmation}
                disabled={startMutation.isPending || readOnly}
              >
                포지션 확인 후 세트 시작
              </Button>
            </>
          )}
        </Card>
      ) : null}

      <Card className="space-y-3" tone="info">
        <div className="grid grid-cols-2 gap-2">
          <Button
            intent="secondary"
            size="lg"
            fullWidth
            disabled={rallyMutation.isPending || readOnly || set.status !== 'in_progress'}
            onClick={() => rallyMutation.mutate(teamAId)}
          >
            {teamAName} +1 ({teamAScore})
          </Button>
          <Button
            intent="secondary"
            size="lg"
            fullWidth
            disabled={rallyMutation.isPending || readOnly || set.status !== 'in_progress'}
            onClick={() => rallyMutation.mutate(teamBId)}
          >
            {teamBName} +1 ({teamBScore})
          </Button>
        </div>

        {set.status === 'pending' ? <p className="text-base font-semibold text-surface-700">세트를 먼저 시작하세요.</p> : null}
        {readOnly ? <p className="text-base font-semibold text-surface-700">완료된 기록은 기본 수정 불가입니다.</p> : null}
        {rallyMutation.error ? <p className="text-base text-danger">{(rallyMutation.error as Error).message}</p> : null}
      </Card>

      {readOnly && canEditCompleted ? (
        <Card className="space-y-3 border-red-200">
          <h2 className="text-2xl font-black">관리자 예외 수정</h2>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label={`${teamAName} 점수`}
              type="number"
              value={manualScore.teamA}
              onChange={(event) => setManualScore((prev) => ({ ...prev, teamA: event.target.value }))}
            />
            <Input
              label={`${teamBName} 점수`}
              type="number"
              value={manualScore.teamB}
              onChange={(event) => setManualScore((prev) => ({ ...prev, teamB: event.target.value }))}
            />
          </div>
          <Button intent="danger" size="lg" fullWidth onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
            완료 기록 수정
          </Button>
          {manualError ? <p className="text-base text-danger">{manualError}</p> : null}
        </Card>
      ) : null}

      <Card className="space-y-2">
        <h2 className="text-3xl font-black">득점 로그</h2>
        {set.events.length ? (
          <div className="space-y-1">
            {set.events
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

      {startConfirmOpen
        ? createPortal(
            <div className="fixed inset-0 z-[85]">
              <button
                type="button"
                className="absolute inset-0 bg-surface-900/45"
                aria-label="세트 시작 확인 닫기"
                onClick={() => {
                  setStartConfirmOpen(false)
                  setStartConfirmError(null)
                }}
              />
              <div className="absolute inset-x-0 bottom-0 rounded-t-[1.75rem] border-t border-surface-200 bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-28px_44px_-30px_rgba(15,23,42,0.45)]">
                <div className="flex items-center justify-between px-5 py-4">
                  <p className="text-xl font-bold text-text-primary">세트 {set.setNo} 시작 전 포지션 확인</p>
                  <button
                    type="button"
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl border border-surface-200 bg-surface-50 text-surface-700"
                    onClick={() => {
                      setStartConfirmOpen(false)
                      setStartConfirmError(null)
                    }}
                    aria-label="닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[72vh] space-y-3 overflow-y-auto px-4 pb-2">
                  <SelectField
                    label="첫 서브 팀"
                    value={confirmServingTeamId}
                    options={[
                      { value: teamAId, label: teamAName },
                      { value: teamBId, label: teamBName },
                    ]}
                    onChange={setConfirmServingTeamId}
                    disabled={startMutation.isPending}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <MemberCapsuleSelect
                      title="A팀 포지션"
                      members={teamAMembers}
                      selectedIds={teamAMemberIds}
                      disabledIds={EMPTY_DISABLED_IDS}
                      maxSelectable={set.teamSize}
                      teamTone="a"
                      onPressMember={(memberId) => setConfirmPickerState({ team: 'A', memberId })}
                      positionByMemberId={normalizeTeamPositionMap(teamAMemberIds, confirmTeamAPositionMap, set.teamSize)}
                    />
                    <MemberCapsuleSelect
                      title="B팀 포지션"
                      members={teamBMembers}
                      selectedIds={teamBMemberIds}
                      disabledIds={EMPTY_DISABLED_IDS}
                      maxSelectable={set.teamSize}
                      teamTone="b"
                      onPressMember={(memberId) => setConfirmPickerState({ team: 'B', memberId })}
                      positionByMemberId={normalizeTeamPositionMap(teamBMemberIds, confirmTeamBPositionMap, set.teamSize)}
                    />
                  </div>

                  {startConfirmError ? <p className="text-sm font-semibold text-danger">{startConfirmError}</p> : null}

                  <Button fullWidth size="lg" intent="primary" onClick={handleConfirmStart} disabled={startMutation.isPending}>
                    {startMutation.isPending ? '시작 중...' : '확정 후 세트 시작'}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <PositionPickerSheet
        open={Boolean(confirmPickerState)}
        title={
          confirmPickerState
            ? `${confirmPickerState.team === 'A' ? teamAName : teamBName} · ${memberNameMap.get(confirmPickerState.memberId) ?? '멤버'} 포지션`
            : '포지션 선택'
        }
        maxPosition={set.teamSize}
        selectedPositionNo={confirmPickerState ? confirmPickerPositionMap[confirmPickerState.memberId] : undefined}
        occupancyByPosition={confirmPickerOccupancy}
        onSelect={handleConfirmPositionSelection}
        onClose={() => setConfirmPickerState(null)}
      />
    </PageFrame>
  )
}
