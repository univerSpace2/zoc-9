import type { MatchFormat, RallyEvent, SetRecord, TeamSize } from '@/types/domain'

interface CreateSetInput {
  id: string
  matchId: string
  setNo: number
  teamIds: [string, string]
  teamSize: TeamSize
  targetScore: number
  deuce: boolean
  initialServingTeamId: string
}

export function initializeRotation(teamIds: [string, string], initialServingTeamId: string): Record<string, number> {
  const [teamAId, teamBId] = teamIds

  if (initialServingTeamId === teamAId) {
    return {
      [teamAId]: 1,
      [teamBId]: 0,
    }
  }

  return {
    [teamAId]: 0,
    [teamBId]: 1,
  }
}

export function nextServePosition(currentPosition: number, teamSize: TeamSize): number {
  if (currentPosition <= 0) {
    return 1
  }

  return (currentPosition % teamSize) + 1
}

export function requiredSetWins(format: MatchFormat): number {
  if (format === 'single') {
    return 1
  }

  if (format === 'best_of_3') {
    return 2
  }

  return 3
}

export function maxSetCount(format: MatchFormat): number {
  if (format === 'single') {
    return 1
  }

  if (format === 'best_of_3') {
    return 3
  }

  return 5
}

export function nextStartingTeamId(currentStartingTeamId: string, teamIds: [string, string]): string {
  return teamIds[0] === currentStartingTeamId ? teamIds[1] : teamIds[0]
}

export function createSetRecord(input: CreateSetInput): SetRecord {
  const [teamAId, teamBId] = input.teamIds
  const rotation = initializeRotation(input.teamIds, input.initialServingTeamId)

  return {
    id: input.id,
    matchId: input.matchId,
    setNo: input.setNo,
    status: 'pending',
    teamIds: [teamAId, teamBId],
    initialServingTeamId: input.initialServingTeamId,
    servingTeamId: input.initialServingTeamId,
    targetScore: input.targetScore,
    deuce: input.deuce,
    teamSize: input.teamSize,
    score: {
      [teamAId]: 0,
      [teamBId]: 0,
    },
    rotation,
    events: [],
  }
}

export function startSet(set: SetRecord): SetRecord {
  if (set.status !== 'pending') {
    return set
  }

  const rotation = initializeRotation(set.teamIds, set.initialServingTeamId)

  return {
    ...set,
    status: 'in_progress',
    servingTeamId: set.initialServingTeamId,
    score: {
      [set.teamIds[0]]: 0,
      [set.teamIds[1]]: 0,
    },
    rotation,
    events: [],
    winnerTeamId: undefined,
  }
}

function isSetWin(score: Record<string, number>, scoringTeamId: string, targetScore: number, deuce: boolean): boolean {
  const teams = Object.keys(score)
  const scoringScore = score[scoringTeamId]
  const otherTeamId = teams.find((teamId) => teamId !== scoringTeamId)

  if (!otherTeamId) {
    return false
  }

  const otherScore = score[otherTeamId]

  if (!deuce) {
    return scoringScore >= targetScore
  }

  if (scoringScore < targetScore) {
    return false
  }

  if (scoringScore < targetScore && otherScore < targetScore - 1) {
    return false
  }

  return scoringScore - otherScore >= 2
}

export function applyRally(set: SetRecord, scoringTeamId: string, clientEventId: string, occurredAt: string): SetRecord {
  if (set.status !== 'in_progress') {
    throw new Error('세트가 진행 중이 아닙니다.')
  }

  const score = {
    ...set.score,
    [scoringTeamId]: (set.score[scoringTeamId] ?? 0) + 1,
  }

  const rotation = { ...set.rotation }
  const servingTeamIdBefore = set.servingTeamId
  const servingPositionBefore = rotation[servingTeamIdBefore] ?? 0
  let servingTeamIdAfter = set.servingTeamId
  let rotationAppliedToTeamId: string | undefined

  if (servingTeamIdBefore !== scoringTeamId) {
    servingTeamIdAfter = scoringTeamId
    rotation[scoringTeamId] = nextServePosition(rotation[scoringTeamId] ?? 0, set.teamSize)
    rotationAppliedToTeamId = scoringTeamId
  }

  const servingPositionAfter = rotation[servingTeamIdAfter] ?? 0

  const event: RallyEvent = {
    clientEventId,
    setId: set.id,
    scoringTeamId,
    occurredAt,
    servingTeamIdBefore,
    servingTeamIdAfter,
    servingPositionBefore,
    servingPositionAfter,
    rotationAppliedToTeamId,
    scoreAfter: score,
  }

  const nextSet: SetRecord = {
    ...set,
    score,
    servingTeamId: servingTeamIdAfter,
    rotation,
    events: [...set.events, event],
  }

  if (isSetWin(score, scoringTeamId, set.targetScore, set.deuce)) {
    return {
      ...nextSet,
      status: 'completed',
      winnerTeamId: scoringTeamId,
    }
  }

  return nextSet
}

export function tallySetWins(sets: SetRecord[]): Record<string, number> {
  const wins: Record<string, number> = {}

  for (const set of sets) {
    if (set.status !== 'completed') {
      continue
    }

    let winnerTeamId = set.winnerTeamId

    if (!winnerTeamId) {
      const [teamAId, teamBId] = set.teamIds
      const teamAScore = set.score[teamAId] ?? 0
      const teamBScore = set.score[teamBId] ?? 0

      if (teamAScore > teamBScore) {
        winnerTeamId = teamAId
      } else if (teamBScore > teamAScore) {
        winnerTeamId = teamBId
      }
    }

    if (winnerTeamId) {
      wins[winnerTeamId] = (wins[winnerTeamId] ?? 0) + 1
    }
  }

  return wins
}

export function decideMatchWinner(
  sets: SetRecord[],
  requiredWins: number,
): { winnerTeamId?: string; shouldFinish: boolean } {
  const wins = tallySetWins(sets)

  for (const [teamId, winCount] of Object.entries(wins)) {
    if (winCount >= requiredWins) {
      return {
        winnerTeamId: teamId,
        shouldFinish: true,
      }
    }
  }

  return {
    shouldFinish: false,
  }
}

export function markRemainingSetsIgnored(sets: SetRecord[]): SetRecord[] {
  return sets.map((set) => {
    if (set.status === 'pending') {
      return {
        ...set,
        status: 'ignored',
      }
    }

    return set
  })
}
