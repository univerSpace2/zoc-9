create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  name text not null,
  phone text not null,
  bank_account text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);

create table if not exists public.group_permissions (
  group_id uuid primary key references public.groups (id) on delete cascade,
  permissions jsonb not null default '{
    "manage_members": true,
    "manage_invites": true,
    "manage_venues": true,
    "manage_notices": true,
    "close_meeting": true,
    "edit_completed_records": true
  }'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  token text not null unique,
  invited_email text,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null check (status in ('pending', 'accepted', 'expired', 'declined', 'canceled')) default 'pending',
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  reservation_required boolean not null default false,
  reservation_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  venue_id uuid references public.venues (id) on delete set null,
  title text not null,
  date date not null,
  start_time time not null,
  status text not null check (status in ('scheduled', 'in_progress', 'completed')) default 'scheduled',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (meeting_id, profile_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  format text not null check (format in ('single', 'best_of_3', 'best_of_5')),
  status text not null check (status in ('planned', 'in_progress', 'completed')) default 'planned',
  team_size int not null check (team_size in (2, 3, 4)),
  target_score int not null default 15 check (target_score > 0),
  deuce boolean not null default true,
  penalty_text text,
  required_set_wins int not null,
  first_serving_team_id uuid,
  winner_team_id uuid,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.match_teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  position_no int not null check (position_no >= 1),
  created_at timestamptz not null default now(),
  unique (match_id, team_id, profile_id)
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  set_no int not null check (set_no > 0),
  status text not null check (status in ('pending', 'in_progress', 'completed', 'ignored')) default 'pending',
  team_a_id uuid not null references public.match_teams (id),
  team_b_id uuid not null references public.match_teams (id),
  initial_serving_team_id uuid not null references public.match_teams (id),
  serving_team_id uuid not null references public.match_teams (id),
  target_score int not null default 15,
  deuce boolean not null default true,
  team_size int not null check (team_size in (2, 3, 4)),
  score_a int not null default 0,
  score_b int not null default 0,
  rotation_a int not null default 1,
  rotation_b int not null default 1,
  winner_team_id uuid references public.match_teams (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, set_no)
);

create table if not exists public.set_events (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  client_event_id text not null unique,
  scoring_team_id uuid not null references public.match_teams (id),
  serving_team_id_before uuid not null references public.match_teams (id),
  serving_team_id_after uuid not null references public.match_teams (id),
  rotation_applied_to_team_id uuid references public.match_teams (id),
  score_a_after int not null,
  score_b_after int not null,
  occurred_at timestamptz not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  entity_type text not null check (entity_type in ('meeting', 'match', 'set')),
  entity_id uuid not null,
  action text not null,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_group_members_group on public.group_members (group_id);
create index if not exists idx_group_members_profile on public.group_members (profile_id);
create index if not exists idx_meetings_group on public.meetings (group_id, status);
create index if not exists idx_matches_meeting on public.matches (meeting_id, status);
create index if not exists idx_sets_match on public.sets (match_id, set_no);
create index if not exists idx_set_events_set on public.set_events (set_id, occurred_at);
create index if not exists idx_audit_logs_group on public.audit_logs (group_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_groups_updated_at on public.groups;
create trigger trg_groups_updated_at before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_venues_updated_at on public.venues;
create trigger trg_venues_updated_at before update on public.venues
for each row execute function public.set_updated_at();

drop trigger if exists trg_meetings_updated_at on public.meetings;
create trigger trg_meetings_updated_at before update on public.meetings
for each row execute function public.set_updated_at();

drop trigger if exists trg_matches_updated_at on public.matches;
create trigger trg_matches_updated_at before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists trg_sets_updated_at on public.sets;
create trigger trg_sets_updated_at before update on public.sets
for each row execute function public.set_updated_at();

drop trigger if exists trg_notices_updated_at on public.notices;
create trigger trg_notices_updated_at before update on public.notices
for each row execute function public.set_updated_at();

create or replace function public.default_permissions_for_role(p_role text)
returns text[]
language sql
immutable
as $$
  select case
    when p_role = 'owner' then array['manage_members','manage_invites','manage_venues','manage_notices','close_meeting','edit_completed_records']::text[]
    when p_role = 'admin' then array['manage_members','manage_invites','manage_venues','manage_notices','close_meeting','edit_completed_records']::text[]
    else array[]::text[]
  end;
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id = auth.uid()
  );
$$;

create or replace function public.group_role(p_group_id uuid)
returns text
language sql
stable
as $$
  select gm.role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.profile_id = auth.uid()
  limit 1;
$$;

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
    when (select role from member) = 'admin' then true
    else exists (
      select 1
      from unnest(coalesce((select permissions from member), array[]::text[])) as perm
      where perm = p_permission
    )
  end;
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_permissions enable row level security;
alter table public.invites enable row level security;
alter table public.venues enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.matches enable row level security;
alter table public.match_teams enable row level security;
alter table public.match_players enable row level security;
alter table public.sets enable row level security;
alter table public.set_events enable row level security;
alter table public.notices enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid());

