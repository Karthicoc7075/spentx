-- ============================================================================
-- Friend splits get first-class storage.
--
-- Before this migration a "Friend split" on a normal transaction was stored as
-- a hidden `is_quick_split` outing plus an outing_expenses row (and settlements
-- rows), so the outing machinery could track who-owes-whom. That meant a
-- one-off shared bill silently created an outing, outing expense, outing
-- members and outing settlements.
--
-- A friend split is a single shared transaction, not a trip. It now lives in
-- its own tables and never touches the outing tables.
-- ============================================================================

create table if not exists public.friend_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The personal-ledger row this split describes. One split per transaction.
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null,
  category_id text,
  split_date timestamptz not null,
  -- Member roster for this one split: [{ id, name, upiId?, friendId?, isCurrentUser? }]
  members jsonb not null default '[]',
  paid_by_member_id text not null,
  split_type text not null check (split_type in ('equally','solo','custom','percentage','shares')),
  -- Per-member shares: [{ memberId, amount }]
  splits jsonb not null default '[]',
  account_name text,
  payment_mode text,
  note text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A transaction has at most one friend split.
create unique index if not exists friend_splits_transaction_idx
  on public.friend_splits (transaction_id);
create index if not exists friend_splits_user_active_idx
  on public.friend_splits (user_id, is_active);
create index if not exists friend_splits_date_idx
  on public.friend_splits (user_id, split_date desc);

-- Settling up on a friend split — deliberately separate from public.settlements,
-- which is outing-scoped (settlements.outing_id is NOT NULL).
create table if not exists public.friend_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_split_id uuid not null references public.friend_splits(id) on delete cascade,
  from_member_id text not null,
  to_member_id text not null,
  amount numeric(14,2) not null,
  is_partial boolean not null default false,
  settled_date timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists friend_settlements_split_idx
  on public.friend_settlements (friend_split_id);
create index if not exists friend_settlements_user_idx
  on public.friend_settlements (user_id);

alter table public.friend_splits enable row level security;
alter table public.friend_settlements enable row level security;

drop policy if exists "friend_splits_own" on public.friend_splits;
create policy "friend_splits_own" on public.friend_splits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "friend_settlements_own" on public.friend_settlements;
create policy "friend_settlements_own" on public.friend_settlements
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- Backfill: convert every existing quick-split outing into a friend_splits row,
-- carry its settlements over, then drop the outing. transactions.outing_id is
-- ON DELETE SET NULL, so the ledger row survives and simply unlinks.
-- ============================================================================

-- One friend split per transaction (enforced by friend_splits_transaction_idx),
-- so pick a single winning expense per linked transaction. A quick-split outing
-- has exactly one expense by construction; DISTINCT ON just makes that safe.
with converted as (
  select distinct on (e.linked_transaction_id)
    e.id            as expense_id,
    e.outing_id     as outing_id,
    e.user_id       as user_id,
    e.linked_transaction_id as transaction_id,
    e.description   as description,
    e.amount        as amount,
    e.category_id   as category_id,
    e.expense_date  as expense_date,
    o.members       as members,
    e.paid_by_member_id as paid_by_member_id,
    e.split_type    as split_type,
    e.splits        as splits,
    e.account_name  as account_name,
    e.payment_mode  as payment_mode,
    coalesce(e.is_active, true) as is_active,
    e.created_at    as created_at,
    e.updated_at    as updated_at
  from public.outing_expenses e
  join public.outings o on o.id = e.outing_id
  where o.is_quick_split = true
    and e.linked_transaction_id is not null
  order by e.linked_transaction_id, e.created_at asc
)
insert into public.friend_splits (
  id, user_id, transaction_id, description, amount, category_id, split_date,
  members, paid_by_member_id, split_type, splits, account_name, payment_mode,
  is_active, created_at, updated_at
)
select
  expense_id, user_id, transaction_id, description, amount, category_id,
  expense_date, members, paid_by_member_id, split_type, splits, account_name,
  payment_mode, is_active, created_at, updated_at
from converted
on conflict do nothing;

-- Carry settlements across. Each quick-split outing maps to exactly one
-- friend_splits row, so pick that one row per outing before joining — otherwise
-- a settlement would fan out across every converted expense of the outing.
with split_for_outing as (
  select distinct on (e.outing_id) e.outing_id, fs.id as friend_split_id
  from public.outing_expenses e
  join public.friend_splits fs on fs.id = e.id
  order by e.outing_id, e.created_at asc
)
insert into public.friend_settlements (
  user_id, friend_split_id, from_member_id, to_member_id, amount,
  is_partial, settled_date, note, created_at
)
select
  s.user_id,
  sfo.friend_split_id,
  s.from_member_id,
  s.to_member_id,
  s.amount,
  coalesce(s.is_partial, false),
  s.settled_date,
  s.note,
  s.created_at
from public.settlements s
join split_for_outing sfo on sfo.outing_id = s.outing_id;

-- Quick-split outings that made it across are no longer needed. The FK cascade
-- clears their outing_expenses and settlements; linked transactions unlink.
delete from public.outings o
where o.is_quick_split = true
  and exists (
    select 1
    from public.outing_expenses e
    join public.friend_splits fs on fs.id = e.id
    where e.outing_id = o.id
  );

comment on table public.friend_splits is
  'One-off shared expense between friends. Independent of outings — creating a friend split must never create an outing.';
comment on table public.friend_settlements is
  'Settle-up records against a friend_splits row.';

