import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMatch,
  editCompletedSetScore,
  listGroups,
  listMatches,
  listMeetings,
  registerUser,
} from '@/services/local-data'

const STORAGE_KEY = 'zoc9-data-v1'
const MATCH_COMPLETION_MIGRATION_FLAG_KEY = 'zoc9-match-completion-migrated-v1'

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

describe('local-data match completion', () => {
  beforeEach(() => {
    const storage = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  })

  it('completes best-of-3 match and ignores remaining set when two set wins are recorded', async () => {
    const owner = await registerUser({
      email: 'owner@test.local',
      name: 'Owner',
      phone: '01000000000',
    })

    const groups = await listGroups(owner.id)
    const groupId = groups[0].id
    const meetings = await listMeetings(groupId)
    const meetingId = meetings[0].id

    const match = await createMatch(owner.id, {
      groupId,
      meetingId,
      format: 'best_of_3',
      teamSize: 2,
      targetScore: 15,
      deuce: true,
      firstServingTeamIndex: 0,
      teams: [
        { name: 'A팀', playerIds: [owner.id] },
        { name: 'B팀', playerIds: [owner.id] },
      ],
    })

    const firstSnapshot = await listMatches(meetingId)
    const sets = firstSnapshot[0].sets

    await editCompletedSetScore(owner.id, sets[0].id, { teamA: 15, teamB: 12 })
    await editCompletedSetScore(owner.id, sets[1].id, { teamA: 15, teamB: 13 })

    const secondSnapshot = await listMatches(meetingId)
    const updatedMatch = secondSnapshot.find((item) => item.match.id === match.id)

    expect(updatedMatch).toBeDefined()
    expect(updatedMatch?.match.status).toBe('completed')
    expect(updatedMatch?.sets[2].status).toBe('ignored')
  })

  it('rejects tie score on completed set edit', async () => {
    const owner = await registerUser({
      email: 'owner2@test.local',
      name: 'Owner2',
      phone: '01000000001',
    })

    const groups = await listGroups(owner.id)
    const groupId = groups[0].id
    const meetings = await listMeetings(groupId)
    const meetingId = meetings[0].id

    const match = await createMatch(owner.id, {
      groupId,
      meetingId,
      format: 'best_of_3',
      teamSize: 2,
      targetScore: 15,
      deuce: true,
      firstServingTeamIndex: 0,
      teams: [
        { name: 'A팀', playerIds: [owner.id] },
        { name: 'B팀', playerIds: [owner.id] },
      ],
    })

    const snapshot = await listMatches(meetingId)
    const setId = snapshot.find((item) => item.match.id === match.id)!.sets[0].id

    await expect(editCompletedSetScore(owner.id, setId, { teamA: 14, teamB: 14 })).rejects.toThrow(
      '완료 세트는 동점으로 저장할 수 없습니다.',
    )
  })

  it('repairs completed sets with missing winnerTeamId from score and reopens tied completed sets', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profiles: [],
        groups: [],
        groupMembers: [],
        invites: [],
        venues: [],
        meetings: [],
        meetingParticipants: [],
        matches: [
          {
            id: 'match-legacy',
            groupId: 'group-legacy',
            meetingId: 'meeting-legacy',
            format: 'best_of_3',
            status: 'in_progress',
            teamSize: 3,
            targetScore: 15,
            deuce: true,
            requiredSetWins: 2,
            firstServingTeamId: 'team-a',
            winnerTeamId: undefined,
            createdAt: '2026-02-28T00:00:00.000Z',
            createdBy: 'profile-legacy',
          },
        ],
        matchTeams: [
          { id: 'team-a', matchId: 'match-legacy', name: 'A팀' },
          { id: 'team-b', matchId: 'match-legacy', name: 'B팀' },
        ],
        matchPlayers: [],
        sets: [
          {
            id: 'legacy-set-1',
            matchId: 'match-legacy',
            setNo: 1,
            status: 'completed',
            teamIds: ['team-a', 'team-b'],
            initialServingTeamId: 'team-a',
            servingTeamId: 'team-b',
            targetScore: 15,
            deuce: true,
            teamSize: 3,
            score: { 'team-a': 15, 'team-b': 13 },
            rotation: { 'team-a': 1, 'team-b': 1 },
            winnerTeamId: undefined,
            events: [],
          },
          {
            id: 'legacy-set-2',
            matchId: 'match-legacy',
            setNo: 2,
            status: 'completed',
            teamIds: ['team-a', 'team-b'],
            initialServingTeamId: 'team-b',
            servingTeamId: 'team-a',
            targetScore: 15,
            deuce: true,
            teamSize: 3,
            score: { 'team-a': 14, 'team-b': 14 },
            rotation: { 'team-a': 1, 'team-b': 1 },
            winnerTeamId: undefined,
            events: [],
          },
          {
            id: 'legacy-set-3',
            matchId: 'match-legacy',
            setNo: 3,
            status: 'pending',
            teamIds: ['team-a', 'team-b'],
            initialServingTeamId: 'team-a',
            servingTeamId: 'team-a',
            targetScore: 15,
            deuce: true,
            teamSize: 3,
            score: { 'team-a': 0, 'team-b': 0 },
            rotation: { 'team-a': 1, 'team-b': 0 },
            winnerTeamId: undefined,
            events: [],
          },
        ],
        notices: [],
        auditLogs: [],
      }),
    )

    const snapshot = await listMatches('meeting-legacy')
    const updated = snapshot[0]
    const set1 = updated.sets.find((set) => set.id === 'legacy-set-1')
    const set2 = updated.sets.find((set) => set.id === 'legacy-set-2')

    expect(set1?.winnerTeamId).toBe('team-a')
    expect(set2?.status).toBe('in_progress')
    expect(set2?.winnerTeamId).toBeUndefined()
    expect(updated.match.status).toBe('in_progress')
    expect(window.localStorage.getItem(MATCH_COMPLETION_MIGRATION_FLAG_KEY)).toBe('1')
  })

  it('reopens match and restores ignored set to playable state when wins drop below required', async () => {
    const owner = await registerUser({
      email: 'owner3@test.local',
      name: 'Owner3',
      phone: '01000000002',
    })

    const groups = await listGroups(owner.id)
    const groupId = groups[0].id
    const meetings = await listMeetings(groupId)
    const meetingId = meetings[0].id

    const match = await createMatch(owner.id, {
      groupId,
      meetingId,
      format: 'best_of_3',
      teamSize: 2,
      targetScore: 15,
      deuce: true,
      firstServingTeamIndex: 0,
      teams: [
        { name: 'A팀', playerIds: [owner.id] },
        { name: 'B팀', playerIds: [owner.id] },
      ],
    })

    let snapshot = await listMatches(meetingId)
    const [set1, set2] = snapshot.find((item) => item.match.id === match.id)!.sets

    await editCompletedSetScore(owner.id, set1.id, { teamA: 15, teamB: 10 })
    await editCompletedSetScore(owner.id, set2.id, { teamA: 15, teamB: 11 })

    snapshot = await listMatches(meetingId)
    let updated = snapshot.find((item) => item.match.id === match.id)!
    expect(updated.match.status).toBe('completed')
    expect(updated.sets[2].status).toBe('ignored')

    await editCompletedSetScore(owner.id, set2.id, { teamA: 12, teamB: 15 })

    snapshot = await listMatches(meetingId)
    updated = snapshot.find((item) => item.match.id === match.id)!

    expect(updated.match.status).toBe('in_progress')
    expect(updated.match.winnerTeamId).toBeUndefined()
    expect(updated.sets[2].status).not.toBe('ignored')
    expect(updated.sets[2].status).toBe('pending')
  })
})
