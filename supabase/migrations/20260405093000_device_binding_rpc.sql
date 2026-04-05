create or replace function public.create_device_bind_code(
  p_requested_local_device_id text default null,
  p_requested_device_name text default null
)
returns table (
  code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  generated_code text;
  generated_expires_at timestamptz;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  generated_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10));
  generated_expires_at := timezone('utc', now()) + interval '10 minutes';

  insert into public.device_bind_codes (
    user_id,
    code,
    requested_local_device_id,
    requested_device_name,
    expires_at
  )
  values (
    current_user_id,
    generated_code,
    nullif(trim(p_requested_local_device_id), ''),
    nullif(trim(p_requested_device_name), ''),
    generated_expires_at
  );

  return query
  select generated_code, generated_expires_at;
end;
$$;

revoke all on function public.create_device_bind_code(text, text) from public;
grant execute on function public.create_device_bind_code(text, text) to authenticated;

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
  on conflict (user_id, local_device_id)
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
  on conflict (user_id)
  do update set
    default_device_id = coalesce(public.user_device_preferences.default_device_id, excluded.default_device_id),
    updated_at = now_utc;

  return query
  select
    upserted_device.id,
    upserted_device.user_id,
    upserted_device.local_device_id,
    upserted_device.name,
    upserted_device.hostname,
    upserted_device.platform,
    upserted_device.arch,
    upserted_device.status,
    upserted_device.last_seen_at,
    upserted_device.created_at,
    upserted_device.updated_at;
end;
$$;

revoke all on function public.consume_device_bind_code(text, text, text, text, text, text) from public;
grant execute on function public.consume_device_bind_code(text, text, text, text, text, text) to anon;
grant execute on function public.consume_device_bind_code(text, text, text, text, text, text) to authenticated;
