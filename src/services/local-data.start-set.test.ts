import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMatch,
  listGroups,
  listMatches,
  listMeetings,
  recordRally,
  registerUser,
  startSetByIdWithServingTeam,
} from '@/services/local-data'
import type { SetPositionSnapshot, TeamPositionAssignments } from '@/types/domain'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string): void {
      store.set(key, value)
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    clear(): void {
      store.clear()
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null
    },
    get length(): number {
      return store.size
    },
  }
}

function buildAssignmentsFromPlayers(
  players: Array<{ teamId: string; profileId: string; positionNo: number }>,
  teamIds: [string, string],
): TeamPositionAssignments {
  const [teamAId, teamBId] = teamIds

  return {
    teamA: players
      .filter((player) => player.teamId === teamAId)
      .sort((left, right) => left.positionNo - right.positionNo)
      .map((player) => ({ profileId: player.profileId, positionNo: player.positionNo })),
    teamB: players
      .filter((player) => player.teamId === teamBId)
      .sort((left, right) => left.positionNo - right.positionNo)
      .map((player) => ({ profileId: player.profileId, positionNo: player.positionNo })),
  }
}

async function completeSetWithTeam(setId: string, scoringTeamId: string, points = 15): Promise<void> {
  for (let index = 0; index < points; index += 1) {
    await recordRally({
      clientEventId: `evt-${setId}-${index}`,
      setId,
      scoringTeamId,
      occurredAt: new Date(Date.now() + index).toISOString(),
    })
  }
}

function resolvePendingLineupSnapshots(
  sets: Array<{ id: string; setNo: number; status: string }>,
  setPositions: SetPositionSnapshot[],
  targetSetNo: number,
): SetPositionSnapshot[] {
  const targetSet = sets.find((set) => set.setNo === targetSetNo)
  if (!targetSet) {
    return []
  }

  let snapshots = setPositions.filter((item) => item.setId === targetSet.id)
  if (snapshots.length > 0) {
    return snapshots
  }

  if (targetSet.status === 'pending') {
    const previousWithSnapshot = sets
      .filter((set) => set.setNo < targetSetNo)
      .sort((left, right) => right.setNo - left.setNo)
      .find((set) => setPositions.some((snapshot) => snapshot.setId === set.id))

    if (previousWithSnapshot) {
      snapshots = setPositions.filter((item) => item.setId === previousWithSnapshot.id)
    }
  }

  return snapshots
}

