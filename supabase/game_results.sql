-- Fallguy: every game played (src/game/record.ts), shown on the account page (src/landing/Stats.tsx).
-- Run this once in the Supabase dashboard: SQL Editor > New query > paste > Run. It's safe to run again.
--
-- A row for each round of a Party Games show (through, out, or the final won), and for each Shoot Out match
-- (won or lost), for whoever was signed in (guests too: registering keeps a guest's account, and its games).
-- Each person can add their own results and read their own, nobody else's; nobody can change or delete them
-- from the games (only here, in the dashboard). Deleting an account deletes its results.

create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  played_at timestamptz not null default now(),
  mode text not null check (mode in ('party-games', 'shoot-out')),
  map text not null check (map ~ '^[a-z0-9_-]{1,24}$'),
  outcome text not null check (outcome in ('through', 'out', 'won', 'lost')),
  -- Party Games: the show the round was in, which of its rounds, and out of how many
  show_id uuid,
  round smallint check (round between 1 and 10),
  rounds smallint check (rounds between 1 and 10),
  -- Where you came, out of how many, and how long it lasted for you (seconds)
  place smallint check (place between 1 and 100),
  field smallint check (field between 1 and 100),
  seconds real check (seconds between 0 and 86400),
  -- Shoot Out: your takedowns, how often you were taken down, and the score
  kills smallint check (kills between 0 and 1000),
  deaths smallint check (deaths between 0 and 1000),
  team_score smallint check (team_score between 0 and 1000),
  enemy_score smallint check (enemy_score between 0 and 1000),
  -- The bots' difficulty preset (supabase/bot_presets.sql)
  bot_preset text check (char_length(bot_preset) <= 24)
);

create index if not exists game_results_by_player on public.game_results (user_id, played_at desc);

alter table public.game_results enable row level security;
grant select, insert on public.game_results to authenticated;

drop policy if exists "Players add their own results" on public.game_results;
create policy "Players add their own results" on public.game_results for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Players read their own results" on public.game_results;
create policy "Players read their own results" on public.game_results for select to authenticated
  using (user_id = (select auth.uid()));
