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

  generated_expires_at := timezone('utc', now()) + interval '10 minutes';

  loop
    generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    begin
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

      exit;
    exception
      when unique_violation then
        generated_code := null;
    end;
  end loop;

  return query
  select generated_code, generated_expires_at;
end;
$$;

revoke all on function public.create_device_bind_code(text, text) from public;
grant execute on function public.create_device_bind_code(text, text) to authenticated;
