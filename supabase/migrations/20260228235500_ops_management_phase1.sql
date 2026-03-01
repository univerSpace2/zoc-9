create or replace function public.has_group_permission(p_group_id uuid, p_permission text)
returns boolean
language sql
stable
as $$
  with member as (
    select gm.role, gm.permissions
    from public.group_members gm
    where gm.group_id = p_group_id and gm.profile_id = auth.uid()
    limit 1
  )
  select case
    when not exists (select 1 from member) then false
    when (select role from member) = 'owner' then true
    else exists (
      select 1
      from unnest(coalesce((select permissions from member), array[]::text[])) as perm
      where perm = p_permission
    )
  end;
$$;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_group_member_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.group_members gm_me
    join public.group_members gm_target on gm_target.group_id = gm_me.group_id
    where gm_me.profile_id = auth.uid()
      and gm_target.profile_id = profiles.id
  )
);

alter table public.audit_logs drop constraint if exists audit_logs_entity_type_check;
alter table public.audit_logs
  add constraint audit_logs_entity_type_check
  check (entity_type in ('meeting', 'match', 'set', 'group', 'member', 'invite', 'venue', 'notice'));

create or replace function public.rpc_create_group(name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  v_name := btrim(name);

  if v_name is null or v_name = '' then
    raise exception '그룹 이름을 입력하세요.';
  end if;

  insert into public.groups (name, created_by)
  values (v_name, auth.uid())
  returning id into v_group_id;

  insert into public.group_members (group_id, profile_id, role, permissions)
  values (v_group_id, auth.uid(), 'owner', public.default_permissions_for_role('owner'));

  insert into public.group_permissions (group_id)
  values (v_group_id)
  on conflict (group_id) do nothing;

  return v_group_id;
end;
$$;

create or replace function public.rpc_update_group_name(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_name text;
  v_group public.groups;
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_name := btrim(payload ->> 'name');

  if v_group_id is null then
    raise exception '그룹이 필요합니다.';
  end if;

  if v_name is null or v_name = '' then
    raise exception '그룹 이름을 입력하세요.';
  end if;

  if public.group_role(v_group_id) <> 'owner' then
    raise exception '그룹 이름 변경 권한이 없습니다.';
  end if;

  select * into v_group from public.groups where id = v_group_id;

  update public.groups
  set name = v_name,
      updated_at = now()
  where id = v_group_id;

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
    'update_group_name',
    jsonb_build_object('name', v_group.name),
    jsonb_build_object('name', v_name),
    auth.uid()
  );

  return v_group_id;
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
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_target_profile_id := (payload ->> 'targetProfileId')::uuid;
  v_role := payload ->> 'role';

  if not public.has_group_permission(v_group_id, 'manage_members') then
    raise exception '멤버 관리 권한이 없습니다.';
  end if;

  if v_role not in ('admin', 'member') then
    raise exception 'owner 위임은 1차 범위에서 지원하지 않습니다.';
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

  update public.group_members
  set role = v_role,
      permissions = public.default_permissions_for_role(v_role)
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
    jsonb_build_object('role', v_member.role, 'permissions', v_member.permissions),
    jsonb_build_object('role', v_role, 'permissions', public.default_permissions_for_role(v_role)),
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
  v_allowed text[] := array[
    'manage_members',
    'manage_invites',
    'manage_venues',
    'manage_notices',
    'close_meeting',
    'edit_completed_records'
  ]::text[];
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

  select coalesce(array_agg(distinct value), array[]::text[])
    into v_permissions
  from jsonb_array_elements_text(coalesce(payload -> 'permissions', '[]'::jsonb)) as value
  where value = any(v_allowed);

  update public.group_members
  set permissions = v_permissions
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
    jsonb_build_object('permissions', v_member.permissions),
    jsonb_build_object('permissions', v_permissions),
    auth.uid()
  );

  return v_target_profile_id;
end;
$$;

create or replace function public.rpc_remove_group_member(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_target_profile_id uuid;
  v_member public.group_members;
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
    raise exception 'owner는 제거할 수 없습니다.';
  end if;

  delete from public.group_members where id = v_member.id;

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
    'remove_member',
    jsonb_build_object('profile_id', v_member.profile_id, 'role', v_member.role, 'permissions', v_member.permissions),
    '{}'::jsonb,
    auth.uid()
  );

  return v_target_profile_id;
