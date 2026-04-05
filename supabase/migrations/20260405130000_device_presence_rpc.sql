create or replace function public.upsert_device_presence(
  p_bound_user_id uuid,
  p_local_device_id text,
  p_name text,
  p_hostname text,
  p_platform text,
  p_arch text
)
returns table (
  device_id uuid,
  user_id uuid,
  local_device_id text,
  name text,
  hostname text,
  platform text,
  arch text,
  status text,
  last_seen_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  now_utc timestamptz;
  upserted_device public.devices%rowtype;
begin
  now_utc := timezone('utc', now());

  if p_bound_user_id is null then
    raise exception 'Bound user id is required';
  end if;

  if trim(coalesce(p_local_device_id, '')) = '' then
    raise exception 'Local device id is required';
  end if;

  insert into public.devices (
    user_id,
    local_device_id,
    name,
    hostname,
    platform,
    arch,
    status,
    last_seen_at
  )
  values (
    p_bound_user_id,
    trim(p_local_device_id),
    coalesce(nullif(trim(p_name), ''), 'Relay Device'),
    coalesce(nullif(trim(p_hostname), ''), 'unknown'),
    coalesce(nullif(trim(p_platform), ''), 'unknown'),
    coalesce(nullif(trim(p_arch), ''), 'unknown'),
    'online',
    now_utc
  )
  on conflict on constraint devices_user_id_local_device_id_key
  do update set
    name = excluded.name,
    hostname = excluded.hostname,
    platform = excluded.platform,
    arch = excluded.arch,
    status = 'online',
    last_seen_at = now_utc,
    updated_at = now_utc
  returning *
  into upserted_device;

  return query
  select
    upserted_device.id as device_id,
    upserted_device.user_id as user_id,
    upserted_device.local_device_id as local_device_id,
    upserted_device.name as name,
    upserted_device.hostname as hostname,
    upserted_device.platform as platform,
    upserted_device.arch as arch,
    upserted_device.status as status,
    upserted_device.last_seen_at as last_seen_at,
    upserted_device.created_at as created_at,
    upserted_device.updated_at as updated_at;
end;
$$;

revoke all on function public.upsert_device_presence(uuid, text, text, text, text, text) from public;
grant execute on function public.upsert_device_presence(uuid, text, text, text, text, text) to anon;
grant execute on function public.upsert_device_presence(uuid, text, text, text, text, text) to authenticated;
