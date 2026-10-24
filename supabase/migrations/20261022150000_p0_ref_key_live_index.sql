-- Phase 0 / Phase 4 gap 3 (Oct 22, 2026): bank-reference duplicate guard
-- counts only LIVE rows.
--
-- Today: transactions_user_ref_key_uidx (from 20261021120000, applied
-- Oct 22) is unique on (user_id, ref_key) for every row with a ref_key,
-- including undone / soft-deleted ones. The app now fills ref_key
-- (v1:<bank:last4>:<d|c|t>:<paise>:<bank ref>) on SMS / notification rows.
-- With the old index, a transaction the user undid (soft-deleted) still
-- holds its key, so adding the same bank event again is refused; the app
-- then keeps the row without a key (never dropped), so nothing is lost, but
-- that row is no longer server-protected.
-- Fix: same uniqueness, but only for live rows (deleted_at is null and
-- is_active is not false). Live duplicates stay impossible.
--
-- NOT required for the app to work: the app is safe with the old index.
-- Recommended before release. Changes no data. Safe to run more than once.
-- Run order: backup (supabase/backup/backup.sh) -> precheck (every row ok)
-- -> this file -> verify. Rollback restores the old index exactly.
-- Note: restoring a soft-deleted row whose bank event was re-added since
-- will fail with 23505 instead of creating a duplicate (by design).

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- New index first, so there is never a moment without a guard.
create unique index if not exists transactions_user_ref_key_live_uidx
  on public.transactions (user_id, ref_key)
  where ref_key is not null
    and deleted_at is null
    and is_active is not false;

drop index if exists public.transactions_user_ref_key_uidx;

commit;
