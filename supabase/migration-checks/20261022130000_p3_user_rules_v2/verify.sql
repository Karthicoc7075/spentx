-- VERIFY after 20261022130000_p3_user_rules_v2.sql. READ-ONLY.
-- Every row must show ok = true.

select 'v2_columns' as check_name,
       (select count(*) = 4 from information_schema.columns
         where table_schema = 'public' and table_name = 'user_merchants'
           and column_name in ('is_family', 'kind', 'revision', 'upi_id_normalized')) as ok
union all
select 'existing_rows_defaulted',
       not exists (select 1 from public.user_merchants
                    where is_family is null or kind is null or revision is null
                       or kind not in ('merchant', 'person'))
union all
select 'categories_purposes_untouched',
       not exists (select 1 from public.user_merchants
                    where category is null or purpose is null)
union all
select 'kind_check_constraint',
       exists (select 1 from pg_constraint
                where conname = 'user_merchants_kind_check')
union all
select 'revisions_rls_on',
       (select relrowsecurity from pg_class
         where oid = 'public.user_merchant_revisions'::regclass)
union all
select 'revisions_select_policy_owner_only',
       exists (select 1 from pg_policies
                where tablename = 'user_merchant_revisions'
                  and cmd = 'SELECT' and qual like '%auth.uid()%user_id%')
union all
select 'revisions_no_write_policies',
       not exists (select 1 from pg_policies
                    where tablename = 'user_merchant_revisions'
                      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
union all
select 'revision_trigger',
       exists (select 1 from pg_trigger
                where tgname = 'user_merchants_log_revision' and not tgisinternal)
union all
select 'trigger_function_search_path',
       exists (select 1 from pg_proc
                where proname = 'user_merchants_log_revision'
                  and array_to_string(proconfig, ',') like '%search_path=public%');
