import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { z } from 'zod'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DeuceBadge } from '@/components/ui/DeuceBadge'
import { Input } from '@/components/ui/Input'
import { ScoreBoard } from '@/components/ui/ScoreBoard'
import { SelectField } from '@/components/ui/SelectField'
import { StatusChip } from '@/components/ui/StatusChip'
import { WinnerBadge } from '@/components/ui/WinnerBadge'
import { enqueueRallyEvent, listQueuedRallyEvents, removeQueuedRallyEvent } from '@/lib/offline-queue'
import { applyRally, startSet } from '@/lib/rules-engine'
import { createId, nowIso } from '@/lib/utils'
import { useVisibilityAndOnlineSync } from '@/lib/visibility-sync'
import {
  apiEditCompletedSet,
  apiGetMeeting,
  apiGetSet,
  apiHasPermission,
  apiRecordRally,
  apiStartSet,
  queryKeys,
} from '@/services/api'
import { useAuthStore } from '@/store/auth-store'
import { useUiStore } from '@/store/ui-store'

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
    mutationFn: async () => {
      if (!setId) {
        throw new Error('세트를 찾을 수 없습니다.')
      }

      return apiStartSet(setId, selectedServingTeamId || undefined)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.set(setId ?? '') })
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

      // 오프라인에서는 큐 적재만 수행하고 서버 호출은 복귀 후 동기화에서 처리한다.
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

      // 온라인 즉시 반영 성공 시에는 해당 이벤트만 큐에서 제거한다.
      await removeQueuedRallyEvent(event.clientEventId)
      await refreshQueueCount()

      return updatedSet
    },
    onMutate: async (scoringTeamId) => {
      const previous = queryClient.getQueryData(queryKeys.set(setId ?? ''))

      queryClient.setQueryData(queryKeys.set(setId ?? ''), (current: Awaited<ReturnType<typeof apiGetSet>> | undefined) => {
        if (!current) {
          return current
        }

        const inProgress = current.set.status === 'pending' ? startSet(current.set) : current.set

        if (inProgress.status !== 'in_progress') {
          return current
        }

        try {
          const optimisticSet = applyRally(inProgress, scoringTeamId, createId('evt_optimistic'), nowIso())

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

  if (!setId || !payload) {
    return (
      <PageFrame className="pt-6">
        <Card>세트 정보를 찾을 수 없습니다.</Card>
      </PageFrame>
    )
  }

  const { set, match } = payload
  const [teamAId, teamBId] = set.teamIds
  const teamAName = teamNameMap.get(teamAId) ?? '팀 A'
  const teamBName = teamNameMap.get(teamBId) ?? '팀 B'
  const teamAScore = set.score[teamAId] ?? 0
  const teamBScore = set.score[teamBId] ?? 0
  const meetingCompleted = meetingQuery.data?.status === 'completed'
  const readOnly = Boolean(meetingCompleted) || match.status === 'completed' || set.status === 'completed' || set.status === 'ignored'
  const canEditCompleted = Boolean(permissionQuery.data)
  const deuceThreshold = Math.max(1, set.targetScore - 1)
  const inDeuceZone = set.deuce && teamAScore >= deuceThreshold && teamBScore >= deuceThreshold
  const isDeuce = inDeuceZone && teamAScore === teamBScore
  const advantageTeamName = inDeuceZone && Math.abs(teamAScore - teamBScore) === 1
    ? teamAScore > teamBScore
      ? teamAName
      : teamBName
    : null
  const servingTeamKey = set.servingTeamId === teamAId ? 'A' : 'B'
  const winnerTeamKey =
    set.winnerTeamId === teamAId ? 'A' : set.winnerTeamId === teamBId ? 'B' : undefined
  const winnerTeamName =
    set.winnerTeamId === teamAId ? teamAName : set.winnerTeamId === teamBId ? teamBName : undefined

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
        <p className="text-xl text-surface-700">
          현재 서브: {teamNameMap.get(set.servingTeamId)} (포지션 {set.rotation[set.servingTeamId]})
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
          <Button fullWidth size="lg" intent="primary" onClick={() => startMutation.mutate()} disabled={startMutation.isPending || readOnly}>
            세트 시작
          </Button>
        </Card>
      ) : null}

      <Card className="space-y-3" tone="info">
        <div className="grid grid-cols-2 gap-2">
          <Button
            intent="secondary"
            size="lg"
            fullWidth
            disabled={rallyMutation.isPending || readOnly}
            onClick={() => rallyMutation.mutate(teamAId)}
          >
            {teamAName} +1 ({teamAScore})
          </Button>
          <Button
            intent="secondary"
            size="lg"
            fullWidth
            disabled={rallyMutation.isPending || readOnly}
            onClick={() => rallyMutation.mutate(teamBId)}
          >
            {teamBName} +1 ({teamBScore})
          </Button>
        </div>

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
                      {new Date(event.occurredAt).toLocaleTimeString('ko-KR')} · 서브{' '}
                      {teamNameMap.get(event.servingTeamIdBefore)} {beforePosition}번 →{' '}
                      {teamNameMap.get(event.servingTeamIdAfter)} {afterPosition}번
                    </p>
                  </div>
                )
              })}
          </div>
        ) : (
          <p className="text-base text-surface-700">아직 득점 기록이 없습니다.</p>
        )}
      </Card>
    </PageFrame>
  )
}
