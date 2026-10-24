-- VERIFY for 20261021120000_p0_tx_status_flags (Phase 0). READ-ONLY.
-- Every row must show ok = true. Then run
-- supabase/migration-checks/p0_snapshot.sql (must equal the BEFORE result).
-- Optional extra: supabase/backup/verify.sql: row
-- counts, balances per account and data_md5 must equal the pre-migration
-- backup (this migration changes no existing value).

select 'status_check_extended' as check_name,
       (select pg_get_constraintdef(c.oid) from pg_constraint c
         where c.conrelid = 'public.transactions'::regclass
           and c.conname = 'transactions_status_check')
       like '%reversed%unknown%' as ok,
       'status allows reversed and unknown' as detail
union all
select 'new_columns',
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'transactions'
           and column_name in ('review_flags', 'channel', 'rule_id',
             'rule_version', 'source_event_ids', 'linked_original_id',
             'link_kind', 'refunded_amount', 'ref_key', 'balance_applied')) = 10,
       '10 Phase 0 columns present'
union all
select 'account_id_nullable',
       (select is_nullable = 'YES' from information_schema.columns
         where table_schema = 'public' and table_name = 'transactions'
           and column_name = 'account_id'),
       'Unassigned allowed'
union all
select 'new_checks',
       (select count(*) from pg_constraint
         where conrelid = 'public.transactions'::regclass
           and conname in ('transactions_review_flags_check',
             'transactions_channel_check', 'transactions_link_kind_check',
             'transactions_refunded_amount_check')) = 4,
       'review_flags / channel / link_kind / refunded_amount checks'
union all
select 'ref_key_unique_index',
       exists (select 1 from pg_indexes where schemaname = 'public'
                 and indexname = 'transactions_user_ref_key_uidx'),
       'unique (user_id, ref_key) where ref_key is not null'
union all
select 'no_status_changed',
       (select count(*) from public.transactions
         where status in ('reversed', 'unknown')) = 0,
       'no existing row was moved to a new status'
union all
select 'defaults_on_old_rows',
       (select count(*) from public.transactions
         where review_flags <> '{}' or source_event_ids <> '{}'
            or refunded_amount <> 0) = 0,
       'old rows read as plain confirmed rows'
union all
select 'balance_applied_untouched',
       (select count(*) from public.transactions
         where balance_applied is not null) = 0,
       'no existing row written (balance_applied null)'
union all
select 'rls_enabled', (select relrowsecurity from pg_class
                        where oid = 'public.transactions'::regclass),
       'RLS still on'
union all
select 'own_row_policies',
       (select count(*) from pg_policies where schemaname = 'public'
          and tablename = 'transactions'
          and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')) >= 4,
       'user_id = auth.uid() policies unchanged';
