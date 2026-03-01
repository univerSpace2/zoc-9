import {
  applyRally,
  createSetRecord,
  decideMatchWinner,
  initializeRotation,
  markRemainingSetsIgnored,
  maxSetCount,
  nextServePosition,
  nextStartingTeamId,
  requiredSetWins,
  startSet,
} from '@/lib/rules-engine'
import { createId, nowIso } from '@/lib/utils'
import type {
  AuditLog,
  CreateMatchInput,
  CreateMeetingInput,
  Group,
  GroupMember,
  Invite,
  Match,
  MatchPlayer,
  MatchTeam,
  Meeting,
  MeetingParticipant,
  MeetingStatus,
  MeetingWinStat,
  PermissionKey,
  Profile,
  SetRecord,
  TeamSize,
  Venue,
} from '@/types/domain'

const STORAGE_KEY = 'zoc9-data-v1'
const ROTATION_MIGRATION_FLAG_KEY = 'zoc9-rotation-independent-migrated-v1'
const MATCH_COMPLETION_MIGRATION_FLAG_KEY = 'zoc9-match-completion-migrated-v1'

const ROLE_DEFAULT_PERMISSIONS: Record<GroupMember['role'], PermissionKey[]> = {
  owner: [
    'manage_members',
    'manage_invites',
    'manage_venues',
    'manage_notices',
    'close_meeting',
    'edit_completed_records',
  ],
  admin: [
    'manage_members',
    'manage_invites',
    'manage_venues',
    'manage_notices',
    'close_meeting',
    'edit_completed_records',
  ],
  member: [],
}

interface LocalDataStore {
  profiles: Profile[]
  groups: Group[]
  groupMembers: GroupMember[]
  invites: Invite[]
  venues: Venue[]
  meetings: Meeting[]
  meetingParticipants: MeetingParticipant[]
  matches: Match[]
  matchTeams: MatchTeam[]
  matchPlayers: MatchPlayer[]
  sets: SetRecord[]
  notices: {
    id: string
    groupId: string
    title: string
    body: string
    createdBy: string
    createdAt: string
  }[]
  auditLogs: AuditLog[]
}

const emptyStore: LocalDataStore = {
  profiles: [],
  groups: [],
  groupMembers: [],
  invites: [],
  venues: [],
  meetings: [],
  meetingParticipants: [],
  matches: [],
  matchTeams: [],
  matchPlayers: [],
  sets: [],
  notices: [],
  auditLogs: [],
}

function sortEventsByOccurredAt(set: SetRecord): SetRecord['events'] {
  return set.events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const leftTime = new Date(left.event.occurredAt).getTime()
      const rightTime = new Date(right.event.occurredAt).getTime()

      if (leftTime !== rightTime) {
        return leftTime - rightTime
      }

      return left.index - right.index
    })
    .map((item) => item.event)
}

function recalculateInProgressSetRotation(set: SetRecord): SetRecord {
  const [teamAId, teamBId] = set.teamIds
  const rotation = initializeRotation(set.teamIds, set.initialServingTeamId)
  let servingTeamId = set.initialServingTeamId
  let scoreA = 0
  let scoreB = 0

  const normalizedEvents = sortEventsByOccurredAt(set).map((event) => {
    const servingTeamIdBefore = servingTeamId
    const servingPositionBefore = rotation[servingTeamIdBefore] ?? 0

    if (event.scoringTeamId === teamAId) {
      scoreA += 1
    } else if (event.scoringTeamId === teamBId) {
      scoreB += 1
    }

    let rotationAppliedToTeamId: string | undefined

    if (servingTeamIdBefore !== event.scoringTeamId) {
      servingTeamId = event.scoringTeamId
      rotation[servingTeamId] = nextServePosition(rotation[servingTeamId] ?? 0, set.teamSize)
      rotationAppliedToTeamId = servingTeamId
    }

    const servingTeamIdAfter = servingTeamId
    const servingPositionAfter = rotation[servingTeamIdAfter] ?? 0

    return {
      ...event,
      servingTeamIdBefore,
      servingTeamIdAfter,
      servingPositionBefore,
      servingPositionAfter,
      rotationAppliedToTeamId,
      scoreAfter: {
        [teamAId]: scoreA,
        [teamBId]: scoreB,
      },
    }
  })

  return {
    ...set,
    servingTeamId,
    rotation: {
      ...rotation,
    },
    score: {
      [teamAId]: scoreA,
      [teamBId]: scoreB,
    },
    events: normalizedEvents,
  }
}

