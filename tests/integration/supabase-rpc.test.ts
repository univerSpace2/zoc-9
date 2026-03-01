import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type TestUser = {
  id: string
  email: string
  password: string
  client: SupabaseClient
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.API_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY
const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY)
const adminClient = hasEnv ? createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!) : null

const describeIfEnv = hasEnv ? describe : describe.skip

describeIfEnv('supabase rpc/rls integration', () => {
  const createdUserIds: string[] = []

  function getAdminClient(): SupabaseClient {
    if (!adminClient) {
      throw new Error('integration environment is not configured')
    }

    return adminClient
  }

  async function createAuthedUser(label: string): Promise<TestUser> {
    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    const password = 'Password123!'

    const { data, error } = await getAdminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: label,
        phone: '01012341234',
      },
    })

    if (error || !data.user) {
      throw new Error(error?.message ?? 'failed to create test user')
    }

    createdUserIds.push(data.user.id)

    const { error: profileError } = await getAdminClient().from('profiles').upsert({
      id: data.user.id,
      email,
      name: label,
      phone: '01012341234',
      bank_account: null,
    })

    if (profileError) {
      throw new Error(profileError.message)
    }

    const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })

    if (signInError) {
      throw new Error(signInError.message)
    }

    return {
      id: data.user.id,
      email,
      password,
      client,
    }
  }

  async function createGroupByOwner(owner: TestUser): Promise<string> {
    const { data, error } = await owner.client.rpc('rpc_create_group', {
      name: `group-${Date.now()}`,
    })

    if (error || !data) {
      throw new Error(error?.message ?? 'failed to create group')
    }

    return String(data)
  }

  async function inviteAndAccept(owner: TestUser, target: TestUser, groupId: string, role: 'member' | 'admin' = 'member') {
    const token = `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const { error: inviteError } = await owner.client.from('invites').insert({
      group_id: groupId,
      token,
      invited_email: target.email,
      role,
      status: 'pending',
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: owner.id,
    })

    if (inviteError) {
      throw new Error(inviteError.message)
    }

    const { error: acceptError } = await target.client.rpc('rpc_accept_invite', {
      invite_token: token,
    })

    if (acceptError) {
      throw new Error(acceptError.message)
    }
  }

  beforeAll(async () => {
    const { error } = await getAdminClient().from('audit_logs').select('id').limit(1)
    if (error) {
      throw new Error(`supabase is not ready for integration test: ${error.message}`)
    }
  }, 60_000)

  afterAll(async () => {
    for (const userId of createdUserIds) {
      await getAdminClient().auth.admin.deleteUser(userId)
    }
  })

  it('rejects unauthorized member role update and writes audit log on authorized update', async () => {
    const owner = await createAuthedUser('owner')
    const member = await createAuthedUser('member')
    const groupId = await createGroupByOwner(owner)

    await inviteAndAccept(owner, member, groupId, 'member')

    const denied = await member.client.rpc('rpc_update_member_role', {
      payload: {
        groupId,
        targetProfileId: member.id,
        role: 'admin',
      },
    })

    expect(denied.error).toBeTruthy()

    const allowed = await owner.client.rpc('rpc_update_member_role', {
      payload: {
        groupId,
        targetProfileId: member.id,
        role: 'admin',
      },
    })

    expect(allowed.error).toBeNull()

    const { data: logs, error: logError } = await owner.client
      .from('audit_logs')
      .select('id, action')
      .eq('group_id', groupId)
      .eq('action', 'update_member_role')

    expect(logError).toBeNull()
    expect((logs ?? []).length).toBeGreaterThan(0)
  }, 60_000)

  it('transfers owner role and blocks self-transfer', async () => {
    const owner = await createAuthedUser('owner-transfer')
    const target = await createAuthedUser('target-transfer')
    const groupId = await createGroupByOwner(owner)

    await inviteAndAccept(owner, target, groupId, 'member')

    const selfTransfer = await owner.client.rpc('rpc_transfer_group_owner', {
      payload: {
        groupId,
        targetProfileId: owner.id,
      },
    })

    expect(selfTransfer.error).toBeTruthy()

    const success = await owner.client.rpc('rpc_transfer_group_owner', {
      payload: {
        groupId,
        targetProfileId: target.id,
      },
    })

    expect(success.error).toBeNull()

    const { data: members, error } = await owner.client
      .from('group_members')
      .select('profile_id, role')
      .eq('group_id', groupId)

    expect(error).toBeNull()

    const ownerRow = (members ?? []).find((row) => String(row.profile_id) === target.id)
    const prevOwnerRow = (members ?? []).find((row) => String(row.profile_id) === owner.id)

    expect(ownerRow?.role).toBe('owner')
    expect(prevOwnerRow?.role).toBe('admin')
  }, 60_000)

  it('blocks tie score on completed record edit and enforces group-level RLS isolation', async () => {
    const owner = await createAuthedUser('owner-edit')
    const memberA = await createAuthedUser('member-a')
    const memberB = await createAuthedUser('member-b')
    const memberC = await createAuthedUser('member-c')
    const outsider = await createAuthedUser('outsider')

    const groupId = await createGroupByOwner(owner)
    const outsiderGroupId = await createGroupByOwner(outsider)

    await inviteAndAccept(owner, memberA, groupId)
    await inviteAndAccept(owner, memberB, groupId)
    await inviteAndAccept(owner, memberC, groupId)

    const { data: meetingRow, error: meetingError } = await owner.client
      .from('meetings')
      .insert({
        group_id: groupId,
        title: 'integration-meeting',
        date: '2026-02-28',
        start_time: '19:00',
        status: 'in_progress',
        created_by: owner.id,
      })
      .select('id')
      .single()

    if (meetingError || !meetingRow) {
      throw new Error(meetingError?.message ?? 'failed to create meeting')
    }

    const { data: matchId, error: matchError } = await owner.client.rpc('rpc_create_match', {
      payload: {
        groupId,
        meetingId: meetingRow.id,
        format: 'best_of_3',
        teamSize: 2,
        targetScore: 5,
        deuce: true,
        firstServingTeamIndex: 0,
        teams: [
          {
            name: 'A팀',
            playerIds: [owner.id, memberA.id],
          },
          {
            name: 'B팀',
            playerIds: [memberB.id, memberC.id],
          },
        ],
      },
    })

    if (matchError || !matchId) {
      throw new Error(matchError?.message ?? 'failed to create match')
    }

    const { data: setRow, error: setError } = await owner.client
      .from('sets')
      .select('id')
      .eq('match_id', String(matchId))
      .eq('set_no', 1)
      .single()

    if (setError || !setRow) {
      throw new Error(setError?.message ?? 'failed to find set')
    }

    const tieEdit = await owner.client.rpc('rpc_edit_completed_record', {
      payload: {
        entity_type: 'set',
        entity_id: setRow.id,
        score: {
          teamA: 5,
          teamB: 5,
        },
      },
    })

    expect(tieEdit.error).toBeTruthy()

    const outsiderRead = await owner.client
      .from('groups')
      .select('id')
      .eq('id', outsiderGroupId)

    expect(outsiderRead.error).toBeNull()
    expect((outsiderRead.data ?? []).length).toBe(0)
  }, 60_000)

  it('validates rpc_start_set position assignments on set 2 and persists set snapshots', async () => {
    const owner = await createAuthedUser('owner-start-set')
    const memberA = await createAuthedUser('member-start-a')
    const memberB = await createAuthedUser('member-start-b')
    const memberC = await createAuthedUser('member-start-c')

    const groupId = await createGroupByOwner(owner)
    await inviteAndAccept(owner, memberA, groupId)
    await inviteAndAccept(owner, memberB, groupId)
    await inviteAndAccept(owner, memberC, groupId)

    const { data: meetingRow, error: meetingError } = await owner.client
      .from('meetings')
      .insert({
        group_id: groupId,
        title: 'integration-start-set',
        date: '2026-03-01',
        start_time: '20:00',
        status: 'in_progress',
        created_by: owner.id,
      })
      .select('id')
      .single()

    if (meetingError || !meetingRow) {
      throw new Error(meetingError?.message ?? 'failed to create meeting')
    }

    const { data: matchId, error: matchError } = await owner.client.rpc('rpc_create_match', {
      payload: {
        groupId,
        meetingId: meetingRow.id,
        format: 'best_of_3',
        teamSize: 2,
        targetScore: 5,
        deuce: false,
        firstServingTeamIndex: 0,
        teams: [
          {
            name: 'A팀',
            playerIds: [owner.id, memberA.id],
          },
          {
            name: 'B팀',
            playerIds: [memberB.id, memberC.id],
          },
        ],
      },
    })

    if (matchError || !matchId) {
      throw new Error(matchError?.message ?? 'failed to create match')
    }

    const { data: setRows, error: setRowsError } = await owner.client
      .from('sets')
      .select('id, set_no, status, team_a_id, team_b_id')
      .eq('match_id', String(matchId))
      .order('set_no', { ascending: true })

    if (setRowsError || !setRows || setRows.length < 2) {
      throw new Error(setRowsError?.message ?? 'failed to fetch sets')
    }

    const set1 = setRows.find((row) => Number(row.set_no) === 1)
    const set2 = setRows.find((row) => Number(row.set_no) === 2)
    if (!set1 || !set2) {
      throw new Error('required sets were not created')
    }

    for (let index = 0; index < 5; index += 1) {
      const rally = await owner.client.rpc('rpc_record_rally', {
        set_id: String(set1.id),
        scoring_team_id: String(set1.team_a_id),
        client_event_id: `rpc-start-${Date.now()}-${index}`,
        occurred_at: new Date(Date.now() + index).toISOString(),
      })

      expect(rally.error).toBeNull()
    }

    const { data: set1After, error: set1AfterError } = await owner.client
      .from('sets')
      .select('status')
      .eq('id', String(set1.id))
      .single()

    expect(set1AfterError).toBeNull()
    expect(set1After?.status).toBe('completed')

    const missingAssignments = await owner.client.rpc('rpc_start_set', {
      match_id: String(matchId),
      set_no: 2,
      first_serving_team_id: String(set2.team_a_id),
      position_assignments: null,
    })

    expect(missingAssignments.error).toBeTruthy()

    const invalidAssignments = await owner.client.rpc('rpc_start_set', {
      match_id: String(matchId),
      set_no: 2,
      first_serving_team_id: String(set2.team_a_id),
      position_assignments: {
        teamA: [
          { profileId: owner.id, positionNo: 1 },
          { profileId: memberA.id, positionNo: 1 },
        ],
        teamB: [
          { profileId: memberB.id, positionNo: 1 },
          { profileId: memberC.id, positionNo: 2 },
        ],
      },
    })

    expect(invalidAssignments.error).toBeTruthy()

    const { data: playerRows, error: playerRowsError } = await owner.client
      .from('match_players')
      .select('team_id, profile_id, position_no')
      .eq('match_id', String(matchId))

    if (playerRowsError || !playerRows) {
      throw new Error(playerRowsError?.message ?? 'failed to fetch players')
    }

    const validAssignments = {
      teamA: playerRows
        .filter((row) => String(row.team_id) === String(set2.team_a_id))
        .sort((left, right) => Number(left.position_no) - Number(right.position_no))
        .map((row) => ({ profileId: String(row.profile_id), positionNo: Number(row.position_no) })),
      teamB: playerRows
        .filter((row) => String(row.team_id) === String(set2.team_b_id))
        .sort((left, right) => Number(left.position_no) - Number(right.position_no))
        .map((row) => ({ profileId: String(row.profile_id), positionNo: Number(row.position_no) })),
    }

    const started = await owner.client.rpc('rpc_start_set', {
      match_id: String(matchId),
      set_no: 2,
      first_serving_team_id: String(set2.team_b_id),
      position_assignments: validAssignments,
    })

    expect(started.error).toBeNull()

    const { data: set2After, error: set2AfterError } = await owner.client
      .from('sets')
      .select('status, initial_serving_team_id')
      .eq('id', String(set2.id))
      .single()

    expect(set2AfterError).toBeNull()
    expect(set2After?.status).toBe('in_progress')
    expect(String(set2After?.initial_serving_team_id)).toBe(String(set2.team_b_id))

    const { data: set2Snapshots, error: snapshotError } = await owner.client
      .from('set_positions')
      .select('team_id, profile_id, position_no')
      .eq('set_id', String(set2.id))

    expect(snapshotError).toBeNull()
    expect((set2Snapshots ?? []).length).toBe(4)
  }, 60_000)
})
