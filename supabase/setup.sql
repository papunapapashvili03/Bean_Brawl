-- Fallguy: player profiles, so every username is unique.
-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run. It's safe to run again.

-- One row per account that has a username (guests don't, until they register)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

-- One of each username, whatever its case
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- Anyone can read who's who (names in games, leaderboards later); nobody writes to it directly: the trigger
-- below keeps it in step with the accounts
alter table public.profiles enable row level security;
drop policy if exists "Profiles are public" on public.profiles;
create policy "Profiles are public" on public.profiles for select using (true);

-- Whenever an account is made (or a guest registers) with a username, its profile gets that username. If
-- someone else already has it, this fails, and so does the sign-up: the game says the username's taken.
create or replace function public.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'username' then
    insert into public.profiles (id, username)
    values (new.id, new.raw_user_meta_data ->> 'username')
    on conflict (id) do update set username = excluded.username;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_saved on auth.users;
create trigger on_auth_user_saved
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile();

-- Whether a username's taken: the sign-up form asks before it sends a code
create or replace function public.username_taken(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

grant execute on function public.username_taken(text) to anon, authenticated;
