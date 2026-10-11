-- Migration: 20261011_investments_goals.sql
-- Investments + Savings Goals: one shared data model for the mobile app and
-- the user website.
--
-- WHAT THIS DOES
--   1. New table public.investments (one row per holding): invested_amount,
--      current_value, optional account link, purpose, notes, linked
--      transaction ids, created_at / updated_at / deleted_at (soft delete).
--   2. New table public.goal_contributions + RPC add_goal_contribution():
--      deposits are added atomically on the server (no read-modify-write of
--      saved_amount from clients). Replays with the same contribution id are
--      no-ops, so offline outbox retries never double count.
--   3. Trigger: soft-deleting a transaction that funded a goal deposit
--      reverses that deposit (saved_amount goes back down).
--   4. savings_goals: checks (target_amount > 0, saved_amount >= 0, added
--      NOT VALID so old rows never block the migration), default icon '🎯',
--      old 'target' icons rewritten to '🎯', updated_at touched on insert too.
--   5. investment_totals view rebuilt: security_invoker (RLS applies), only
--      the caller's own rows, ignores deleted / inactive / unverified /
--      rejected / failed / refunded transactions and transfers, categories
--      matched per user (no cross-user row multiplication), and investment
--      transactions already linked to a holding are not counted twice.
--   6. Data migration (idempotent, deterministic ids, ON CONFLICT DO NOTHING):
--        a. projector_settings.settings.holdings  -> investments
--        b. accounts with an investment type       -> investments
--   7. Realtime publication + replica identity for the new tables.
--
-- ACCOUNTS TYPE DECISION
--   accounts.type stays bank / cash / wallet / credit (as in init.sql). Investments
--   no longer live in accounts. Any investment-typed account (only possible
--   if the live DB was widened by hand) is copied into investments and then
--   soft-deleted (is_active=false, deleted_at=now()); its transactions are kept.
--   The check constraint is re-asserted NOT VALID so new rows must use the 4 types.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- Same body as 20261003_sync_cursor_columns.sql; repeated so this file also
-- works on a database where that migration was skipped.
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Deterministic uuid used by BOTH this migration and the mobile app
-- (InvestmentIds.legacy in Dart): md5('<user_id>:<kind>:<legacy id>') as uuid.
create or replace function public.spentx_legacy_uuid(p_user uuid, p_kind text, p_id text)
returns uuid language sql immutable as $$
  select case
    when p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_id::uuid
    else md5(p_user::text || ':' || p_kind || ':' || p_id)::uuid
  end
$$;

create or replace function public.spentx_try_timestamptz(p text)
returns timestamptz language plpgsql stable as $$
begin
  return p::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function public.spentx_try_numeric(p text)
returns numeric language plpgsql stable as $$
begin
  return nullif(p, '')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.spentx_investment_type(p_raw text)
returns text language sql immutable as $$
  select case regexp_replace(lower(coalesce(p_raw, '')), '[^a-z]', '', 'g')
    when 'mutualfund' then 'mutual_fund'
    when 'mutualfunds' then 'mutual_fund'
    when 'mf' then 'mutual_fund'
    when 'sip' then 'mutual_fund'
    when 'stocks' then 'stocks'
    when 'stock' then 'stocks'
    when 'equity' then 'stocks'
    when 'fixeddeposit' then 'fixed_deposit'
    when 'fd' then 'fixed_deposit'
    when 'bonds' then 'bonds'
    when 'bond' then 'bonds'
    when 'gold' then 'gold'
    when 'crypto' then 'crypto'
    when 'realestate' then 'real_estate'
    when 'liquid' then 'liquid'
    else 'other'
  end
$$;

-- ---------------------------------------------------------------------------
-- 1. investments
-- ---------------------------------------------------------------------------
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'other',
  invested_amount numeric(14,2) not null default 0,
  current_value numeric(14,2) not null default 0,
  account_id uuid references public.accounts(id) on delete set null,
  purpose text,
  notes text,
  source_transaction_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Columns added later stay idempotent if an early version of the table exists.
alter table public.investments add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.investments add column if not exists purpose text;
alter table public.investments add column if not exists notes text;
alter table public.investments add column if not exists source_transaction_ids text[] not null default '{}'::text[];
alter table public.investments add column if not exists deleted_at timestamptz;

