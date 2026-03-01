export interface DisabledMemberInput {
  memberIds: string[]
  selectedIds: string[]
  opponentSelectedIds: string[]
  selectedRefereeId?: string
  teamSize: number
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
