-- Migration: 20260755_transfer_transactions.sql
-- Description: Adds a real Transfer transaction type. A transfer moves
-- money between two of the user's own accounts and must never affect
-- income/expense/budget totals — only account balances / net worth (which
-- nets to zero across the two accounts involved).
--
-- Design: `account_id` (existing, NOT NULL) is reused as the transfer's
-- "from" side — it already means "the account this transaction belongs to"
-- everywhere in the codebase (resolveAccountId, transactionMatchesAccount,
-- mobile's RemoteIdCache), so a transfer's source account gets that meaning
-- for free. Only `to_account_id` (nullable — null for expense/income rows)
-- is new.
--
-- Splits are deliberately skipped for transfers: transaction_splits.purpose_id
-- is NOT NULL (init.sql:245) and has no meaning for a transfer. Skipping
-- transaction_splits entirely is what naturally excludes transfers from any
-- view that inner-joins it (monthly_plan_actuals, investment_totals).

alter table public.transactions add column if not exists to_account_id uuid
  references public.accounts(id) on delete restrict;

alter table public.transactions add column if not exists transfer_type text
  check (transfer_type in ('bank_to_bank', 'bank_to_cash', 'cash_to_bank'));

-- transfer_type/to_account_id are set only when type = 'transfer'; enforce
-- the pairing so a transfer can never be missing its sub-kind and
-- non-transfers can't carry one.
alter table public.transactions drop constraint if exists transactions_transfer_shape_check;
alter table public.transactions add constraint transactions_transfer_shape_check
  check (
    (type = 'transfer' and to_account_id is not null and transfer_type is not null)
    or
    (type <> 'transfer' and to_account_id is null and transfer_type is null)
  );

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('income', 'expense', 'transfer'));

create index if not exists transactions_user_to_account_idx
  on public.transactions (user_id, to_account_id) where to_account_id is not null;

comment on column public.transactions.account_id is
  'For type=transfer this is the FROM account. For expense/income it is simply the account.';
comment on column public.transactions.to_account_id is
  'TO account for type=transfer only. Null otherwise.';
comment on column public.transactions.transfer_type is
  'bank_to_bank | bank_to_cash | cash_to_bank. Set only when type=transfer.';

-- ── RPC: create_transfer — single-row transfer, no transaction_splits ────
create or replace function public.create_transfer(
  p_transfer jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, to_account_id, merchant, total_amount, type,
    transfer_type, payment_method, source, entry_source, transaction_date,
    month_key, note, status, has_splits, has_items
  )
  select
    auth.uid(),
    (p_transfer->>'fromAccountId')::uuid,
    (p_transfer->>'toAccountId')::uuid,
    coalesce(p_transfer->>'merchant', 'Transfer'),
    (p_transfer->>'amount')::numeric,
    'transfer',
    p_transfer->>'transferType',
    coalesce(p_transfer->>'paymentMethod', 'UPI'),
    coalesce(p_transfer->>'source', 'manual'),
    coalesce(p_transfer->>'entrySource', 'manual'),
    (p_transfer->>'transactionDate')::timestamptz,
    p_transfer->>'monthKey',
    p_transfer->>'note',
    coalesce(p_transfer->>'status', 'completed'),
    false,
    false
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$ language plpgsql security invoker;

-- Impersonation variant (service role only) — keep in sync with the RPC above.
create or replace function public.impersonation_create_transfer(
  p_user_id uuid,
  p_transfer jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, to_account_id, merchant, total_amount, type,
    transfer_type, payment_method, source, entry_source, transaction_date,
    month_key, note, status, has_splits, has_items
  )
  select
    p_user_id,
    (p_transfer->>'fromAccountId')::uuid,
    (p_transfer->>'toAccountId')::uuid,
    coalesce(p_transfer->>'merchant', 'Transfer'),
    (p_transfer->>'amount')::numeric,
    'transfer',
    p_transfer->>'transferType',
    coalesce(p_transfer->>'paymentMethod', 'UPI'),
    coalesce(p_transfer->>'source', 'manual'),
    coalesce(p_transfer->>'entrySource', 'manual'),
    (p_transfer->>'transactionDate')::timestamptz,
    p_transfer->>'monthKey',
    p_transfer->>'note',
    coalesce(p_transfer->>'status', 'completed'),
    false,
    false
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$ language plpgsql security definer;
