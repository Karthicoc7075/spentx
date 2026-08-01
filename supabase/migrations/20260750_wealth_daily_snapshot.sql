-- Migration: 20260750_wealth_daily_snapshot.sql
-- Description: Activates the "Daily Snapshot" wealth-history feature.
--
-- net_worth_history (20260718_user_bootstrap_schema_fixes.sql) and
-- account_balance_history (init.sql) already model exactly what this
-- feature needs (one net-worth row per user/day, one balance row per
-- account/day) — they were seeded once at signup with zero values and
-- never populated again. Rather than adding a third parallel
-- wealth_snapshots/wealth_snapshot_accounts pair, this feature reads and
-- writes those two existing tables. This migration only adds what's
-- actually missing:
--   1. net_worth_history has no wallet_balance column (cash/bank/investment
--      only) — the feature also needs to show wallet totals separately.
--   2. Neither table has a delete policy, so a user can never remove a
--      snapshot they created.

alter table public.net_worth_history
  add column if not exists wallet_balance numeric(14,2) not null default 0;

drop policy if exists "net_worth_history_delete_own" on public.net_worth_history;
create policy "net_worth_history_delete_own" on public.net_worth_history
  for delete using (user_id = auth.uid());

drop policy if exists "account_balance_history_delete_own" on public.account_balance_history;
create policy "account_balance_history_delete_own" on public.account_balance_history
  for delete using (user_id = auth.uid());
