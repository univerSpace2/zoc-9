alter table public.group_members
  add column if not exists permissions_override boolean not null default false;

alter table public.matches
  add column if not exists referee_profile_id uuid references public.profiles (id) on delete set null;

with owner_rank as (
  select
    gm.id,
    row_number() over (partition by gm.group_id order by gm.created_at asc, gm.id asc) as rn
  from public.group_members gm
  where gm.role = 'owner'
)
update public.group_members gm
set role = 'admin',
    permissions = public.default_permissions_for_role('admin'),
    permissions_override = false
from owner_rank r
where gm.id = r.id
  and r.rn > 1;

create unique index if not exists uq_group_members_single_owner
  on public.group_members (group_id)
  where role = 'owner';

insert into public.group_permissions (group_id)
select g.id
from public.groups g
where not exists (
  select 1
  from public.group_permissions gp
  where gp.group_id = g.id
);

update public.group_permissions
set permissions = jsonb_build_object(
  'owner', to_jsonb(array[
    'manage_members',
    'manage_invites',
    'manage_venues',
    'manage_notices',
    'close_meeting',
    'edit_completed_records'
  ]::text[]),
  'admin',
    case
      when jsonb_typeof(permissions -> 'admin') = 'array' then permissions -> 'admin'
      else to_jsonb(array[
        'manage_members',
        'manage_invites',
        'manage_venues',
        'manage_notices',
        'close_meeting',
        'edit_completed_records'
      ]::text[])
    end,
  'member',
    case
      when jsonb_typeof(permissions -> 'member') = 'array' then permissions -> 'member'
      else '[]'::jsonb
    end
)
where jsonb_typeof(permissions) = 'object';

alter table public.group_permissions
  alter column permissions set default jsonb_build_object(
    'owner', to_jsonb(array[
      'manage_members',
      'manage_invites',
      'manage_venues',
      'manage_notices',
      'close_meeting',
      'edit_completed_records'
    ]::text[]),
    'admin', to_jsonb(array[
      'manage_members',
      'manage_invites',
      'manage_venues',
      'manage_notices',
      'close_meeting',
      'edit_completed_records'
    ]::text[]),
    'member', to_jsonb(array[]::text[])
  );

update public.group_members gm
set permissions_override = (
  gm.role <> 'owner'
  and gm.permissions is distinct from public.default_permissions_for_role(gm.role)
);

create or replace function public.normalize_permission_keys(p_permissions jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct value), array[]::text[])
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(p_permissions) = 'array' then p_permissions
      else '[]'::jsonb
    end
  ) as value
  where value = any(array[
    'manage_members',
    'manage_invites',
    'manage_venues',
    'manage_notices',
    'close_meeting',
    'edit_completed_records'
  ]::text[]);
$$;

create or replace function public.permission_template_for_role(p_group_id uuid, p_role text)
returns text[]
language plpgsql
stable
as $$
declare
  v_policy jsonb;
  v_template text[];
begin
  select permissions
    into v_policy
  from public.group_permissions
  where group_id = p_group_id;

  if v_policy is not null then
    v_template := public.normalize_permission_keys(v_policy -> p_role);
  end if;

  if v_template is null or cardinality(v_template) = 0 then
    v_template := public.default_permissions_for_role(p_role);
  end if;

  return v_template;
end;
$$;

create or replace function public.has_group_permission(p_group_id uuid, p_permission text)
returns boolean
language plpgsql
stable
as $$
declare
  v_member public.group_members;
  v_permissions text[];
begin
  if p_group_id is null or p_permission is null then
    return false;
  end if;

  select *
    into v_member
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.profile_id = auth.uid()
  limit 1;

  if v_member.id is null then
    return false;
  end if;

  if v_member.role = 'owner' then
    return true;
  end if;

  if coalesce(v_member.permissions_override, false) then
    return p_permission = any(coalesce(v_member.permissions, array[]::text[]));
  end if;

  v_permissions := public.permission_template_for_role(p_group_id, v_member.role);
  return p_permission = any(coalesce(v_permissions, array[]::text[]));
