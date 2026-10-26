-- VERIFY for 20261026_account_kinds. READ-ONLY. Every row must show ok = true.

select 'new_columns' as check_name,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'accounts'
           and is_nullable = 'YES'
           and column_name in ('account_kind', 'linked_account_id',
             'credit_limit', 'bill_day', 'due_day',
             'last_statement_amount', 'last_statement_due')) = 7 as ok,
       '7 nullable columns present' as detail
union all
select 'old_rows_untouched',
       (select count(*) from public.accounts
         where account_kind is not null or linked_account_id is not null
            or credit_limit is not null or bill_day is not null
            or due_day is not null or last_statement_amount is not null
            or last_statement_due is not null) = 0,
       'right after apply: no existing account has a value (0 rows)'
union all
select 'checks',
       (select count(*) from pg_constraint
         where conrelid = 'public.accounts'::regclass
           and conname in ('accounts_account_kind_check',
             'accounts_credit_fields_check', 'accounts_linked_account_fkey',
             'accounts_linked_not_self_check')) = 4,
       'kind / credit fields / link fk / not-self'
union all
select 'type_check_unchanged',
       exists (select 1 from pg_constraint
                where conrelid = 'public.accounts'::regclass
                  and conname = 'accounts_type_check'),
       'accounts_type_check still present'
union all
select 'blocklist_table',
       to_regclass('public.account_blocklist') is not null,
       'account_blocklist exists'
union all
select 'blocklist_rls',
       coalesce((select relrowsecurity from pg_class
                  where oid = to_regclass('public.account_blocklist')), false),
       'RLS enabled on account_blocklist'
union all
select 'blocklist_policies',
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'account_blocklist'
           and policyname in ('account_blocklist_select_own',
             'account_blocklist_insert_own', 'account_blocklist_delete_own')) = 3,
       'owner-only select / insert / delete'
union all
select 'blocklist_no_anon',
       not has_table_privilege('anon', 'public.account_blocklist', 'select'),
       'anon has no access';
