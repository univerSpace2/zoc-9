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
as $$
declare
  v_set_id uuid;
begin
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

update public.sets
set serving_team_id = initial_serving_team_id,
    rotation_a = case when initial_serving_team_id = team_a_id then 1 else 0 end,
    rotation_b = case when initial_serving_team_id = team_b_id then 1 else 0 end,
    updated_at = now()
where status = 'pending';

do $$
declare
  v_set record;
  v_event record;
  v_serving uuid;
  v_before uuid;
  v_after uuid;
  v_rotation_team uuid;
  v_rotation_a int;
  v_rotation_b int;
  v_score_a int;
  v_score_b int;
begin
  for v_set in
    select *
    from public.sets
    where status = 'in_progress'
  loop
    v_serving := v_set.initial_serving_team_id;
    v_rotation_a := case when v_serving = v_set.team_a_id then 1 else 0 end;
    v_rotation_b := case when v_serving = v_set.team_b_id then 1 else 0 end;
    v_score_a := 0;
    v_score_b := 0;

    for v_event in
      select *
      from public.set_events
      where set_id = v_set.id
      order by occurred_at asc, created_at asc, id asc
    loop
      v_before := v_serving;
      v_after := v_serving;
      v_rotation_team := null;

      if v_event.scoring_team_id = v_set.team_a_id then
        v_score_a := v_score_a + 1;
      elsif v_event.scoring_team_id = v_set.team_b_id then
        v_score_b := v_score_b + 1;
      end if;

      if v_before <> v_event.scoring_team_id then
        v_after := v_event.scoring_team_id;
        v_rotation_team := v_after;

        if v_after = v_set.team_a_id then
          v_rotation_a := case when v_rotation_a = 0 then 1 else (v_rotation_a % v_set.team_size) + 1 end;
        elsif v_after = v_set.team_b_id then
          v_rotation_b := case when v_rotation_b = 0 then 1 else (v_rotation_b % v_set.team_size) + 1 end;
        end if;
      end if;

      v_serving := v_after;

      update public.set_events
      set serving_team_id_before = v_before,
          serving_team_id_after = v_after,
          rotation_applied_to_team_id = v_rotation_team,
          score_a_after = v_score_a,
          score_b_after = v_score_b
      where id = v_event.id;
    end loop;

    update public.sets
    set serving_team_id = v_serving,
        rotation_a = v_rotation_a,
        rotation_b = v_rotation_b,
        score_a = v_score_a,
        score_b = v_score_b,
        updated_at = now()
    where id = v_set.id;
  end loop;
end;
$$;
