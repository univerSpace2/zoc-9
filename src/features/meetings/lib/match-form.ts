export interface DisabledMemberInput {
  memberIds: string[]
  selectedIds: string[]
  opponentSelectedIds: string[]
  selectedRefereeId?: string
  teamSize: number
}

export type PositionMap = Record<string, number>

export interface TeamPositionAssignment {
  profileId: string
  positionNo: number
}

export function stripRefereeFromTeamSelections(teamAIds: string[], teamBIds: string[], refereeId?: string): {
  teamAIds: string[]
  teamBIds: string[]
} {
  if (!refereeId) {
    return {
      teamAIds,
      teamBIds,
    }
  }

  return {
    teamAIds: teamAIds.filter((id) => id !== refereeId),
    teamBIds: teamBIds.filter((id) => id !== refereeId),
  }
}

export function stripRefereeFromTeamPositionMaps(
  teamAPositionMap: PositionMap,
  teamBPositionMap: PositionMap,
  refereeId?: string,
): { teamAPositionMap: PositionMap; teamBPositionMap: PositionMap } {
  if (!refereeId) {
    return {
      teamAPositionMap,
      teamBPositionMap,
    }
  }

  const nextA = { ...teamAPositionMap }
  const nextB = { ...teamBPositionMap }
  delete nextA[refereeId]
  delete nextB[refereeId]

  return {
    teamAPositionMap: nextA,
    teamBPositionMap: nextB,
  }
}

export function computeDisabledMemberIds(input: DisabledMemberInput): Set<string> {
  const disabledIds = new Set<string>()
  const selectedSet = new Set(input.selectedIds)
  const opponentSet = new Set(input.opponentSelectedIds)
  const refereeId = input.selectedRefereeId?.trim()
  const hasReachedLimit = input.selectedIds.length >= input.teamSize

  for (const memberId of input.memberIds) {
    if (opponentSet.has(memberId)) {
      disabledIds.add(memberId)
      continue
    }

    if (refereeId && memberId === refereeId) {
      disabledIds.add(memberId)
      continue
    }

    if (hasReachedLimit && !selectedSet.has(memberId)) {
      disabledIds.add(memberId)
    }
  }

  return disabledIds
}

function findMemberByPosition(positionMap: PositionMap, positionNo: number, exceptMemberId?: string): string | undefined {
  for (const [memberId, mappedPositionNo] of Object.entries(positionMap)) {
    if (memberId === exceptMemberId) {
      continue
    }

    if (mappedPositionNo === positionNo) {
      return memberId
    }
  }

  return undefined
}

export function normalizeTeamPositionMap(selectedIds: string[], positionMap: PositionMap, teamSize: number): PositionMap {
  const selectedSet = new Set(selectedIds)
  const nextMap: PositionMap = {}
  const usedPositions = new Set<number>()

  for (const memberId of selectedIds) {
    const positionNo = positionMap[memberId]
    if (!Number.isInteger(positionNo)) {
      continue
    }

    if (positionNo < 1 || positionNo > teamSize) {
      continue
    }

    if (usedPositions.has(positionNo)) {
      continue
    }

    nextMap[memberId] = positionNo
    usedPositions.add(positionNo)
  }

  for (const memberId of Object.keys(nextMap)) {
    if (!selectedSet.has(memberId)) {
      delete nextMap[memberId]
    }
  }

  return nextMap
}

export function assignMemberPositionWithSwap(input: {
  selectedIds: string[]
  positionMap: PositionMap
  memberId: string
  positionNo: number
  teamSize: number
}): { selectedIds: string[]; positionMap: PositionMap } {
  if (!Number.isInteger(input.positionNo) || input.positionNo < 1 || input.positionNo > input.teamSize) {
    return {
      selectedIds: input.selectedIds,
      positionMap: normalizeTeamPositionMap(input.selectedIds, input.positionMap, input.teamSize),
    }
  }

  const selected = input.selectedIds.includes(input.memberId)
  if (!selected && input.selectedIds.length >= input.teamSize) {
    return {
      selectedIds: input.selectedIds,
      positionMap: normalizeTeamPositionMap(input.selectedIds, input.positionMap, input.teamSize),
    }
  }

  const nextSelectedIds = selected ? input.selectedIds : [...input.selectedIds, input.memberId]
  const nextMap = normalizeTeamPositionMap(nextSelectedIds, input.positionMap, input.teamSize)
  const previousPositionNo = nextMap[input.memberId]
  const occupyingMemberId = findMemberByPosition(nextMap, input.positionNo, input.memberId)

  nextMap[input.memberId] = input.positionNo

  if (occupyingMemberId) {
    if (previousPositionNo && previousPositionNo !== input.positionNo) {
      nextMap[occupyingMemberId] = previousPositionNo
    } else {
      delete nextMap[occupyingMemberId]
      const usedPositions = new Set(Object.values(nextMap))
      for (let positionNo = 1; positionNo <= input.teamSize; positionNo += 1) {
        if (!usedPositions.has(positionNo)) {
          nextMap[occupyingMemberId] = positionNo
          break
        }
      }
    }
  }

  return {
    selectedIds: nextSelectedIds,
    positionMap: normalizeTeamPositionMap(nextSelectedIds, nextMap, input.teamSize),
  }
}

export function removeMemberFromTeamSelection(input: {
  selectedIds: string[]
  positionMap: PositionMap
  memberId: string
  teamSize: number
}): { selectedIds: string[]; positionMap: PositionMap } {
  const nextSelectedIds = input.selectedIds.filter((id) => id !== input.memberId)
  const nextMap = { ...input.positionMap }
  delete nextMap[input.memberId]

  return {
    selectedIds: nextSelectedIds,
    positionMap: normalizeTeamPositionMap(nextSelectedIds, nextMap, input.teamSize),
  }
}

export function isCompleteTeamPositionAssignment(selectedIds: string[], positionMap: PositionMap, teamSize: number): boolean {
  if (selectedIds.length !== teamSize) {
    return false
  }

  const normalized = normalizeTeamPositionMap(selectedIds, positionMap, teamSize)
  if (Object.keys(normalized).length !== teamSize) {
    return false
  }

  const positions = new Set(Object.values(normalized))
  if (positions.size !== teamSize) {
    return false
  }

  for (let positionNo = 1; positionNo <= teamSize; positionNo += 1) {
    if (!positions.has(positionNo)) {
      return false
    }
  }

  return true
}

export function buildOrderedPlayerIdsByPosition(selectedIds: string[], positionMap: PositionMap, teamSize: number): string[] {
  const normalized = normalizeTeamPositionMap(selectedIds, positionMap, teamSize)

  if (!isCompleteTeamPositionAssignment(selectedIds, normalized, teamSize)) {
    throw new Error('포지션 배정이 완료되지 않았습니다.')
  }

  const memberByPosition = new Map<number, string>()
  for (const [memberId, positionNo] of Object.entries(normalized)) {
    memberByPosition.set(positionNo, memberId)
  }

  return Array.from({ length: teamSize }, (_, index) => memberByPosition.get(index + 1) as string)
}

export function toTeamPositionAssignments(selectedIds: string[], positionMap: PositionMap, teamSize: number): TeamPositionAssignment[] {
  const orderedIds = buildOrderedPlayerIdsByPosition(selectedIds, positionMap, teamSize)
  return orderedIds.map((profileId, index) => ({
    profileId,
    positionNo: index + 1,
  }))
}