alter table public.investments drop constraint if exists investments_type_check;
alter table public.investments add constraint investments_type_check check (type in (
  'mutual_fund','stocks','fixed_deposit','bonds','gold','crypto','real_estate','liquid','other'
));
alter table public.investments drop constraint if exists investments_name_check;
alter table public.investments add constraint investments_name_check check (length(btrim(name)) > 0);
alter table public.investments drop constraint if exists investments_amounts_check;
alter table public.investments add constraint investments_amounts_check
  check (invested_amount >= 0 and current_value >= 0);

create index if not exists investments_user_updated_idx on public.investments (user_id, updated_at);
create index if not exists investments_user_live_idx on public.investments (user_id) where deleted_at is null;

alter table public.investments enable row level security;
drop policy if exists "investments_select_own" on public.investments;
create policy "investments_select_own" on public.investments
  for select using (user_id = auth.uid());
drop policy if exists "investments_insert_own" on public.investments;
create policy "investments_insert_own" on public.investments
  for insert with check (user_id = auth.uid());
drop policy if exists "investments_update_own" on public.investments;
create policy "investments_update_own" on public.investments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No delete policy on purpose: clients soft delete (deleted_at) only.

drop trigger if exists investments_touch_updated_at on public.investments;
create trigger investments_touch_updated_at
  before insert or update on public.investments
  for each row execute function public.touch_updated_at();

grant select, insert, update on public.investments to authenticated;
revoke all on public.investments from anon;

-- ---------------------------------------------------------------------------
-- 2. savings_goals hardening
-- ---------------------------------------------------------------------------
alter table public.savings_goals add column if not exists is_active boolean not null default true;
alter table public.savings_goals add column if not exists deleted_at timestamptz;
alter table public.savings_goals add column if not exists target_date date;
alter table public.savings_goals add column if not exists color text default 'indigo';
alter table public.savings_goals add column if not exists icon text default '🎯';
alter table public.savings_goals alter column icon set default '🎯';
update public.savings_goals set icon = '🎯' where icon is null or icon = 'target';

alter table public.savings_goals drop constraint if exists savings_goals_target_positive;
alter table public.savings_goals add constraint savings_goals_target_positive
  check (target_amount > 0) not valid;
alter table public.savings_goals drop constraint if exists savings_goals_saved_nonnegative;
alter table public.savings_goals add constraint savings_goals_saved_nonnegative
  check (saved_amount >= 0) not valid;

create index if not exists savings_goals_user_updated_idx on public.savings_goals (user_id, updated_at);

-- updated_at is server time on insert as well as update (clients compare it).
drop trigger if exists tr_savings_goals_touch on public.savings_goals;
create trigger tr_savings_goals_touch
  before insert or update on public.savings_goals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. goal_contributions + atomic RPCs
-- ---------------------------------------------------------------------------
create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric(14,2) not null,
  transaction_id text,
  note text,
  source text not null default 'web',
  contributed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.goal_contributions drop constraint if exists goal_contributions_amount_check;
alter table public.goal_contributions add constraint goal_contributions_amount_check check (amount <> 0);
alter table public.goal_contributions drop constraint if exists goal_contributions_source_check;
alter table public.goal_contributions add constraint goal_contributions_source_check
  check (source in ('web','mobile','migration'));

create index if not exists goal_contributions_goal_idx on public.goal_contributions (goal_id);
create index if not exists goal_contributions_user_tx_idx on public.goal_contributions (user_id, transaction_id)
  where transaction_id is not null;

alter table public.goal_contributions enable row level security;
drop policy if exists "goal_contributions_select_own" on public.goal_contributions;
create policy "goal_contributions_select_own" on public.goal_contributions
  for select using (user_id = auth.uid());
drop policy if exists "goal_contributions_insert_own" on public.goal_contributions;
create policy "goal_contributions_insert_own" on public.goal_contributions
  for insert with check (user_id = auth.uid());
drop policy if exists "goal_contributions_update_own" on public.goal_contributions;
create policy "goal_contributions_update_own" on public.goal_contributions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.goal_contributions to authenticated;
revoke all on public.goal_contributions from anon;

