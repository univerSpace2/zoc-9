-- Fix recursive RLS evaluation causing "stack depth limit exceeded"
-- when querying groups/group_members through helper functions.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
security definer
set search_path = public
as $$
  select gm.role
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.permission_template_for_role(p_group_id uuid, p_role text)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_policy jsonb;
  v_template text[];
begin
  if p_role = 'owner' then
    return public.default_permissions_for_role('owner');
  end if;

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
security definer
set search_path = public
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

