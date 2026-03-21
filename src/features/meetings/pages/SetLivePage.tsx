import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, X } from 'lucide-react'
import { DragPositionList } from '@/components/ui/DragPositionList'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AdminScoreEditor } from '@/features/meetings/components/AdminScoreEditor'
import { RallyLog } from '@/features/meetings/components/RallyLog'
import { SelectField } from '@/components/ui/SelectField'
import { WinnerBadge } from '@/components/ui/WinnerBadge'
import {
  isCompleteTeamPositionAssignment,
  normalizeTeamPositionMap,
  type PositionMap,
} from '@/features/meetings/lib/match-form'
import { enqueueRallyEvent, listQueuedRallyEvents, removeQueuedRallyEvent } from '@/lib/offline-queue'
import { applyRally } from '@/lib/rules-engine'
import { createId, nowIso } from '@/lib/utils'
import { useVisibilityAndOnlineSync } from '@/lib/visibility-sync'
import {
  apiAbortMatch,
  apiEditCompletedSet,
  apiForceEndSet,
  apiGetMeeting,
  apiGetSet,
  apiHasPermission,
  apiListMembers,
  apiRecordRally,
  apiStartSet,
  apiUndoLastRally,
  apiUpdateSetPositions,
  queryKeys,
} from '@/services/api'
import { useAuthStore } from '@/store/auth-store'
import { useUiStore } from '@/store/ui-store'
import type { SetPositionSnapshot, TeamPositionAssignments } from '@/types/domain'

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
  const { groupId, meetingId, matchId, setId } = useParams<{
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
  const [confirmTeamAOrder, setConfirmTeamAOrder] = useState<string[]>([])
  const [confirmTeamBOrder, setConfirmTeamBOrder] = useState<string[]>([])
  const [showPositionChange, setShowPositionChange] = useState(false)
  const [posChangeTeamAOrder, setPosChangeTeamAOrder] = useState<string[]>([])
  const [posChangeTeamBOrder, setPosChangeTeamBOrder] = useState<string[]>([])
  const [showEndSetConfirm, setShowEndSetConfirm] = useState(false)
  const [showAbortConfirm, setShowAbortConfirm] = useState(false)

  const setQuery = useQuery({
    queryKey: queryKeys.set(setId ?? ''),
    queryFn: () => apiGetSet(setId ?? ''),
    enabled: Boolean(setId),
    refetchInterval: 12_000,
  })

  const permissionQuery = useQuery({
    queryKey: queryKeys.permission(user?.id ?? '', groupId ?? '', 'edit_completed_records'),
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

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!setId) throw new Error('세트를 찾을 수 없습니다.')
      return apiUndoLastRally(setId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
    },
  })

  const forceEndMutation = useMutation({
    mutationFn: async () => {
      if (!setId) throw new Error('세트를 찾을 수 없습니다.')
      return apiForceEndSet(setId)
    },
    onSuccess: async () => {
      setShowEndSetConfirm(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats(meetingId ?? '') })
    },
  })

  const abortMutation = useMutation({
    mutationFn: async () => {
      if (!matchId) throw new Error('매치를 찾을 수 없습니다.')
      return apiAbortMatch(matchId)
    },
    onSuccess: async () => {
      setShowAbortConfirm(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.matches(meetingId ?? '') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.stats(meetingId ?? '') })
    },
  })

  const positionChangeMutation = useMutation({
    mutationFn: async () => {
      if (!setId) throw new Error('세트를 찾을 수 없습니다.')
      const orderedToAssignments = (orderedIds: string[]) =>
        orderedIds.map((profileId, idx) => ({ profileId, positionNo: idx + 1 }))
      const assignments: TeamPositionAssignments = {
        teamA: orderedToAssignments(posChangeTeamAOrder),
        teamB: orderedToAssignments(posChangeTeamBOrder),
      }
      return apiUpdateSetPositions(setId, assignments)
    },
    onSuccess: async () => {
      setShowPositionChange(false)
      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
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

  const posMapToOrdered = (ids: string[], posMap: PositionMap) =>
    [...ids].sort((a, b) => (posMap[a] ?? 99) - (posMap[b] ?? 99))

  const openStartConfirmation = () => {
    const previousSet = sets.find((item) => item.setNo === set.setNo - 1)
    if (!previousSet || (previousSet.status !== 'completed' && previousSet.status !== 'ignored')) {
      setStartConfirmError('이전 세트가 완료되어야 시작할 수 있습니다.')
      return
    }

    const resolved = resolvePositionMapsForTargetSet(set.id, set.setNo, set.teamSize)
    setConfirmServingTeamId(selectedServingTeamId || set.initialServingTeamId)
    setConfirmTeamAOrder(posMapToOrdered(teamAMemberIds, resolved.teamAPositionMap))
    setConfirmTeamBOrder(posMapToOrdered(teamBMemberIds, resolved.teamBPositionMap))
    setStartConfirmError(null)
    setStartConfirmOpen(true)
  }

  const handleConfirmStart = () => {
    setStartConfirmError(null)

    if (confirmTeamAOrder.length < set.teamSize) {
      setStartConfirmError('A팀 포지션을 모두 지정하세요.')
      return
    }

    if (confirmTeamBOrder.length < set.teamSize) {
      setStartConfirmError('B팀 포지션을 모두 지정하세요.')
      return
    }

    const orderedToAssignments = (orderedIds: string[]) =>
      orderedIds.map((profileId, idx) => ({ profileId, positionNo: idx + 1 }))

    const assignments: TeamPositionAssignments = {
      teamA: orderedToAssignments(confirmTeamAOrder),
      teamB: orderedToAssignments(confirmTeamBOrder),
    }

    startMutation.mutate({
      firstServingTeamId: confirmServingTeamId || set.initialServingTeamId,
      positionAssignments: assignments,
    })
  }

  const attackCount = set.events.filter((e) => e.scoringTeamId === set.servingTeamId).length
  const errorCount = set.events.filter((e) => e.scoringTeamId !== set.servingTeamId).length
  const isLive = set.status === 'in_progress'
  const canScore = !rallyMutation.isPending && !readOnly && isLive

  const teamAServingMember = teamRosterMap.get(teamAId)?.find((p) => p.positionNo === (set.servingTeamId === teamAId ? servingPosition : 0))
  const teamBServingMember = teamRosterMap.get(teamBId)?.find((p) => p.positionNo === (set.servingTeamId === teamBId ? servingPosition : 0))

  const nextRotationMember = servingMemberName
  const nextRotationPosition = servingPosition

  return (
    <PageFrame className="space-y-6 pb-48 pt-4">
      {/* ── Status Header ── */}
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="rounded-full bg-[#516200] px-4 py-1 text-sm font-bold tracking-wide text-[#d1fc00]">
          {set.setNo}세트 {isLive ? '진행 중' : set.status === 'completed' ? '완료' : '대기'}
        </div>
        {set.deuce && isLive && (
          <div className="mt-2 flex items-center gap-2 text-surface-600">
            <span className="text-xs font-medium">
              듀스 가능성 있음 (최대 {set.targetScore + 4}점)
            </span>
          </div>
        )}
      </div>

      {/* ── Scoreboard Bento Grid ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Team A */}
        <div className="flex flex-col gap-3">
          <div className="relative flex flex-grow flex-col items-center overflow-hidden rounded-3xl bg-white p-6 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
            {/* Serving indicator */}
            {servingTeamKey === 'A' && (
              <div className="absolute left-4 top-4 flex items-center gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#516200]">SERVING</span>
              </div>
            )}
            <span className="mt-6 text-sm font-bold text-surface-600">{teamAName}</span>
            <p
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${teamAName} 점수 ${teamAScore}`}
              className={`font-display text-[7rem] font-black leading-none tracking-tighter tabular-nums ${
                winnerTeamKey === 'A' ? 'text-[#516200]' : servingTeamKey === 'A' ? 'text-text-primary' : 'text-text-primary/40'
              }`}
            >
              {String(teamAScore).padStart(2, '0')}
            </p>
            {/* +/- buttons */}
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={() => undoMutation.mutate()}
                disabled={!canScore || set.events.length === 0 || undoMutation.isPending}
                className="flex h-14 flex-1 items-center justify-center rounded-xl bg-surface-300 text-surface-700 transition active:scale-90 disabled:opacity-40"
                aria-label={`되돌리기`}
              >
                <span className="text-xl font-bold">−</span>
              </button>
              <button
                type="button"
                onClick={() => rallyMutation.mutate(teamAId)}
                disabled={!canScore}
                className="flex h-14 w-3/4 items-center justify-center rounded-xl shadow-lg shadow-[#516200]/20 transition active:scale-95 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)' }}
                aria-label={`${teamAName} 득점`}
              >
                <span className="text-3xl font-bold text-[#3c4a00]">+</span>
              </button>
            </div>
          </div>
          {/* Server info */}
          <div className={`flex items-center justify-between rounded-2xl bg-white/50 px-4 py-3 ${servingTeamKey !== 'A' ? 'opacity-50' : ''}`}>
            <span className="text-xs font-bold text-surface-600">
              서버: {teamAServingMember?.name ?? teamRosterMap.get(teamAId)?.[0]?.name ?? '—'}
            </span>
            {servingTeamKey === 'A' && (
              <span className="rounded-full bg-[#0059b6]/10 px-2 py-0.5 text-[10px] font-black text-[#0059b6]">
                다음: {teamRosterMap.get(teamAId)?.find((p) => p.positionNo === (servingPosition % set.teamSize) + 1)?.name ?? '—'}
              </span>
            )}
          </div>
        </div>

        {/* Team B */}
        <div className="flex flex-col gap-3">
          <div className="relative flex flex-grow flex-col items-center overflow-hidden rounded-3xl bg-white p-6 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
            {servingTeamKey === 'B' && (
              <div className="absolute left-4 top-4 flex items-center gap-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#516200]">SERVING</span>
              </div>
            )}
            <span className="mt-6 text-sm font-bold text-surface-600">{teamBName}</span>
            <p
              aria-live="polite"
              aria-atomic="true"
              aria-label={`${teamBName} 점수 ${teamBScore}`}
              className={`font-display text-[7rem] font-black leading-none tracking-tighter tabular-nums ${
                winnerTeamKey === 'B' ? 'text-[#516200]' : servingTeamKey === 'B' ? 'text-text-primary' : 'text-text-primary/40'
              }`}
            >
              {String(teamBScore).padStart(2, '0')}
            </p>
            <div className="mt-4 flex w-full gap-2">
              <button
                type="button"
                onClick={() => undoMutation.mutate()}
                disabled={!canScore || set.events.length === 0 || undoMutation.isPending}
                className="flex h-14 flex-1 items-center justify-center rounded-xl bg-surface-300 text-surface-700 transition active:scale-90 disabled:opacity-40"
                aria-label={`되돌리기`}
              >
                <span className="text-xl font-bold">−</span>
              </button>
              <button
                type="button"
                onClick={() => rallyMutation.mutate(teamBId)}
                disabled={!canScore}
                className="flex h-14 w-3/4 items-center justify-center rounded-xl shadow-lg shadow-[#516200]/20 transition active:scale-95 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)' }}
                aria-label={`${teamBName} 득점`}
              >
                <span className="text-3xl font-bold text-[#3c4a00]">+</span>
              </button>
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-2xl bg-white/50 px-4 py-3 ${servingTeamKey !== 'B' ? 'opacity-50' : ''}`}>
            <span className="text-xs font-bold text-surface-600">
              서버: {teamBServingMember?.name ?? teamRosterMap.get(teamBId)?.[0]?.name ?? '—'}
            </span>
            {servingTeamKey === 'B' && (
              <span className="rounded-full bg-[#0059b6]/10 px-2 py-0.5 text-[10px] font-black text-[#0059b6]">
                다음: {teamRosterMap.get(teamBId)?.find((p) => p.positionNo === (servingPosition % set.teamSize) + 1)?.name ?? '—'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Middle Info Bar: Next Server + Deuce ── */}
      <div className="flex items-center justify-between rounded-2xl bg-surface-200 p-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500">Next Server</span>
          <span className="flex items-center gap-2 text-sm font-bold text-text-primary">
            {nextRotationMember ?? '—'} (로테이션 {nextRotationPosition})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isDeuce && (
            <>
              <span className="h-2 w-2 rounded-full bg-danger" />
              <span className="text-xs font-black text-danger">DEUCE</span>
            </>
          )}
          {!isDeuce && advantageTeamName && (
            <span className="text-xs font-black text-[#516200]">ADV {advantageTeamName}</span>
          )}
        </div>
      </div>

      {/* ── Quick Stats + History Button ── */}
      <div className="flex items-end gap-4">
        <div className="flex-grow rounded-3xl bg-surface-400/30 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-around">
            <div className="text-center">
              <p className="text-[10px] font-bold text-surface-600">ATTACK</p>
              <p className="font-display text-lg font-bold text-[#516200]">{attackCount}</p>
            </div>
            <div className="h-8 w-[1px] bg-surface-400/30" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-surface-600">ERROR</p>
              <p className="font-display text-lg font-bold text-danger">{errorCount}</p>
            </div>
          </div>
        </div>
        <details className="group">
          <summary className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-2xl bg-[#0c0f10] text-white shadow-xl transition active:scale-95 list-none">
            <span className="text-xl">📋</span>
          </summary>
          <div className="absolute right-4 z-20 mt-2 max-h-64 w-72 overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl">
            <RallyLog events={set.events} teamNameMap={teamNameMap} />
          </div>
        </details>
      </div>

      {/* ── Winner Badge ── */}
      {winnerTeamName && (
        <div className="flex items-center justify-center">
          <WinnerBadge teamName={winnerTeamName} />
        </div>
      )}

      {/* ── Offline Queue Notice ── */}
      {(queueCount > 0 || syncNotice) && (
        <div className="rounded-xl bg-surface-200 px-4 py-2 text-center text-xs text-surface-600">
          오프라인 큐: {queueCount}건 {syncing ? '(동기화 중...)' : ''}
          {syncNotice ? <span className="ml-2 font-semibold text-warning">{syncNotice}</span> : null}
        </div>
      )}

      {/* ── Set Start (Pending) ── */}
      {set.status === 'pending' && (
        <div className="rounded-3xl bg-white p-6 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
          {set.setNo < 2 ? (
            <div className="space-y-3">
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
                fullWidth size="lg" intent="primary"
                onClick={() => startMutation.mutate({ firstServingTeamId: selectedServingTeamId || set.initialServingTeamId })}
                disabled={startMutation.isPending || readOnly}
              >
                세트 시작
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-surface-700">2세트 이상은 포지션 확인 후 시작할 수 있습니다.</p>
              {startConfirmError && <p className="text-sm font-semibold text-danger">{startConfirmError}</p>}
              <Button fullWidth size="lg" intent="primary" onClick={openStartConfirmation} disabled={startMutation.isPending || readOnly}>
                포지션 확인 후 세트 시작
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Read-only notice ── */}
      {readOnly && (
        <div className="rounded-xl bg-[#FFF8F0] px-4 py-3 text-center text-sm font-semibold text-warning">
          완료된 기록은 기본 수정 불가입니다.
        </div>
      )}

      {/* ── Admin Score Editor ── */}
      {readOnly && canEditCompleted && (
        <AdminScoreEditor
          teamAName={teamAName} teamBName={teamBName}
          manualScore={manualScore} onScoreChange={setManualScore}
          onSubmit={() => editMutation.mutate()} isPending={editMutation.isPending} error={manualError}
        />
      )}

      {/* ── Floating Match Controller (Glassmorphism) ── */}
      {isLive && !readOnly && (
        <div className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
          <div className="flex justify-between gap-2 rounded-[2rem] bg-white/80 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-2xl">
            <button
              type="button"
              onClick={() => {
                setShowPositionChange(true)
                // Convert positionMap to ordered array (sorted by position number)
                const toOrdered = (ids: string[], posMap: PositionMap) =>
                  [...ids].sort((a, b) => (posMap[a] ?? 99) - (posMap[b] ?? 99))
                setPosChangeTeamAOrder(toOrdered(teamAMemberIds, resolvedCurrentSetPositions.teamAPositionMap))
                setPosChangeTeamBOrder(toOrdered(teamBMemberIds, resolvedCurrentSetPositions.teamBPositionMap))
              }}
              className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-surface-300/50 py-4 transition hover:bg-surface-300"
            >
              <RefreshCw className="h-4 w-4 text-surface-700" />
              <span className="text-[10px] font-bold text-surface-700">포지션 변경</span>
            </button>
            <button
              type="button"
              onClick={() => setShowEndSetConfirm(true)}
              className="flex flex-[1.5] flex-col items-center gap-1 rounded-2xl py-4 shadow-inner"
              style={{ background: 'linear-gradient(135deg, #516200 0%, #d1fc00 100%)' }}
            >
              <span className="text-base">✅</span>
              <span className="text-[10px] font-black text-[#3c4a00]">세트 종료</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAbortConfirm(true)}
              className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-danger/10 py-4 transition hover:bg-danger/20"
            >
              <span className="text-base">⏸️</span>
              <span className="text-[10px] font-bold text-danger">경기중단</span>
            </button>
          </div>
          {rallyMutation.error && <p className="mt-2 text-center text-sm text-danger">{(rallyMutation.error as Error).message}</p>}

          {/* End Set Confirmation */}
          {showEndSetConfirm && (
            <div className="mt-2 space-y-2 rounded-2xl bg-white p-4 shadow-lg">
              <p className="text-sm font-bold text-text-primary">현재 점수로 세트를 종료하시겠습니까?</p>
              <p className="text-xs text-surface-600">{teamAName} {teamAScore} : {teamBScore} {teamBName}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button intent="neutral" size="sm" fullWidth onClick={() => setShowEndSetConfirm(false)}>취소</Button>
                <Button intent="primary" size="sm" fullWidth onClick={() => forceEndMutation.mutate()} disabled={forceEndMutation.isPending}>
                  {forceEndMutation.isPending ? '종료 중...' : '세트 종료'}
                </Button>
              </div>
              {forceEndMutation.error && <p className="text-xs text-danger">{(forceEndMutation.error as Error).message}</p>}
            </div>
          )}

          {/* Abort Match Confirmation */}
          {showAbortConfirm && (
            <div className="mt-2 space-y-2 rounded-2xl bg-white p-4 shadow-lg">
              <p className="text-sm font-bold text-danger">경기를 중단하시겠습니까?</p>
              <p className="text-xs text-surface-600">현재 세트와 매치가 모두 종료됩니다.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button intent="neutral" size="sm" fullWidth onClick={() => setShowAbortConfirm(false)}>취소</Button>
                <Button intent="danger" size="sm" fullWidth onClick={() => abortMutation.mutate()} disabled={abortMutation.isPending}>
                  {abortMutation.isPending ? '중단 중...' : '경기 중단'}
                </Button>
              </div>
              {abortMutation.error && <p className="text-xs text-danger">{(abortMutation.error as Error).message}</p>}
            </div>
          )}
        </div>
      )}

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
              <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-surface-50 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                <div className="flex items-center justify-between px-5 py-4">
                  <p className="text-xl font-bold text-text-primary">세트 {set.setNo} 시작 전 포지션 확인</p>
                  <button
                    type="button"
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[0.75rem] bg-surface-200 text-surface-700"
                    onClick={() => {
                      setStartConfirmOpen(false)
                      setStartConfirmError(null)
                    }}
                    aria-label="닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[72vh] space-y-4 overflow-y-auto px-4 pb-2">
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

                  <p className="text-xs text-surface-600">드래그하여 포지션 순서를 변경하세요. 위에서부터 1번입니다.</p>

                  <div className="grid grid-cols-2 gap-3">
                    <DragPositionList
                      title={teamAName}
                      teamTone="a"
                      members={teamAMembers}
                      orderedIds={confirmTeamAOrder}
                      onChange={setConfirmTeamAOrder}
                    />
                    <DragPositionList
                      title={teamBName}
                      teamTone="b"
                      members={teamBMembers}
                      orderedIds={confirmTeamBOrder}
                      onChange={setConfirmTeamBOrder}
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

      {/* ── Mid-set Position Change Modal ── */}
      {showPositionChange && isLive
        ? createPortal(
            <div className="fixed inset-0 z-[85]">
              <button
                type="button"
                className="absolute inset-0 bg-surface-900/45"
                aria-label="포지션 변경 닫기"
                onClick={() => setShowPositionChange(false)}
              />
              <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-surface-50 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
                <div className="flex items-center justify-between px-5 py-4">
                  <p className="text-xl font-bold text-text-primary">포지션 변경</p>
                  <button
                    type="button"
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[0.75rem] bg-surface-200 text-surface-700"
                    onClick={() => setShowPositionChange(false)}
                    aria-label="닫기"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[72vh] space-y-4 overflow-y-auto px-4 pb-2">
                  <p className="text-xs text-surface-600">드래그하여 포지션 순서를 변경하세요. 위에서부터 1번입니다.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <DragPositionList
                      title={teamAName}
                      teamTone="a"
                      members={teamAMembers}
                      orderedIds={posChangeTeamAOrder}
                      onChange={setPosChangeTeamAOrder}
                    />
                    <DragPositionList
                      title={teamBName}
                      teamTone="b"
                      members={teamBMembers}
                      orderedIds={posChangeTeamBOrder}
                      onChange={setPosChangeTeamBOrder}
                    />
                  </div>
                  {positionChangeMutation.error && (
                    <p className="text-sm font-semibold text-danger">{(positionChangeMutation.error as Error).message}</p>
                  )}
                  <Button
                    fullWidth size="lg" intent="primary"
                    onClick={() => positionChangeMutation.mutate()}
                    disabled={positionChangeMutation.isPending}
                  >
                    {positionChangeMutation.isPending ? '저장 중...' : '포지션 변경 확정'}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

    </PageFrame>
  )
}
