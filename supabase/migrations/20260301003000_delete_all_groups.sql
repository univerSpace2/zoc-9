-- One-time cleanup requested by operator:
-- remove all groups and group-dependent records.

truncate table public.groups cascade;

