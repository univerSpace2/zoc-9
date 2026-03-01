import { describe, expect, it } from 'vitest'
import { resolveMemberPermissions } from '@/services/local-data'
import type { GroupMember } from '@/types/domain'

function makeMember(input: Partial<GroupMember>): GroupMember {
  return {
    id: 'gm-1',
    groupId: 'group-1',
    profileId: 'profile-1',
    role: 'member',
    permissions: [],
    permissionsOverride: false,
    ...input,
  }
}

describe('local-data permission resolution', () => {
  it('gives owner full permissions regardless of override flags', () => {
    const owner = makeMember({
      role: 'owner',
      permissions: [],
      permissionsOverride: true,
    })

    const resolved = resolveMemberPermissions(owner)

    expect(resolved).toEqual([
      'manage_members',
      'manage_invites',
      'manage_venues',
      'manage_notices',
      'close_meeting',
      'edit_completed_records',
    ])
  })

  it('uses member override permissions when override is enabled', () => {
    const member = makeMember({
      role: 'member',
      permissions: ['manage_invites'],
      permissionsOverride: true,
    })

    const resolved = resolveMemberPermissions(member)
    expect(resolved).toEqual(['manage_invites'])
  })

  it('resets to role template after role change with override disabled', () => {
    const updated = makeMember({
      role: 'admin',
      permissions: [],
      permissionsOverride: false,
    })

    const resolved = resolveMemberPermissions(updated)
    expect(resolved).toEqual([
      'manage_members',
      'manage_invites',
      'manage_venues',
      'manage_notices',
      'close_meeting',
      'edit_completed_records',
    ])
  })
})
