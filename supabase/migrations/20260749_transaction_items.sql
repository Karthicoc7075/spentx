-- Migration: 20260749_transaction_items.sql
-- Description: Adds an optional "Transaction Title / Itemization" layer.
--
-- SMS-imported transactions only carry a merchant name + amount, so the
-- ledger loses what was actually bought. This adds two purely additive,
-- optional pieces, both independent of the existing Split Expense data
-- model (transaction_splits, which allocates an amount across purposes/
-- categories/contributors and is NOT touched here):
--   1. transactions.title  — a single free-text display title.
--   2. transaction_items   — an optional list of purchased line items
--      (name, category, amount), one row per item.
--
-- Both are nullable/empty by default so SMS auto-detected transactions keep
-- being created fully automatically with no extra input required.

alter table public.transactions add column if not exists title text;
alter table public.transactions add column if not exists has_items boolean not null default false;

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_id text,
  amount numeric(14,2) not null,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists transaction_items_transaction_idx on public.transaction_items (transaction_id);
create index if not exists transaction_items_user_idx on public.transaction_items (user_id);

alter table public.transaction_items enable row level security;

drop policy if exists "transaction_items_select_own" on public.transaction_items;
create policy "transaction_items_select_own" on public.transaction_items for select using (user_id = auth.uid());

drop policy if exists "transaction_items_write_own" on public.transaction_items;
create policy "transaction_items_write_own" on public.transaction_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── RPC: create_transaction_with_splits — accept optional p_items ────────
-- A defaulted extra parameter is a DIFFERENT overload in Postgres (function
-- identity includes the full parameter list, not just the name), so the old
-- 2-arg version must be dropped first — otherwise a 2-arg call becomes
-- ambiguous between it and the new 3-arg-with-default version.
drop function if exists public.create_transaction_with_splits(jsonb, jsonb);

create or replace function public.create_transaction_with_splits(
  p_transaction jsonb,
  p_splits jsonb,
  p_items jsonb default '[]'::jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, merchant, title, total_amount, type, payment_method, source,
    entry_source, transaction_date, month_key, description, note, reference,
    reference_id, upi, raw_identifier, status, has_splits, has_items, tags, outing_id
  )
  select
    auth.uid(),
    (p_transaction->>'accountId')::uuid,
    p_transaction->>'merchant',
    nullif(p_transaction->>'title', ''),
    (p_transaction->>'totalAmount')::numeric,
    p_transaction->>'type',
    coalesce(p_transaction->>'paymentMethod', 'UPI'),
    coalesce(p_transaction->>'source', 'manual'),
    coalesce(p_transaction->>'entrySource', 'manual'),
    (p_transaction->>'transactionDate')::timestamptz,
    p_transaction->>'monthKey',
    p_transaction->>'description',
    p_transaction->>'note',
    p_transaction->>'reference',
    p_transaction->>'referenceId',
    nullif(coalesce(
      p_transaction->>'upi',
      p_transaction->>'upiId',
      ''
    ), ''),
    nullif(coalesce(
      p_transaction->>'rawIdentifier',
      p_transaction->>'raw_identifier',
      p_transaction->>'upi',
      p_transaction->>'upiId',
      ''
    ), ''),
    coalesce(p_transaction->>'status', 'completed'),
    jsonb_array_length(p_splits) > 1,
    jsonb_array_length(p_items) > 0,
    array(select jsonb_array_elements_text(coalesce(p_transaction->'tags', '[]'::jsonb))),
    nullif(p_transaction->>'outingId', '')::uuid
  returning id into v_transaction_id;

  insert into public.transaction_splits (
    transaction_id, user_id, purpose_id, category_id, contributor_id, outing_id, amount, note
  )
  select
    v_transaction_id,
    auth.uid(),
    (s->>'purposeId')::uuid,
    s->>'categoryId',
    nullif(s->>'contributorId', '')::uuid,
    nullif(s->>'outingId', '')::uuid,
    (s->>'amount')::numeric,
    s->>'note'
  from jsonb_array_elements(p_splits) as s;

  insert into public.transaction_items (
    transaction_id, user_id, name, category_id, amount, position
  )
  select
    v_transaction_id,
    auth.uid(),
    i.item->>'name',
    i.item->>'categoryId',
    (i.item->>'amount')::numeric,
    (i.ordinality - 1)::smallint
  from jsonb_array_elements(p_items) with ordinality as i(item, ordinality);

  return v_transaction_id;
end;
$$ language plpgsql security invoker;

-- Impersonation variant (service role only) — keep in sync with main RPC.
drop function if exists public.impersonation_create_transaction_with_splits(uuid, jsonb, jsonb);

create or replace function public.impersonation_create_transaction_with_splits(
  p_user_id uuid,
  p_transaction jsonb,
  p_splits jsonb,
  p_items jsonb default '[]'::jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, merchant, title, total_amount, type, payment_method, source,
    entry_source, transaction_date, month_key, description, note, reference,
    reference_id, upi, raw_identifier, status, has_splits, has_items, tags, outing_id
  )
  select
    p_user_id,
    (p_transaction->>'accountId')::uuid,
    p_transaction->>'merchant',
    nullif(p_transaction->>'title', ''),
    (p_transaction->>'totalAmount')::numeric,
    p_transaction->>'type',
    coalesce(p_transaction->>'paymentMethod', 'UPI'),
    coalesce(p_transaction->>'source', 'manual'),
    coalesce(p_transaction->>'entrySource', 'manual'),
    (p_transaction->>'transactionDate')::timestamptz,
    p_transaction->>'monthKey',
    p_transaction->>'description',
    p_transaction->>'note',
    p_transaction->>'reference',
    p_transaction->>'referenceId',
    nullif(coalesce(
      p_transaction->>'upi',
      p_transaction->>'upiId',
      ''
    ), ''),
    nullif(coalesce(
      p_transaction->>'rawIdentifier',
      p_transaction->>'raw_identifier',
      p_transaction->>'upi',
      p_transaction->>'upiId',
      ''
    ), ''),
    coalesce(p_transaction->>'status', 'completed'),
    jsonb_array_length(p_splits) > 1,
    jsonb_array_length(p_items) > 0,
    array(select jsonb_array_elements_text(coalesce(p_transaction->'tags', '[]'::jsonb))),
    nullif(p_transaction->>'outingId', '')::uuid
  returning id into v_transaction_id;

  insert into public.transaction_splits (
    transaction_id, user_id, purpose_id, category_id, contributor_id, outing_id, amount, note
  )
  select
    v_transaction_id,
    p_user_id,
    (s->>'purposeId')::uuid,
    s->>'categoryId',
    nullif(s->>'contributorId', '')::uuid,
    nullif(s->>'outingId', '')::uuid,
    (s->>'amount')::numeric,
    s->>'note'
  from jsonb_array_elements(p_splits) as s;

  insert into public.transaction_items (
    transaction_id, user_id, name, category_id, amount, position
  )
  select
    v_transaction_id,
    p_user_id,
    i.item->>'name',
    i.item->>'categoryId',
    (i.item->>'amount')::numeric,
    (i.ordinality - 1)::smallint
  from jsonb_array_elements(p_items) with ordinality as i(item, ordinality);

  return v_transaction_id;
end;
$$ language plpgsql security definer;
