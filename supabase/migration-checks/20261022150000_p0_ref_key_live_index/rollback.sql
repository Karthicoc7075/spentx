-- ROLLBACK for supabase/migrations/20261022150000_p0_ref_key_live_index.sql
-- Restores the original index from 20261021120000_p0_tx_status_flags.
-- Changes no data. If the CREATE fails with 23505, a soft-deleted row and a
-- live row share a key: keep the live-only index (do not delete data) and
-- ask before going further.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create unique index if not exists transactions_user_ref_key_uidx
  on public.transactions (user_id, ref_key)
  where ref_key is not null;

drop index if exists public.transactions_user_ref_key_live_uidx;

commit;
