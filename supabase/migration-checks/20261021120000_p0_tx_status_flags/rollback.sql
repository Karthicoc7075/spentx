-- ROLLBACK for 20261021120000_p0_tx_status_flags (Phase 0).
-- The status check below is the definition from
-- 20261006_unverified_transactions_sync.sql; precheck.sql confirms live
-- still matches it before the migration runs.
--
-- Rows written after the migration with status reversed / unknown, or with
-- no account, would block steps 1 and 3: the guard stops and nothing is
-- changed. Decide on those rows first (see the counts it prints).

begin;

do $$
declare n_status int; n_unassigned int;
begin
  select count(*) into n_status from public.transactions
   where status in ('reversed', 'unknown');
  select count(*) into n_unassigned from public.transactions
   where account_id is null;
  if n_status > 0 or n_unassigned > 0 then
    raise exception 'rollback stopped: % rows with reversed/unknown status, % Unassigned rows',
      n_status, n_unassigned;
  end if;
end $$;

drop index if exists public.transactions_user_linked_original_idx;
drop index if exists public.transactions_user_ref_key_uidx;

alter table public.transactions drop constraint if exists transactions_refunded_amount_check;
alter table public.transactions drop constraint if exists transactions_link_kind_check;
alter table public.transactions drop constraint if exists transactions_channel_check;
alter table public.transactions drop constraint if exists transactions_review_flags_check;

-- 1. status check as before
alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('completed', 'pending', 'failed', 'refunded', 'unverified', 'rejected'));

-- 3. account required again
alter table public.transactions alter column account_id set not null;

-- The data columns stay (the app ignores them on an old schema and falls
-- back automatically). Drop only after an explicit decision:
-- alter table public.transactions drop column if exists review_flags;        -- DATA LOSS
-- alter table public.transactions drop column if exists channel;             -- DATA LOSS
-- alter table public.transactions drop column if exists rule_id;             -- DATA LOSS
-- alter table public.transactions drop column if exists rule_version;        -- DATA LOSS
-- alter table public.transactions drop column if exists source_event_ids;    -- DATA LOSS
-- alter table public.transactions drop column if exists linked_original_id;  -- DATA LOSS
-- alter table public.transactions drop column if exists link_kind;           -- DATA LOSS
-- alter table public.transactions drop column if exists refunded_amount;     -- DATA LOSS
-- alter table public.transactions drop column if exists ref_key;             -- DATA LOSS
-- alter table public.transactions drop column if exists balance_applied;     -- DATA LOSS

commit;
