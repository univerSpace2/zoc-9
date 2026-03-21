import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PageFrame } from '@/components/layout/PageFrame'
import { Button } from '@/components/ui/Button'
import { FORMAT_LABEL } from '@/lib/constants'
import { apiGetActiveMeeting, apiListMatches, queryKeys } from '@/services/api'
import type { Match, MatchTeam, SetRecord } from '@/types/domain'

function resolveCompletedSetWinnerTeamId(set: {
  status: string
  winnerTeamId?: string
  teamIds: [string, string]
  score: Record<string, number>
}): string | null {
  if (set.winnerTeamId) return set.winnerTeamId
  if (set.status !== 'completed') return null
  const [teamAId, teamBId] = set.teamIds
  const scoreA = set.score[teamAId] ?? 0
  const scoreB = set.score[teamBId] ?? 0
  if (scoreA === scoreB) return null
  return scoreA > scoreB ? teamAId : teamBId
}

function resolveMatchSetWins(
  _match: { requiredSetWins: number },
  teams: MatchTeam[],
  sets: SetRecord[],
): Map<string, number> {
  const wins = new Map<string, number>()
  for (const team of teams) wins.set(team.id, 0)
  for (const set of sets) {
    const winnerId = resolveCompletedSetWinnerTeamId(set)
    if (winnerId) wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1)
  }
  return wins
}

function resolveMatchWinnerTeamId(
  match: { requiredSetWins: number; winnerTeamId?: string },
  sets: SetRecord[],
): string | null {
  if (match.winnerTeamId) return match.winnerTeamId
  const wins = new Map<string, number>()
  for (const set of sets) {
    const winnerId = resolveCompletedSetWinnerTeamId(set)
    if (!winnerId) continue
    wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1)
    if ((wins.get(winnerId) ?? 0) >= match.requiredSetWins) return winnerId
  }
  return null
}

/** Find the current (in_progress) or latest set for a live match */
function findActiveSet(sets: SetRecord[]): SetRecord | undefined {
  return sets.find((s) => s.status === 'in_progress') ?? sets.filter((s) => s.status === 'completed').pop() ?? sets[0]
}