end;
$$;

create or replace function public.rpc_cancel_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
begin
  select *
    into v_invite
  from public.invites i
  where i.id = rpc_cancel_invite.invite_id
  for update;

  if v_invite.id is null then
    raise exception '초대를 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_invite.group_id, 'manage_invites') then
    raise exception '초대 관리 권한이 없습니다.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception '대기중 초대만 취소할 수 있습니다.';
  end if;

  update public.invites
  set status = 'canceled'
  where id = v_invite.id;

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
    v_invite.group_id,
    'invite',
    v_invite.id,
    'cancel_invite',
    jsonb_build_object('status', v_invite.status),
    jsonb_build_object('status', 'canceled'),
    auth.uid()
  );

  return v_invite.id;
end;
$$;

create or replace function public.rpc_reissue_invite(invite_id uuid, expires_in_days int default 7)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_new_invite_id uuid;
  v_days int;
begin
  select *
    into v_invite
  from public.invites i
  where i.id = rpc_reissue_invite.invite_id
  for update;

  if v_invite.id is null then
    raise exception '초대를 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_invite.group_id, 'manage_invites') then
    raise exception '초대 관리 권한이 없습니다.';
  end if;

  v_days := greatest(coalesce(expires_in_days, 7), 1);

  if v_invite.status = 'pending' then
    update public.invites
    set status = 'canceled'
    where id = v_invite.id;
  end if;

  insert into public.invites (
    group_id,
    token,
    invited_email,
    role,
    status,
    expires_at,
    created_by
  )
  values (
    v_invite.group_id,
    encode(gen_random_bytes(12), 'hex'),
    v_invite.invited_email,
    v_invite.role,
    'pending',
    now() + make_interval(days => v_days),
    auth.uid()
  )
  returning id into v_new_invite_id;

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
    v_invite.group_id,
    'invite',
    v_invite.id,
    'reissue_invite',
    jsonb_build_object('status', v_invite.status, 'token', v_invite.token),
    jsonb_build_object('new_invite_id', v_new_invite_id),
    auth.uid()
  );

  return v_new_invite_id;
end;
$$;

create or replace function public.rpc_create_venue(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_name text;
  v_reservation_required boolean;
  v_reservation_url text;
  v_venue_id uuid;
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_name := btrim(payload ->> 'name');
  v_reservation_required := coalesce((payload ->> 'reservationRequired')::boolean, false);
  v_reservation_url := nullif(btrim(payload ->> 'reservationUrl'), '');

  if not public.has_group_permission(v_group_id, 'manage_venues') then
    raise exception '구장 관리 권한이 없습니다.';
  end if;

  if v_name is null or v_name = '' then
    raise exception '구장 이름을 입력하세요.';
  end if;

  insert into public.venues (
    group_id,
    name,
    reservation_required,
    reservation_url
  )
  values (
    v_group_id,
    v_name,
    v_reservation_required,
    v_reservation_url
  )
  returning id into v_venue_id;

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
    'venue',
    v_venue_id,
    'create_venue',
    '{}'::jsonb,
    jsonb_build_object('name', v_name, 'reservation_required', v_reservation_required, 'reservation_url', v_reservation_url),
    auth.uid()
  );

  return v_venue_id;
end;
$$;

create or replace function public.rpc_update_venue(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue_id uuid;
  v_venue public.venues;
  v_name text;
  v_reservation_required boolean;
  v_reservation_url text;
begin
  v_venue_id := (payload ->> 'venueId')::uuid;

  select *
    into v_venue
  from public.venues v
  where v.id = v_venue_id
  for update;

  if v_venue.id is null then
    raise exception '구장을 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_venue.group_id, 'manage_venues') then
    raise exception '구장 관리 권한이 없습니다.';
  end if;

  v_name := coalesce(nullif(btrim(payload ->> 'name'), ''), v_venue.name);
  v_reservation_required := coalesce((payload ->> 'reservationRequired')::boolean, v_venue.reservation_required);
  v_reservation_url := nullif(btrim(payload ->> 'reservationUrl'), '');

  update public.venues
  set name = v_name,
      reservation_required = v_reservation_required,
      reservation_url = v_reservation_url,
      updated_at = now()
  where id = v_venue.id;

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
    v_venue.group_id,
    'venue',
    v_venue.id,
    'update_venue',
    jsonb_build_object('name', v_venue.name, 'reservation_required', v_venue.reservation_required, 'reservation_url', v_venue.reservation_url),
    jsonb_build_object('name', v_name, 'reservation_required', v_reservation_required, 'reservation_url', v_reservation_url),
    auth.uid()
  );

  return v_venue.id;
