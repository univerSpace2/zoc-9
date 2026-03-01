import { initializeRotation, nextServePosition } from '@/lib/rules-engine'
import { createId } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useLocalDataMode } from '@/lib/env'
import type {
  AuditLog,
  CreateMatchInput,
  CreateMeetingInput,
  Group,
  GroupMember,
  GroupPermissionPolicy,
  Invite,
  Match,
  MatchFormat,
  MatchTeam,
  Meeting,
  MeetingDetail,
  MeetingStatus,
  MemberPositionStat,
  MeetingWinStat,
  Notice,
  OfflineRallyEvent,
  PermissionKey,
  Profile,
  ReceivedInviteItem,
  Role,
  SetRecord,
  TeamSize,
  Venue,
} from '@/types/domain'
import {
  acceptInvite,
  createGroup,
  createInvite,
  createMatch,
  createMeeting,
  declineInvite,
  editCompletedSetScore,
  getActiveMeetingByGroup,
  getGroupMember,
  getInviteByToken,
  getMeeting,
  getSet,
  hasPermission,
  listAuditLogs,
  listGroups,
  listGroupVenues,
  listInvitesByGroup,
  listMatches,
  listMeetingStats,
  listMeetings,
  listMembers,
  listGroupMemberPositionStats,
  loginUser,
  recordRally,
  registerUser,
  startSetByIdWithServingTeam,
  getMeetingDetail,
  updateMeetingStatus,
  updateProfile,
} from '@/services/local-data'

const PERMISSION_KEYS: PermissionKey[] = [
  'manage_members',
  'manage_invites',
  'manage_venues',
  'manage_notices',
  'close_meeting',
  'edit_completed_records',
]

const ROLE_SET = new Set(['owner', 'admin', 'member'])

export const queryKeys = {
  groups: (profileId: string) => ['groups', profileId] as const,
  group: (groupId: string) => ['group', groupId] as const,
  members: (groupId: string) => ['members', groupId] as const,
  meetings: (groupId: string) => ['meetings', groupId] as const,
  activeMeeting: (groupId: string) => ['activeMeeting', groupId] as const,
  meeting: (meetingId: string) => ['meeting', meetingId] as const,
  matches: (meetingId: string) => ['matches', meetingId] as const,
  set: (setId: string) => ['set', setId] as const,
  stats: (meetingId: string) => ['stats', meetingId] as const,
  invites: (groupId: string) => ['invites', groupId] as const,
  receivedInvites: (profileId: string) => ['receivedInvites', profileId] as const,
  groupPermissionPolicy: (groupId: string) => ['groupPermissionPolicy', groupId] as const,
  meetingDetail: (meetingId: string) => ['meetingDetail', meetingId] as const,
  memberPositionStats: (groupId: string) => ['memberPositionStats', groupId] as const,
  venues: (groupId: string) => ['venues', groupId] as const,
  notices: (groupId: string) => ['notices', groupId] as const,
  auditLogs: (groupId: string) => ['auditLogs', groupId] as const,
} as const

function shouldUseLocalData(): boolean {
  return useLocalDataMode || !supabase
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase 연결 정보가 없습니다. VITE_SUPABASE_URL/ANON_KEY를 확인하세요.')
  }

  return supabase
}

function normalizeRole(value: string): Role {
  if (!ROLE_SET.has(value)) {
    return 'member'
  }

  return value as Role
}

function normalizePermissions(value: unknown): PermissionKey[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is PermissionKey => typeof item === 'string' && PERMISSION_KEYS.includes(item as PermissionKey))
}

function mapProfileRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    name: String(row.name ?? ''),
    phone: String(row.phone ?? ''),
    bankAccount: row.bank_account ? String(row.bank_account) : undefined,
  }
}

function mapGroupRow(row: Record<string, unknown>): Group {
  return {
    id: String(row.id),
    name: String(row.name),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  }
}

function mapMemberRow(row: Record<string, unknown>): GroupMember {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    profileId: String(row.profile_id),
    role: normalizeRole(String(row.role ?? 'member')),
    permissions: normalizePermissions(row.permissions),
    permissionsOverride: Boolean(row.permissions_override),
  }
}

function mapInviteRow(row: Record<string, unknown>): Invite {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    token: String(row.token),
    invitedEmail: row.invited_email ? String(row.invited_email) : undefined,
    role: normalizeRole(String(row.role ?? 'member')),
    status: String(row.status) as Invite['status'],
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  }
}

function mapVenueRow(row: Record<string, unknown>): Venue {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    name: String(row.name),
    reservationRequired: Boolean(row.reservation_required),
    reservationUrl: row.reservation_url ? String(row.reservation_url) : undefined,
  }
}

function mapMeetingRow(row: Record<string, unknown>): Meeting {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    venueId: row.venue_id ? String(row.venue_id) : undefined,
    title: String(row.title),
    date: String(row.date),
    startTime: String(row.start_time),
    status: String(row.status) as MeetingStatus,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  }
}

function mapMatchRow(row: Record<string, unknown>): Match {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    meetingId: String(row.meeting_id),
    format: String(row.format) as MatchFormat,
    status: String(row.status) as Match['status'],
    teamSize: Number(row.team_size) as TeamSize,
    targetScore: Number(row.target_score),
    deuce: Boolean(row.deuce),
    penaltyText: row.penalty_text ? String(row.penalty_text) : undefined,
    requiredSetWins: Number(row.required_set_wins),
    firstServingTeamId: String(row.first_serving_team_id),
    winnerTeamId: row.winner_team_id ? String(row.winner_team_id) : undefined,
    refereeProfileId: row.referee_profile_id ? String(row.referee_profile_id) : undefined,
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  }
}

