-- Fallguy: each player's skill rating, and how hard the bots play for them (src/game/bots/difficulty.ts).
-- Run this once in the Supabase dashboard (SQL Editor > New query > paste > Run), after game_results.sql and
-- bot_presets.sql. It's safe to run again.
--
-- Every game a signed-in player finishes (a Party Games show, a Shoot Out match: see game_results.sql) moves
-- their rating for that mode. The rating is on the same scale as the bots' difficulty: 0 is the Easy preset,
-- 0.5 Normal, 1 Hard, 1.25 Elite (the account page shows it times 1000). The bots then play at the player's
-- rating, so a better player meets better bots. And after a few bad games in a row (out before the final; a
-- lost match) they ease off a little, until the player has a good one: in Party Games only in the qualifying
-- rounds, so it can help someone into the final, but the final itself is played at their rating.
--
-- How a game moves the rating (Elo-like): it scores 0..1 (Party Games: by how far into the show they got and
-- where they came; Shoot Out: the result and their takedowns per time taken down), against what's expected
-- of their rating at the difficulty they played at; the difference, times K, is added to the rating. K is
-- large for new players (so the rating finds them quickly), small once they've played a while, and larger
-- again after a long break. A game left early scores 0.

-- What's recorded with each game, for this
alter table public.game_results add column if not exists difficulty real check (difficulty between 0 and 1.5);
alter table public.game_results add column if not exists left_early boolean not null default false;

-- ---------------------------------------------------------------------------------------------------------
-- The numbers it all goes by: change them in Table Editor > skill_settings (the one row). The game reads them
-- as it opens; new ratings are worked out with them straight away.

create table if not exists public.skill_settings (
  id smallint primary key default 1 check (id = 1),
  adaptive boolean not null default true, -- bots adapt to each player (off: everyone gets the default preset)
  start_rating real not null default 0.35 check (start_rating between 0 and 1.25), -- a new player's
  scale real not null default 0.15 check (scale > 0), -- how far apart rating and difficulty make a game a sure thing
  k_new real not null default 0.20 check (k_new between 0 and 1), -- how far one game moves a new player's rating
  k_settled real not null default 0.05 check (k_settled between 0 and 1), -- and a regular's
  settle_games real not null default 12 check (settle_games > 0), -- K goes from one to the other over about this many games
  k_rusty real not null default 0.12 check (k_rusty between 0 and 1), -- at least this, back after a break
  rusty_days integer not null default 14 check (rusty_days > 0), -- (that long without playing that mode)
  max_rating real not null default 1.25 check (max_rating between 0.5 and 1.5),
  -- Easing off after bad games in a row (taken off the difficulty)
  mercy_2 real not null default 0.08 check (mercy_2 between 0 and 0.5), -- after 2
  mercy_3 real not null default 0.15 check (mercy_3 between 0 and 0.5), -- 3 or 4
  mercy_5 real not null default 0.20 check (mercy_5 between 0 and 0.5), -- 5 or more (the most it eases off)
  -- Pushing back after good games in a row (added to the difficulty)
  hot_2 real not null default 0.05 check (hot_2 between 0 and 0.5), -- after 2
  hot_3 real not null default 0.10 check (hot_3 between 0 and 0.5), -- 3 or more
  updated_at timestamptz not null default now()
);
insert into public.skill_settings (id) values (1) on conflict (id) do nothing;

alter table public.skill_settings enable row level security;
grant select on public.skill_settings to anon, authenticated;
drop policy if exists "Skill settings are public" on public.skill_settings;
create policy "Skill settings are public" on public.skill_settings for select using (true);

-- An Elite bot preset, for the best players (past Hard)
insert into public.bot_presets
  (name, label, is_default, level_min, level_max, quickness_min, quickness_max, speed, mistakes, reaction, shooter_skill_min, shooter_skill_max, notes)
values
  ('elite', 'Elite', false, 0.75, 1, 0.6, 1, 1.06, 0.15, 0.55, 0.92, 1, 'For the best players: past Hard')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- The ratings: one per player per mode. Players can read their own; only the trigger below writes them.

