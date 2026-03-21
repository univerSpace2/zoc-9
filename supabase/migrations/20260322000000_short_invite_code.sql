-- Generate a 5-character random uppercase alphabet invite code
create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select string_agg(chr(65 + floor(random() * 26)::int), '')
  from generate_series(1, 5);
$$;

-- Update rpc_accept_invite: keep invite as 'pending' so multiple users can join with the same code
create or replace function public.rpc_accept_invite(invite_token text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_invite public.invites;
  v_profile_id uuid;
begin
  v_profile_id := auth.uid();

  if v_profile_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into v_invite
  from public.invites
  where token = invite_token
  limit 1;

  if v_invite.id is null then
    raise exception '초대를 찾을 수 없습니다.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception '이미 처리된 초대입니다.';
  end if;

  if v_invite.expires_at < now() then
    update public.invites set status = 'expired' where id = v_invite.id;
    raise exception '만료된 초대입니다.';
  end if;

  insert into public.group_members (group_id, profile_id, role, permissions)
  values (v_invite.group_id, v_profile_id, v_invite.role, public.default_permissions_for_role(v_invite.role))
  on conflict (group_id, profile_id) do nothing;

  -- Do NOT change invite status to 'accepted' — keep it reusable until expiration

  return v_invite.group_id;
end;
$$;

-- Update rpc_reissue_invite to use short invite code
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
    public.generate_invite_code(),
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
