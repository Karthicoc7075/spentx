-- VERIFY for supabase/migrations/20261011_admin_fixes.sql (Phase S5b).
-- READ-ONLY. Every row must show ok = true. This migration changes no user
-- data: every data_md5 in supabase/backup/verify.sql must be unchanged.

select 'admin_functions' as check_name,
       (select count(distinct p.proname) from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.proname in ('protect_user_identity', 'protect_user_role', 'is_admin',
             'require_admin', 'admin_ist_month_start', 'admin_escape_like',
             'admin_log_action', 'admin_allowed_tables', 'admin_deletable_tables',
             'admin_updatable_tables', 'admin_insertable_tables', 'admin_table_pk',
             'admin_table_user_col', 'admin_table_has_column', 'admin_assert_table',
             'admin_table_meta', 'admin_table_where', 'admin_list_table',
             'admin_count_table', 'admin_row_target', 'admin_insert_row',
             'admin_update_row', 'admin_delete_row', 'admin_restore_row',
             'admin_tx_is_confirmed', 'admin_tx_first_category',
             'admin_tx_counts_for_balance', 'admin_user_spend_amount',
             'admin_user_income_amount', 'admin_user_matches', 'admin_list_users',
             'admin_count_users', 'admin_find_user', 'admin_get_user_overview',
             'admin_get_user_balance_inputs', 'admin_get_overview', 'admin_get_metrics',
             'admin_action_log_matches', 'admin_list_action_logs',
             'admin_count_action_logs', 'admin_list_backups', 'admin_count_backups',
             'admin_purge_api_logs', 'admin_start_impersonation',
             'impersonation_add_goal_contribution', 'admin_audit_config_change',
             'admin_upsert_merchant_brand', 'admin_upsert_keyword_rule')) = 48 as ok,
       '48 admin functions present' as detail
union all
select 'is_admin_callable',
       has_function_privilege('authenticated', 'public.is_admin()', 'execute'),
       'authenticated can call is_admin()'
union all
select 'identity_trigger',
       exists (select 1 from pg_trigger where not tgisinternal
               and tgname = 'protect_user_identity'
               and tgrelid = 'public.users'::regclass),
       'protect_user_identity on users'
union all
select 'config_audit_triggers',
       (select count(*) from pg_trigger where not tgisinternal
         and tgname = 'admin_audit_config_change') = 5,
       'admin_audit_config_change on 5 config tables (2026-10-21: 5)'
union all
select 'action_log_columns',
       (select count(*) from information_schema.columns where table_schema = 'public'
         and table_name = 'admin_action_logs' and column_name in ('after', 'reason')) = 2,
       'admin_action_logs.after / reason'
union all
select 'impersonation_mode',
       not exists (select 1 from public.admin_impersonation_sessions where mode is null),
       'every impersonation session has a mode';
