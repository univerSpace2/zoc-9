create or replace function public.sync_match_state(p_match_id uuid)
returns void
language plpgsql
security definer
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

  if not exists (
    select 1
    from public.sets
    where match_id = p_match_id
      and status = 'in_progress'
  ) then
    update public.sets
    set status = 'in_progress',
        score_a = 0,
        score_b = 0,
        rotation_a = case when initial_serving_team_id = team_a_id then 1 else 0 end,
        rotation_b = case when initial_serving_team_id = team_b_id then 1 else 0 end,
        serving_team_id = initial_serving_team_id,
        winner_team_id = null,
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
end;
$$;

create or replace function public.rpc_finalize_set(set_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_set public.sets;
  v_winner uuid;
begin
  select *
    into v_set
  from public.sets
  where id = rpc_finalize_set.set_id
  for update;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  v_winner := case
    when v_set.score_a > v_set.score_b then v_set.team_a_id
    when v_set.score_b > v_set.score_a then v_set.team_b_id
    else null
  end;

  if v_winner is null then
    raise exception '완료 세트는 동점으로 저장할 수 없습니다.';
  end if;

  update public.sets
  set status = 'completed',
      winner_team_id = v_winner,
      updated_at = now()
  where id = v_set.id
  returning * into v_set;

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

  return match_id;
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

  if v_score_a = v_score_b then
    raise exception '완료 세트는 동점으로 저장할 수 없습니다.';
  end if;

  v_winner := case
    when v_score_a > v_score_b then v_set.team_a_id
    else v_set.team_b_id
  end;

  update public.sets
  set score_a = v_score_a,
      score_b = v_score_b,
      winner_team_id = v_winner,
      status = 'completed',
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

do $$
declare
  v_match_id uuid;
begin
  for v_match_id in
    with repaired as (
      update public.sets
      set winner_team_id = case
        when score_a > score_b then team_a_id
        when score_b > score_a then team_b_id
        else null
      end,
      updated_at = now()
      where status = 'completed'
        and winner_team_id is null
        and score_a <> score_b
      returning match_id
    ),
    reopened as (
      update public.sets
      set status = 'in_progress',
          winner_team_id = null,
          updated_at = now()
      where status = 'completed'
        and winner_team_id is null
        and score_a = score_b
      returning match_id
    )
    select match_id from repaired
    union
    select match_id from reopened
  loop
    perform public.sync_match_state(v_match_id);
  end loop;
end;
$$;
