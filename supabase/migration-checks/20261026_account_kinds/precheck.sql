-- PRECHECK for supabase/migrations/20261026_account_kinds.sql. READ-ONLY.
-- Every row must show ok = true; otherwise stop.

select 'not_yet_applied' as check_name,
       not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'accounts'
                      and column_name in ('account_kind', 'linked_account_id',
                        'credit_limit', 'bill_day', 'due_day',
                        'last_statement_amount', 'last_statement_due')) as ok,
       'false = already (partly) applied: run verify.sql instead' as detail
union all
select 'no_blocklist_table',
       to_regclass('public.account_blocklist') is null,
       'account_blocklist does not exist yet'
union all
select 'no_name_conflicts',
       not exists (select 1 from pg_constraint
                    where conrelid = 'public.accounts'::regclass
                      and conname in ('accounts_account_kind_check',
                        'accounts_credit_fields_check', 'accounts_linked_account_fkey',
                        'accounts_linked_not_self_check'))
       and not exists (select 1 from pg_indexes where schemaname = 'public'
                        and indexname = 'accounts_linked_account_idx'),
       'none of the new constraint / index names exist yet'
union all
select 'accounts_rls_enabled',
       (select relrowsecurity from pg_class where oid = 'public.accounts'::regclass),
       'accounts RLS on (covers the new columns)'
union all
select 'gen_random_uuid',
       exists (select 1 from pg_proc where proname = 'gen_random_uuid'),
       'needed for account_blocklist.id'
union all
select 'type_check (info)', true,
       coalesce((select pg_get_constraintdef(oid) from pg_constraint
                  where conrelid = 'public.accounts'::regclass
                    and conname = 'accounts_type_check'), 'none')
       || ' — left unchanged'
union all
select 'accounts (info)', true,
       (select count(*) from public.accounts)::text || ' accounts; '
       || (select count(*) from public.accounts
            where deleted_at is null and (last4 is null or btrim(last4) = ''))::text
       || ' live with empty last4';