function runIndependentRotationMigrationOnce(): void {
  if (typeof window === 'undefined') {
    return
  }

  if (localStorage.getItem(ROTATION_MIGRATION_FLAG_KEY) === '1') {
    return
  }

  const serialized = localStorage.getItem(STORAGE_KEY)
  if (!serialized) {
    localStorage.setItem(ROTATION_MIGRATION_FLAG_KEY, '1')
    return
  }

  try {
    const parsed = JSON.parse(serialized) as LocalDataStore
    const store: LocalDataStore = {
      ...structuredClone(emptyStore),
      ...parsed,
    }

    let changed = false
    store.sets = store.sets.map((set) => {
      if (set.status === 'completed' || set.status === 'ignored') {
        return set
      }

      changed = true

      if (set.status === 'pending') {
        return {
          ...set,
          servingTeamId: set.initialServingTeamId,
          rotation: initializeRotation(set.teamIds, set.initialServingTeamId),
        }
      }

      return recalculateInProgressSetRotation(set)
    })

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    // Ignore migration parse errors and continue with fresh runtime state.
  } finally {
    localStorage.setItem(ROTATION_MIGRATION_FLAG_KEY, '1')
  }
}

function runMatchCompletionMigrationOnce(): void {
  if (typeof window === 'undefined') {
    return
  }

  if (localStorage.getItem(MATCH_COMPLETION_MIGRATION_FLAG_KEY) === '1') {
    return
  }

  const serialized = localStorage.getItem(STORAGE_KEY)
  if (!serialized) {
    localStorage.setItem(MATCH_COMPLETION_MIGRATION_FLAG_KEY, '1')
    return
  }

  try {
    const parsed = JSON.parse(serialized) as LocalDataStore
    const store: LocalDataStore = {
      ...structuredClone(emptyStore),
      ...parsed,
    }

    let changed = false

    store.sets = store.sets.map((set) => {
      if (set.status !== 'completed' || set.winnerTeamId) {
        return set
      }

      const [teamAId, teamBId] = set.teamIds
      const teamAScore = set.score[teamAId] ?? 0
      const teamBScore = set.score[teamBId] ?? 0

      changed = true

      if (teamAScore > teamBScore) {
        return {
          ...set,
          winnerTeamId: teamAId,
        }
      }

      if (teamBScore > teamAScore) {
        return {
          ...set,
          winnerTeamId: teamBId,
        }
      }

      return {
        ...set,
        status: 'in_progress',
        winnerTeamId: undefined,
      }
    })

    if (store.matches.length > 0) {
      for (const match of store.matches) {
        finalizeMatchState(store, match.id)
      }
      changed = true
    }

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    // Ignore migration parse errors and continue with fresh runtime state.
  } finally {
    localStorage.setItem(MATCH_COMPLETION_MIGRATION_FLAG_KEY, '1')
  }
}

function loadStore(): LocalDataStore {
  runIndependentRotationMigrationOnce()
  runMatchCompletionMigrationOnce()
  const serialized = localStorage.getItem(STORAGE_KEY)

  if (!serialized) {
    return structuredClone(emptyStore)
  }

  try {
    const parsed = JSON.parse(serialized) as LocalDataStore

    return {
      ...structuredClone(emptyStore),
      ...parsed,
    }
  } catch {
    return structuredClone(emptyStore)
  }
}

