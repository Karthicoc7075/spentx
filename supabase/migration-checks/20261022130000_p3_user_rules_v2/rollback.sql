-- ROLLBACK for 20261022130000_p3_user_rules_v2.sql.
-- DESTRUCTIVE: drops the revision history and the Phase 3 columns (the
-- family / person flags and revisions saved since). Category, purpose,
-- title and trust are kept. Run only with explicit approval.

begin;
drop trigger if exists user_merchants_log_revision on public.user_merchants;
drop function if exists public.user_merchants_log_revision();
drop table if exists public.user_merchant_revisions;
drop index if exists public.user_merchants_user_upi_idx;
alter table public.user_merchants drop constraint if exists user_merchants_kind_check;
alter table public.user_merchants
  drop column if exists upi_id_normalized,
  drop column if exists revision,
  drop column if exists kind,
  drop column if exists is_family;
commit;
