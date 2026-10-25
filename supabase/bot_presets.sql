-- Fallguy: the bots' difficulty presets (src/game/bots/presets.ts).
-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run. It's safe to run again (it
-- doesn't overwrite presets you've changed since).
--
-- Each row is a preset; the one with is_default ticked is the one every match uses. Change any number in the
-- Table Editor and the next match anyone starts plays with it: no code change, no deploy. (To try one out
-- without making it the default, add ?bots=<name> to the games' address, e.g. /games/?bots=hard#sky.)
--
--   level_min, level_max          how good each Party Games bot is: 0 slow and careless .. 1 quick and sharp.
--                                 Each bot gets a level somewhere in this range.
--   quickness_min, quickness_max  how quick off the line each one is: 0 slow to start .. 1 straight away
--   speed                         times their running speed (1 = as their level says; 0.5 .. 1.15)
--   mistakes                      times how often they slip up, misjudge or let their mind wander
--                                 (0 = never, 1 = normal, 2 = twice as often; up to 5)
--   reaction                      times how long they take to react to what's coming (1 = normal, 2 = twice
--                                 as slow, 0.5 = twice as quick; 0.2 .. 4)
--   shooter_skill_min, _max       how good each Shoot Out bot is: 0.6 slow and wild .. 1 quick and steady
--                                 (aim, and how fast it reacts)

create table if not exists public.bot_presets (
  name text primary key check (name ~ '^[a-z0-9_-]{1,24}$'),
  label text not null,
  is_default boolean not null default false,
  level_min real not null default 0 check (level_min between 0 and 1),
  level_max real not null default 1 check (level_max between 0 and 1),
  quickness_min real not null default 0 check (quickness_min between 0 and 1),
  quickness_max real not null default 1 check (quickness_max between 0 and 1),
  speed real not null default 1 check (speed between 0.5 and 1.15),
  mistakes real not null default 1 check (mistakes between 0 and 5),
  reaction real not null default 1 check (reaction between 0.2 and 4),
  shooter_skill_min real not null default 0.65 check (shooter_skill_min between 0.4 and 1),
  shooter_skill_max real not null default 1 check (shooter_skill_max between 0.4 and 1),
  notes text,
  updated_at timestamptz not null default now(),
  check (level_min <= level_max and quickness_min <= quickness_max and shooter_skill_min <= shooter_skill_max)
);

-- Only one default at a time
create unique index if not exists bot_presets_one_default on public.bot_presets (is_default) where is_default;

-- Anyone can read them (the games do); nobody can change them from the games: only here, in the dashboard
alter table public.bot_presets enable row level security;
grant select on public.bot_presets to anon, authenticated;
drop policy if exists "Bot presets are public" on public.bot_presets;
create policy "Bot presets are public" on public.bot_presets for select using (true);

-- When a row was last changed
create or replace function public.touch_bot_preset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists bot_presets_touched on public.bot_presets;
create trigger bot_presets_touched before update on public.bot_presets for each row execute function public.touch_bot_preset();

-- The three to start with (Normal is how the bots have always played)
insert into public.bot_presets
  (name, label, is_default, level_min, level_max, quickness_min, quickness_max, speed, mistakes, reaction, shooter_skill_min, shooter_skill_max, notes)
values
  ('easy', 'Easy', false, 0, 0.55, 0, 0.6, 0.92, 1.8, 1.5, 0.6, 0.78, 'Slower, sloppier bots'),
  ('normal', 'Normal', true, 0, 1, 0, 1, 1, 1, 1, 0.65, 1, 'How the bots have always played'),
  ('hard', 'Hard', false, 0.5, 1, 0.4, 1, 1.03, 0.4, 0.7, 0.85, 1, 'Quick, sharp bots that rarely slip')
on conflict (name) do nothing;