describe('local-data start set serving team propagation', () => {
  beforeEach(() => {
    const storage = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  })

  it('blocks set 2 start when previous set is not completed', async () => {
    const owner = await registerUser({
      email: 'start-set-block@test.local',
      name: 'Owner',
      phone: '01011112222',
    })

    const groupId = (await listGroups(owner.id))[0].id
    const meetingId = (await listMeetings(groupId))[0].id

    await createMatch(owner.id, {
      groupId,
      meetingId,
      format: 'best_of_3',
      teamSize: 2,
      targetScore: 15,
      deuce: true,
      firstServingTeamIndex: 0,
      teams: [
        { name: 'A팀', playerIds: ['p1', 'p2'] },
        { name: 'B팀', playerIds: ['p3', 'p4'] },
      ],
    })

    const before = await listMatches(meetingId)
    const set2 = before[0].sets.find((set) => set.setNo === 2)
    expect(set2).toBeDefined()

    const assignments = buildAssignmentsFromPlayers(before[0].players, set2!.teamIds)

    await expect(startSetByIdWithServingTeam(set2!.id, set2!.teamIds[0], assignments)).rejects.toThrow(
      '이전 세트가 완료되어야 시작할 수 있습니다.',
    )
  })

  it('applies manual first-serving team and propagates opposite team to next pending set', async () => {
    const owner = await registerUser({
      email: 'start-set@test.local',
      name: 'Owner',
      phone: '01011112222',
    })

    const groupId = (await listGroups(owner.id))[0].id
    const meetingId = (await listMeetings(groupId))[0].id

    await createMatch(owner.id, {
      groupId,
      meetingId,
      format: 'best_of_3',
      teamSize: 2,
      targetScore: 15,
      deuce: true,
      firstServingTeamIndex: 0,
      teams: [
        { name: 'A팀', playerIds: ['p1', 'p2'] },
        { name: 'B팀', playerIds: ['p3', 'p4'] },
      ],
    })

    const before = await listMatches(meetingId)
    const set1 = before[0].sets.find((set) => set.setNo === 1)
    const set2 = before[0].sets.find((set) => set.setNo === 2)
    const set3 = before[0].sets.find((set) => set.setNo === 3)

    expect(set1).toBeDefined()
    expect(set2).toBeDefined()
    expect(set3).toBeDefined()

    await completeSetWithTeam(set1!.id, set1!.teamIds[0])

    const forcedServingTeamId = set2!.teamIds[1]
    const oppositeTeamId = set2!.teamIds[0]
    const assignments = buildAssignmentsFromPlayers(before[0].players, set2!.teamIds)

    await startSetByIdWithServingTeam(set2!.id, forcedServingTeamId, assignments)

    const after = await listMatches(meetingId)
    const updatedSet2 = after[0].sets.find((set) => set.id === set2!.id)
    const updatedSet3 = after[0].sets.find((set) => set.id === set3!.id)

    expect(updatedSet2?.status).toBe('in_progress')
    expect(updatedSet2?.initialServingTeamId).toBe(forcedServingTeamId)
    expect(updatedSet2?.servingTeamId).toBe(forcedServingTeamId)
    expect(updatedSet3?.status).toBe('pending')
    expect(updatedSet3?.initialServingTeamId).toBe(oppositeTeamId)
    expect(updatedSet3?.servingTeamId).toBe(oppositeTeamId)
  })

  it('stores set position snapshot on start and resolves pending lineup from previous snapshot', async () => {
    const owner = await registerUser({
      email: 'start-set-snapshot@test.local',
      name: 'Owner',
      phone: '01011112222',
    })

    const groupId = (await listGroups(owner.id))[0].id
    const meetingId = (await listMeetings(groupId))[0].id

    await createMatch(owner.id, {
      groupId,
      meetingId,
      format: 'best_of_3',
      teamSize: 2,
      targetScore: 15,
      deuce: true,
      firstServingTeamIndex: 0,
      teams: [
        { name: 'A팀', playerIds: ['p1', 'p2'] },
        { name: 'B팀', playerIds: ['p3', 'p4'] },
      ],
    })

    const before = await listMatches(meetingId)
    const set1 = before[0].sets.find((set) => set.setNo === 1)
    const set2 = before[0].sets.find((set) => set.setNo === 2)
    const set3 = before[0].sets.find((set) => set.setNo === 3)

    expect(set1).toBeDefined()
    expect(set2).toBeDefined()
    expect(set3).toBeDefined()

    await completeSetWithTeam(set1!.id, set1!.teamIds[0])

    const baseAssignments = buildAssignmentsFromPlayers(before[0].players, set2!.teamIds)
    const customAssignments: TeamPositionAssignments = {
      teamA: [...baseAssignments.teamA]
        .reverse()
        .map((item, index) => ({ profileId: item.profileId, positionNo: index + 1 })),
      teamB: [...baseAssignments.teamB],
    }

    await startSetByIdWithServingTeam(set2!.id, set2!.teamIds[0], customAssignments)

    const after = await listMatches(meetingId)
    const set2Snapshots = after[0].setPositions
      .filter((item) => item.setId === set2!.id)
      .sort((left, right) => left.positionNo - right.positionNo)
    const set3Snapshots = after[0].setPositions.filter((item) => item.setId === set3!.id)

    expect(set2Snapshots.length).toBe(4)
    expect(set2Snapshots.filter((item) => item.teamId === set2!.teamIds[0]).map((item) => item.profileId)).toEqual(
      customAssignments.teamA.map((item) => item.profileId),
    )
    expect(set3Snapshots.length).toBe(0)

    const pendingSnapshots = resolvePendingLineupSnapshots(after[0].sets, after[0].setPositions, 3)
      .filter((item) => item.teamId === set2!.teamIds[0])
      .sort((left, right) => left.positionNo - right.positionNo)

    expect(pendingSnapshots.map((item) => item.profileId)).toEqual(customAssignments.teamA.map((item) => item.profileId))
  })
})