end;
$$;

create or replace function public.rpc_delete_venue(venue_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue public.venues;
begin
  select *
    into v_venue
  from public.venues v
  where v.id = rpc_delete_venue.venue_id
  for update;

  if v_venue.id is null then
    raise exception '구장을 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_venue.group_id, 'manage_venues') then
    raise exception '구장 관리 권한이 없습니다.';
  end if;

  delete from public.venues where id = v_venue.id;

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
    v_venue.group_id,
    'venue',
    v_venue.id,
    'delete_venue',
    jsonb_build_object('name', v_venue.name, 'reservation_required', v_venue.reservation_required, 'reservation_url', v_venue.reservation_url),
    '{}'::jsonb,
    auth.uid()
  );

  return v_venue.id;
end;
$$;

create or replace function public.rpc_create_notice(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_title text;
  v_body text;
  v_notice_id uuid;
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_title := btrim(payload ->> 'title');
  v_body := btrim(payload ->> 'body');

  if not public.has_group_permission(v_group_id, 'manage_notices') then
    raise exception '공지 관리 권한이 없습니다.';
  end if;

  if v_title is null or v_title = '' then
    raise exception '공지 제목을 입력하세요.';
  end if;

  if v_body is null or v_body = '' then
    raise exception '공지 내용을 입력하세요.';
  end if;

  insert into public.notices (group_id, title, body, created_by)
  values (v_group_id, v_title, v_body, auth.uid())
  returning id into v_notice_id;

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
    'notice',
    v_notice_id,
    'create_notice',
    '{}'::jsonb,
    jsonb_build_object('title', v_title, 'body', v_body),
    auth.uid()
  );

  return v_notice_id;
end;
$$;

create or replace function public.rpc_update_notice(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notice_id uuid;
  v_notice public.notices;
  v_title text;
  v_body text;
begin
  v_notice_id := (payload ->> 'noticeId')::uuid;

  select *
    into v_notice
  from public.notices n
  where n.id = v_notice_id
  for update;

  if v_notice.id is null then
    raise exception '공지를 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_notice.group_id, 'manage_notices') then
    raise exception '공지 관리 권한이 없습니다.';
  end if;

  v_title := coalesce(nullif(btrim(payload ->> 'title'), ''), v_notice.title);
  v_body := coalesce(nullif(btrim(payload ->> 'body'), ''), v_notice.body);

  update public.notices
  set title = v_title,
      body = v_body,
      updated_at = now()
  where id = v_notice.id;

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
    v_notice.group_id,
    'notice',
    v_notice.id,
    'update_notice',
    jsonb_build_object('title', v_notice.title, 'body', v_notice.body),
    jsonb_build_object('title', v_title, 'body', v_body),
    auth.uid()
  );

  return v_notice.id;
end;
$$;

create or replace function public.rpc_delete_notice(notice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notice public.notices;
begin
  select *
    into v_notice
  from public.notices n
  where n.id = rpc_delete_notice.notice_id
  for update;

  if v_notice.id is null then
    raise exception '공지를 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_notice.group_id, 'manage_notices') then
    raise exception '공지 관리 권한이 없습니다.';
  end if;

  delete from public.notices where id = v_notice.id;

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
    v_notice.group_id,
    'notice',
    v_notice.id,
    'delete_notice',
    jsonb_build_object('title', v_notice.title, 'body', v_notice.body),
    '{}'::jsonb,
    auth.uid()
  );

  return v_notice.id;
end;
$$;

