-- Decrement a specific team's score by 1
create or replace function public.rpc_decrement_score(set_id uuid, team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set public.sets;
begin
  select * into v_set from public.sets s where s.id = rpc_decrement_score.set_id for update;

  if v_set.id is null then
    raise exception '세트를 찾을 수 없습니다.';
  end if;

  if v_set.status <> 'in_progress' then
    raise exception '진행 중인 세트만 수정할 수 있습니다.';
  end if;

  if team_id = v_set.team_a_id then
    if v_set.score_a <= 0 then
      raise exception '점수가 0 이하입니다.';
    end if;
    update public.sets
    set score_a = score_a - 1, updated_at = now()
    where id = v_set.id;
  elsif team_id = v_set.team_b_id then
    if v_set.score_b <= 0 then
      raise exception '점수가 0 이하입니다.';
    end if;
    update public.sets
    set score_b = score_b - 1, updated_at = now()
    where id = v_set.id;
  else
    raise exception '해당 세트의 팀이 아닙니다.';
  end if;
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

grant execute on function public.rpc_decrement_score(uuid, uuid) to authenticated;
grant execute on function public.rpc_force_end_set(uuid) to authenticated;
