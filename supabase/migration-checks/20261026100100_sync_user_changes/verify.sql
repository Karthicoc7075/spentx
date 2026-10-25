-- VERIFY for supabase/migrations/20261026100100_sync_user_changes.sql
-- READ-ONLY. Every row with a real check must show ok = true.

select 'user_changes_rls_on' as check_name,
       (select relrowsecurity from pg_class where oid = 'public.user_changes'::regclass) as ok,
       'RLS enabled' as detail
union all
select 'user_changes_select_own_only',
       exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'user_changes'
                  and policyname = 'user_changes_select_own' and cmd = 'SELECT')
       and not exists (select 1 from pg_policies
                        where schemaname = 'public' and tablename = 'user_changes'
                          and cmd <> 'SELECT'),
       'read own rows, no client write policy'
union all
select 'clients_cannot_write_user_changes',
       not has_table_privilege('authenticated', 'public.user_changes', 'insert')
       and not has_table_privilege('authenticated', 'public.user_changes', 'update')
       and not has_table_privilege('authenticated', 'public.user_changes', 'delete')
       and not has_table_privilege('anon', 'public.user_changes', 'select'),
       'grants'
union all
select 'bump_fn_not_callable_by_clients',
       not has_function_privilege('anon', 'public.sx_bump_user_change()', 'execute')
       and not has_function_privilege('authenticated', 'public.sx_bump_user_change()', 'execute'),
       'execute revoked'
union all
select 'change_triggers_on_key_tables',
       (select count(distinct tgrelid) from pg_trigger
         where not tgisinternal and tgname like '%\_sx\_chg\_%'
           and tgrelid in ('public.transactions'::regclass, 'public.accounts'::regclass,
                           'public.purposes'::regclass, 'public.categories'::regclass,
                           'public.transaction_splits'::regclass)) = 5,
       'transactions, splits, accounts, purposes, categories'
union all
select 'change_triggers (info)', true,
       (select count(*)::text || ' triggers on ' || count(distinct tgrelid)::text || ' tables'
          from pg_trigger where not tgisinternal and tgname like '%\_sx\_chg\_%')
union all
select 'insert_touch_on_transactions',
       exists (select 1 from pg_trigger
                where tgrelid = 'public.transactions'::regclass
                  and tgname = 'transactions_sx_touch_ins'),
       'server clock on insert'
union all
select 'user_changes_in_realtime',
       exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and tablename = 'user_changes'),
       'publication'
union all
select 'rls_on_user_tables',
       (select bool_and(relrowsecurity) from pg_class
         where relnamespace = 'public'::regnamespace
           and relname in ('transactions', 'transaction_splits', 'accounts', 'purposes',
                           'categories', 'user_merchants', 'outings', 'friends', 'users',
                           'user_changes')),
       'RLS still on'
union all
select 'row_counts_unchanged (info)', true,
       'transactions ' || (select count(*) from public.transactions)::text
       || ', accounts ' || (select count(*) from public.accounts)::text
       || ' (compare with before)';
