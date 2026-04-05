create or replace function public.consume_device_bind_code(
  p_code text,
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
  bind_record public.device_bind_codes%rowtype;
  upserted_device public.devices%rowtype;
  normalized_code text;
  now_utc timestamptz;
begin
  normalized_code := upper(trim(coalesce(p_code, '')));
  now_utc := timezone('utc', now());

  if normalized_code = '' then
    raise exception 'Bind code is required';
  end if;

  if trim(coalesce(p_local_device_id, '')) = '' then
    raise exception 'Local device id is required';
  end if;

  select *
  into bind_record
  from public.device_bind_codes
  where code = normalized_code
    and consumed_at is null
    and expires_at > now_utc
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Invalid or expired bind code';
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
    bind_record.user_id,
    trim(p_local_device_id),
    coalesce(nullif(trim(p_name), ''), coalesce(bind_record.requested_device_name, 'Relay Device')),
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

  update public.device_bind_codes
  set consumed_at = now_utc,
      consumed_device_id = upserted_device.id
  where id = bind_record.id;

  insert into public.user_device_preferences (
    user_id,
    default_device_id
  )
  values (
    bind_record.user_id,
    upserted_device.id
  )
  on conflict on constraint user_device_preferences_pkey
  do update set
    default_device_id = coalesce(public.user_device_preferences.default_device_id, excluded.default_device_id),
    updated_at = now_utc;

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

revoke all on function public.consume_device_bind_code(text, text, text, text, text, text) from public;
grant execute on function public.consume_device_bind_code(text, text, text, text, text, text) to anon;
grant execute on function public.consume_device_bind_code(text, text, text, text, text, text) to authenticated;
