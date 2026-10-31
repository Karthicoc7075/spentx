-- Migration: 20261031140000_clear_zero_snapshots.sql
-- Description: Clear legacy development ₹0 snapshots from account_balance_history and net_worth_history.
--
-- PREVIEW / AUDIT (Run these first to verify count before deleting):
--
-- SELECT count(*) AS zero_account_snapshots_count
-- FROM public.account_balance_history
-- WHERE balance = 0;
--
-- SELECT count(*) AS zero_net_worth_snapshots_count
-- FROM public.net_worth_history
-- WHERE net_worth = 0
--   AND cash_balance = 0
--   AND bank_balance = 0
--   AND investment_value = 0
--   AND coalesce(wallet_balance, 0) = 0;

-- 1. Remove ₹0 account balance snapshots created by website bootstrap
DELETE FROM public.account_balance_history
WHERE balance = 0;

-- 2. Remove ₹0 net worth snapshots created by website bootstrap
DELETE FROM public.net_worth_history
WHERE net_worth = 0
  AND cash_balance = 0
  AND bank_balance = 0
  AND investment_value = 0
  AND coalesce(wallet_balance, 0) = 0;