end;
$$;

create or replace function public.rpc_update_group_permission_policy(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_existing jsonb;
  v_admin text[];
  v_member text[];
  v_updated jsonb;
begin
  v_group_id := (payload ->> 'groupId')::uuid;

  if v_group_id is null then
    raise exception '그룹이 필요합니다.';
  end if;

  if public.group_role(v_group_id) <> 'owner' then
    raise exception '권한 정책 수정은 owner만 가능합니다.';
  end if;

  select permissions
    into v_existing
  from public.group_permissions
  where group_id = v_group_id
  for update;

  if v_existing is null then
    v_existing := jsonb_build_object(
      'owner', to_jsonb(public.default_permissions_for_role('owner')),
      'admin', to_jsonb(public.default_permissions_for_role('admin')),
      'member', to_jsonb(public.default_permissions_for_role('member'))
    );
  end if;

  v_admin := public.normalize_permission_keys(payload -> 'admin');
  v_member := public.normalize_permission_keys(payload -> 'member');

  v_updated := jsonb_build_object(
    'owner', to_jsonb(public.default_permissions_for_role('owner')),
    'admin', to_jsonb(v_admin),
    'member', to_jsonb(v_member)
  );

  update public.group_permissions
  set permissions = v_updated,
      updated_at = now()
  where group_id = v_group_id;

  update public.group_members gm
  set permissions = public.permission_template_for_role(v_group_id, gm.role)
  where gm.group_id = v_group_id
    and gm.role in ('admin', 'member')
    and coalesce(gm.permissions_override, false) = false;

  insert into public.audit_logs (
    group_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    actor_id
  )
  values (
    v_group_id,
    'group',
    v_group_id,
    'update_group_permission_policy',
    coalesce(v_existing, '{}'::jsonb),
    v_updated,
    auth.uid()
  );

  return v_group_id;
end;
$$;

create or replace function public.rpc_reset_member_permissions(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_target_profile_id uuid;
  v_member public.group_members;
  v_next_permissions text[];
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_target_profile_id := (payload ->> 'targetProfileId')::uuid;

  if not public.has_group_permission(v_group_id, 'manage_members') then
    raise exception '멤버 관리 권한이 없습니다.';
  end if;

  select *
    into v_member
  from public.group_members gm
  where gm.group_id = v_group_id
    and gm.profile_id = v_target_profile_id
  for update;

  if v_member.id is null then
    raise exception '대상 멤버를 찾을 수 없습니다.';
  end if;

  if v_member.role = 'owner' then
    raise exception 'owner 권한은 복원할 수 없습니다.';
  end if;

  v_next_permissions := public.permission_template_for_role(v_group_id, v_member.role);

  update public.group_members
  set permissions = v_next_permissions,
      permissions_override = false
  where id = v_member.id;

  insert into public.audit_logs (
    group_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    actor_id
  )
  values (
    v_group_id,
    'member',
    v_member.id,
    'reset_member_permissions',
    jsonb_build_object('permissions', v_member.permissions, 'permissions_override', v_member.permissions_override),
    jsonb_build_object('permissions', v_next_permissions, 'permissions_override', false),
    auth.uid()
  );

  return v_target_profile_id;
end;
$$;

create or replace function public.rpc_transfer_group_owner(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_target_profile_id uuid;
  v_current_owner public.group_members;
  v_target public.group_members;
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_target_profile_id := (payload ->> 'targetProfileId')::uuid;

  if v_group_id is null or v_target_profile_id is null then
    raise exception '필수값이 누락되었습니다.';
  end if;

  if public.group_role(v_group_id) <> 'owner' then
    raise exception 'owner만 위임할 수 있습니다.';
  end if;

  if v_target_profile_id = auth.uid() then
    raise exception '본인에게는 위임할 수 없습니다.';
  end if;

  select *
    into v_current_owner
  from public.group_members gm
  where gm.group_id = v_group_id
    and gm.profile_id = auth.uid()
  for update;

  select *
    into v_target
  from public.group_members gm
  where gm.group_id = v_group_id
    and gm.profile_id = v_target_profile_id
  for update;

  if v_target.id is null then
    raise exception '대상 멤버를 찾을 수 없습니다.';
  end if;

  if v_target.role = 'owner' then
    raise exception '이미 owner입니다.';
  end if;

  update public.group_members
  set role = 'admin',
      permissions = public.permission_template_for_role(v_group_id, 'admin'),
      permissions_override = false
  where id = v_current_owner.id;

  update public.group_members
  set role = 'owner',
      permissions = public.default_permissions_for_role('owner'),
      permissions_override = false
  where id = v_target.id;

  insert into public.audit_logs (
    group_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    actor_id
  )
  values (
    v_group_id,
    'group',
    v_group_id,
    'transfer_group_owner',
    jsonb_build_object('owner_profile_id', v_current_owner.profile_id),
    jsonb_build_object('owner_profile_id', v_target.profile_id, 'previous_owner_role', 'admin'),
    auth.uid()
  );

  return v_target.profile_id;
end;
$$;

create or replace function public.rpc_update_member_role(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_target_profile_id uuid;
  v_role text;
  v_member public.group_members;
  v_permissions text[];
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_target_profile_id := (payload ->> 'targetProfileId')::uuid;
  v_role := payload ->> 'role';

  if not public.has_group_permission(v_group_id, 'manage_members') then
    raise exception '멤버 관리 권한이 없습니다.';
  end if;

  if v_role not in ('admin', 'member') then
    raise exception 'owner 위임은 그룹 위임 기능을 사용하세요.';
  end if;

  select *
    into v_member
  from public.group_members gm
  where gm.group_id = v_group_id
    and gm.profile_id = v_target_profile_id
  for update;

  if v_member.id is null then
    raise exception '대상 멤버를 찾을 수 없습니다.';
  end if;

  if v_member.role = 'owner' then
    raise exception 'owner 역할 변경은 지원하지 않습니다.';
  end if;

  v_permissions := public.permission_template_for_role(v_group_id, v_role);

  update public.group_members
  set role = v_role,
      permissions = v_permissions,
      permissions_override = false
  where id = v_member.id;

  insert into public.audit_logs (
    group_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    actor_id
  )
  values (
    v_group_id,
    'member',
    v_member.id,
    'update_member_role',
    jsonb_build_object(
      'role', v_member.role,
      'permissions', v_member.permissions,
      'permissions_override', v_member.permissions_override
    ),
    jsonb_build_object(
      'role', v_role,
      'permissions', v_permissions,
      'permissions_override', false
    ),
    auth.uid()
  );

  return v_target_profile_id;
end;
$$;

create or replace function public.rpc_update_member_permissions(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_target_profile_id uuid;
  v_member public.group_members;
  v_permissions text[];
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_target_profile_id := (payload ->> 'targetProfileId')::uuid;

  if not public.has_group_permission(v_group_id, 'manage_members') then
    raise exception '멤버 관리 권한이 없습니다.';
  end if;

  select *
    into v_member
  from public.group_members gm
  where gm.group_id = v_group_id
    and gm.profile_id = v_target_profile_id
  for update;

  if v_member.id is null then
    raise exception '대상 멤버를 찾을 수 없습니다.';
  end if;

  if v_member.role = 'owner' then
    raise exception 'owner 권한은 수정할 수 없습니다.';
  end if;

  v_permissions := public.normalize_permission_keys(payload -> 'permissions');

  update public.group_members
  set permissions = v_permissions,
      permissions_override = true
  where id = v_member.id;

  insert into public.audit_logs (
    group_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    actor_id
  )
  values (
    v_group_id,
    'member',
    v_member.id,
    'update_member_permissions',
    jsonb_build_object('permissions', v_member.permissions, 'permissions_override', v_member.permissions_override),
    jsonb_build_object('permissions', v_permissions, 'permissions_override', true),
    auth.uid()
  );

  return v_target_profile_id;
end;
$$;

create or replace function public.rpc_create_match(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_meeting_id uuid;
  v_format text;
  v_team_size int;
  v_target_score int;
  v_deuce boolean;
  v_penalty text;
  v_first_serving_team_index int;
  v_match_id uuid;
  v_team_a_id uuid;
  v_team_b_id uuid;
  v_required int;
  v_set_count int;
  v_set_no int;
  v_starting uuid;
  v_pos int;
  v_player_id text;
  v_referee_profile_id uuid;
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_meeting_id := (payload ->> 'meetingId')::uuid;
  v_format := payload ->> 'format';
  v_team_size := (payload ->> 'teamSize')::int;
  v_target_score := coalesce((payload ->> 'targetScore')::int, 15);
  v_deuce := coalesce((payload ->> 'deuce')::boolean, true);
  v_penalty := payload ->> 'penaltyText';
  v_first_serving_team_index := coalesce((payload ->> 'firstServingTeamIndex')::int, 0);
  v_referee_profile_id := nullif(payload ->> 'refereeProfileId', '')::uuid;

  if not public.is_group_member(v_group_id) then
    raise exception '그룹 권한이 없습니다.';
  end if;

  if v_referee_profile_id is not null and not exists (
    select 1
    from public.group_members gm
    where gm.group_id = v_group_id
      and gm.profile_id = v_referee_profile_id
  ) then
    raise exception '심판은 그룹 멤버여야 합니다.';
  end if;

  v_required := case
    when v_format = 'single' then 1
    when v_format = 'best_of_3' then 2
    else 3
  end;

  v_set_count := case
    when v_format = 'single' then 1
    when v_format = 'best_of_3' then 3
    else 5
  end;

  insert into public.matches (
    group_id,
    meeting_id,
    format,
    status,
    team_size,
    target_score,
    deuce,
    penalty_text,
    required_set_wins,
    referee_profile_id,
    created_by
  )
  values (
    v_group_id,
    v_meeting_id,
    v_format,
    'in_progress',
    v_team_size,
    v_target_score,
    v_deuce,
    v_penalty,
    v_required,
    v_referee_profile_id,
    auth.uid()
  )
  returning id into v_match_id;

  insert into public.match_teams (match_id, name)
  values (v_match_id, coalesce(payload -> 'teams' -> 0 ->> 'name', 'A팀'))
  returning id into v_team_a_id;

  insert into public.match_teams (match_id, name)
  values (v_match_id, coalesce(payload -> 'teams' -> 1 ->> 'name', 'B팀'))
  returning id into v_team_b_id;

  v_pos := 1;
  for v_player_id in
    select value
    from jsonb_array_elements_text(coalesce(payload -> 'teams' -> 0 -> 'playerIds', '[]'::jsonb)) as value
  loop
    insert into public.match_players (match_id, team_id, profile_id, position_no)
    values (v_match_id, v_team_a_id, v_player_id::uuid, v_pos)
    on conflict (match_id, team_id, profile_id) do nothing;

    v_pos := v_pos + 1;
  end loop;

  v_pos := 1;
  for v_player_id in
    select value
    from jsonb_array_elements_text(coalesce(payload -> 'teams' -> 1 -> 'playerIds', '[]'::jsonb)) as value
  loop
    insert into public.match_players (match_id, team_id, profile_id, position_no)
    values (v_match_id, v_team_b_id, v_player_id::uuid, v_pos)
    on conflict (match_id, team_id, profile_id) do nothing;

    v_pos := v_pos + 1;
  end loop;

  v_starting := case when v_first_serving_team_index = 0 then v_team_a_id else v_team_b_id end;

  update public.matches
  set first_serving_team_id = v_starting,
      updated_at = now()
  where id = v_match_id;

  for v_set_no in 1..v_set_count loop
    insert into public.sets (
      match_id,
      set_no,
      status,
      team_a_id,
      team_b_id,
      initial_serving_team_id,
      serving_team_id,
      target_score,
      deuce,
      team_size,
      rotation_a,
      rotation_b
    )
    values (
      v_match_id,
      v_set_no,
      case when v_set_no = 1 then 'in_progress' else 'pending' end,
      v_team_a_id,
      v_team_b_id,
      v_starting,
      v_starting,
      v_target_score,
      v_deuce,
      v_team_size,
      case when v_starting = v_team_a_id then 1 else 0 end,
      case when v_starting = v_team_b_id then 1 else 0 end
    );

    v_starting := case when v_starting = v_team_a_id then v_team_b_id else v_team_a_id end;
  end loop;

  return v_match_id;
end;
$$;

create or replace function public.rpc_start_set(match_id uuid, set_no int, first_serving_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.sets;
  v_set_id uuid;
  v_next_starting uuid;
begin
  select *
    into v_set
  from public.sets s
  where s.match_id = rpc_start_set.match_id
    and s.set_no = rpc_start_set.set_no
  for update;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  if v_set.status in ('completed', 'ignored') then
    raise exception '시작할 수 없는 세트 상태입니다.';
  end if;

  if first_serving_team_id not in (v_set.team_a_id, v_set.team_b_id) then
    raise exception '유효하지 않은 시작 서브 팀입니다.';
  end if;

  update public.sets
  set status = 'in_progress',
      score_a = 0,
      score_b = 0,
      rotation_a = case when first_serving_team_id = team_a_id then 1 else 0 end,
      rotation_b = case when first_serving_team_id = team_b_id then 1 else 0 end,
      initial_serving_team_id = first_serving_team_id,
      serving_team_id = first_serving_team_id,
      winner_team_id = null,
      updated_at = now()
  where id = v_set.id
  returning id into v_set_id;

  v_next_starting := case when first_serving_team_id = v_set.team_a_id then v_set.team_b_id else v_set.team_a_id end;

  update public.sets
  set initial_serving_team_id = v_next_starting,
      serving_team_id = v_next_starting,
      rotation_a = case when v_next_starting = team_a_id then 1 else 0 end,
      rotation_b = case when v_next_starting = team_b_id then 1 else 0 end,
      updated_at = now()
  where id = (
    select s.id
    from public.sets s
    where s.match_id = v_set.match_id
      and s.set_no > v_set.set_no
      and s.status = 'pending'
    order by s.set_no
    limit 1
  );

  return v_set_id;
end;
$$;

create or replace function public.rpc_record_rally(
  set_id uuid,
  scoring_team_id uuid,
  client_event_id text,
  occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.sets;
  v_group_id uuid;
  v_meeting_status text;
  v_match_status text;
  v_score_a int;
  v_score_b int;
  v_serving_before uuid;
  v_serving_after uuid;
  v_rotation_a int;
  v_rotation_b int;
  v_rotation_team uuid;
  v_winner uuid;
  v_payload jsonb;
begin
  select *
    into v_set
  from public.sets s
  where s.id = rpc_record_rally.set_id
  for update;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  select m.group_id, m.status, mt.status
    into v_group_id, v_match_status, v_meeting_status
  from public.matches m
  join public.meetings mt on mt.id = m.meeting_id
  where m.id = v_set.match_id;

  if v_meeting_status = 'completed' then
    raise exception '완료된 모임에서는 득점을 기록할 수 없습니다.';
  end if;

  if v_match_status = 'completed' then
    raise exception '완료된 매치에서는 득점을 기록할 수 없습니다.';
  end if;

  if exists (select 1 from public.set_events e where e.client_event_id = rpc_record_rally.client_event_id) then
    select jsonb_build_object(
      'set_id', v_set.id,
      'status', v_set.status,
      'score_a', v_set.score_a,
      'score_b', v_set.score_b,
      'serving_team_id', v_set.serving_team_id,
      'winner_team_id', v_set.winner_team_id
    ) into v_payload;

    return v_payload;
  end if;

  if v_set.status = 'pending' then
    update public.sets
    set status = 'in_progress',
        score_a = 0,
        score_b = 0,
        rotation_a = case when initial_serving_team_id = team_a_id then 1 else 0 end,
        rotation_b = case when initial_serving_team_id = team_b_id then 1 else 0 end,
        serving_team_id = initial_serving_team_id,
        updated_at = now()
    where id = v_set.id
    returning * into v_set;
  end if;

  if v_set.status <> 'in_progress' then
    raise exception '진행 중인 세트가 아닙니다.';
  end if;

  v_serving_before := v_set.serving_team_id;
  v_serving_after := v_set.serving_team_id;
  v_rotation_a := v_set.rotation_a;
  v_rotation_b := v_set.rotation_b;
  v_rotation_team := null;

  v_score_a := v_set.score_a;
  v_score_b := v_set.score_b;

  if scoring_team_id = v_set.team_a_id then
    v_score_a := v_score_a + 1;
  elsif scoring_team_id = v_set.team_b_id then
    v_score_b := v_score_b + 1;
  else
    raise exception '해당 세트의 팀이 아닙니다.';
  end if;

  if v_serving_before <> scoring_team_id then
    v_serving_after := scoring_team_id;
    v_rotation_team := scoring_team_id;

    if scoring_team_id = v_set.team_a_id then
      v_rotation_a := case when v_rotation_a = 0 then 1 else (v_rotation_a % v_set.team_size) + 1 end;
    else
      v_rotation_b := case when v_rotation_b = 0 then 1 else (v_rotation_b % v_set.team_size) + 1 end;
    end if;
  end if;

  v_winner := null;

  if not v_set.deuce then
    if v_score_a >= v_set.target_score then
      v_winner := v_set.team_a_id;
    elsif v_score_b >= v_set.target_score then
      v_winner := v_set.team_b_id;
    end if;
  else
    if v_score_a >= v_set.target_score and v_score_a - v_score_b >= 2 then
      v_winner := v_set.team_a_id;
    elsif v_score_b >= v_set.target_score and v_score_b - v_score_a >= 2 then
      v_winner := v_set.team_b_id;
    end if;
  end if;

  update public.sets
  set score_a = v_score_a,
      score_b = v_score_b,
      serving_team_id = v_serving_after,
      rotation_a = v_rotation_a,
      rotation_b = v_rotation_b,
      status = case when v_winner is not null then 'completed' else status end,
      winner_team_id = v_winner,
      updated_at = now()
  where id = v_set.id
  returning * into v_set;

  insert into public.set_events (
    set_id,
    match_id,
    group_id,
    client_event_id,
    scoring_team_id,
    serving_team_id_before,
    serving_team_id_after,
    rotation_applied_to_team_id,
    score_a_after,
    score_b_after,
    occurred_at,
    created_by
  )
  values (
    v_set.id,
    v_set.match_id,
    v_group_id,
    client_event_id,
    scoring_team_id,
    v_serving_before,
    v_serving_after,
    v_rotation_team,
    v_score_a,
    v_score_b,
    occurred_at,
    auth.uid()
  );

  if v_winner is not null then
    perform public.sync_match_state(v_set.match_id);
  end if;

  select jsonb_build_object(
    'set_id', v_set.id,
    'status', v_set.status,
    'score_a', v_set.score_a,
    'score_b', v_set.score_b,
    'serving_team_id', v_set.serving_team_id,
    'winner_team_id', v_set.winner_team_id
  ) into v_payload;

  return v_payload;
end;
$$;

grant execute on function public.normalize_permission_keys(jsonb) to authenticated;
grant execute on function public.permission_template_for_role(uuid, text) to authenticated;
grant execute on function public.rpc_update_group_permission_policy(jsonb) to authenticated;
grant execute on function public.rpc_reset_member_permissions(jsonb) to authenticated;
grant execute on function public.rpc_transfer_group_owner(jsonb) to authenticated;
