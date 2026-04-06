create table if not exists public.relay_agent_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_device_id text not null,
  kind text not null check (kind in ('ping', 'bridge-http')),
  method text null check (method in ('DELETE', 'GET', 'PATCH', 'POST')),
  path text null,
  headers jsonb not null default '{}'::jsonb,
  body text null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'completed', 'failed', 'expired')),
  claimed_at timestamptz null,
  responded_at timestamptz null,
  expires_at timestamptz not null default timezone('utc', now()) + interval '30 seconds',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists relay_agent_requests_device_status_idx
  on public.relay_agent_requests (local_device_id, status, created_at asc);

create index if not exists relay_agent_requests_user_id_idx
  on public.relay_agent_requests (user_id, created_at desc);

create index if not exists relay_agent_requests_expires_at_idx
  on public.relay_agent_requests (expires_at);

drop trigger if exists relay_agent_requests_set_updated_at on public.relay_agent_requests;
create trigger relay_agent_requests_set_updated_at
before update on public.relay_agent_requests
for each row
execute function public.set_updated_at();

create table if not exists public.relay_agent_responses (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.relay_agent_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_device_id text not null,
  kind text not null check (kind in ('ping', 'bridge-http-start', 'bridge-http-chunk', 'bridge-http-end', 'bridge-http-error')),
  status integer null,
  headers jsonb not null default '{}'::jsonb,
  chunk_base64 text null,
  error text null,
  responded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists relay_agent_responses_request_id_idx
  on public.relay_agent_responses (request_id, id asc);

create index if not exists relay_agent_responses_user_id_idx
  on public.relay_agent_responses (user_id, created_at desc);

create or replace function public.claim_relay_agent_request(
  p_user_id uuid,
  p_local_device_id text
)
returns table (
  id uuid,
  user_id uuid,
  local_device_id text,
  kind text,
  method text,
  path text,
  headers jsonb,
  body text,
  status text,
  claimed_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    update public.relay_agent_requests as requests
    set
      status = 'delivered',
      claimed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where requests.id = (
      select candidate.id
      from public.relay_agent_requests as candidate
      where candidate.user_id = p_user_id
        and candidate.local_device_id = trim(coalesce(p_local_device_id, ''))
        and candidate.status = 'pending'
        and candidate.expires_at > timezone('utc', now())
      order by candidate.created_at asc
      limit 1
      for update skip locked
    )
    returning requests.*
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.local_device_id,
    claimed.kind,
    claimed.method,
    claimed.path,
    claimed.headers,
    claimed.body,
    claimed.status,
    claimed.claimed_at,
    claimed.responded_at,
    claimed.expires_at,
    claimed.created_at,
    claimed.updated_at
  from claimed;
end;
$$;

revoke all on function public.claim_relay_agent_request(uuid, text) from public;
grant execute on function public.claim_relay_agent_request(uuid, text) to anon;
grant execute on function public.claim_relay_agent_request(uuid, text) to authenticated;
