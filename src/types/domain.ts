export type MatchFormat = 'single' | 'best_of_3' | 'best_of_5'
export type MatchStatus = 'planned' | 'in_progress' | 'completed'
export type SetStatus = 'pending' | 'in_progress' | 'completed' | 'ignored'
export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed'
export type TeamSize = 2 | 3 | 4
export type Role = 'owner' | 'admin' | 'member'
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'declined' | 'canceled'

export type PermissionKey =
  | 'manage_members'
  | 'manage_invites'
  | 'manage_venues'
  | 'manage_notices'
  | 'close_meeting'
  | 'edit_completed_records'

export type GroupPermissionMap = Record<PermissionKey, boolean>
export type AccessibilityScale = 1 | 1.1 | 1.2 | 1.4 | 1.6 | 2

export interface UIThemeTokens {
  bg: string
  surface: string
  textPrimary: string
  textSecondary: string
  primary: string
  primaryStrong: string
  live: string
  warning: string
  danger: string
  winner: string
}

export interface Profile {
  id: string
  email: string
  name: string
  phone: string
  bankAccount?: string
}

export interface Group {
  id: string
  name: string
  createdAt: string
  createdBy: string
}

export interface GroupMember {
  id: string
  groupId: string
  profileId: string
  role: Role
  permissions: PermissionKey[]
  permissionsOverride: boolean
}

export interface GroupPermissionPolicy {
  groupId: string
  owner: PermissionKey[]
  admin: PermissionKey[]
  member: PermissionKey[]
  updatedAt?: string
}

export interface Invite {
  id: string
  groupId: string
  token: string
  invitedEmail?: string
  role: Role
  status: InviteStatus
  expiresAt: string
  createdAt: string
  createdBy: string
}

export interface Venue {
  id: string
  groupId: string
  name: string
  address?: string
  memo?: string
  reservationRequired: boolean
  reservationUrl?: string
}

export interface Meeting {
  id: string
  groupId: string
  venueId?: string
  title: string
  date: string
  startTime: string
  status: MeetingStatus
  createdBy: string
  createdAt: string
}

export interface MeetingParticipant {
  id: string
  meetingId: string
  profileId: string
}

export interface MatchTeam {
  id: string
  matchId: string
  name: string
}

export interface MatchPlayer {
  id: string
  matchId: string
  teamId: string
  profileId: string
  positionNo: number
}

export interface TeamPositionAssignment {
  profileId: string
  positionNo: number
}

export interface TeamPositionAssignments {
  teamA: TeamPositionAssignment[]
  teamB: TeamPositionAssignment[]
}

export interface SetPositionSnapshot {
  id: string
  setId: string
  matchId: string
  teamId: string
  profileId: string
  positionNo: number
  createdAt: string
}

export interface Match {
  id: string
  groupId: string
  meetingId: string
  format: MatchFormat
  status: MatchStatus
  teamSize: TeamSize
  targetScore: number
  deuce: boolean
  penaltyText?: string
  requiredSetWins: number
  firstServingTeamId: string
  winnerTeamId?: string
  refereeProfileId?: string
  createdAt: string
  createdBy: string
}

export interface RallyEvent {
  clientEventId: string
  setId: string
  scoringTeamId: string
  occurredAt: string
  servingTeamIdBefore: string
  servingTeamIdAfter: string
  servingPositionBefore: number
  servingPositionAfter: number
  rotationAppliedToTeamId?: string
  scoreAfter: Record<string, number>
}

export interface SetRecord {
  id: string
  matchId: string
  setNo: number
  status: SetStatus
  teamIds: [string, string]
  initialServingTeamId: string
  servingTeamId: string
  targetScore: number
  deuce: boolean
  teamSize: TeamSize
  score: Record<string, number>
  // 0 means this team has not served yet in the current set.
  rotation: Record<string, number>
  winnerTeamId?: string
  events: RallyEvent[]
}

export interface Notice {
  id: string
  groupId: string
  title: string
  body: string
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
}

export interface ReceivedInviteItem {
  invite: Invite
  groupName: string
  inviterName: string
  isExpired: boolean
}

export interface AuditLog {
  id: string
  groupId: string
  entityType: 'meeting' | 'match' | 'set' | 'group' | 'member' | 'invite' | 'venue' | 'notice'
  entityId: string
  action: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  actorId: string
  createdAt: string
}

export interface MeetingWinStat {
  profileId: string
  name: string
  wins: number
  losses: number
  winRate: number
}

export interface MemberPositionStat {
  profileId: string
  name: string
  teamSize: TeamSize
  positionNo: number
  wins: number
  losses: number
  winRate: number
  sampleSize: number
}

export interface MeetingDetail {
  meeting: Meeting
  venue?: Venue
  participants: Profile[]
}

export interface CreateMatchInput {
  groupId: string
  meetingId: string
  format: MatchFormat
  teamSize: TeamSize
  targetScore: number
  deuce: boolean
  penaltyText?: string
  refereeProfileId?: string
  firstServingTeamIndex: 0 | 1
  teams: {
    name: string
    playerIds: string[]
  }[]
}

export interface CreateMeetingInput {
  groupId: string
  title: string
  venueId?: string
  date: string
  startTime: string
  participantIds: string[]
}

export interface OfflineRallyEvent {
  clientEventId: string
  setId: string
  scoringTeamId: string
  occurredAt: string
}

export interface CurrentUserContext {
  profile: Profile
  groupMember: GroupMember
}