create or replace function public.add_goal_contribution(
  p_goal_id uuid,
  p_amount numeric,
  p_contribution_id uuid default null,
  p_transaction_id text default null,
  p_note text default null,
  p_source text default 'web'
)
returns public.savings_goals
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := coalesce(p_contribution_id, gen_random_uuid());
  v_goal public.savings_goals;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'Amount must not be zero' using errcode = '22023';
  end if;

  -- Replay of an already-applied contribution (outbox retry): no-op.
  if exists (select 1 from public.goal_contributions where id = v_id and user_id = v_uid) then
    select * into v_goal from public.savings_goals where id = p_goal_id and user_id = v_uid;
    return v_goal;
  end if;

  select * into v_goal
  from public.savings_goals
  where id = p_goal_id and user_id = v_uid and deleted_at is null and is_active
  for update;
  if not found then
    raise exception 'Goal not found' using errcode = 'P0002';
  end if;
  if v_goal.saved_amount + p_amount < 0 then
    raise exception 'Withdrawal is larger than the saved amount' using errcode = '22023';
  end if;

  insert into public.goal_contributions (id, user_id, goal_id, amount, transaction_id, note, source)
  values (v_id, v_uid, p_goal_id, round(p_amount, 2), nullif(p_transaction_id, ''), p_note,
          case when p_source in ('web','mobile') then p_source else 'web' end);

  update public.savings_goals
     set saved_amount = round(saved_amount + p_amount, 2)
   where id = p_goal_id and user_id = v_uid
  returning * into v_goal;
  return v_goal;
end;
$$;

create or replace function public.remove_goal_contribution(p_contribution_id uuid)
returns public.savings_goals
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.goal_contributions;
  v_goal public.savings_goals;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  update public.goal_contributions
     set deleted_at = now()
   where id = p_contribution_id and user_id = v_uid and deleted_at is null
  returning * into v_c;
  if not found then
    return null;
  end if;
  update public.savings_goals
     set saved_amount = greatest(0, round(saved_amount - v_c.amount, 2))
   where id = v_c.goal_id and user_id = v_uid
  returning * into v_goal;
  return v_goal;
end;
$$;

revoke all on function public.add_goal_contribution(uuid, numeric, uuid, text, text, text) from public, anon;
grant execute on function public.add_goal_contribution(uuid, numeric, uuid, text, text, text) to authenticated;
revoke all on function public.remove_goal_contribution(uuid) from public, anon;
grant execute on function public.remove_goal_contribution(uuid) to authenticated;

-- Soft-deleting the bank transaction behind a goal deposit reverses it.
create or replace function public.tg_reverse_goal_contributions_on_tx_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if (new.deleted_at is not null and old.deleted_at is null)
     or (coalesce(new.is_active, true) = false and coalesce(old.is_active, true) = true) then
    for r in
      update public.goal_contributions
         set deleted_at = now()
       where user_id = new.user_id
         and transaction_id = new.id::text
         and deleted_at is null
      returning goal_id, amount
    loop
      update public.savings_goals
         set saved_amount = greatest(0, round(saved_amount - r.amount, 2))
       where id = r.goal_id and user_id = new.user_id;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_reverse_goal_contributions on public.transactions;
create trigger transactions_reverse_goal_contributions
  after update of deleted_at, is_active on public.transactions
  for each row execute function public.tg_reverse_goal_contributions_on_tx_delete();

