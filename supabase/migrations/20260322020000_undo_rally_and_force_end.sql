-- Undo the last rally event in a set
create or replace function public.rpc_undo_last_rally(set_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.sets;
  v_last_event public.set_events;
  v_prev_event public.set_events;
  v_new_score_a int;
  v_new_score_b int;
  v_new_serving uuid;
  v_new_rotation_a int;
  v_new_rotation_b int;
begin
  select * into v_set from public.sets s where s.id = rpc_undo_last_rally.set_id for update;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  if v_set.status <> 'in_progress' then
    raise exception '진행 중인 세트만 되돌릴 수 있습니다.';
  end if;

  -- Get the last event
  select * into v_last_event
  from public.set_events e
  where e.set_id = v_set.id
  order by e.occurred_at desc, e.created_at desc
  limit 1;

  if v_last_event.id is null then
    raise exception '되돌릴 이벤트가 없습니다.';
  end if;

  -- Restore serving to what it was before the last event
  v_new_serving := v_last_event.serving_team_id_before;

  -- Restore score: subtract 1 from the scoring team
  v_new_score_a := v_set.score_a;
  v_new_score_b := v_set.score_b;

  if v_last_event.scoring_team_id = v_set.team_a_id then
    v_new_score_a := greatest(0, v_new_score_a - 1);
  else
    v_new_score_b := greatest(0, v_new_score_b - 1);
  end if;

  -- Restore rotation: if rotation was applied, reverse it
  v_new_rotation_a := v_set.rotation_a;
  v_new_rotation_b := v_set.rotation_b;

  if v_last_event.rotation_applied_to_team_id = v_set.team_a_id then
    -- Reverse rotation for team A
    v_new_rotation_a := case
      when v_new_rotation_a = 1 then v_set.team_size
      else v_new_rotation_a - 1
    end;
  elsif v_last_event.rotation_applied_to_team_id = v_set.team_b_id then
    -- Reverse rotation for team B
    v_new_rotation_b := case
      when v_new_rotation_b = 1 then v_set.team_size
      else v_new_rotation_b - 1
    end;
  end if;

  -- Delete the last event
  delete from public.set_events where id = v_last_event.id;

  -- Update the set
  update public.sets
  set score_a = v_new_score_a,
      score_b = v_new_score_b,
      serving_team_id = v_new_serving,
      rotation_a = v_new_rotation_a,
      rotation_b = v_new_rotation_b,
      winner_team_id = null,
      updated_at = now()
  where id = v_set.id;
end;
$$;

-- Force end a set with the current score
create or replace function public.rpc_force_end_set(set_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.sets;
  v_winner uuid;
begin
  select * into v_set from public.sets s where s.id = rpc_force_end_set.set_id for update;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  if v_set.status <> 'in_progress' then
    raise exception '진행 중인 세트만 종료할 수 있습니다.';
  end if;

  if v_set.score_a >= v_set.score_b then
    v_winner := v_set.team_a_id;
  else
    v_winner := v_set.team_b_id;
  end if;

  update public.sets
  set status = 'completed',
      winner_team_id = v_winner,
      updated_at = now()
  where id = v_set.id;
end;
$$;

grant execute on function public.rpc_undo_last_rally(uuid) to authenticated;
grant execute on function public.rpc_force_end_set(uuid) to authenticated;