function saveStore(store: LocalDataStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function updateStore(mutator: (store: LocalDataStore) => void): LocalDataStore {
  const next = loadStore()
  mutator(next)
  saveStore(next)
  return next
}

function ensureOwnerGroup(profile: Profile): { store: LocalDataStore; group: Group } {
  const store = updateStore((draft) => {
    const joinedGroupIds = new Set(
      draft.groupMembers
        .filter((member) => member.profileId === profile.id)
        .map((member) => member.groupId),
    )

    if (joinedGroupIds.size > 0) {
      return
    }

    const groupId = createId('group')
    const now = nowIso()

    draft.groups.push({
      id: groupId,
      name: `${profile.name}의 ZOC9 그룹`,
      createdAt: now,
      createdBy: profile.id,
    })

    draft.groupMembers.push({
      id: createId('gm'),
      groupId,
      profileId: profile.id,
      role: 'owner',
      permissions: [...ROLE_DEFAULT_PERMISSIONS.owner],
      permissionsOverride: false,
    })

    const venueId = createId('venue')
    draft.venues.push({
      id: venueId,
      groupId,
      name: '메인 구장',
      reservationRequired: false,
    })

    const meetingId = createId('meeting')
    draft.meetings.push({
      id: meetingId,
      groupId,
      venueId,
      title: '오프닝 스크림',
      date: now.slice(0, 10),
      startTime: '19:00',
      status: 'scheduled',
      createdBy: profile.id,
      createdAt: now,
    })

    draft.meetingParticipants.push({
      id: createId('mp'),
      meetingId,
      profileId: profile.id,
    })
  })

  const groupMember = store.groupMembers.find((member) => member.profileId === profile.id)

  if (!groupMember) {
    throw new Error('기본 그룹을 찾을 수 없습니다.')
  }

  const group = store.groups.find((item) => item.id === groupMember.groupId)

  if (!group) {
    throw new Error('그룹을 찾을 수 없습니다.')
  }

  return { store, group }
}

export function resetLocalData(): void {
  saveStore(structuredClone(emptyStore))
  localStorage.removeItem(ROTATION_MIGRATION_FLAG_KEY)
  localStorage.removeItem(MATCH_COMPLETION_MIGRATION_FLAG_KEY)
}

export async function registerUser(input: {
  email: string
  name: string
  phone: string
  bankAccount?: string
}): Promise<Profile> {
  const email = input.email.trim().toLowerCase()

  const store = loadStore()
  const exists = store.profiles.some((profile) => profile.email === email)

  if (exists) {
    throw new Error('이미 등록된 이메일입니다.')
  }

  const profile: Profile = {
    id: createId('profile'),
    email,
    name: input.name.trim(),
    phone: input.phone.trim(),
    bankAccount: input.bankAccount?.trim() || undefined,
  }

  updateStore((draft) => {
    draft.profiles.push(profile)
  })

  ensureOwnerGroup(profile)

  return profile
}

export async function loginUser(input: { email: string }): Promise<Profile> {
  const email = input.email.trim().toLowerCase()
  const store = loadStore()
  const profile = store.profiles.find((item) => item.email === email)

  if (!profile) {
    throw new Error('등록되지 않은 이메일입니다. 회원가입을 먼저 진행하세요.')
  }

  ensureOwnerGroup(profile)

  return profile
}

export async function updateProfile(
  profileId: string,
  input: { name: string; phone: string; bankAccount?: string },
): Promise<Profile> {
  let updated: Profile | null = null

  updateStore((draft) => {
    const target = draft.profiles.find((profile) => profile.id === profileId)

    if (!target) {
      throw new Error('프로필을 찾을 수 없습니다.')
    }

    target.name = input.name.trim()
    target.phone = input.phone.trim()
    target.bankAccount = input.bankAccount?.trim() || undefined
    updated = target
  })

  if (!updated) {
    throw new Error('프로필 업데이트에 실패했습니다.')
  }

  return updated
}

export async function listGroups(profileId: string): Promise<Group[]> {
  const store = loadStore()
  const groupIds = new Set(
    store.groupMembers.filter((member) => member.profileId === profileId).map((member) => member.groupId),
  )

  return store.groups.filter((group) => groupIds.has(group.id))
}

export async function createGroup(profileId: string, name: string): Promise<Group> {
  const group: Group = {
    id: createId('group'),
    name: name.trim(),
    createdAt: nowIso(),
    createdBy: profileId,
  }

  updateStore((draft) => {
    draft.groups.push(group)
    draft.groupMembers.push({
      id: createId('gm'),
      groupId: group.id,
      profileId,
      role: 'owner',
      permissions: [...ROLE_DEFAULT_PERMISSIONS.owner],
      permissionsOverride: false,
    })
  })

  return group
}

export async function getInviteByToken(token: string): Promise<{
  invite: Invite
  groupName: string
  inviterName: string
  isExpired: boolean
} | null> {
  const store = loadStore()
  const invite = store.invites.find((item) => item.token === token)

  if (!invite) {
    return null
  }

  const group = store.groups.find((item) => item.id === invite.groupId)
  const inviter = store.profiles.find((item) => item.id === invite.createdBy)

  return {
    invite,
    groupName: group?.name ?? '알 수 없는 그룹',
    inviterName: inviter?.name ?? '알 수 없음',
    isExpired: new Date(invite.expiresAt).getTime() < Date.now(),
  }
}

export async function acceptInvite(profileId: string, token: string): Promise<void> {
  updateStore((draft) => {
    const invite = draft.invites.find((item) => item.token === token)

    if (!invite) {
      throw new Error('초대를 찾을 수 없습니다.')
    }

    if (invite.status !== 'pending') {
      throw new Error('이미 처리된 초대입니다.')
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      invite.status = 'expired'
      throw new Error('만료된 초대입니다.')
    }

    const exists = draft.groupMembers.some(
      (member) => member.groupId === invite.groupId && member.profileId === profileId,
    )

    if (!exists) {
      draft.groupMembers.push({
        id: createId('gm'),
        groupId: invite.groupId,
        profileId,
        role: invite.role,
        permissions: [...ROLE_DEFAULT_PERMISSIONS[invite.role]],
        permissionsOverride: false,
      })
    }

    invite.status = 'accepted'
  })
}

export async function declineInvite(token: string): Promise<void> {
  updateStore((draft) => {
    const invite = draft.invites.find((item) => item.token === token)

    if (!invite) {
      throw new Error('초대를 찾을 수 없습니다.')
    }

    if (invite.status !== 'pending') {
      throw new Error('이미 처리된 초대입니다.')
    }

    invite.status = 'declined'
  })
}

export async function listInvitesByGroup(groupId: string): Promise<Invite[]> {
  const store = loadStore()
  return store.invites.filter((invite) => invite.groupId === groupId)
}

export async function createInvite(
  actorId: string,
  input: { groupId: string; role: GroupMember['role']; invitedEmail?: string; expiresInDays?: number },
): Promise<Invite> {
  const invite: Invite = {
    id: createId('invite'),
    groupId: input.groupId,
    token: createId('token'),
    invitedEmail: input.invitedEmail,
    role: input.role,
    status: 'pending',
    expiresAt: new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: nowIso(),
    createdBy: actorId,
  }

  updateStore((draft) => {
    draft.invites.push(invite)
  })

  return invite
}

export async function listMembers(groupId: string): Promise<(GroupMember & { profile: Profile })[]> {
  const store = loadStore()

  return store.groupMembers
    .filter((member) => member.groupId === groupId)
    .map((member) => {
      const profile = store.profiles.find((item) => item.id === member.profileId)

      if (!profile) {
        throw new Error('멤버 프로필을 찾을 수 없습니다.')
      }

      return {
        ...member,
        profile,
      }
    })
}

export async function hasPermission(
  profileId: string,
  groupId: string,
  permission: PermissionKey,
): Promise<boolean> {
  const store = loadStore()
  const member = store.groupMembers.find((item) => item.groupId === groupId && item.profileId === profileId)

  if (!member) {
    return false
  }

  if (member.role === 'owner') {
    return true
  }

  if (member.permissionsOverride) {
    return member.permissions.includes(permission)
  }

  const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[member.role] ?? []
  return defaultPermissions.includes(permission)
}

export function defaultPermissionsForRole(role: GroupMember['role']): PermissionKey[] {
  return [...(ROLE_DEFAULT_PERMISSIONS[role] ?? [])]
}

export function resolveMemberPermissions(member: GroupMember): PermissionKey[] {
  if (member.role === 'owner') {
    return defaultPermissionsForRole('owner')
  }

  if (member.permissionsOverride) {
    return [...member.permissions]
  }

  return defaultPermissionsForRole(member.role)
}

export function mapMemberWithResolvedPermissions(member: GroupMember): GroupMember {
  return {
    ...member,
    permissions: resolveMemberPermissions(member),
  }
}

export async function listGroupMemberPositionStats(groupId: string): Promise<
  {
    profileId: string
    name: string
    teamSize: TeamSize
    positionNo: number
    wins: number
    losses: number
    winRate: number
    sampleSize: number
  }[]
> {
  const store = loadStore()
  const groupMatchIds = new Set(store.matches.filter((match) => match.groupId === groupId && match.status === 'completed').map((match) => match.id))
  const positionStats = new Map<string, { wins: number; losses: number; teamSize: TeamSize; positionNo: number }>()

  for (const match of store.matches) {
    if (!groupMatchIds.has(match.id) || !match.winnerTeamId) {
      continue
    }

    for (const player of store.matchPlayers.filter((item) => item.matchId === match.id)) {
      const key = `${player.profileId}:${match.teamSize}:${player.positionNo}`
      const current = positionStats.get(key) ?? {
        wins: 0,
        losses: 0,
        teamSize: match.teamSize,
        positionNo: player.positionNo,
      }

      if (player.teamId === match.winnerTeamId) {
        current.wins += 1
      } else {
        current.losses += 1
      }

      positionStats.set(key, current)
    }
  }

  return Array.from(positionStats.entries())
    .map(([key, stat]) => {
      const profileId = key.split(':')[0]
      const profile = store.profiles.find((item) => item.id === profileId)
      const sampleSize = stat.wins + stat.losses

      return {
        profileId,
        name: profile?.name ?? '알 수 없음',
        teamSize: stat.teamSize,
        positionNo: stat.positionNo,
        wins: stat.wins,
        losses: stat.losses,
        winRate: sampleSize > 0 ? Math.round((stat.wins / sampleSize) * 1000) / 10 : 0,
        sampleSize,
      }
    })
    .sort(
      (left, right) =>
        right.winRate - left.winRate ||
        right.sampleSize - left.sampleSize ||
        left.teamSize - right.teamSize ||
        left.positionNo - right.positionNo,
    )
}

export async function getMeetingDetail(meetingId: string): Promise<{
  meeting: Meeting
  venue?: Venue
  participants: Profile[]
} | null> {
  const store = loadStore()
  const meeting = store.meetings.find((item) => item.id === meetingId)

  if (!meeting) {
    return null
  }

  const venue = meeting.venueId ? store.venues.find((item) => item.id === meeting.venueId) : undefined
  const participants = store.meetingParticipants
    .filter((item) => item.meetingId === meetingId)
    .map((item) => store.profiles.find((profile) => profile.id === item.profileId))
    .filter((item): item is Profile => Boolean(item))

  return {
    meeting,
    venue,
    participants,
  }
}

export async function startSetByIdWithServingTeam(setId: string, firstServingTeamId?: string): Promise<SetRecord> {
  let next: SetRecord | null = null

  updateStore((draft) => {
    const setIndex = draft.sets.findIndex((item) => item.id === setId)
    if (setIndex < 0) {
      throw new Error('세트를 찾을 수 없습니다.')
    }

    const current = draft.sets[setIndex]
    const servingTeamId = firstServingTeamId ?? current.initialServingTeamId

    if (!current.teamIds.includes(servingTeamId)) {
      throw new Error('유효하지 않은 시작 서브 팀입니다.')
    }

    const prepared: SetRecord = {
      ...current,
      initialServingTeamId: servingTeamId,
      servingTeamId,
      rotation: initializeRotation(current.teamIds, servingTeamId),
      score: {
        [current.teamIds[0]]: 0,
        [current.teamIds[1]]: 0,
      },
      winnerTeamId: undefined,
      events: [],
    }

    draft.sets[setIndex] = startSet(prepared)
    next = draft.sets[setIndex]

    const oppositeTeamId = current.teamIds.find((teamId) => teamId !== servingTeamId) ?? current.teamIds[0]
    const nextPending = draft.sets
      .filter((set) => set.matchId === current.matchId && set.setNo > current.setNo && set.status === 'pending')
      .sort((left, right) => left.setNo - right.setNo)[0]

    if (nextPending) {
      const nextPendingIndex = draft.sets.findIndex((set) => set.id === nextPending.id)
      draft.sets[nextPendingIndex] = {
        ...nextPending,
        initialServingTeamId: oppositeTeamId,
        servingTeamId: oppositeTeamId,
        rotation: initializeRotation(nextPending.teamIds, oppositeTeamId),
      }
    }
  })

  if (!next) {
    throw new Error('세트 시작에 실패했습니다.')
  }

  return next
}

export async function getGroupMember(profileId: string, groupId: string): Promise<GroupMember | null> {
  const store = loadStore()
  return store.groupMembers.find((item) => item.profileId === profileId && item.groupId === groupId) ?? null
}

export async function listMeetings(groupId: string): Promise<Meeting[]> {
  const store = loadStore()
  return store.meetings
    .filter((meeting) => meeting.groupId === groupId)
    .sort((left, right) => `${right.date}${right.startTime}`.localeCompare(`${left.date}${left.startTime}`))
}

export async function createMeeting(profileId: string, input: CreateMeetingInput): Promise<Meeting> {
  const meeting: Meeting = {
    id: createId('meeting'),
    groupId: input.groupId,
    venueId: input.venueId,
    title: input.title.trim(),
    date: input.date,
    startTime: input.startTime,
    status: 'scheduled',
    createdBy: profileId,
    createdAt: nowIso(),
  }

  updateStore((draft) => {
    draft.meetings.push(meeting)

    const uniqueParticipantIds = Array.from(new Set(input.participantIds))
    for (const participantId of uniqueParticipantIds) {
      draft.meetingParticipants.push({
        id: createId('mp'),
        meetingId: meeting.id,
        profileId: participantId,
      })
    }
  })

  return meeting
}

export async function updateMeetingStatus(
  profileId: string,
  meetingId: string,
  status: MeetingStatus,
): Promise<Meeting> {
  let updated: Meeting | null = null

  updateStore((draft) => {
    const meeting = draft.meetings.find((item) => item.id === meetingId)

    if (!meeting) {
      throw new Error('모임을 찾을 수 없습니다.')
    }

    if (status === 'completed') {
      const allowed = draft.groupMembers.some(
        (member) =>
          member.groupId === meeting.groupId &&
          member.profileId === profileId &&
          (member.role === 'owner' ||
            member.role === 'admin' ||
            member.permissions.includes('close_meeting')),
      )

      if (!allowed) {
        throw new Error('모임 완료 권한이 없습니다.')
      }
    }

    meeting.status = status
    updated = meeting
  })

  if (!updated) {
    throw new Error('모임 상태 변경에 실패했습니다.')
  }

  return updated
}

export async function getMeeting(meetingId: string): Promise<Meeting | null> {
  const store = loadStore()
  return store.meetings.find((meeting) => meeting.id === meetingId) ?? null
}

export async function getActiveMeetingByGroup(groupId: string): Promise<Meeting | null> {
  const store = loadStore()
  const active = store.meetings
    .filter((meeting) => meeting.groupId === groupId && meeting.status === 'in_progress')
    .sort((left, right) => `${right.date}${right.startTime}`.localeCompare(`${left.date}${left.startTime}`))[0]

  return active ?? null
}

function createSetSeries(match: Match, teamIds: [string, string], teamSize: TeamSize): SetRecord[] {
  const setCount = maxSetCount(match.format)
  const sets: SetRecord[] = []
  let startingTeamId = match.firstServingTeamId

  for (let setNo = 1; setNo <= setCount; setNo += 1) {
    const set = createSetRecord({
      id: createId('set'),
      matchId: match.id,
      setNo,
      teamIds,
      teamSize,
      targetScore: match.targetScore,
      deuce: match.deuce,
      initialServingTeamId: startingTeamId,
    })

    if (setNo === 1) {
      sets.push(startSet(set))
    } else {
      sets.push(set)
    }

    startingTeamId = nextStartingTeamId(startingTeamId, teamIds)
  }

  return sets
}

export async function createMatch(profileId: string, input: CreateMatchInput): Promise<Match> {
  if (input.teams.length !== 2) {
    throw new Error('매치는 반드시 2팀으로 구성되어야 합니다.')
  }

  const requiredWins = requiredSetWins(input.format)
  const matchId = createId('match')

  const teamAId = createId('team')
  const teamBId = createId('team')

  const match: Match = {
    id: matchId,
    groupId: input.groupId,
    meetingId: input.meetingId,
    format: input.format,
    status: 'in_progress',
    teamSize: input.teamSize,
    targetScore: input.targetScore,
    deuce: input.deuce,
    penaltyText: input.penaltyText,
    refereeProfileId: input.refereeProfileId,
    requiredSetWins: requiredWins,
    firstServingTeamId: input.firstServingTeamIndex === 0 ? teamAId : teamBId,
    createdAt: nowIso(),
    createdBy: profileId,
  }

  const teams: MatchTeam[] = [
    {
      id: teamAId,
      matchId,
      name: input.teams[0].name.trim(),
    },
    {
      id: teamBId,
      matchId,
      name: input.teams[1].name.trim(),
    },
  ]

  const players: MatchPlayer[] = []

  for (let index = 0; index < input.teams[0].playerIds.length; index += 1) {
    players.push({
      id: createId('mply'),
      matchId,
      teamId: teamAId,
      profileId: input.teams[0].playerIds[index],
      positionNo: index + 1,
    })
  }

  for (let index = 0; index < input.teams[1].playerIds.length; index += 1) {
    players.push({
      id: createId('mply'),
      matchId,
      teamId: teamBId,
      profileId: input.teams[1].playerIds[index],
      positionNo: index + 1,
    })
  }

  const sets = createSetSeries(match, [teamAId, teamBId], input.teamSize)

  updateStore((draft) => {
    draft.matches.push(match)
    draft.matchTeams.push(...teams)
    draft.matchPlayers.push(...players)
    draft.sets.push(...sets)

    const meeting = draft.meetings.find((item) => item.id === input.meetingId)
    if (meeting && meeting.status === 'scheduled') {
      meeting.status = 'in_progress'
    }
  })

  return match
}

export async function listMatches(meetingId: string): Promise<
  {
    match: Match
    teams: MatchTeam[]
    players: MatchPlayer[]
    sets: SetRecord[]
  }[]
> {
  const store = loadStore()
  const matches = store.matches.filter((match) => match.meetingId === meetingId)

  return matches
    .map((match) => ({
      match,
      teams: store.matchTeams.filter((team) => team.matchId === match.id),
      players: store.matchPlayers.filter((player) => player.matchId === match.id),
      sets: store.sets
        .filter((set) => set.matchId === match.id)
        .sort((left, right) => left.setNo - right.setNo),
    }))
    .sort((left, right) => right.match.createdAt.localeCompare(left.match.createdAt))
}

export async function getSet(
  setId: string,
): Promise<{ set: SetRecord; match: Match; teams: MatchTeam[]; players: MatchPlayer[] } | null> {
  const store = loadStore()
  const set = store.sets.find((item) => item.id === setId)

  if (!set) {
    return null
  }

  const match = store.matches.find((item) => item.id === set.matchId)

  if (!match) {
    return null
  }

  return {
    set,
    match,
    teams: store.matchTeams.filter((team) => team.matchId === match.id),
    players: store.matchPlayers.filter((player) => player.matchId === match.id),
  }
}

export async function startSetById(setId: string): Promise<SetRecord> {
  return startSetByIdWithServingTeam(setId)
}

function finalizeMatchState(draft: LocalDataStore, matchId: string): void {
  const match = draft.matches.find((item) => item.id === matchId)

  if (!match) {
    return
  }

  const setIndexes = draft.sets
    .map((set, index) => ({ set, index }))
    .filter((item) => item.set.matchId === matchId)
    .sort((left, right) => left.set.setNo - right.set.setNo)

  for (const item of setIndexes) {
    const set = item.set
    if (set.status !== 'completed' || set.winnerTeamId) {
      continue
    }

    const [teamAId, teamBId] = set.teamIds
    const teamAScore = set.score[teamAId] ?? 0
    const teamBScore = set.score[teamBId] ?? 0

    if (teamAScore > teamBScore) {
      draft.sets[item.index] = { ...set, winnerTeamId: teamAId }
    } else if (teamBScore > teamAScore) {
      draft.sets[item.index] = { ...set, winnerTeamId: teamBId }
    } else {
      // A completed set cannot be tied; recover to in-progress.
      draft.sets[item.index] = { ...set, status: 'in_progress', winnerTeamId: undefined }
    }
  }

  let sets = draft.sets.filter((set) => set.matchId === matchId).sort((left, right) => left.setNo - right.setNo)

  const decision = decideMatchWinner(sets, match.requiredSetWins)

  if (!decision.shouldFinish) {
    match.status = 'in_progress'
    match.winnerTeamId = undefined

    for (const set of sets) {
      if (set.status === 'ignored') {
        const index = draft.sets.findIndex((item) => item.id === set.id)
        draft.sets[index] = {
          ...set,
          status: 'pending',
          servingTeamId: set.initialServingTeamId,
          score: {
            [set.teamIds[0]]: 0,
            [set.teamIds[1]]: 0,
          },
          rotation: initializeRotation(set.teamIds, set.initialServingTeamId),
          winnerTeamId: undefined,
          events: [],
        }
      }
    }

    sets = draft.sets.filter((set) => set.matchId === matchId).sort((left, right) => left.setNo - right.setNo)
    const hasInProgress = sets.some((set) => set.status === 'in_progress')

    if (!hasInProgress) {
      const pending = sets.find((set) => set.status === 'pending')

      if (pending) {
        const index = draft.sets.findIndex((set) => set.id === pending.id)
        draft.sets[index] = startSet(pending)
      }
    }

    return
  }

  match.status = 'completed'
  match.winnerTeamId = decision.winnerTeamId

  const normalized: SetRecord[] = markRemainingSetsIgnored(sets).map((set) => {
    if (set.status === 'in_progress' || set.status === 'ignored') {
      return {
        ...set,
        status: 'ignored' as const,
      }
    }

    return set
  })

  for (const set of normalized) {
    const index = draft.sets.findIndex((item) => item.id === set.id)
    draft.sets[index] = set
  }
}

export async function recordRally(payload: {
  setId: string
  scoringTeamId: string
  clientEventId: string
  occurredAt: string
}): Promise<SetRecord> {
  let nextSet: SetRecord | null = null

  updateStore((draft) => {
    const setIndex = draft.sets.findIndex((set) => set.id === payload.setId)
    if (setIndex < 0) {
      throw new Error('세트를 찾을 수 없습니다.')
    }

    const current = draft.sets[setIndex]
    if (current.events.some((event) => event.clientEventId === payload.clientEventId)) {
      nextSet = current
      return
    }

    const inProgressSet = current.status === 'pending' ? startSet(current) : current
    const updated = applyRally(
      inProgressSet,
      payload.scoringTeamId,
      payload.clientEventId,
      payload.occurredAt,
    )

    draft.sets[setIndex] = updated
    finalizeMatchState(draft, updated.matchId)
    nextSet = draft.sets[setIndex]
  })

  if (!nextSet) {
    throw new Error('득점 반영에 실패했습니다.')
  }

  return nextSet
}

export async function editCompletedSetScore(
  actorId: string,
  setId: string,
  score: { teamA: number; teamB: number },
): Promise<SetRecord> {
  let nextSet: SetRecord | null = null

  updateStore((draft) => {
    const setIndex = draft.sets.findIndex((set) => set.id === setId)

    if (setIndex < 0) {
      throw new Error('세트를 찾을 수 없습니다.')
    }

    const original = draft.sets[setIndex]
    const match = draft.matches.find((item) => item.id === original.matchId)

    if (!match) {
      throw new Error('매치를 찾을 수 없습니다.')
    }

    const member = draft.groupMembers.find(
      (item) => item.groupId === match.groupId && item.profileId === actorId,
    )

    if (!member) {
      throw new Error('그룹 멤버가 아닙니다.')
    }

    const canEdit =
      member.role === 'owner' ||
      member.permissions.includes('edit_completed_records') ||
      (member.role === 'admin' && member.permissions.includes('edit_completed_records'))

    if (!canEdit) {
      throw new Error('완료 기록 수정 권한이 없습니다.')
    }

    if (score.teamA === score.teamB) {
      throw new Error('완료 세트는 동점으로 저장할 수 없습니다.')
    }

    const [teamAId, teamBId] = original.teamIds
    const winnerTeamId = score.teamA > score.teamB ? teamAId : score.teamB > score.teamA ? teamBId : undefined

    const updated: SetRecord = {
      ...original,
      status: winnerTeamId ? 'completed' : original.status,
      score: {
        [teamAId]: score.teamA,
        [teamBId]: score.teamB,
      },
      winnerTeamId,
    }

    draft.sets[setIndex] = updated

    draft.auditLogs.push({
      id: createId('audit'),
      groupId: match.groupId,
      entityType: 'set',
      entityId: setId,
      action: 'edit_completed_record',
      before: {
        score: original.score,
        winnerTeamId: original.winnerTeamId,
      },
      after: {
        score: updated.score,
        winnerTeamId: updated.winnerTeamId,
      },
      actorId,
      createdAt: nowIso(),
    })

    finalizeMatchState(draft, original.matchId)
    nextSet = updated
  })

  if (!nextSet) {
    throw new Error('완료 기록 수정에 실패했습니다.')
  }

  return nextSet
}

export async function listMeetingStats(meetingId: string): Promise<MeetingWinStat[]> {
  const store = loadStore()
  const matches = store.matches.filter((match) => match.meetingId === meetingId && match.status === 'completed')

  const winsByProfile = new Map<string, { wins: number; losses: number }>()

  for (const match of matches) {
    if (!match.winnerTeamId) {
      continue
    }

    const teams = store.matchTeams.filter((team) => team.matchId === match.id)
    const winnerTeam = teams.find((team) => team.id === match.winnerTeamId)
    const loserTeams = teams.filter((team) => team.id !== match.winnerTeamId)

    if (!winnerTeam || loserTeams.length === 0) {
      continue
    }

    const winnerPlayers = store.matchPlayers.filter(
      (player) => player.matchId === match.id && player.teamId === winnerTeam.id,
    )

    const loserPlayers = store.matchPlayers.filter(
      (player) => player.matchId === match.id && player.teamId === loserTeams[0].id,
    )

    for (const player of winnerPlayers) {
      const current = winsByProfile.get(player.profileId) ?? { wins: 0, losses: 0 }
      current.wins += 1
      winsByProfile.set(player.profileId, current)
    }

    for (const player of loserPlayers) {
      const current = winsByProfile.get(player.profileId) ?? { wins: 0, losses: 0 }
      current.losses += 1
      winsByProfile.set(player.profileId, current)
    }
  }

  return Array.from(winsByProfile.entries())
    .map(([profileId, value]) => {
      const profile = store.profiles.find((item) => item.id === profileId)
      const total = value.wins + value.losses
      return {
        profileId,
        name: profile?.name ?? '알 수 없음',
        wins: value.wins,
        losses: value.losses,
        winRate: total > 0 ? Math.round((value.wins / total) * 100) : 0,
      }
    })
    .sort((left, right) => right.winRate - left.winRate)
}

export async function listGroupVenues(groupId: string): Promise<Venue[]> {
  const store = loadStore()
  return store.venues.filter((venue) => venue.groupId === groupId)
}

export async function listAuditLogs(groupId: string): Promise<AuditLog[]> {
  const store = loadStore()
  return store.auditLogs
    .filter((log) => log.groupId === groupId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
