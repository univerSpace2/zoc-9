import { describe, expect, test } from 'vitest'
import { computeDisabledMemberIds, stripRefereeFromTeamSelections } from '@/features/meetings/lib/match-form'

describe('match-form helpers', () => {
  test('stripRefereeFromTeamSelections removes selected referee from both teams', () => {
    const result = stripRefereeFromTeamSelections(['a', 'b'], ['c', 'a'], 'a')

    expect(result.teamAIds).toEqual(['b'])
    expect(result.teamBIds).toEqual(['c'])
  })

  test('computeDisabledMemberIds disables opponent-selected and referee-selected members', () => {
    const disabledIds = computeDisabledMemberIds({
      memberIds: ['a', 'b', 'c', 'd'],
      selectedIds: ['a'],
      opponentSelectedIds: ['b'],
      selectedRefereeId: 'c',
      teamSize: 2,
    })

    expect(disabledIds.has('b')).toBe(true)
    expect(disabledIds.has('c')).toBe(true)
    expect(disabledIds.has('a')).toBe(false)
    expect(disabledIds.has('d')).toBe(false)
  })

  test('computeDisabledMemberIds locks unselected members when team reached capacity', () => {
    const disabledIds = computeDisabledMemberIds({
      memberIds: ['a', 'b', 'c', 'd'],
      selectedIds: ['a', 'd'],
      opponentSelectedIds: ['b'],
      selectedRefereeId: '',
      teamSize: 2,
    })

    expect(disabledIds.has('a')).toBe(false)
    expect(disabledIds.has('d')).toBe(false)
    expect(disabledIds.has('b')).toBe(true)
    expect(disabledIds.has('c')).toBe(true)
  })
})
