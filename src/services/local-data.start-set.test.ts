import { beforeEach, describe, expect, it } from 'vitest'
import {
  createMatch,
  listGroups,
  listMatches,
  listMeetings,
  registerUser,
  startSetByIdWithServingTeam,
} from '@/services/local-data'

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

describe('local-data start set serving team propagation', () => {
  beforeEach(() => {
    const storage = createMemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
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
    const set2 = before[0].sets.find((set) => set.setNo === 2)
    const set3 = before[0].sets.find((set) => set.setNo === 3)

    expect(set2).toBeDefined()
    expect(set3).toBeDefined()

    const forcedServingTeamId = set2!.teamIds[1]
    const oppositeTeamId = set2!.teamIds[0]

    await startSetByIdWithServingTeam(set2!.id, forcedServingTeamId)

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
})
