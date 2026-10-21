-- VERIFY for supabase/migrations/20261011_security_audit_fixes.sql (Phase S5b).
-- READ-ONLY. Every row must show ok = true. Then compare
-- supabase/backup/verify.sql (transactions data_md5, balances_per_account).
-- Note: trigger transactions_reverse_goal_contributions is intentionally
-- absent: 20261012_goal_investment_sync.sql drops it.

select 'caller_guard' as check_name,
       to_regprocedure('public.spentx_caller_may_act_for(uuid)') is not null as ok,
       'spentx_caller_may_act_for(uuid)' as detail
union all
select 'cascade_rpcs_not_anon',
       not has_function_privilege('anon', 'public.cascade_delete_friend(uuid,uuid)', 'execute')
       and not has_function_privilege('anon', 'public.cascade_delete_outing(uuid,uuid)', 'execute')
       and not has_function_privilege('anon', 'public.restore_deleted_outing(uuid,uuid)', 'execute')
       and not has_function_privilege('anon', 'public.purge_expired_deleted_outings()', 'execute'),
       'anon cannot call cascade/restore/purge'
union all
select 'share_logs_locked',
       not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'share_access_logs'
                   and policyname = 'share_access_logs_insert_any')
       and not has_table_privilege('anon', 'public.share_access_logs', 'insert'),
       'no anonymous insert into share_access_logs'
union all
select 'goal_contrib_writes_rpc_only',
       not has_table_privilege('authenticated', 'public.goal_contributions', 'insert')
       and not has_table_privilege('authenticated', 'public.goal_contributions', 'update'),
       'clients cannot write goal_contributions directly'
union all
select 'reversed_at_column',
       exists (select 1 from information_schema.columns where table_schema = 'public'
               and table_name = 'goal_contributions' and column_name = 'reversed_at'),
       'goal_contributions.reversed_at'
union all
select 'month_key_trigger',
       exists (select 1 from pg_trigger where not tgisinternal
               and tgname = 'transactions_ist_month_key'
               and tgrelid = 'public.transactions'::regclass),
       'transactions_ist_month_key'
union all
select 'month_key_filled',
       not exists (select 1 from public.transactions
                   where transaction_date is not null
                     and month_key is distinct from
                         public.spentx_ist_month_key(transaction_date)),
       'every month_key matches IST month of transaction_date'
union all
select 'soft_delete_columns',
       (select count(*) from information_schema.columns where table_schema = 'public'
         and column_name = 'deleted_at'
         and table_name in ('budget_templates', 'smart_views')) = 2,
       'budget_templates / smart_views deleted_at';
