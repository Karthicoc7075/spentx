-- Migration: 20261006_unverified_transactions_sync.sql
-- Enables hybrid sync engine unverified transactions & detection key deduplication
--
-- 1. Updates transactions_status_check constraint to allow 'unverified' and 'rejected'
-- 2. Adds detection_key column and unique index per user to prevent duplicate SMS/WorkManager uploads
-- 3. Adds is_auto_detected flag on public.transactions

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('completed', 'pending', 'failed', 'refunded', 'unverified', 'rejected'));

alter table public.transactions
  add column if not exists detection_key text;

alter table public.transactions
  add column if not exists is_auto_detected boolean not null default false;

create unique index if not exists transactions_user_detection_key_idx
  on public.transactions (user_id, detection_key)
  where detection_key is not null and btrim(detection_key) <> '';
