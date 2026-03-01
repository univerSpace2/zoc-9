create table if not exists public.set_positions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  team_id uuid not null references public.match_teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  position_no int not null check (position_no >= 1),
  created_at timestamptz not null default now(),
  unique (set_id, team_id, profile_id),
  unique (set_id, team_id, position_no)
);

create index if not exists idx_set_positions_match on public.set_positions (match_id);
create index if not exists idx_set_positions_set on public.set_positions (set_id);
create index if not exists idx_set_positions_set_team_pos on public.set_positions (set_id, team_id, position_no);

alter table public.set_positions enable row level security;

drop policy if exists set_positions_member_select on public.set_positions;
create policy set_positions_member_select on public.set_positions for select using (
  public.is_group_member((select m.group_id from public.matches m where m.id = match_id))
);

drop policy if exists set_positions_manage on public.set_positions;
create policy set_positions_manage on public.set_positions for all using (
  public.is_group_member((select m.group_id from public.matches m where m.id = match_id))
) with check (
  public.is_group_member((select m.group_id from public.matches m where m.id = match_id))
);

insert into public.set_positions (set_id, match_id, team_id, profile_id, position_no)
select
  s.id as set_id,
  s.match_id,
  mp.team_id,
  mp.profile_id,
  mp.position_no
from public.sets s
join public.match_players mp
  on mp.match_id = s.match_id
 and mp.team_id in (s.team_a_id, s.team_b_id)
where s.status in ('in_progress', 'completed', 'ignored')
  and not exists (
    select 1
    from public.set_positions sp
    where sp.set_id = s.id
  );

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
  v_created_set_id uuid;
  v_first_set_id uuid;
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
    on conflict (match_id, team_id, profile_id) do update
    set position_no = excluded.position_no;

    v_pos := v_pos + 1;
  end loop;

  v_pos := 1;
  for v_player_id in
    select value
    from jsonb_array_elements_text(coalesce(payload -> 'teams' -> 1 -> 'playerIds', '[]'::jsonb)) as value
  loop
    insert into public.match_players (match_id, team_id, profile_id, position_no)
    values (v_match_id, v_team_b_id, v_player_id::uuid, v_pos)
    on conflict (match_id, team_id, profile_id) do update
    set position_no = excluded.position_no;

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
    )
    returning id into v_created_set_id;

    if v_set_no = 1 then
      v_first_set_id := v_created_set_id;
    end if;

    v_starting := case when v_starting = v_team_a_id then v_team_b_id else v_team_a_id end;
  end loop;

  if v_first_set_id is not null then
    insert into public.set_positions (set_id, match_id, team_id, profile_id, position_no)
    select
      v_first_set_id,
      v_match_id,
      mp.team_id,
      mp.profile_id,
      mp.position_no
    from public.match_players mp
    where mp.match_id = v_match_id
      and mp.team_id in (v_team_a_id, v_team_b_id)
    on conflict (set_id, team_id, position_no) do update
    set profile_id = excluded.profile_id;
  end if;

  return v_match_id;
end;
$$;

