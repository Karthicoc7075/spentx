-- PRECHECK for supabase/migrations/20261011_admin_fixes.sql  (Phase S5b). READ-ONLY.
-- Run before the migration (and before rollback.sql). Every row must show
-- ok = true; otherwise stop. Then take the backup and save the output of
-- supabase/backup/verify.sql.

-- 1. Is rollback.sql still current? (fingerprint of the functions it restores)
select 'rollback_fingerprint' as check_name,
       md5(string_agg(pg_get_functiondef(p.oid), ''
           order by p.proname, pg_get_function_identity_arguments(p.oid)))
         = 'e38135e3abc02c0c9e2c8253703d781c' as ok,
       count(*)::text || ' functions; expected 48, fingerprint e38135e3abc02c0c9e2c8253703d781c' as detail
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
where p.proname::text = any (array['admin_action_log_matches', 'admin_allowed_tables', 'admin_assert_table', 'admin_audit_config_change', 'admin_count_action_logs', 'admin_count_backups', 'admin_count_table', 'admin_count_users', 'admin_deletable_tables', 'admin_delete_row', 'admin_escape_like', 'admin_find_user', 'admin_get_metrics', 'admin_get_overview', 'admin_get_user_balance_inputs', 'admin_get_user_overview', 'admin_insert_row', 'admin_insertable_tables', 'admin_ist_month_start', 'admin_list_action_logs', 'admin_list_backups', 'admin_list_table', 'admin_list_users', 'admin_log_action', 'admin_purge_api_logs', 'admin_restore_row', 'admin_row_target', 'admin_start_impersonation', 'admin_table_has_column', 'admin_table_meta', 'admin_table_pk', 'admin_table_user_col', 'admin_table_where', 'admin_tx_counts_for_balance', 'admin_tx_first_category', 'admin_tx_is_confirmed', 'admin_updatable_tables', 'admin_update_row', 'admin_upsert_keyword_rule', 'admin_upsert_merchant_brand', 'admin_user_income_amount', 'admin_user_matches', 'admin_user_spend_amount', 'impersonation_add_goal_contribution', 'is_admin', 'protect_user_identity', 'protect_user_role', 'require_admin']::text[]);

-- 2. Already applied on live (2026-10-21)? Then do NOT re-run the migration:
--    run verify.sql only. Re-running re-creates objects that later
--    migrations changed (e.g. 20261012_goal_investment_sync.sql drops
--    trigger transactions_reverse_goal_contributions).
--    The checks in verify.sql double as "is it applied" checks: all ok = true
--    means applied.