create table if not exists public.player_skill (
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('party-games', 'shoot-out')),
  rating real not null,
  games integer not null default 0, -- games rated
  streak integer not null default 0, -- good games in a row (above 0) or bad ones (below 0)
  last_played timestamptz,
  primary key (user_id, mode)
);

alter table public.player_skill enable row level security;
grant select on public.player_skill to authenticated;
drop policy if exists "Players read their own skill" on public.player_skill;
create policy "Players read their own skill" on public.player_skill for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------
-- Rating a game as it's kept: a Shoot Out match, or the last round of a Party Games show (out, or the final)

create or replace function public.rate_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.skill_settings%rowtype;
  had public.player_skill%rowtype;
  v_rating real;
  v_games integer := 0;
  v_streak integer := 0;
  v_last timestamptz;
  is_final boolean;
  share real;
  score real;
  faced real;
  expected real;
  k real;
  good boolean;
  bad boolean;
begin
  select * into s from public.skill_settings where id = 1;
  if not found then
    return new;
  end if;

  if new.mode = 'party-games' then
    -- (A round gone through: the show's not over yet)
    if new.outcome not in ('out', 'won') then
      return new;
    end if;
    is_final := new.round is not null and new.round = new.rounds;
    -- Where they came in their last round: 1 for first, 0 for last
    share := case when new.field > 1 and new.place is not null then greatest(0, least(1, 1 - (new.place - 1)::real / (new.field - 1))) else 0.5 end;
    score := case
      when new.left_early then 0
      when new.outcome = 'won' then 1
      when is_final then 0.60 + 0.20 * share
      when new.round > 1 then 0.35 + 0.15 * share
      else 0.10 + 0.20 * share
    end;
    -- The difficulty over the whole show (each round's, this one too)
    select avg(r.difficulty) into faced from public.game_results r
      where r.user_id = new.user_id and r.show_id = new.show_id and r.difficulty is not null;
    good := is_final and not new.left_early; -- made the final
    bad := not is_final and not new.left_early; -- out before it
  else
    score := case
      when new.left_early then 0
      else 0.7 * (case when new.outcome = 'won' then 1 else 0 end)
        + 0.3 * least(coalesce(new.kills, 0)::real / greatest(coalesce(new.deaths, 0), 1), 2) / 2
    end;
    faced := new.difficulty;
    good := new.outcome = 'won' and not new.left_early;
    bad := new.outcome = 'lost' and not new.left_early;
  end if;

  select * into had from public.player_skill p where p.user_id = new.user_id and p.mode = new.mode for update;
  if found then
    v_rating := had.rating;
    v_games := had.games;
    v_streak := had.streak;
    v_last := had.last_played;
  else
    v_rating := s.start_rating;
  end if;

  faced := coalesce(faced, v_rating);
  expected := 1 / (1 + exp(-(v_rating - faced) / s.scale));
  k := s.k_settled + (s.k_new - s.k_settled) * exp(-v_games / s.settle_games);
  if v_last is not null and v_last < now() - make_interval(days => s.rusty_days) then
    k := greatest(k, s.k_rusty);
  end if;
  v_rating := greatest(0, least(s.max_rating, v_rating + k * (score - expected)));
  -- (A game left early leaves the run of good or bad games as it was)
  v_streak := case when good then greatest(v_streak, 0) + 1 when bad then least(v_streak, 0) - 1 else v_streak end;

  insert into public.player_skill (user_id, mode, rating, games, streak, last_played)
    values (new.user_id, new.mode, v_rating, v_games + 1, v_streak, now())
    on conflict (user_id, mode) do update
      set rating = excluded.rating, games = excluded.games, streak = excluded.streak, last_played = excluded.last_played;
  return new;
end;
$$;

drop trigger if exists game_rated on public.game_results;
create trigger game_rated after insert on public.game_results for each row execute function public.rate_game();