function mapPermissionPolicyRow(row: Record<string, unknown>): GroupPermissionPolicy {
  const permissions = (row.permissions as Record<string, unknown> | null) ?? {}
  return {
    groupId: String(row.group_id),
    owner: normalizePermissions(permissions.owner),
    admin: normalizePermissions(permissions.admin),
    member: normalizePermissions(permissions.member),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapTeamRow(row: Record<string, unknown>): MatchTeam {
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    name: String(row.name),
  }
}

function mapSetRow(row: Record<string, unknown>, events: SetRecord['events'] = []): SetRecord {
  const teamAId = String(row.team_a_id)
  const teamBId = String(row.team_b_id)

  return {
    id: String(row.id),
    matchId: String(row.match_id),
    setNo: Number(row.set_no),
    status: String(row.status) as SetRecord['status'],
    teamIds: [teamAId, teamBId],
    initialServingTeamId: String(row.initial_serving_team_id),
    servingTeamId: String(row.serving_team_id),
    targetScore: Number(row.target_score),
    deuce: Boolean(row.deuce),
    teamSize: Number(row.team_size) as TeamSize,
    score: {
      [teamAId]: Number(row.score_a),
      [teamBId]: Number(row.score_b),
    },
    rotation: {
      [teamAId]: Number(row.rotation_a),
      [teamBId]: Number(row.rotation_b),
    },
    winnerTeamId: row.winner_team_id ? String(row.winner_team_id) : undefined,
    events,
  }
}

function mapNoticeRow(row: Record<string, unknown>): Notice {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    title: String(row.title),
    body: String(row.body),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapAuditRow(row: Record<string, unknown>): AuditLog {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    entityType: String(row.entity_type) as AuditLog['entityType'],
    entityId: String(row.entity_id),
    action: String(row.action),
    before: (row.before_data as Record<string, unknown>) ?? {},
    after: (row.after_data as Record<string, unknown>) ?? {},
    actorId: String(row.actor_id),
    createdAt: String(row.created_at),
  }
}

async function getProfileById(profileId: string): Promise<Profile> {
  const client = ensureSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('id, email, name, phone, bank_account')
    .eq('id', profileId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '프로필을 찾을 수 없습니다.')
  }

  return mapProfileRow(data)
}

function mapEventsWithServePositions(
  eventRows: Record<string, unknown>[],
  teamIds: [string, string],
  initialServingTeamId: string,
  teamSize: TeamSize,
): SetRecord['events'] {
  const [teamAId, teamBId] = teamIds
  const rotation = initializeRotation(teamIds, initialServingTeamId)

  return eventRows.map((row) => {
    const servingTeamIdBefore = String(row.serving_team_id_before)
    const servingTeamIdAfter = String(row.serving_team_id_after)
    const rotationAppliedToTeamId = row.rotation_applied_to_team_id ? String(row.rotation_applied_to_team_id) : undefined
    const scoringTeamId = String(row.scoring_team_id)

    const servingPositionBefore = rotation[servingTeamIdBefore] ?? 0

    if (rotationAppliedToTeamId) {
      rotation[rotationAppliedToTeamId] = nextServePosition(rotation[rotationAppliedToTeamId] ?? 0, teamSize)
    }

    const servingPositionAfter = rotation[servingTeamIdAfter] ?? 0

    return {
      clientEventId: String(row.client_event_id),
      setId: String(row.set_id),
      scoringTeamId,
      occurredAt: String(row.occurred_at),
      servingTeamIdBefore,
      servingTeamIdAfter,
      servingPositionBefore,
      servingPositionAfter,
      rotationAppliedToTeamId,
      scoreAfter: {
        [teamAId]: Number(row.score_a_after),
        [teamBId]: Number(row.score_b_after),
      },
    }
  })
}

