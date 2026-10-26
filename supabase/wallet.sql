-- Fallguy: players' SOL. Run this once in the Supabase dashboard (SQL Editor > New query > paste > Run). It's
-- safe to run again.
--
-- Each player has a balance on the site (lamports: 1 SOL = 1,000,000,000). They put SOL in from their own
-- wallet (a deposit: a transfer to the site's wallet, checked on the chain by the game server), stake it on a
-- Party Games show (taken as the show starts, paid out to the players who come top when it ends, less the
-- site's fee), and take it out again to the wallet they've linked (a withdrawal, sent by the game server).
--
-- Every change to a balance is a line in the ledger, made together with the change, by the functions below;
-- they're for the game server only (it uses the service role key). Players can read their own balance,
-- wallet and ledger, and change nothing.

-- ---------------------------------------------------------------------------------------------------------
-- The wallet each player's linked (to take SOL out to), shown to be theirs by a message it signed

create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  address text not null unique check (address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  linked_at timestamptz not null default now()
);

create table if not exists public.balances (
  user_id uuid primary key references auth.users (id) on delete restrict,
  lamports bigint not null default 0 check (lamports >= 0),
  updated_at timestamptz not null default now()
);

-- kind: deposit (in, from a wallet), withdrawal (out, to the linked wallet), stake (on a show), winnings (from
-- a show), refund (a stake or withdrawal given back). ref: what it's for (the deposit's transaction, the
-- show, the withdrawal); signature: the transaction on the chain, for deposits and withdrawals.
create table if not exists public.ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  kind text not null check (kind in ('deposit', 'withdrawal', 'stake', 'winnings', 'refund')),
  lamports bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  ref text not null check (char_length(ref) <= 120),
  signature text check (char_length(signature) <= 120),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
-- (Nothing's counted twice: a show's stake or winnings once per player, a deposit's transaction once at all)
create unique index if not exists ledger_once on public.ledger (kind, ref, user_id);
create unique index if not exists ledger_deposit_once on public.ledger (ref) where kind = 'deposit';
create index if not exists ledger_by_player on public.ledger (user_id, created_at desc);

-- The shows played for stakes: what each player put in, the pot, the site's fee, and how it was paid out
create table if not exists public.staked_shows (
  id uuid primary key,
  tier smallint not null,
  stake bigint not null check (stake > 0),
  players integer not null default 0,
  pot bigint not null default 0,
  fee bigint,
  payouts jsonb,
  status text not null default 'live' check (status in ('live', 'settled', 'refunded')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- Reading: your own, and nothing else; writing: only the functions below
alter table public.wallets enable row level security;
alter table public.balances enable row level security;
alter table public.ledger enable row level security;
alter table public.staked_shows enable row level security;
grant select on public.wallets, public.balances, public.ledger to authenticated;

drop policy if exists "Players read their own wallet" on public.wallets;
create policy "Players read their own wallet" on public.wallets for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Players read their own balance" on public.balances;
create policy "Players read their own balance" on public.balances for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Players read their own ledger" on public.ledger;
create policy "Players read their own ledger" on public.ledger for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------
-- Changing balances (the game server only)

-- One change: the balance and its ledger line together, or neither. A balance can't go below 0, and the same
-- thing can't be counted twice (see ledger_once): either fails the whole change. Returns the new balance.
create or replace function public.apply_ledger(p_user uuid, p_kind text, p_lamports bigint, p_ref text, p_signature text default null, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  insert into public.balances (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.balances set lamports = lamports + p_lamports, updated_at = now()
    where user_id = p_user and lamports + p_lamports >= 0
    returning lamports into v_balance;
  if v_balance is null then
    raise exception 'insufficient balance' using errcode = 'P0001';
  end if;
  insert into public.ledger (user_id, kind, lamports, balance_after, ref, signature, note)
    values (p_user, p_kind, p_lamports, v_balance, p_ref, p_signature, p_note);
  return v_balance;
end;
$$;

-- A staked show starting: each player's stake taken (those who can't cover it are left out), and the show
-- kept. Returns the players whose stake was taken.
create or replace function public.start_staked_show(p_show uuid, p_tier smallint, p_stake bigint, p_users uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_in uuid[] := '{}';
begin
  insert into public.staked_shows (id, tier, stake) values (p_show, p_tier, p_stake);
  foreach v_user in array p_users loop
    begin
      perform public.apply_ledger(v_user, 'stake', -p_stake, p_show::text);
      v_in := v_in || v_user;
    exception when others then
      -- (not enough in their balance: they're not in it)
      null;
    end;
  end loop;
  update public.staked_shows set players = cardinality(v_in), pot = p_stake * cardinality(v_in) where id = p_show;
  return v_in;
end;
$$;

-- A staked show over: its winnings paid ([{ "user": uuid, "lamports": n, "place": n }]), and what's left of
-- the pot kept as the site's fee. A show's settled (or refunded) once only.
create or replace function public.settle_staked_show(p_show uuid, p_payouts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_show public.staked_shows%rowtype;
  v_pay jsonb;
  v_total bigint := 0;
begin
  select * into v_show from public.staked_shows where id = p_show for update;
  if not found or v_show.status <> 'live' then
    raise exception 'show not live' using errcode = 'P0001';
  end if;
  for v_pay in select * from jsonb_array_elements(coalesce(p_payouts, '[]'::jsonb)) loop
    v_total := v_total + (v_pay ->> 'lamports')::bigint;
  end loop;
  if v_total > v_show.pot then
    raise exception 'payouts exceed the pot' using errcode = 'P0001';
  end if;
  for v_pay in select * from jsonb_array_elements(coalesce(p_payouts, '[]'::jsonb)) loop
    if (v_pay ->> 'lamports')::bigint > 0 then
      -- (Only players who staked on it can be paid from it)
      if not exists (select 1 from public.ledger l where l.kind = 'stake' and l.ref = p_show::text and l.user_id = (v_pay ->> 'user')::uuid) then
        raise exception 'payout to a player not in the show' using errcode = 'P0001';
      end if;
      perform public.apply_ledger((v_pay ->> 'user')::uuid, 'winnings', (v_pay ->> 'lamports')::bigint, p_show::text, null, 'place ' || (v_pay ->> 'place'));
    end if;
  end loop;
  update public.staked_shows set status = 'settled', fee = v_show.pot - v_total, payouts = p_payouts, settled_at = now() where id = p_show;
end;
$$;

-- A staked show that couldn't be finished (the server stopped part way): every stake given back
create or replace function public.refund_staked_show(p_show uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
begin
  perform 1 from public.staked_shows where id = p_show and status = 'live' for update;
  if not found then
    return;
  end if;
  for v_line in select l.user_id, l.lamports from public.ledger l where l.kind = 'stake' and l.ref = p_show::text loop
    perform public.apply_ledger(v_line.user_id, 'refund', -v_line.lamports, p_show::text, null, 'show not finished');
  end loop;
  update public.staked_shows set status = 'refunded', settled_at = now() where id = p_show;
end;
$$;

-- Every show still live (as the server starts: the shows it was running are gone), refunded
create or replace function public.refund_live_shows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_show uuid;
  v_count integer := 0;
begin
  for v_show in select id from public.staked_shows where status = 'live' loop
    perform public.refund_staked_show(v_show);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Linking a wallet (the server's checked the signature)
create or replace function public.link_wallet(p_user uuid, p_address text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.wallets (user_id, address) values (p_user, p_address)
    on conflict (user_id) do update set address = excluded.address, linked_at = now();
$$;

-- None of these for players (or anyone without the service role key)
revoke all on function public.apply_ledger(uuid, text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.start_staked_show(uuid, smallint, bigint, uuid[]) from public, anon, authenticated;
revoke all on function public.settle_staked_show(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.refund_staked_show(uuid) from public, anon, authenticated;
revoke all on function public.refund_live_shows() from public, anon, authenticated;
revoke all on function public.link_wallet(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_ledger(uuid, text, bigint, text, text, text) to service_role;
grant execute on function public.start_staked_show(uuid, smallint, bigint, uuid[]) to service_role;
grant execute on function public.settle_staked_show(uuid, jsonb) to service_role;
grant execute on function public.refund_staked_show(uuid) to service_role;
grant execute on function public.refund_live_shows() to service_role;
grant execute on function public.link_wallet(uuid, text) to service_role;