create or replace function public.rpc_start_set(
  match_id uuid,
  set_no int,
  first_serving_team_id uuid,
  position_assignments jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.sets;
  v_set_id uuid;
  v_next_starting uuid;
  v_prev_set_status text;
  v_team_a_assignments jsonb;
  v_team_b_assignments jsonb;
  v_expected_count int;
  v_team_a_valid_members int;
  v_team_a_valid_positions int;
  v_team_a_distinct_profiles int;
  v_team_a_distinct_positions int;
  v_team_b_valid_members int;
  v_team_b_valid_positions int;
  v_team_b_distinct_profiles int;
  v_team_b_distinct_positions int;
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

  if v_set.set_no >= 2 then
    select s.status
      into v_prev_set_status
    from public.sets s
    where s.match_id = v_set.match_id
      and s.set_no = v_set.set_no - 1;

    if v_prev_set_status is null or v_prev_set_status not in ('completed', 'ignored') then
      raise exception '이전 세트가 완료되어야 시작할 수 있습니다.';
    end if;

    if position_assignments is null then
      raise exception '포지션 확인 후 세트를 시작하세요.';
    end if;
  end if;

  if position_assignments is null then
    position_assignments := jsonb_build_object(
      'teamA',
      (
        select coalesce(
          jsonb_agg(jsonb_build_object('profileId', mp.profile_id, 'positionNo', mp.position_no) order by mp.position_no),
          '[]'::jsonb
        )
        from public.match_players mp
        where mp.match_id = v_set.match_id
          and mp.team_id = v_set.team_a_id
      ),
      'teamB',
      (
        select coalesce(
          jsonb_agg(jsonb_build_object('profileId', mp.profile_id, 'positionNo', mp.position_no) order by mp.position_no),
          '[]'::jsonb
        )
        from public.match_players mp
        where mp.match_id = v_set.match_id
          and mp.team_id = v_set.team_b_id
      )
    );
  end if;

  v_team_a_assignments := coalesce(position_assignments -> 'teamA', '[]'::jsonb);
  v_team_b_assignments := coalesce(position_assignments -> 'teamB', '[]'::jsonb);

  if jsonb_typeof(v_team_a_assignments) <> 'array' or jsonb_typeof(v_team_b_assignments) <> 'array' then
    raise exception '포지션 배정 형식이 올바르지 않습니다.';
  end if;

  v_expected_count := v_set.team_size;

  if jsonb_array_length(v_team_a_assignments) <> v_expected_count
    or jsonb_array_length(v_team_b_assignments) <> v_expected_count then
    raise exception '팀 포지션을 모두 지정하세요.';
  end if;

  with team_a_input as (
    select
      (item ->> 'profileId')::uuid as profile_id,
      (item ->> 'positionNo')::int as position_no
    from jsonb_array_elements(v_team_a_assignments) as item
  )
  select
    count(*) filter (
      where exists (
        select 1
        from public.match_players mp
        where mp.match_id = v_set.match_id
          and mp.team_id = v_set.team_a_id
          and mp.profile_id = team_a_input.profile_id
      )
    ),
    count(*) filter (where team_a_input.position_no between 1 and v_set.team_size),
    count(distinct team_a_input.profile_id),
    count(distinct team_a_input.position_no)
  into
    v_team_a_valid_members,
    v_team_a_valid_positions,
    v_team_a_distinct_profiles,
    v_team_a_distinct_positions
  from team_a_input;

  with team_b_input as (
    select
      (item ->> 'profileId')::uuid as profile_id,
      (item ->> 'positionNo')::int as position_no
    from jsonb_array_elements(v_team_b_assignments) as item
  )
  select
    count(*) filter (
      where exists (
        select 1
        from public.match_players mp
        where mp.match_id = v_set.match_id
          and mp.team_id = v_set.team_b_id
          and mp.profile_id = team_b_input.profile_id
      )
    ),
    count(*) filter (where team_b_input.position_no between 1 and v_set.team_size),
    count(distinct team_b_input.profile_id),
    count(distinct team_b_input.position_no)
  into
    v_team_b_valid_members,
    v_team_b_valid_positions,
    v_team_b_distinct_profiles,
    v_team_b_distinct_positions
  from team_b_input;

  if v_team_a_valid_members <> v_expected_count
    or v_team_a_valid_positions <> v_expected_count
    or v_team_a_distinct_profiles <> v_expected_count
    or v_team_a_distinct_positions <> v_expected_count then
    raise exception 'A팀 포지션 배정이 올바르지 않습니다.';
  end if;

  if v_team_b_valid_members <> v_expected_count
    or v_team_b_valid_positions <> v_expected_count
    or v_team_b_distinct_profiles <> v_expected_count
    or v_team_b_distinct_positions <> v_expected_count then
    raise exception 'B팀 포지션 배정이 올바르지 않습니다.';
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

  delete from public.set_positions where set_id = v_set.id;

  insert into public.set_positions (set_id, match_id, team_id, profile_id, position_no)
  select
    v_set.id,
    v_set.match_id,
    v_set.team_a_id,
    (item ->> 'profileId')::uuid,
    (item ->> 'positionNo')::int
  from jsonb_array_elements(v_team_a_assignments) as item;

  insert into public.set_positions (set_id, match_id, team_id, profile_id, position_no)
  select
    v_set.id,
    v_set.match_id,
    v_set.team_b_id,
    (item ->> 'profileId')::uuid,
    (item ->> 'positionNo')::int
  from jsonb_array_elements(v_team_b_assignments) as item;

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

create or replace function public.sync_match_state(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required int;
  v_winner uuid;
begin
  select required_set_wins
    into v_required
  from public.matches
  where id = p_match_id;

  if v_required is null then
    return;
  end if;

  select resolved.winner_team_id
    into v_winner
  from (
    select
      case
        when s.winner_team_id is not null then s.winner_team_id
        when s.status = 'completed' and s.score_a > s.score_b then s.team_a_id
        when s.status = 'completed' and s.score_b > s.score_a then s.team_b_id
        else null
      end as winner_team_id
    from public.sets s
    where s.match_id = p_match_id
      and s.status = 'completed'
  ) resolved
  where resolved.winner_team_id is not null
  group by resolved.winner_team_id
  having count(*) >= v_required
  order by count(*) desc
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
      and status in ('pending', 'in_progress');

    return;
  end if;

  update public.matches
  set status = 'in_progress',
      winner_team_id = null,
      updated_at = now()
  where id = p_match_id;

  update public.sets
  set status = 'pending',
      winner_team_id = null,
      updated_at = now()
  where match_id = p_match_id
    and status = 'ignored';
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
      winner_team_id = v_winner,
      status = case when v_winner is null then 'in_progress' else 'completed' end,
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