create or replace function public.rpc_get_invite_by_token(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_group_name text;
  v_inviter_name text;
  v_is_expired boolean;
begin
  select *
    into v_invite
  from public.invites i
  where i.token = invite_token
  limit 1;

  if v_invite.id is null then
    return null;
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at < now() then
    update public.invites
    set status = 'expired'
    where id = v_invite.id;

    select *
      into v_invite
    from public.invites i
    where i.id = v_invite.id;
  end if;

  select g.name into v_group_name
  from public.groups g
  where g.id = v_invite.group_id;

  select p.name into v_inviter_name
  from public.profiles p
  where p.id = v_invite.created_by;

  v_is_expired := v_invite.expires_at < now();

  return jsonb_build_object(
    'id', v_invite.id,
    'group_id', v_invite.group_id,
    'token', v_invite.token,
    'invited_email', v_invite.invited_email,
    'role', v_invite.role,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'created_by', v_invite.created_by,
    'created_at', v_invite.created_at,
    'group_name', coalesce(v_group_name, '알 수 없는 그룹'),
    'inviter_name', coalesce(v_inviter_name, '알 수 없음'),
    'is_expired', v_is_expired
  );
end;
$$;

create or replace function public.rpc_decline_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
begin
  select *
    into v_invite
  from public.invites i
  where i.token = invite_token
  for update;

  if v_invite.id is null then
    raise exception '초대를 찾을 수 없습니다.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception '이미 처리된 초대입니다.';
  end if;

  if v_invite.expires_at < now() then
    update public.invites
    set status = 'expired'
    where id = v_invite.id;
    raise exception '만료된 초대입니다.';
  end if;

  update public.invites
  set status = 'declined'
  where id = v_invite.id;

  return v_invite.id;
end;
$$;

create or replace function public.rpc_list_received_invites()
returns table (
  invite_id uuid,
  group_id uuid,
  token text,
  invited_email text,
  role text,
  status text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  group_name text,
  inviter_name text,
  is_expired boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();

  if v_email is null then
    return;
  end if;

  update public.invites
  set status = 'expired'
  where status = 'pending'
    and expires_at < now()
    and lower(coalesce(invited_email, '')) = lower(v_email);

  return query
  select
    i.id as invite_id,
    i.group_id,
    i.token,
    i.invited_email,
    i.role,
    i.status,
    i.expires_at,
    i.created_by,
    i.created_at,
    g.name as group_name,
    p.name as inviter_name,
    (i.expires_at < now()) as is_expired
  from public.invites i
  join public.groups g on g.id = i.group_id
  left join public.profiles p on p.id = i.created_by
  where lower(coalesce(i.invited_email, '')) = lower(v_email)
  order by i.created_at desc;
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
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_meeting_id := (payload ->> 'meetingId')::uuid;
  v_format := payload ->> 'format';
  v_team_size := (payload ->> 'teamSize')::int;
  v_target_score := coalesce((payload ->> 'targetScore')::int, 15);
  v_deuce := coalesce((payload ->> 'deuce')::boolean, true);
  v_penalty := payload ->> 'penaltyText';
  v_first_serving_team_index := coalesce((payload ->> 'firstServingTeamIndex')::int, 0);

  if not public.is_group_member(v_group_id) then
    raise exception '그룹 권한이 없습니다.';
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

grant execute on function public.rpc_create_group(text) to authenticated;
grant execute on function public.rpc_update_group_name(jsonb) to authenticated;
grant execute on function public.rpc_update_member_role(jsonb) to authenticated;
grant execute on function public.rpc_update_member_permissions(jsonb) to authenticated;
grant execute on function public.rpc_remove_group_member(jsonb) to authenticated;
grant execute on function public.rpc_cancel_invite(uuid) to authenticated;
grant execute on function public.rpc_reissue_invite(uuid, int) to authenticated;
grant execute on function public.rpc_create_venue(jsonb) to authenticated;
grant execute on function public.rpc_update_venue(jsonb) to authenticated;
grant execute on function public.rpc_delete_venue(uuid) to authenticated;
grant execute on function public.rpc_create_notice(jsonb) to authenticated;
grant execute on function public.rpc_update_notice(jsonb) to authenticated;
grant execute on function public.rpc_delete_notice(uuid) to authenticated;
grant execute on function public.rpc_list_received_invites() to authenticated;
grant execute on function public.rpc_get_invite_by_token(text) to anon, authenticated;
grant execute on function public.rpc_decline_invite(text) to anon, authenticated;