export function GroupMatchHubPage() {
  const { groupId } = useParams<{ groupId: string }>()

  const activeMeetingQuery = useQuery({
    queryKey: queryKeys.activeMeeting(groupId ?? ''),
    queryFn: () => apiGetActiveMeeting(groupId ?? ''),
    enabled: Boolean(groupId),
    refetchInterval: 10_000,
  })

  const meetingId = activeMeetingQuery.data?.id
  const matchesQuery = useQuery({
    queryKey: queryKeys.matches(meetingId ?? ''),
    queryFn: () => apiListMatches(meetingId ?? ''),
    enabled: Boolean(meetingId),
    refetchInterval: 10_000,
  })

  if (!groupId) return null

  const allMatchItems = matchesQuery.data ?? []
  const liveMatch = allMatchItems.find((item) => item.match.status === 'in_progress')
  const completedMatches = allMatchItems.filter((item) => item.match.status === 'completed')

  return (
    <PageFrame className="space-y-8 pt-6">
      {/* ── Section: 진행 중인 경기 ────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-end justify-between px-1">
          <h2 className="font-display text-xl font-bold tracking-tight">진행 중인 경기</h2>
          {liveMatch && (
            <span className="animate-pulse rounded-full bg-[#f95630] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
              Live Now
            </span>
          )}
        </div>

        {liveMatch ? (
          <LiveMatchCard groupId={groupId} meetingId={meetingId!} matchItem={liveMatch} />
        ) : activeMeetingQuery.data ? (
          <div className="rounded-3xl bg-surface-50 p-6 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
            <p className="text-center text-sm text-surface-600">
              <span className="font-bold text-text-primary">{activeMeetingQuery.data.title}</span> 모임이 진행
              중입니다.
            </p>
            <Link to={`/g/${groupId}/m/${activeMeetingQuery.data.id}/matches`} className="mt-4 block">
              <Button fullWidth size="lg" intent="primary">
                매치 화면으로 이동
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-3xl bg-surface-100 p-6">
            <p className="text-center text-sm text-surface-600">현재 진행 중인 모임이 없습니다.</p>
          </div>
        )}
      </section>

      {/* ── Section: 새 경기 생성 설정 (Quick Config Preview) ─ */}
      {activeMeetingQuery.data && (
        <section className="space-y-4">
          <h2 className="px-1 font-display text-xl font-bold tracking-tight">새 경기 생성 설정</h2>
          <div className="space-y-6 rounded-3xl bg-surface-100 p-6">
            {/* Goal Score */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-surface-600">
                  목표 점수 (Goal Score)
                </span>
                <span className="font-display text-lg font-extrabold tracking-tighter text-[#516200]">15점</span>
              </div>
              <div className="relative h-2 rounded-full bg-surface-300">
                <div className="absolute left-0 top-0 h-full w-[60%] rounded-full bg-[#516200]" />
                <div className="absolute left-[60%] top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#516200] bg-white shadow-md" />
              </div>
            </div>

            {/* Quick options */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2 rounded-2xl bg-surface-50 p-4">
                <span className="text-[10px] font-bold uppercase text-surface-600">듀스 적용</span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">ON</span>
                  <div className="relative h-6 w-10 rounded-full bg-[#516200] p-1">
                    <div className="ml-auto h-4 w-4 rounded-full bg-white" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 rounded-2xl bg-surface-50 p-4">
                <span className="text-[10px] font-bold uppercase text-surface-600">경기 방식</span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">4 v 4</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link to={`/g/${groupId}/m/${activeMeetingQuery.data.id}/matches`}>
              <Button fullWidth size="lg" intent="primary">
                대전 신청
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* ── Section: 경기 기록 ────────────────────────────── */}
      {completedMatches.length > 0 && (
        <section className="space-y-4">
          <h2 className="px-1 font-display text-xl font-bold tracking-tight">경기 기록</h2>
          <div className="space-y-3">
            {completedMatches.map(({ match, teams, sets }) => (
              <MatchHistoryRow
                key={match.id}
                groupId={groupId}
                meetingId={meetingId!}
                match={match}
                teams={teams}
                sets={sets}
              />
            ))}
          </div>
        </section>
      )}

      {/* Show empty state only when meeting exists but no completed matches */}
      {activeMeetingQuery.data && completedMatches.length === 0 && !liveMatch && (
        <section className="space-y-4">
          <h2 className="px-1 font-display text-xl font-bold tracking-tight">경기 기록</h2>
          <div className="rounded-3xl bg-surface-100 p-6">
            <p className="text-center text-sm text-surface-600">아직 완료된 경기가 없습니다.</p>
          </div>
        </section>
      )}
    </PageFrame>
  )
}

/* ═══════════════════════════════════════════════════════════
   Live Match Card
   ═══════════════════════════════════════════════════════════ */

function LiveMatchCard({
  groupId,
  meetingId,
  matchItem,
}: {
  groupId: string
  meetingId: string
  matchItem: {
    match: Match
    teams: MatchTeam[]
    sets: SetRecord[]
  }
}) {
  const { match, teams, sets } = matchItem
  const activeSet = findActiveSet(sets)
  const teamA = teams[0]
  const teamB = teams[1]

  const scoreA = activeSet ? (activeSet.score[teamA?.id ?? ''] ?? 0) : 0
  const scoreB = activeSet ? (activeSet.score[teamB?.id ?? ''] ?? 0) : 0
  const targetScore = activeSet?.targetScore ?? match.targetScore
  const maxScore = Math.max(scoreA, scoreB, 1)
  const progressPct = Math.min(Math.round((maxScore / targetScore) * 100), 100)

  const currentSetNo = activeSet?.setNo ?? 1
  const formatLabel = FORMAT_LABEL[match.format] ?? match.format

  return (
    <Link to={`/g/${groupId}/m/${meetingId}/matches`}>
      <div className="relative overflow-hidden rounded-3xl bg-surface-50 p-6 shadow-[0_20px_40px_rgba(44,47,48,0.06)]">
        {/* Kinetic background blur */}
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[#d1fc00]/30 blur-2xl" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          {/* Match info line */}
          <div className="flex items-center gap-2 text-surface-600">
            <span className="text-[11px] font-bold tracking-wider">
              {currentSetNo}세트: {formatLabel} / {match.teamSize}v{match.teamSize} / {targetScore}점
            </span>
          </div>

          {/* Score display */}
          <div className="flex w-full items-center justify-between px-2">
            {/* Team A */}
            <div className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-200 text-xl font-black text-[#516200] shadow-inner">
                A
              </div>
              <span className="text-xs font-bold text-surface-600">{teamA?.name ?? 'Team A'}</span>
            </div>

            {/* Scores */}
            <div className="flex flex-1 items-center justify-center gap-3">
              <span className="font-display text-5xl font-black tracking-tighter text-text-primary">
                {String(scoreA).padStart(2, '0')}
              </span>
              <span className="text-2xl font-black text-surface-300">:</span>
              <span className="font-display text-5xl font-black tracking-tighter text-text-primary">
                {String(scoreB).padStart(2, '0')}
              </span>
            </div>

            {/* Team B */}
            <div className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-200 text-xl font-black text-[#0059b6] shadow-inner">
                B
              </div>
              <span className="text-xs font-bold text-surface-600">{teamB?.name ?? 'Team B'}</span>
            </div>
          </div>

          {/* Set progress bar */}
          <div className="mt-4 w-full rounded-2xl border border-[#516200]/10 bg-[#d1fc00]/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#4c5d00]">SET PROGRESS</span>
              <span className="text-[10px] font-bold text-[#4c5d00]">{progressPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/50">
              <div
                className="h-full rounded-full bg-[#516200] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════
   Match History Row
   ═══════════════════════════════════════════════════════════ */

function MatchHistoryRow({
  groupId,
  meetingId,
  match,
  teams,
  sets,
}: {
  groupId: string
  meetingId: string
  match: Match
  teams: MatchTeam[]
  sets: SetRecord[]
}) {
  const teamA = teams[0]
  const teamB = teams[1]
  const winnerTeamId = resolveMatchWinnerTeamId(match, sets)

  // Compute total set wins for display
  const setWins = resolveMatchSetWins(match, teams, sets)
  const teamAWins = setWins.get(teamA?.id ?? '') ?? 0
  const teamBWins = setWins.get(teamB?.id ?? '') ?? 0

  const teamAIsWinner = winnerTeamId === teamA?.id
  const teamBIsWinner = winnerTeamId === teamB?.id

  // Format time from createdAt
  const createdDate = new Date(match.createdAt)
  const timeStr = `${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`

  return (
    <Link to={`/g/${groupId}/m/${meetingId}/matches`}>
      <div className="group flex items-center justify-between rounded-3xl bg-surface-50 p-5 transition-shadow hover:shadow-[0_20px_40px_rgba(44,47,48,0.08)]">
        {/* Left: status + team names */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-surface-400">FIN</span>
            <span className="text-xs font-bold text-surface-400">{timeStr}</span>
          </div>
          <div className="h-8 w-[2px] bg-surface-200" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-surface-700">{teamA?.name ?? 'Team A'}</span>
            <span className="text-xs font-bold text-surface-700">{teamB?.name ?? 'Team B'}</span>
          </div>
        </div>

        {/* Right: scores */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span
              className={`font-display text-lg font-black ${teamAIsWinner ? 'text-[#516200]' : 'text-surface-500'}`}
            >
              {String(teamAWins).padStart(2, '0')}
            </span>
            <span
              className={`font-display text-lg font-black ${teamBIsWinner ? 'text-[#516200]' : 'text-surface-500'}`}
            >
              {String(teamBWins).padStart(2, '0')}
            </span>
          </div>
          <ChevronRight className="h-5 w-5 text-surface-400 transition-colors group-hover:text-[#516200]" />
        </div>
      </div>
    </Link>
  )
}