drop policy if exists groups_member_select on public.groups;
create policy groups_member_select on public.groups for select using (public.is_group_member(id));

drop policy if exists groups_owner_modify on public.groups;
create policy groups_owner_modify on public.groups for all using (public.group_role(id) = 'owner') with check (public.group_role(id) = 'owner');

drop policy if exists group_members_member_select on public.group_members;
create policy group_members_member_select on public.group_members for select using (public.is_group_member(group_id));

drop policy if exists group_members_manage on public.group_members;
create policy group_members_manage on public.group_members for all using (public.has_group_permission(group_id, 'manage_members')) with check (public.has_group_permission(group_id, 'manage_members'));

drop policy if exists group_permissions_member_select on public.group_permissions;
create policy group_permissions_member_select on public.group_permissions for select using (public.is_group_member(group_id));

drop policy if exists group_permissions_owner_modify on public.group_permissions;
create policy group_permissions_owner_modify on public.group_permissions for all using (public.group_role(group_id) = 'owner') with check (public.group_role(group_id) = 'owner');

drop policy if exists invites_member_select on public.invites;
create policy invites_member_select on public.invites for select using (public.is_group_member(group_id));

drop policy if exists invites_manage on public.invites;
create policy invites_manage on public.invites for all using (public.has_group_permission(group_id, 'manage_invites')) with check (public.has_group_permission(group_id, 'manage_invites'));

drop policy if exists venues_member_select on public.venues;
create policy venues_member_select on public.venues for select using (public.is_group_member(group_id));

drop policy if exists venues_manage on public.venues;
create policy venues_manage on public.venues for all using (public.has_group_permission(group_id, 'manage_venues')) with check (public.has_group_permission(group_id, 'manage_venues'));

drop policy if exists meetings_member_select on public.meetings;
create policy meetings_member_select on public.meetings for select using (public.is_group_member(group_id));

drop policy if exists meetings_manage on public.meetings;
create policy meetings_manage on public.meetings for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists meeting_participants_member_select on public.meeting_participants;
create policy meeting_participants_member_select on public.meeting_participants for select using (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.is_group_member(m.group_id))
);

drop policy if exists meeting_participants_manage on public.meeting_participants;
create policy meeting_participants_manage on public.meeting_participants for all using (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.is_group_member(m.group_id))
) with check (
  exists (select 1 from public.meetings m where m.id = meeting_id and public.is_group_member(m.group_id))
);

drop policy if exists matches_member_select on public.matches;
create policy matches_member_select on public.matches for select using (public.is_group_member(group_id));

drop policy if exists matches_manage on public.matches;
create policy matches_manage on public.matches for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists match_teams_member_select on public.match_teams;
create policy match_teams_member_select on public.match_teams for select using (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
);

drop policy if exists match_teams_manage on public.match_teams;
create policy match_teams_manage on public.match_teams for all using (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
) with check (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
);

drop policy if exists match_players_member_select on public.match_players;
create policy match_players_member_select on public.match_players for select using (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
);

drop policy if exists match_players_manage on public.match_players;
create policy match_players_manage on public.match_players for all using (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
) with check (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
);

drop policy if exists sets_member_select on public.sets;
create policy sets_member_select on public.sets for select using (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
);

drop policy if exists sets_manage on public.sets;
create policy sets_manage on public.sets for all using (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
) with check (
  exists (select 1 from public.matches m where m.id = match_id and public.is_group_member(m.group_id))
);

drop policy if exists set_events_member_select on public.set_events;
create policy set_events_member_select on public.set_events for select using (public.is_group_member(group_id));

drop policy if exists set_events_manage on public.set_events;
create policy set_events_manage on public.set_events for all using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists notices_member_select on public.notices;
create policy notices_member_select on public.notices for select using (public.is_group_member(group_id));

drop policy if exists notices_manage on public.notices;
create policy notices_manage on public.notices for all using (public.has_group_permission(group_id, 'manage_notices')) with check (public.has_group_permission(group_id, 'manage_notices'));

