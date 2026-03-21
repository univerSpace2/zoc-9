-- Add memo column to venues table
alter table public.venues add column if not exists memo text;

-- Update rpc_create_venue to support memo
create or replace function public.rpc_create_venue(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_name text;
  v_address text;
  v_memo text;
  v_reservation_required boolean;
  v_reservation_url text;
  v_venue_id uuid;
begin
  v_group_id := (payload ->> 'groupId')::uuid;
  v_name := btrim(payload ->> 'name');
  v_address := nullif(btrim(payload ->> 'address'), '');
  v_memo := nullif(btrim(payload ->> 'memo'), '');
  v_reservation_required := coalesce((payload ->> 'reservationRequired')::boolean, false);
  v_reservation_url := nullif(btrim(payload ->> 'reservationUrl'), '');

  if not public.has_group_permission(v_group_id, 'manage_venues') then
    raise exception '구장 관리 권한이 없습니다.';
  end if;

  if v_name is null or v_name = '' then
    raise exception '구장 이름을 입력하세요.';
  end if;

  insert into public.venues (group_id, name, address, memo, reservation_required, reservation_url)
  values (v_group_id, v_name, v_address, v_memo, v_reservation_required, v_reservation_url)
  returning id into v_venue_id;

  insert into public.audit_logs (group_id, entity_type, entity_id, action, before_data, after_data, actor_id)
  values (v_group_id, 'venue', v_venue_id, 'create_venue', '{}'::jsonb,
    jsonb_build_object('name', v_name, 'address', v_address, 'memo', v_memo, 'reservation_required', v_reservation_required, 'reservation_url', v_reservation_url),
    auth.uid());

  return v_venue_id;
end;
$$;

-- Update rpc_update_venue to support memo
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
  v_address text;
  v_memo text;
  v_reservation_required boolean;
  v_reservation_url text;
begin
  v_venue_id := (payload ->> 'venueId')::uuid;

  select * into v_venue from public.venues v where v.id = v_venue_id for update;

  if v_venue.id is null then
    raise exception '구장을 찾을 수 없습니다.';
  end if;

  if not public.has_group_permission(v_venue.group_id, 'manage_venues') then
    raise exception '구장 관리 권한이 없습니다.';
  end if;

  v_name := coalesce(nullif(btrim(payload ->> 'name'), ''), v_venue.name);
  v_address := nullif(btrim(payload ->> 'address'), '');
  v_memo := nullif(btrim(payload ->> 'memo'), '');
  v_reservation_required := coalesce((payload ->> 'reservationRequired')::boolean, v_venue.reservation_required);
  v_reservation_url := nullif(btrim(payload ->> 'reservationUrl'), '');

  update public.venues
  set name = v_name, address = v_address, memo = v_memo,
      reservation_required = v_reservation_required, reservation_url = v_reservation_url, updated_at = now()
  where id = v_venue.id;

  insert into public.audit_logs (group_id, entity_type, entity_id, action, before_data, after_data, actor_id)
  values (v_venue.group_id, 'venue', v_venue.id, 'update_venue',
    jsonb_build_object('name', v_venue.name, 'address', v_venue.address, 'memo', v_venue.memo, 'reservation_required', v_venue.reservation_required, 'reservation_url', v_venue.reservation_url),
    jsonb_build_object('name', v_name, 'address', v_address, 'memo', v_memo, 'reservation_required', v_reservation_required, 'reservation_url', v_reservation_url),
    auth.uid());

  return v_venue.id;
end;
$$;
