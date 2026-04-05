create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_device_id text not null,
  name text not null,
  hostname text not null,
  platform text not null,
  arch text not null,
  status text not null default 'offline' check (status in ('online', 'offline')),
  last_seen_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, local_device_id)
);

create index if not exists devices_user_id_idx on public.devices (user_id);
create index if not exists devices_status_idx on public.devices (status);

create table if not exists public.device_bind_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  requested_local_device_id text null,
  requested_device_name text null,
  consumed_device_id uuid null references public.devices(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_bind_codes_user_id_idx on public.device_bind_codes (user_id);
create index if not exists device_bind_codes_expires_at_idx on public.device_bind_codes (expires_at);
create index if not exists device_bind_codes_unconsumed_idx
  on public.device_bind_codes (user_id, created_at desc)
  where consumed_at is null;

create table if not exists public.user_device_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_device_id uuid null references public.devices(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
before update on public.devices
for each row
execute function public.set_updated_at();

drop trigger if exists device_bind_codes_set_updated_at on public.device_bind_codes;
create trigger device_bind_codes_set_updated_at
before update on public.device_bind_codes
for each row
execute function public.set_updated_at();

drop trigger if exists user_device_preferences_set_updated_at on public.user_device_preferences;
create trigger user_device_preferences_set_updated_at
before update on public.user_device_preferences
for each row
execute function public.set_updated_at();

alter table public.devices enable row level security;
alter table public.device_bind_codes enable row level security;
alter table public.user_device_preferences enable row level security;

drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own"
on public.devices
for select
using (auth.uid() = user_id);

drop policy if exists "devices_insert_own" on public.devices;
create policy "devices_insert_own"
on public.devices
for insert
with check (auth.uid() = user_id);

drop policy if exists "devices_update_own" on public.devices;
create policy "devices_update_own"
on public.devices
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "devices_delete_own" on public.devices;
create policy "devices_delete_own"
on public.devices
for delete
using (auth.uid() = user_id);

drop policy if exists "device_bind_codes_select_own" on public.device_bind_codes;
create policy "device_bind_codes_select_own"
on public.device_bind_codes
for select
using (auth.uid() = user_id);

drop policy if exists "device_bind_codes_insert_own" on public.device_bind_codes;
create policy "device_bind_codes_insert_own"
on public.device_bind_codes
for insert
with check (auth.uid() = user_id);

drop policy if exists "device_bind_codes_update_own" on public.device_bind_codes;
create policy "device_bind_codes_update_own"
on public.device_bind_codes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "device_bind_codes_delete_own" on public.device_bind_codes;
create policy "device_bind_codes_delete_own"
on public.device_bind_codes
for delete
using (auth.uid() = user_id);

drop policy if exists "user_device_preferences_select_own" on public.user_device_preferences;
create policy "user_device_preferences_select_own"
on public.user_device_preferences
for select
using (auth.uid() = user_id);

drop policy if exists "user_device_preferences_insert_own" on public.user_device_preferences;
create policy "user_device_preferences_insert_own"
on public.user_device_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_device_preferences_update_own" on public.user_device_preferences;
create policy "user_device_preferences_update_own"
on public.user_device_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