drop policy if exists audit_logs_member_select on public.audit_logs;
create policy audit_logs_member_select on public.audit_logs for select using (public.is_group_member(group_id));

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert with check (public.is_group_member(group_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, name, phone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), coalesce(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_match_state(p_match_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_required int;
  v_winner uuid;
begin
  select required_set_wins into v_required
  from public.matches
  where id = p_match_id;

  select s.winner_team_id
  into v_winner
  from public.sets s
  where s.match_id = p_match_id
    and s.status = 'completed'
    and s.winner_team_id is not null
  group by s.winner_team_id
  having count(*) >= v_required
  limit 1;

  if v_winner is not null then
    update public.matches
    set status = 'completed',
        winner_team_id = v_winner,
        updated_at = now()
    where id = p_match_id;

    update public.sets
    set status = 'ignored',
        updated_at = now()
    where match_id = p_match_id
      and status = 'pending';
  else
    if not exists (select 1 from public.sets where match_id = p_match_id and status = 'in_progress') then
      update public.sets
      set status = 'in_progress',
          score_a = 0,
          score_b = 0,
          rotation_a = 1,
          rotation_b = 1,
          serving_team_id = initial_serving_team_id,
          updated_at = now()
      where id = (
        select s.id
        from public.sets s
        where s.match_id = p_match_id
          and s.status = 'pending'
        order by s.set_no
        limit 1
      );
    end if;
  end if;
end;
$$;

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

  update public.invites
  set status = 'accepted'
  where id = v_invite.id;

  return v_invite.group_id;
end;
$$;

create or replace function public.rpc_create_match(payload jsonb)
returns uuid
language plpgsql
security definer
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
      team_size
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
      v_team_size
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
as $$
declare
  v_set_id uuid;
begin
  update public.sets
  set status = 'in_progress',
      score_a = 0,
      score_b = 0,
      rotation_a = 1,
      rotation_b = 1,
      initial_serving_team_id = first_serving_team_id,
      serving_team_id = first_serving_team_id,
      winner_team_id = null,
      updated_at = now()
  where public.sets.match_id = rpc_start_set.match_id
    and public.sets.set_no = rpc_start_set.set_no
  returning id into v_set_id;

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
as $$
declare
  v_set public.sets;
  v_match public.matches;
  v_group_id uuid;
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

  select group_id into v_group_id
  from public.matches
  where id = v_set.match_id;

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
        rotation_a = 1,
        rotation_b = 1,
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
      v_rotation_a := (v_rotation_a % v_set.team_size) + 1;
    else
      v_rotation_b := (v_rotation_b % v_set.team_size) + 1;
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

  perform public.sync_match_state(v_set.match_id);

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

create or replace function public.rpc_finalize_set(set_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_set public.sets;
begin
  update public.sets
  set status = 'completed',
      updated_at = now()
  where id = rpc_finalize_set.set_id
  returning * into v_set;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  perform public.sync_match_state(v_set.match_id);

  return v_set.id;
end;
$$;

create or replace function public.rpc_finalize_match(match_id uuid)
returns uuid
language plpgsql
security definer
as $$
begin
  perform public.sync_match_state(match_id);

  update public.matches
  set status = 'completed',
      updated_at = now()
  where id = match_id;

  return match_id;
end;
$$;

create or replace function public.rpc_complete_meeting(meeting_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id from public.meetings where id = meeting_id;

  if v_group_id is null then
    raise exception '모임을 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_group_id, 'close_meeting') then
    raise exception '모임 완료 권한이 없습니다.';
  end if;

  update public.meetings
  set status = 'completed',
      updated_at = now()
  where id = meeting_id;

  return meeting_id;
end;
$$;

create or replace function public.rpc_edit_completed_record(payload jsonb)
returns uuid
language plpgsql
security definer
as $$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_set public.sets;
  v_group_id uuid;
  v_score_a int;
  v_score_b int;
  v_winner uuid;
begin
  v_entity_type := payload ->> 'entity_type';
  v_entity_id := (payload ->> 'entity_id')::uuid;

  if v_entity_type <> 'set' then
    raise exception 'v1에서는 set 수정만 지원합니다.';
  end if;

  select *
    into v_set
  from public.sets s
  where s.id = v_entity_id;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  select m.group_id
    into v_group_id
  from public.matches m
  where m.id = v_set.match_id;

  if not public.has_group_permission(v_group_id, 'edit_completed_records') then
    raise exception '완료 기록 수정 권한이 없습니다.';
  end if;

  v_score_a := coalesce((payload -> 'score' ->> 'teamA')::int, v_set.score_a);
  v_score_b := coalesce((payload -> 'score' ->> 'teamB')::int, v_set.score_b);

  v_winner := case
    when v_score_a > v_score_b then v_set.team_a_id
    when v_score_b > v_score_a then v_set.team_b_id
    else null
  end;

  update public.sets
  set score_a = v_score_a,
      score_b = v_score_b,
      winner_team_id = v_winner,
      status = case when v_winner is null then status else 'completed' end,
      updated_at = now()
  where id = v_entity_id;

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
    'set',
    v_entity_id,
    'edit_completed_record',
    jsonb_build_object('score_a', v_set.score_a, 'score_b', v_set.score_b, 'winner_team_id', v_set.winner_team_id),
    jsonb_build_object('score_a', v_score_a, 'score_b', v_score_b, 'winner_team_id', v_winner),
    auth.uid()
  );

  perform public.sync_match_state(v_set.match_id);

  return v_entity_id;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
