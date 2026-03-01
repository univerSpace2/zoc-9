import { describe, expect, test } from 'vitest'
import {
  assignMemberPositionWithSwap,
  buildOrderedPlayerIdsByPosition,
  computeDisabledMemberIds,
  isCompleteTeamPositionAssignment,
  normalizeTeamPositionMap,
  removeMemberFromTeamSelection,
  stripRefereeFromTeamPositionMaps,
  stripRefereeFromTeamSelections,
  toTeamPositionAssignments,
} from '@/features/meetings/lib/match-form'

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

  test('stripRefereeFromTeamPositionMaps removes referee from both position maps', () => {
    const result = stripRefereeFromTeamPositionMaps(
      { a: 1, b: 2 },
      { c: 1, a: 2 },
      'a',
    )

    expect(result.teamAPositionMap).toEqual({ b: 2 })
    expect(result.teamBPositionMap).toEqual({ c: 1 })
  })

  test('normalizeTeamPositionMap removes out-of-range and duplicate positions', () => {
    const normalized = normalizeTeamPositionMap(['a', 'b', 'c'], { a: 1, b: 1, c: 9, d: 2 }, 3)
    expect(normalized).toEqual({ a: 1 })
  })

  test('assignMemberPositionWithSwap swaps when target position is occupied', () => {
    const result = assignMemberPositionWithSwap({
      selectedIds: ['a', 'b', 'c'],
      positionMap: { a: 1, b: 2, c: 3 },
      memberId: 'a',
      positionNo: 2,
      teamSize: 3,
    })

    expect(result.positionMap).toEqual({ a: 2, b: 1, c: 3 })
  })

  test('assignMemberPositionWithSwap assigns first empty slot to displaced member', () => {
    const result = assignMemberPositionWithSwap({
      selectedIds: ['a', 'b'],
      positionMap: { a: 1, b: 2 },
      memberId: 'c',
      positionNo: 1,
      teamSize: 3,
    })

    expect(result.selectedIds).toEqual(['a', 'b', 'c'])
    expect(result.positionMap).toEqual({ a: 3, b: 2, c: 1 })
  })

  test('removeMemberFromTeamSelection removes member from list and position map', () => {
    const result = removeMemberFromTeamSelection({
      selectedIds: ['a', 'b', 'c'],
      positionMap: { a: 1, b: 2, c: 3 },
      memberId: 'b',
      teamSize: 3,
    })

    expect(result.selectedIds).toEqual(['a', 'c'])
    expect(result.positionMap).toEqual({ a: 1, c: 3 })
  })

  test('isCompleteTeamPositionAssignment requires 1..N complete mapping', () => {
    expect(isCompleteTeamPositionAssignment(['a', 'b', 'c'], { a: 1, b: 2, c: 3 }, 3)).toBe(true)
    expect(isCompleteTeamPositionAssignment(['a', 'b', 'c'], { a: 1, b: 2 }, 3)).toBe(false)
    expect(isCompleteTeamPositionAssignment(['a', 'b', 'c'], { a: 1, b: 1, c: 2 }, 3)).toBe(false)
  })

  test('buildOrderedPlayerIdsByPosition sorts by position', () => {
    const ordered = buildOrderedPlayerIdsByPosition(['a', 'b', 'c'], { b: 2, c: 3, a: 1 }, 3)
    expect(ordered).toEqual(['a', 'b', 'c'])
  })

  test('toTeamPositionAssignments returns normalized position objects', () => {
    const assignments = toTeamPositionAssignments(['a', 'b', 'c'], { b: 2, c: 3, a: 1 }, 3)
    expect(assignments).toEqual([
      { profileId: 'a', positionNo: 1 },
      { profileId: 'b', positionNo: 2 },
      { profileId: 'c', positionNo: 3 },
    ])
  })
})
