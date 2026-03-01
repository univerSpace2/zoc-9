import { beforeEach, describe, expect, it } from 'vitest'
import { listMatches } from '@/services/local-data'

const STORAGE_KEY = 'zoc9-data-v1'
const MIGRATION_FLAG_KEY = 'zoc9-rotation-independent-migrated-v1'

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

function seedLegacyStore(): void {
  const store = {
    profiles: [],
    groups: [],
    groupMembers: [],
    invites: [],
    venues: [],
    meetings: [],
    meetingParticipants: [],
    matches: [
      {
        id: 'match-1',
        groupId: 'group-1',
        meetingId: 'meeting-1',
        format: 'best_of_3',
        status: 'in_progress',
        teamSize: 3,
        targetScore: 15,
        deuce: true,
        requiredSetWins: 2,
        firstServingTeamId: 'team-a',
        createdAt: '2026-02-28T00:00:00.000Z',
        createdBy: 'profile-1',
      },
    ],
    matchTeams: [
      { id: 'team-a', matchId: 'match-1', name: 'A팀' },
      { id: 'team-b', matchId: 'match-1', name: 'B팀' },
    ],
    matchPlayers: [],
    sets: [
      {
        id: 'set-in-progress',
        matchId: 'match-1',
        setNo: 1,
        status: 'in_progress',
        teamIds: ['team-a', 'team-b'],
        initialServingTeamId: 'team-a',
        servingTeamId: 'team-a',
        targetScore: 15,
        deuce: true,
        teamSize: 3,
        score: { 'team-a': 0, 'team-b': 0 },
        rotation: { 'team-a': 1, 'team-b': 1 },
        events: [
          {
            clientEventId: 'evt-1',
            setId: 'set-in-progress',
            scoringTeamId: 'team-b',
            occurredAt: '2026-02-28T10:00:00.000Z',
            servingTeamIdBefore: 'team-a',
            servingTeamIdAfter: 'team-b',
            scoreAfter: { 'team-a': 0, 'team-b': 1 },
          },
          {
            clientEventId: 'evt-2',
            setId: 'set-in-progress',
            scoringTeamId: 'team-a',
            occurredAt: '2026-02-28T10:00:01.000Z',
            servingTeamIdBefore: 'team-b',
            servingTeamIdAfter: 'team-a',
            scoreAfter: { 'team-a': 1, 'team-b': 1 },
          },
        ],
      },
      {
        id: 'set-pending',
        matchId: 'match-1',
        setNo: 2,
        status: 'pending',
        teamIds: ['team-a', 'team-b'],
        initialServingTeamId: 'team-a',
        servingTeamId: 'team-a',
        targetScore: 15,
        deuce: true,
        teamSize: 3,
        score: { 'team-a': 0, 'team-b': 0 },
        rotation: { 'team-a': 1, 'team-b': 1 },
        events: [],
      },
      {
        id: 'set-completed',
        matchId: 'match-1',
        setNo: 3,
        status: 'completed',
        teamIds: ['team-a', 'team-b'],
        initialServingTeamId: 'team-a',
        servingTeamId: 'team-b',
        targetScore: 15,
        deuce: true,
        teamSize: 3,
        score: { 'team-a': 14, 'team-b': 16 },
        rotation: { 'team-a': 1, 'team-b': 1 },
        winnerTeamId: 'team-b',
        events: [],
      },
    ],
    notices: [],
    auditLogs: [],
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

describe('local-data rotation migration', () => {
  beforeEach(() => {
    const storage = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  })

  it('migrates pending/in_progress sets and keeps completed sets unchanged', async () => {
    seedLegacyStore()

    const matches = await listMatches('meeting-1')
    const sets = matches[0].sets

    const inProgress = sets.find((set) => set.id === 'set-in-progress')
    const pending = sets.find((set) => set.id === 'set-pending')
    const completed = sets.find((set) => set.id === 'set-completed')

    expect(inProgress).toBeDefined()
    expect(pending).toBeDefined()
    expect(completed).toBeDefined()

    expect(inProgress?.rotation['team-a']).toBe(2)
    expect(inProgress?.rotation['team-b']).toBe(1)
    expect(inProgress?.servingTeamId).toBe('team-a')
    expect(inProgress?.events[0]?.servingPositionAfter).toBe(1)
    expect(inProgress?.events[1]?.servingPositionAfter).toBe(2)

    expect(pending?.rotation['team-a']).toBe(1)
    expect(pending?.rotation['team-b']).toBe(0)

    expect(completed?.rotation['team-a']).toBe(1)
    expect(completed?.rotation['team-b']).toBe(1)

    expect(window.localStorage.getItem(MIGRATION_FLAG_KEY)).toBe('1')
  })
})
