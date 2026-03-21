import type { MatchFormat, PermissionKey } from '@/types/domain'

export const PERMISSION_OPTIONS: PermissionKey[] = [
  'manage_members',
  'manage_invites',
  'manage_venues',
  'manage_notices',
  'close_meeting',
  'edit_completed_records',
]

export const PERMISSION_LABEL: Record<PermissionKey, string> = {
  manage_members: '멤버 관리',
  manage_invites: '초대 관리',
  manage_venues: '구장 관리',
  manage_notices: '공지 관리',
  close_meeting: '모임 완료',
  edit_completed_records: '완료기록 수정',
}

export const FORMAT_LABEL: Record<MatchFormat, string> = {
  single: '단판',
  best_of_3: '3판 2선승',
  best_of_5: '5판 3선승',
}

export const ERR = {
  LOGIN_REQUIRED: '로그인이 필요합니다.',
  INVALID_USER_GROUP: '유효한 사용자/그룹이 필요합니다.',
  INVALID_USER_GROUP_MEETING: '유효한 사용자/그룹/모임이 필요합니다.',
} as const
