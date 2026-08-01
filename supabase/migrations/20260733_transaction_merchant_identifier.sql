-- Merchant identifier parity (web + mobile manual add / SMS learning).
--
-- Before: UPI / merchant id lived only in tags (`upi:…`) or loosely in
-- `reference` / `reference_id`. That is lossy and hard to query.
--
-- After:
--   transactions.upi             — primary UPI VPA or merchant identifier
--   transactions.raw_identifier  — stable learning key (often same as upi)
--
-- Also: keep reference / reference_id for UTR / free-text refs.

-- ── columns ──────────────────────────────────────────────────────────────
alter table public.transactions
  add column if not exists upi text;

alter table public.transactions
  add column if not exists raw_identifier text;

comment on column public.transactions.upi is
  'UPI VPA or merchant identifier used for merchant learning / match (not display title).';
comment on column public.transactions.raw_identifier is
  'Stable merchant lookup key; usually mirrors upi, or SMS raw payee id.';

-- ── indexes ──────────────────────────────────────────────────────────────
create index if not exists transactions_user_upi_idx
  on public.transactions (user_id, upi)
  where upi is not null and btrim(upi) <> '';

create index if not exists transactions_user_raw_identifier_idx
  on public.transactions (user_id, raw_identifier)
  where raw_identifier is not null and btrim(raw_identifier) <> '';

-- ── backfill from tags upi:… ─────────────────────────────────────────────
update public.transactions t
set
  upi = coalesce(
    nullif(btrim(t.upi), ''),
    (
      select nullif(btrim(substring(tag from 5)), '')
      from unnest(coalesce(t.tags, array[]::text[])) as tag
      where tag ilike 'upi:%'
      limit 1
    )
  ),
  raw_identifier = coalesce(
    nullif(btrim(t.raw_identifier), ''),
    (
      select nullif(btrim(substring(tag from 5)), '')
      from unnest(coalesce(t.tags, array[]::text[])) as tag
      where tag ilike 'upi:%'
      limit 1
    )
  )
where
  (t.upi is null or btrim(t.upi) = '')
  and exists (
    select 1
    from unnest(coalesce(t.tags, array[]::text[])) as tag
    where tag ilike 'upi:%'
  );

-- ── backfill from reference fields when still empty ──────────────────────
-- Prefer values that look like UPI (contain @) or any non-empty reference_id.
update public.transactions t
set
  upi = coalesce(
    nullif(btrim(t.upi), ''),
    case
      when t.reference is not null and t.reference like '%@%' then btrim(t.reference)
      when t.reference_id is not null and t.reference_id like '%@%' then btrim(t.reference_id)
      when t.reference_id is not null and btrim(t.reference_id) <> '' then btrim(t.reference_id)
      when t.reference is not null and btrim(t.reference) <> '' then btrim(t.reference)
      else null
    end
  ),
  raw_identifier = coalesce(
    nullif(btrim(t.raw_identifier), ''),
    case
      when t.reference is not null and t.reference like '%@%' then btrim(t.reference)
      when t.reference_id is not null and t.reference_id like '%@%' then btrim(t.reference_id)
      when t.reference_id is not null and btrim(t.reference_id) <> '' then btrim(t.reference_id)
      when t.reference is not null and btrim(t.reference) <> '' then btrim(t.reference)
      else null
    end
  )
where
  (t.upi is null or btrim(t.upi) = '')
  and (
    (t.reference is not null and btrim(t.reference) <> '')
    or (t.reference_id is not null and btrim(t.reference_id) <> '')
  );

-- When upi filled but raw_identifier empty, mirror.
update public.transactions t
set raw_identifier = btrim(t.upi)
where
  t.upi is not null
  and btrim(t.upi) <> ''
  and (t.raw_identifier is null or btrim(t.raw_identifier) = '');

-- ── RPC: create_transaction_with_splits — accept upi / rawIdentifier ─────
create or replace function public.create_transaction_with_splits(
  p_transaction jsonb,
  p_splits jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, merchant, total_amount, type, payment_method, source,
    entry_source, transaction_date, month_key, description, note, reference,
    reference_id, upi, raw_identifier, status, has_splits, tags, outing_id
  )
  select
    auth.uid(),
    (p_transaction->>'accountId')::uuid,
    p_transaction->>'merchant',
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

  return v_transaction_id;
end;
$$ language plpgsql security invoker;

-- Impersonation variant (service role only) — keep in sync with main RPC.
create or replace function public.impersonation_create_transaction_with_splits(
  p_user_id uuid,
  p_transaction jsonb,
  p_splits jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, merchant, total_amount, type, payment_method, source,
    entry_source, transaction_date, month_key, description, note, reference,
    reference_id, upi, raw_identifier, status, has_splits, tags, outing_id
  )
  select
    p_user_id,
    (p_transaction->>'accountId')::uuid,
    p_transaction->>'merchant',
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

  return v_transaction_id;
end;
$$ language plpgsql security definer;