export async function apiRegister(payload: {
  email: string
  name: string
  phone: string
  bankAccount?: string
  password: string
}): Promise<Profile> {
  if (shouldUseLocalData()) {
    return registerUser(payload)
  }

  const client = ensureSupabase()

  const { data, error } = await client.auth.signUp({
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    options: {
      data: {
        name: payload.name.trim(),
        phone: payload.phone.trim(),
      },
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('회원가입에 실패했습니다.')
  }

  const { error: profileError } = await client.from('profiles').upsert(
    {
      id: data.user.id,
      email: payload.email.trim().toLowerCase(),
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      bank_account: payload.bankAccount?.trim() || null,
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    throw new Error(profileError.message)
  }

  return getProfileById(data.user.id)
}

export async function apiLogin(payload: { email: string; password: string }): Promise<Profile> {
  if (shouldUseLocalData()) {
    return loginUser({ email: payload.email })
  }

  const client = ensureSupabase()

  const { data, error } = await client.auth.signInWithPassword({
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('로그인에 실패했습니다.')
  }

  return getProfileById(data.user.id)
}

export async function apiUpdateProfile(
  profileId: string,
  payload: { name: string; phone: string; bankAccount?: string },
): Promise<Profile> {
  if (shouldUseLocalData()) {
    return updateProfile(profileId, payload)
  }

  const client = ensureSupabase()

  const { data, error } = await client
    .from('profiles')
    .update({
      name: payload.name.trim(),
      phone: payload.phone.trim(),
      bank_account: payload.bankAccount?.trim() || null,
    })
    .eq('id', profileId)
    .select('id, email, name, phone, bank_account')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '프로필 수정에 실패했습니다.')
  }

  return mapProfileRow(data)
}

export async function apiChangePassword(newPassword: string): Promise<void> {
  if (shouldUseLocalData()) {
    return
  }

  const client = ensureSupabase()
  const { error } = await client.auth.updateUser({ password: newPassword })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiListGroups(profileId: string): Promise<Group[]> {
  if (shouldUseLocalData()) {
    return listGroups(profileId)
  }

  const client = ensureSupabase()
  const { data: membershipRows, error: membershipError } = await client
    .from('group_members')
    .select('group_id')
    .eq('profile_id', profileId)

  if (membershipError) {
    throw new Error(membershipError.message)
  }

  const groupIds = (membershipRows ?? []).map((row) => String(row.group_id))
  if (groupIds.length === 0) {
    return []
  }

  const { data, error } = await client
    .from('groups')
    .select('id, name, created_by, created_at')
    .in('id', groupIds)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapGroupRow(row))
}

export async function apiGetGroup(groupId: string): Promise<Group | null> {
  if (shouldUseLocalData()) {
    return null
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('groups')
    .select('id, name, created_by, created_at')
    .eq('id', groupId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? mapGroupRow(data) : null
}

export async function apiCreateGroup(profileId: string, name: string): Promise<Group> {
  if (shouldUseLocalData()) {
    return createGroup(profileId, name)
  }

  const client = ensureSupabase()
  const { data: groupId, error } = await client.rpc('rpc_create_group', { name: name.trim() })

  if (error) {
    throw new Error(error.message)
  }

  const { data: groupRow, error: groupError } = await client
    .from('groups')
    .select('id, name, created_by, created_at')
    .eq('id', String(groupId))
    .single()

  if (groupError || !groupRow) {
    throw new Error(groupError?.message ?? '그룹 생성 결과를 조회하지 못했습니다.')
  }

  return mapGroupRow(groupRow)
}

export async function apiUpdateGroupName(actorId: string, groupId: string, name: string): Promise<Group> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 그룹명 변경 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_update_group_name', {
    payload: {
      groupId,
      name,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  const group = await apiGetGroup(groupId)
  if (!group) {
    throw new Error('그룹 정보를 불러오지 못했습니다.')
  }

  return group
}

export async function apiGetGroupPermissionPolicy(groupId: string): Promise<GroupPermissionPolicy> {
  if (shouldUseLocalData()) {
    return {
      groupId,
      owner: [...PERMISSION_KEYS],
      admin: [...PERMISSION_KEYS],
      member: [],
    }
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('group_permissions')
    .select('group_id, permissions, updated_at')
    .eq('group_id', groupId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return {
      groupId,
      owner: [...PERMISSION_KEYS],
      admin: [...PERMISSION_KEYS],
      member: [],
    }
  }

  return mapPermissionPolicyRow(data)
}

export async function apiUpdateGroupPermissionPolicy(
  actorId: string,
  groupId: string,
  payload: {
    admin: PermissionKey[]
    member: PermissionKey[]
  },
): Promise<GroupPermissionPolicy> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 권한 정책 변경 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_update_group_permission_policy', {
    payload: {
      groupId,
      admin: payload.admin,
      member: payload.member,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  return apiGetGroupPermissionPolicy(groupId)
}

export async function apiTransferGroupOwner(actorId: string, groupId: string, targetProfileId: string): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 그룹장 위임 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_transfer_group_owner', {
    payload: {
      groupId,
      targetProfileId,
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiResetMemberPermissions(actorId: string, groupId: string, targetProfileId: string): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 멤버 권한 복원을 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_reset_member_permissions', {
    payload: {
      groupId,
      targetProfileId,
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiListMembers(groupId: string): Promise<(GroupMember & { profile: Profile })[]> {
  if (shouldUseLocalData()) {
    return listMembers(groupId)
  }

  const client = ensureSupabase()
  const { data: memberRows, error: memberError } = await client
    .from('group_members')
    .select('id, group_id, profile_id, role, permissions, permissions_override')
    .eq('group_id', groupId)

  if (memberError) {
    throw new Error(memberError.message)
  }

  const profileIds = (memberRows ?? []).map((row) => String(row.profile_id))
  const { data: profileRows, error: profileError } = await client
    .from('profiles')
    .select('id, email, name, phone, bank_account')
    .in('id', profileIds)

  if (profileError) {
    throw new Error(profileError.message)
  }

  const profileMap = new Map((profileRows ?? []).map((row) => [String(row.id), mapProfileRow(row)]))

  return (memberRows ?? [])
    .map((row) => {
      const member = mapMemberRow(row)
      const profile = profileMap.get(member.profileId)

      if (!profile) {
        return null
      }

      return {
        ...member,
        profile,
      }
    })
    .filter((item): item is GroupMember & { profile: Profile } => item !== null)
}

export async function apiUpdateMemberRole(
  actorId: string,
  groupId: string,
  targetProfileId: string,
  role: Exclude<Role, 'owner'>,
): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 멤버 역할 변경을 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_update_member_role', {
    payload: {
      groupId,
      targetProfileId,
      role,
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiUpdateMemberPermissions(
  actorId: string,
  groupId: string,
  targetProfileId: string,
  permissions: PermissionKey[],
): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 멤버 권한 변경을 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_update_member_permissions', {
    payload: {
      groupId,
      targetProfileId,
      permissions,
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiRemoveMember(actorId: string, groupId: string, targetProfileId: string): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 멤버 제거를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_remove_group_member', {
    payload: {
      groupId,
      targetProfileId,
    },
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiListMeetings(groupId: string): Promise<Meeting[]> {
  if (shouldUseLocalData()) {
    return listMeetings(groupId)
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('meetings')
    .select('id, group_id, venue_id, title, date, start_time, status, created_by, created_at')
    .eq('group_id', groupId)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapMeetingRow(row))
}

export async function apiCreateMeeting(profileId: string, payload: CreateMeetingInput): Promise<Meeting> {
  if (shouldUseLocalData()) {
    return createMeeting(profileId, payload)
  }

  const client = ensureSupabase()

  const { data, error } = await client
    .from('meetings')
    .insert({
      group_id: payload.groupId,
      venue_id: payload.venueId ?? null,
      title: payload.title,
      date: payload.date,
      start_time: payload.startTime,
      status: 'scheduled',
      created_by: profileId,
    })
    .select('id, group_id, venue_id, title, date, start_time, status, created_by, created_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '모임 생성에 실패했습니다.')
  }

  const participantIds = Array.from(new Set(payload.participantIds))
  if (participantIds.length > 0) {
    const { error: participantError } = await client.from('meeting_participants').insert(
      participantIds.map((profileIdValue) => ({
        meeting_id: data.id,
        profile_id: profileIdValue,
      })),
    )

    if (participantError) {
      throw new Error(participantError.message)
    }
  }

  return mapMeetingRow(data)
}

export async function apiUpdateMeetingStatus(
  profileId: string,
  meetingId: string,
  status: MeetingStatus,
): Promise<Meeting> {
  if (shouldUseLocalData()) {
    return updateMeetingStatus(profileId, meetingId, status)
  }

  const client = ensureSupabase()

  if (status === 'completed') {
    const { error } = await client.rpc('rpc_complete_meeting', { meeting_id: meetingId })
    if (error) {
      throw new Error(error.message)
    }
  } else {
    const { error } = await client.from('meetings').update({ status }).eq('id', meetingId)
    if (error) {
      throw new Error(error.message)
    }
  }

  const updated = await apiGetMeeting(meetingId)
  if (!updated) {
    throw new Error('모임 상태 변경 결과를 확인할 수 없습니다.')
  }

  return updated
}

export async function apiGetMeeting(meetingId: string): Promise<Meeting | null> {
  if (shouldUseLocalData()) {
    return getMeeting(meetingId)
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('meetings')
    .select('id, group_id, venue_id, title, date, start_time, status, created_by, created_at')
    .eq('id', meetingId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? mapMeetingRow(data) : null
}

export async function apiGetMeetingDetail(meetingId: string): Promise<MeetingDetail | null> {
  if (shouldUseLocalData()) {
    return getMeetingDetail(meetingId)
  }

  const client = ensureSupabase()
  const meeting = await apiGetMeeting(meetingId)

  if (!meeting) {
    return null
  }

  const [{ data: venueRow, error: venueError }, { data: participantRows, error: participantError }] = await Promise.all([
    meeting.venueId
      ? client
          .from('venues')
          .select('id, group_id, name, reservation_required, reservation_url')
          .eq('id', meeting.venueId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client.from('meeting_participants').select('profile_id').eq('meeting_id', meetingId),
  ])

  if (venueError) {
    throw new Error(venueError.message)
  }

  if (participantError) {
    throw new Error(participantError.message)
  }

  const profileIds = (participantRows ?? []).map((row) => String(row.profile_id))
  const { data: profileRows, error: profileError } =
    profileIds.length > 0
      ? await client.from('profiles').select('id, email, name, phone, bank_account').in('id', profileIds)
      : { data: [], error: null }

  if (profileError) {
    throw new Error(profileError.message)
  }

  return {
    meeting,
    venue: venueRow ? mapVenueRow(venueRow as Record<string, unknown>) : undefined,
    participants: (profileRows ?? []).map((row) => mapProfileRow(row as Record<string, unknown>)),
  }
}

export async function apiGetActiveMeeting(groupId: string): Promise<Meeting | null> {
  if (shouldUseLocalData()) {
    return getActiveMeetingByGroup(groupId)
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('meetings')
    .select('id, group_id, venue_id, title, date, start_time, status, created_by, created_at')
    .eq('group_id', groupId)
    .eq('status', 'in_progress')
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? mapMeetingRow(data) : null
}

export async function apiListMatches(meetingId: string): Promise<
  {
    match: Match
    teams: MatchTeam[]
    sets: SetRecord[]
  }[]
> {
  if (shouldUseLocalData()) {
    return listMatches(meetingId)
  }

  const client = ensureSupabase()
  const { data: matchRows, error: matchError } = await client
    .from('matches')
    .select(
      'id, group_id, meeting_id, format, status, team_size, target_score, deuce, penalty_text, required_set_wins, first_serving_team_id, winner_team_id, referee_profile_id, created_by, created_at',
    )
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })

  if (matchError) {
    throw new Error(matchError.message)
  }

  const matches = (matchRows ?? []).map((row) => mapMatchRow(row))
  if (matches.length === 0) {
    return []
  }

  const matchIds = matches.map((item) => item.id)

  const [{ data: teamRows, error: teamError }, { data: setRows, error: setError }] = await Promise.all([
    client
      .from('match_teams')
      .select('id, match_id, name')
      .in('match_id', matchIds),
    client
      .from('sets')
      .select(
        'id, match_id, set_no, status, team_a_id, team_b_id, initial_serving_team_id, serving_team_id, target_score, deuce, team_size, score_a, score_b, rotation_a, rotation_b, winner_team_id',
      )
      .in('match_id', matchIds)
      .order('set_no', { ascending: true }),
  ])

  if (teamError) {
    throw new Error(teamError.message)
  }

  if (setError) {
    throw new Error(setError.message)
  }

  const teamsByMatch = new Map<string, MatchTeam[]>()
  for (const row of teamRows ?? []) {
    const team = mapTeamRow(row)
    const list = teamsByMatch.get(team.matchId) ?? []
    list.push(team)
    teamsByMatch.set(team.matchId, list)
  }

  const setsByMatch = new Map<string, SetRecord[]>()
  for (const row of setRows ?? []) {
    const set = mapSetRow(row)
    const list = setsByMatch.get(set.matchId) ?? []
    list.push(set)
    setsByMatch.set(set.matchId, list)
  }

  return matches.map((match) => ({
    match,
    teams: teamsByMatch.get(match.id) ?? [],
    sets: (setsByMatch.get(match.id) ?? []).sort((left, right) => left.setNo - right.setNo),
  }))
}

export async function apiCreateMatch(profileId: string, payload: CreateMatchInput): Promise<Match> {
  if (shouldUseLocalData()) {
    return createMatch(profileId, payload)
  }

  const client = ensureSupabase()
  const { data: matchId, error } = await client.rpc('rpc_create_match', { payload })

  if (error) {
    throw new Error(error.message)
  }

  const { data: matchRow, error: matchError } = await client
    .from('matches')
    .select(
      'id, group_id, meeting_id, format, status, team_size, target_score, deuce, penalty_text, required_set_wins, first_serving_team_id, winner_team_id, referee_profile_id, created_by, created_at',
    )
    .eq('id', String(matchId))
    .single()

  if (matchError || !matchRow) {
    throw new Error(matchError?.message ?? '매치 생성 결과를 확인할 수 없습니다.')
  }

  return mapMatchRow(matchRow)
}

export async function apiGetSet(setId: string): Promise<
  {
    set: SetRecord
    match: Match
    teams: MatchTeam[]
  } | null
> {
  if (shouldUseLocalData()) {
    return getSet(setId)
  }

  const client = ensureSupabase()

  const { data: setRow, error: setError } = await client
    .from('sets')
    .select(
      'id, match_id, set_no, status, team_a_id, team_b_id, initial_serving_team_id, serving_team_id, target_score, deuce, team_size, score_a, score_b, rotation_a, rotation_b, winner_team_id',
    )
    .eq('id', setId)
    .maybeSingle()

  if (setError) {
    throw new Error(setError.message)
  }

  if (!setRow) {
    return null
  }

  const [{ data: matchRow, error: matchError }, { data: teamRows, error: teamError }, { data: eventRows, error: eventError }] =
    await Promise.all([
      client
        .from('matches')
        .select(
          'id, group_id, meeting_id, format, status, team_size, target_score, deuce, penalty_text, required_set_wins, first_serving_team_id, winner_team_id, referee_profile_id, created_by, created_at',
        )
        .eq('id', String(setRow.match_id))
        .single(),
      client
        .from('match_teams')
        .select('id, match_id, name')
        .eq('match_id', String(setRow.match_id))
        .order('created_at', { ascending: true }),
      client
        .from('set_events')
        .select(
          'id, set_id, client_event_id, scoring_team_id, serving_team_id_before, serving_team_id_after, rotation_applied_to_team_id, score_a_after, score_b_after, occurred_at, created_at',
        )
        .eq('set_id', setId)
        .order('occurred_at', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ])

  if (matchError || !matchRow) {
    throw new Error(matchError?.message ?? '매치를 찾을 수 없습니다.')
  }

  if (teamError) {
    throw new Error(teamError.message)
  }

  if (eventError) {
    throw new Error(eventError.message)
  }

  const teamIds: [string, string] = [String(setRow.team_a_id), String(setRow.team_b_id)]

  const events = mapEventsWithServePositions(
    (eventRows ?? []).map((row) => row as Record<string, unknown>),
    teamIds,
    String(setRow.initial_serving_team_id),
    Number(setRow.team_size) as TeamSize,
  )

  return {
    set: mapSetRow(setRow, events),
    match: mapMatchRow(matchRow),
    teams: (teamRows ?? []).map((row) => mapTeamRow(row)),
  }
}

export async function apiStartSet(setId: string, firstServingTeamId?: string): Promise<SetRecord> {
  if (shouldUseLocalData()) {
    return startSetByIdWithServingTeam(setId, firstServingTeamId)
  }

  const setPayload = await apiGetSet(setId)
  if (!setPayload) {
    throw new Error('세트를 찾을 수 없습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_start_set', {
    match_id: setPayload.match.id,
    set_no: setPayload.set.setNo,
    first_serving_team_id: firstServingTeamId ?? setPayload.set.initialServingTeamId,
  })

  if (error) {
    throw new Error(error.message)
  }

  const refreshed = await apiGetSet(setId)
  if (!refreshed) {
    throw new Error('세트 시작 결과를 불러오지 못했습니다.')
  }

  return refreshed.set
}

export async function apiRecordRally(event: OfflineRallyEvent): Promise<SetRecord> {
  if (shouldUseLocalData()) {
    return recordRally(event)
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_record_rally', {
    set_id: event.setId,
    scoring_team_id: event.scoringTeamId,
    client_event_id: event.clientEventId,
    occurred_at: event.occurredAt,
  })

  if (error) {
    throw new Error(error.message)
  }

  const refreshed = await apiGetSet(event.setId)
  if (!refreshed) {
    throw new Error('세트 갱신 결과를 불러오지 못했습니다.')
  }

  return refreshed.set
}

export async function apiEditCompletedSet(
  actorId: string,
  setId: string,
  score: { teamA: number; teamB: number },
): Promise<SetRecord> {
  if (shouldUseLocalData()) {
    return editCompletedSetScore(actorId, setId, score)
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_edit_completed_record', {
    payload: {
      entity_type: 'set',
      entity_id: setId,
      score,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  const refreshed = await apiGetSet(setId)
  if (!refreshed) {
    throw new Error('세트 갱신 결과를 불러오지 못했습니다.')
  }

  return refreshed.set
}

export async function apiListStats(meetingId: string): Promise<MeetingWinStat[]> {
  if (shouldUseLocalData()) {
    return listMeetingStats(meetingId)
  }

  const client = ensureSupabase()
  const { data: matchRows, error: matchError } = await client
    .from('matches')
    .select('id, winner_team_id')
    .eq('meeting_id', meetingId)
    .eq('status', 'completed')

  if (matchError) {
    throw new Error(matchError.message)
  }

  if (!matchRows || matchRows.length === 0) {
    return []
  }

  const matchIds = matchRows.map((row) => String(row.id))

  const [{ data: teamRows, error: teamError }, { data: playerRows, error: playerError }] = await Promise.all([
    client.from('match_teams').select('id, match_id').in('match_id', matchIds),
    client.from('match_players').select('match_id, team_id, profile_id').in('match_id', matchIds),
  ])

  if (teamError) {
    throw new Error(teamError.message)
  }

  if (playerError) {
    throw new Error(playerError.message)
  }

  const profileIds = Array.from(new Set((playerRows ?? []).map((row) => String(row.profile_id))))

  const { data: profileRows, error: profileError } = await client
    .from('profiles')
    .select('id, name')
    .in('id', profileIds)

  if (profileError) {
    throw new Error(profileError.message)
  }

  const teamsByMatch = new Map<string, string[]>()
  for (const row of teamRows ?? []) {
    const matchId = String(row.match_id)
    const list = teamsByMatch.get(matchId) ?? []
    list.push(String(row.id))
    teamsByMatch.set(matchId, list)
  }

  const playersByMatchTeam = new Map<string, string[]>()
  for (const row of playerRows ?? []) {
    const key = `${row.match_id}:${row.team_id}`
    const list = playersByMatchTeam.get(key) ?? []
    list.push(String(row.profile_id))
    playersByMatchTeam.set(key, list)
  }

  const profileNameMap = new Map((profileRows ?? []).map((row) => [String(row.id), String(row.name)]))
  const winsByProfile = new Map<string, { wins: number; losses: number }>()

  for (const match of matchRows) {
    const matchId = String(match.id)
    const winnerTeamId = match.winner_team_id ? String(match.winner_team_id) : null

    if (!winnerTeamId) {
      continue
    }

    const teamIds = teamsByMatch.get(matchId) ?? []
    const loserTeamId = teamIds.find((teamId) => teamId !== winnerTeamId)

    if (!loserTeamId) {
      continue
    }

    const winnerPlayers = playersByMatchTeam.get(`${matchId}:${winnerTeamId}`) ?? []
    const loserPlayers = playersByMatchTeam.get(`${matchId}:${loserTeamId}`) ?? []

    for (const profileId of winnerPlayers) {
      const current = winsByProfile.get(profileId) ?? { wins: 0, losses: 0 }
      current.wins += 1
      winsByProfile.set(profileId, current)
    }

    for (const profileId of loserPlayers) {
      const current = winsByProfile.get(profileId) ?? { wins: 0, losses: 0 }
      current.losses += 1
      winsByProfile.set(profileId, current)
    }
  }

  return Array.from(winsByProfile.entries())
    .map(([profileId, summary]) => {
      const total = summary.wins + summary.losses
      const winRate = total > 0 ? Math.round((summary.wins / total) * 1000) / 10 : 0

      return {
        profileId,
        name: profileNameMap.get(profileId) ?? '알 수 없음',
        wins: summary.wins,
        losses: summary.losses,
        winRate,
      }
    })
    .sort((left, right) => right.winRate - left.winRate || right.wins - left.wins)
}

export async function apiListGroupMemberPositionStats(groupId: string): Promise<MemberPositionStat[]> {
  if (shouldUseLocalData()) {
    return listGroupMemberPositionStats(groupId)
  }

  const client = ensureSupabase()
  const { data: matchRows, error: matchError } = await client
    .from('matches')
    .select('id, team_size, winner_team_id')
    .eq('group_id', groupId)
    .eq('status', 'completed')

  if (matchError) {
    throw new Error(matchError.message)
  }

  if (!matchRows || matchRows.length === 0) {
    return []
  }

  const matchIds = matchRows.map((row) => String(row.id))
  const winnerByMatchId = new Map(
    matchRows
      .filter((row) => row.winner_team_id)
      .map((row) => [String(row.id), String(row.winner_team_id)]),
  )
  const teamSizeByMatchId = new Map(matchRows.map((row) => [String(row.id), Number(row.team_size) as TeamSize]))

  const { data: playerRows, error: playerError } = await client
    .from('match_players')
    .select('match_id, team_id, profile_id, position_no')
    .in('match_id', matchIds)

  if (playerError) {
    throw new Error(playerError.message)
  }

  const profileIds = Array.from(new Set((playerRows ?? []).map((row) => String(row.profile_id))))
  const { data: profileRows, error: profileError } =
    profileIds.length > 0
      ? await client.from('profiles').select('id, name').in('id', profileIds)
      : { data: [], error: null }

  if (profileError) {
    throw new Error(profileError.message)
  }

  const nameByProfileId = new Map((profileRows ?? []).map((row) => [String(row.id), String(row.name)]))
  const statsMap = new Map<string, { wins: number; losses: number; teamSize: TeamSize; positionNo: number }>()

  for (const row of playerRows ?? []) {
    const matchId = String(row.match_id)
    const winnerTeamId = winnerByMatchId.get(matchId)
    const teamSize = teamSizeByMatchId.get(matchId)

    if (!winnerTeamId || !teamSize) {
      continue
    }

    const profileId = String(row.profile_id)
    const positionNo = Number(row.position_no)
    const key = `${profileId}:${teamSize}:${positionNo}`
    const current = statsMap.get(key) ?? { wins: 0, losses: 0, teamSize, positionNo }

    if (String(row.team_id) === winnerTeamId) {
      current.wins += 1
    } else {
      current.losses += 1
    }

    statsMap.set(key, current)
  }

  return Array.from(statsMap.entries())
    .map(([key, stat]) => {
      const profileId = key.split(':')[0]
      const sampleSize = stat.wins + stat.losses
      return {
        profileId,
        name: nameByProfileId.get(profileId) ?? '알 수 없음',
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

export async function apiHasPermission(
  profileId: string,
  groupId: string,
  permission: PermissionKey,
): Promise<boolean> {
  if (shouldUseLocalData()) {
    return hasPermission(profileId, groupId, permission)
  }

  const client = ensureSupabase()
  const { data, error } = await client.rpc('has_group_permission', {
    p_group_id: groupId,
    p_permission: permission,
  })

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
}

export async function apiGetGroupMember(profileId: string, groupId: string): Promise<GroupMember | null> {
  if (shouldUseLocalData()) {
    return getGroupMember(profileId, groupId)
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('group_members')
    .select('id, group_id, profile_id, role, permissions, permissions_override')
    .eq('group_id', groupId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? mapMemberRow(data) : null
}

export async function apiListInvites(groupId: string): Promise<Invite[]> {
  if (shouldUseLocalData()) {
    return listInvitesByGroup(groupId)
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('invites')
    .select('id, group_id, token, invited_email, role, status, expires_at, created_by, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapInviteRow(row))
}

export async function apiCreateInvite(
  actorId: string,
  payload: { groupId: string; role: GroupMember['role']; invitedEmail?: string; expiresInDays?: number },
): Promise<Invite> {
  if (shouldUseLocalData()) {
    return createInvite(actorId, payload)
  }

  const client = ensureSupabase()

  const { data, error } = await client
    .from('invites')
    .insert({
      group_id: payload.groupId,
      token: createId('token'),
      invited_email: payload.invitedEmail?.trim() || null,
      role: payload.role,
      status: 'pending',
      expires_at: new Date(Date.now() + (payload.expiresInDays ?? 7) * 24 * 60 * 60 * 1000).toISOString(),
      created_by: actorId,
    })
    .select('id, group_id, token, invited_email, role, status, expires_at, created_by, created_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? '초대 생성에 실패했습니다.')
  }

  return mapInviteRow(data)
}

export async function apiCancelInvite(actorId: string, inviteId: string): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 초대 취소를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_cancel_invite', { invite_id: inviteId })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiReissueInvite(actorId: string, inviteId: string, expiresInDays = 7): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 초대 재발급을 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_reissue_invite', {
    invite_id: inviteId,
    expires_in_days: expiresInDays,
  })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiGetInvite(token: string): Promise<
  {
    invite: Invite
    groupName: string
    inviterName: string
    isExpired: boolean
  } | null
> {
  if (shouldUseLocalData()) {
    return getInviteByToken(token)
  }

  const client = ensureSupabase()
  const { data, error } = await client.rpc('rpc_get_invite_by_token', { invite_token: token })

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  const invite = mapInviteRow(data as Record<string, unknown>)

  return {
    invite,
    groupName: String((data as Record<string, unknown>).group_name ?? '알 수 없는 그룹'),
    inviterName: String((data as Record<string, unknown>).inviter_name ?? '알 수 없음'),
    isExpired: Boolean((data as Record<string, unknown>).is_expired),
  }
}

export async function apiListReceivedInvites(profileId: string): Promise<ReceivedInviteItem[]> {
  if (shouldUseLocalData()) {
    void profileId
    return []
  }

  const client = ensureSupabase()
  const { data, error } = await client.rpc('rpc_list_received_invites')

  if (error) {
    throw new Error(error.message)
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    invite: mapInviteRow({
      id: row.invite_id,
      group_id: row.group_id,
      token: row.token,
      invited_email: row.invited_email,
      role: row.role,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.created_at,
      created_by: row.created_by,
    }),
    groupName: String(row.group_name ?? '알 수 없는 그룹'),
    inviterName: String(row.inviter_name ?? '알 수 없음'),
    isExpired: Boolean(row.is_expired),
  }))
}

export async function apiAcceptInvite(profileId: string, token: string): Promise<void> {
  if (shouldUseLocalData()) {
    return acceptInvite(profileId, token)
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_accept_invite', { invite_token: token })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiDeclineInvite(token: string): Promise<void> {
  if (shouldUseLocalData()) {
    return declineInvite(token)
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_decline_invite', { invite_token: token })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiListVenues(groupId: string): Promise<Venue[]> {
  if (shouldUseLocalData()) {
    return listGroupVenues(groupId)
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('venues')
    .select('id, group_id, name, reservation_required, reservation_url')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapVenueRow(row))
}

export async function apiCreateVenue(
  actorId: string,
  payload: { groupId: string; name: string; reservationRequired: boolean; reservationUrl?: string },
): Promise<Venue> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 구장 생성 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { data: venueId, error } = await client.rpc('rpc_create_venue', {
    payload: {
      groupId: payload.groupId,
      name: payload.name,
      reservationRequired: payload.reservationRequired,
      reservationUrl: payload.reservationUrl,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  const { data: venueRow, error: venueError } = await client
    .from('venues')
    .select('id, group_id, name, reservation_required, reservation_url')
    .eq('id', String(venueId))
    .single()

  if (venueError || !venueRow) {
    throw new Error(venueError?.message ?? '구장 생성 결과를 불러오지 못했습니다.')
  }

  return mapVenueRow(venueRow)
}

export async function apiUpdateVenue(
  actorId: string,
  venueId: string,
  payload: { name: string; reservationRequired: boolean; reservationUrl?: string },
): Promise<Venue> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 구장 수정 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_update_venue', {
    payload: {
      venueId,
      name: payload.name,
      reservationRequired: payload.reservationRequired,
      reservationUrl: payload.reservationUrl,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  const { data: venueRow, error: venueError } = await client
    .from('venues')
    .select('id, group_id, name, reservation_required, reservation_url')
    .eq('id', venueId)
    .single()

  if (venueError || !venueRow) {
    throw new Error(venueError?.message ?? '구장 수정 결과를 불러오지 못했습니다.')
  }

  return mapVenueRow(venueRow)
}

export async function apiDeleteVenue(actorId: string, venueId: string): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 구장 삭제 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_delete_venue', { venue_id: venueId })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiListNotices(groupId: string): Promise<Notice[]> {
  if (shouldUseLocalData()) {
    return []
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('notices')
    .select('id, group_id, title, body, created_by, created_at, updated_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapNoticeRow(row))
}

export async function apiCreateNotice(
  actorId: string,
  payload: { groupId: string; title: string; body: string },
): Promise<Notice> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 공지 생성 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { data: noticeId, error } = await client.rpc('rpc_create_notice', {
    payload: {
      groupId: payload.groupId,
      title: payload.title,
      body: payload.body,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  const { data: noticeRow, error: noticeError } = await client
    .from('notices')
    .select('id, group_id, title, body, created_by, created_at, updated_at')
    .eq('id', String(noticeId))
    .single()

  if (noticeError || !noticeRow) {
    throw new Error(noticeError?.message ?? '공지 생성 결과를 불러오지 못했습니다.')
  }

  return mapNoticeRow(noticeRow)
}

export async function apiUpdateNotice(
  actorId: string,
  noticeId: string,
  payload: { title: string; body: string },
): Promise<Notice> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 공지 수정 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_update_notice', {
    payload: {
      noticeId,
      title: payload.title,
      body: payload.body,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  const { data: noticeRow, error: noticeError } = await client
    .from('notices')
    .select('id, group_id, title, body, created_by, created_at, updated_at')
    .eq('id', noticeId)
    .single()

  if (noticeError || !noticeRow) {
    throw new Error(noticeError?.message ?? '공지 수정 결과를 불러오지 못했습니다.')
  }

  return mapNoticeRow(noticeRow)
}

export async function apiDeleteNotice(actorId: string, noticeId: string): Promise<void> {
  void actorId

  if (shouldUseLocalData()) {
    throw new Error('로컬 모드에서는 공지 삭제 RPC를 지원하지 않습니다.')
  }

  const client = ensureSupabase()
  const { error } = await client.rpc('rpc_delete_notice', { notice_id: noticeId })

  if (error) {
    throw new Error(error.message)
  }
}

export async function apiListAuditLogs(groupId: string): Promise<AuditLog[]> {
  if (shouldUseLocalData()) {
    return listAuditLogs(groupId)
  }

  const client = ensureSupabase()
  const { data, error } = await client
    .from('audit_logs')
    .select('id, group_id, entity_type, entity_id, action, before_data, after_data, actor_id, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => mapAuditRow(row))
}
