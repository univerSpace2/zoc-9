import { describe, expect, it } from 'vitest'
import {
  applyRally,
  createSetRecord,
  decideMatchWinner,
  markRemainingSetsIgnored,
  requiredSetWins,
  startSet,
} from '@/lib/rules-engine'

function makeSet(teamSize: 2 | 3 | 4, deuce: boolean): ReturnType<typeof createSetRecord> {
  return startSet(
    createSetRecord({
      id: 'set-1',
      matchId: 'match-1',
      setNo: 1,
      teamIds: ['team-a', 'team-b'],
      teamSize,
      targetScore: 15,
      deuce,
      initialServingTeamId: 'team-a',
    }),
  )
}

describe('rules-engine', () => {
  it('keeps independent serve sequence per team', () => {
    let set = makeSet(4, true)
    expect(set.rotation['team-a']).toBe(1)
    expect(set.rotation['team-b']).toBe(0)
    expect(set.servingTeamId).toBe('team-a')

    set = applyRally(set, 'team-a', 'evt-1', '2026-02-28T00:00:00.000Z')
    expect(set.rotation['team-a']).toBe(1)
    expect(set.rotation['team-b']).toBe(0)
    expect(set.servingTeamId).toBe('team-a')

    set = applyRally(set, 'team-b', 'evt-2', '2026-02-28T00:00:01.000Z')
    expect(set.rotation['team-b']).toBe(1)
    expect(set.servingTeamId).toBe('team-b')

    set = applyRally(set, 'team-a', 'evt-3', '2026-02-28T00:00:02.000Z')
    expect(set.rotation['team-a']).toBe(2)
    expect(set.servingTeamId).toBe('team-a')
  })

  it('cycles rotation for 2/3/4-player teams', () => {
    for (const teamSize of [2, 3, 4] as const) {
      let set = makeSet(teamSize, true)

      for (let i = 0; i < teamSize + 1; i += 1) {
        set = applyRally(set, 'team-b', `evt-${teamSize}-${i}`, `2026-02-28T00:00:0${i}.000Z`)
        set = applyRally(set, 'team-a', `evt-${teamSize}-a-${i}`, `2026-02-28T00:00:1${i}.000Z`)
      }

      expect(set.rotation['team-a']).toBe(2)
      expect(set.rotation['team-b']).toBe(1)
    }
  })

  it('finishes set with no deuce at target score', () => {
    let set = makeSet(3, false)

    for (let i = 0; i < 15; i += 1) {
      set = applyRally(set, 'team-a', `no-deuce-${i}`, `2026-02-28T00:00:${String(i).padStart(2, '0')}.000Z`)
      if (set.status === 'completed') {
        break
      }
    }

    expect(set.status).toBe('completed')
    expect(set.winnerTeamId).toBe('team-a')
    expect(set.score['team-a']).toBe(15)
  })

  it('finishes set with deuce only by 2-point margin after tie at 14', () => {
    let set = makeSet(3, true)

    for (let i = 0; i < 14; i += 1) {
      set = applyRally(set, 'team-a', `deuce-a-${i}`, `2026-02-28T00:01:${String(i).padStart(2, '0')}.000Z`)
      set = applyRally(set, 'team-b', `deuce-b-${i}`, `2026-02-28T00:02:${String(i).padStart(2, '0')}.000Z`)
    }

    expect(set.status).toBe('in_progress')
    set = applyRally(set, 'team-a', 'deuce-adv-1', '2026-02-28T00:03:00.000Z')
    expect(set.status).toBe('in_progress')
    set = applyRally(set, 'team-a', 'deuce-adv-2', '2026-02-28T00:03:01.000Z')

    expect(set.status).toBe('completed')
    expect(set.score['team-a']).toBe(16)
    expect(set.score['team-b']).toBe(14)
  })

  it('marks remaining sets ignored when winner reaches required wins', () => {
    const requiredWins = requiredSetWins('best_of_3')
    const sets = [
      {
        ...makeSet(2, false),
        setNo: 1,
        status: 'completed' as const,
        winnerTeamId: 'team-a',
      },
      {
        ...makeSet(2, false),
        setNo: 2,
        status: 'completed' as const,
        winnerTeamId: 'team-a',
      },
      {
        ...makeSet(2, false),
        setNo: 3,
        status: 'pending' as const,
      },
    ]

    const decision = decideMatchWinner(sets, requiredWins)
    expect(decision.shouldFinish).toBe(true)
    expect(decision.winnerTeamId).toBe('team-a')

    const normalized = markRemainingSetsIgnored(sets)
    expect(normalized[2].status).toBe('ignored')
  })

  it('decides winner from completed set scores when winnerTeamId is missing', () => {
    const requiredWins = requiredSetWins('best_of_3')
    const base = makeSet(3, true)

    const sets = [
      {
        ...base,
        id: 's1',
        setNo: 1,
        status: 'completed' as const,
        score: { 'team-a': 15, 'team-b': 11 },
        winnerTeamId: undefined,
      },
      {
        ...base,
        id: 's2',
        setNo: 2,
        status: 'completed' as const,
        score: { 'team-a': 17, 'team-b': 15 },
        winnerTeamId: undefined,
      },
      {
        ...base,
        id: 's3',
        setNo: 3,
        status: 'pending' as const,
      },
    ]

    const decision = decideMatchWinner(sets, requiredWins)
    expect(decision.shouldFinish).toBe(true)
    expect(decision.winnerTeamId).toBe('team-a')
  })
})