-- ---------------------------------------------------------------------------
-- 4. investment_totals (rebuilt; nothing in the schema depends on it)
-- ---------------------------------------------------------------------------
drop view if exists public.investment_totals;
create view public.investment_totals
with (security_invoker = on)
as
with inv as (
  select i.user_id,
         sum(i.invested_amount) as invested,
         sum(i.current_value) as current_value,
         count(*) as holdings
  from public.investments i
  where i.user_id = auth.uid() and i.deleted_at is null
  group by i.user_id
),
linked as (
  select distinct unnest(i.source_transaction_ids) as tx_id
  from public.investments i
  where i.user_id = auth.uid() and i.deleted_at is null
),
tx as (
  select t.user_id, sum(ts.amount) as amt
  from public.transactions t
  join public.transaction_splits ts on ts.transaction_id = t.id and ts.user_id = t.user_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and coalesce(t.is_active, true)
    and t.deleted_at is null
    and t.status not in ('unverified', 'rejected', 'failed', 'refunded')
    and not (coalesce(t.tags, '{}'::text[]) && array['transfer', 'settlement'])
    and (
      exists (
        select 1 from public.categories c
        where c.user_id = t.user_id
          and c.name = ts.category_id
          and c.is_investment
          and c.deleted_at is null
      )
      or exists (
        select 1
        from public.global_settings gs,
             jsonb_array_elements(coalesce(gs.default_categories, '[]'::jsonb)) e
        where gs.id = 'app'
          and e->>'name' = ts.category_id
          and coalesce((e->>'isInvestment')::boolean, false)
      )
      or lower(btrim(coalesce(ts.category_id, ''))) in
         ('investment', 'investments', 'mutual fund', 'mutual funds', 'stocks', 'sip')
    )
    and not exists (select 1 from linked l where l.tx_id = t.id::text)
  group by t.user_id
)
select coalesce(inv.user_id, tx.user_id) as user_id,
       coalesce(inv.invested, 0) + coalesce(tx.amt, 0) as total_invested,
       coalesce(inv.current_value, 0) + coalesce(tx.amt, 0) as total_current_value,
       coalesce(inv.holdings, 0)::int as holdings_count,
       coalesce(tx.amt, 0) as unlinked_transactions_total
from inv
full join tx on tx.user_id = inv.user_id;

revoke all on public.investment_totals from anon;
grant select on public.investment_totals to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Data migration (idempotent)
-- ---------------------------------------------------------------------------
-- 5a. Holdings stored by older mobile builds inside projector_settings JSON.
insert into public.investments (id, user_id, name, type, invested_amount, current_value, notes, created_at, updated_at)
select public.spentx_legacy_uuid(ps.user_id, 'holding', coalesce(h->>'id', md5(h::text))),
       ps.user_id,
       coalesce(nullif(btrim(h->>'name'), ''), 'Investment'),
       public.spentx_investment_type(h->>'type'),
       greatest(0, round(coalesce(public.spentx_try_numeric(h->>'amount'), 0), 2)),
       greatest(0, round(coalesce(public.spentx_try_numeric(h->>'amount'), 0)
                * (1 + coalesce(public.spentx_try_numeric(h->>'growthPercent'), 0) / 100), 2)),
       'Moved from the old holdings list',
       coalesce(public.spentx_try_timestamptz(h->>'updatedAt'), now()),
       now()
from public.projector_settings ps
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(ps.settings->'holdings') = 'array' then ps.settings->'holdings' else '[]'::jsonb end
) h
where jsonb_typeof(h) = 'object'
on conflict (id) do nothing;

-- 5b. Investment-typed accounts (only exist if accounts.type was widened by hand).
do $$
declare
  n int;
begin
  insert into public.investments (id, user_id, name, type, invested_amount, current_value, account_id, notes, created_at)
  select public.spentx_legacy_uuid(a.user_id, 'account', a.id::text),
         a.user_id,
         a.name,
         public.spentx_investment_type(a.type),
         greatest(0, coalesce(a.opening_balance, 0)),
         greatest(0, coalesce(a.opening_balance, 0)),
         a.id,
         'Moved from an investment account',
         a.created_at
  from public.accounts a
  where a.type not in ('bank', 'cash', 'wallet', 'credit')
    and coalesce(a.is_active, true)
    and a.deleted_at is null
  on conflict (id) do nothing;
  get diagnostics n = row_count;

  update public.accounts
     set is_active = false, deleted_at = coalesce(deleted_at, now())
   where type not in ('bank', 'cash', 'wallet', 'credit')
     and (coalesce(is_active, true) or deleted_at is null);

  if n > 0 then
    raise notice 'Moved % investment account(s) into investments', n;
  end if;
end $$;

-- Re-assert the accounts type rule for new rows (NOT VALID keeps old rows).
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('bank', 'cash', 'wallet', 'credit')) not valid;

-- ---------------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------------
alter table public.investments replica identity full;
alter table public.goal_contributions replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'investments') then
      execute 'alter publication supabase_realtime add table public.investments';
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'goal_contributions') then
      execute 'alter publication supabase_realtime add table public.goal_contributions';
    end if;
  end if;
end $$;
