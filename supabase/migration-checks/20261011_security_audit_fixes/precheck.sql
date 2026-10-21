-- PRECHECK for supabase/migrations/20261011_security_audit_fixes.sql  (Phase S5b). READ-ONLY.
-- Run before the migration (and before rollback.sql). Every row must show
-- ok = true; otherwise stop. Then take the backup and save the output of
-- supabase/backup/verify.sql.

-- 1. Is rollback.sql still current? (fingerprint of the functions it restores)
select 'rollback_fingerprint' as check_name,
       md5(string_agg(pg_get_functiondef(p.oid), ''
           order by p.proname, pg_get_function_identity_arguments(p.oid)))
         = 'a4fc301f9b5a8c22eb5b43aa01ce74f3' as ok,
       count(*)::text || ' functions; expected 9, fingerprint a4fc301f9b5a8c22eb5b43aa01ce74f3' as detail
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
where p.proname::text = any (array['admin_user_spend_amount', 'cascade_delete_friend', 'cascade_delete_outing', 'purge_expired_deleted_outings', 'restore_deleted_outing', 'spentx_caller_may_act_for', 'spentx_ist_month_key', 'tg_reverse_goal_contributions_on_tx_delete', 'tg_transactions_ist_month_key']::text[]);

-- 2. Already applied on live (2026-10-21)? Then do NOT re-run the migration:
--    run verify.sql only. Re-running re-creates objects that later
--    migrations changed (e.g. 20261012_goal_investment_sync.sql drops
--    trigger transactions_reverse_goal_contributions).
--    The checks in verify.sql double as "is it applied" checks: all ok = true
--    means applied.
