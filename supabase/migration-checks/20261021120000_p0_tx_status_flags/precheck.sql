-- PRECHECK for supabase/migrations/20261021120000_p0_tx_status_flags.sql
-- (Phase 0). READ-ONLY. Every row must show ok = true; otherwise stop.

select 'status_check_is_expected' as check_name,
       (select pg_get_constraintdef(c.oid) from pg_constraint c
         where c.conrelid = 'public.transactions'::regclass
           and c.conname = 'transactions_status_check')
       = 'CHECK ((status = ANY (ARRAY[''completed''::text, ''pending''::text, ''failed''::text, ''refunded''::text, ''unverified''::text, ''rejected''::text])))' as ok,
       'live constraint equals the copy restored by rollback.sql' as detail
union all
select 'not_yet_applied',
       not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'transactions'
                      and column_name in ('review_flags', 'channel', 'rule_id',
                        'rule_version', 'source_event_ids', 'linked_original_id',
                        'link_kind', 'refunded_amount', 'ref_key',
                        'balance_applied')),
       'false = already (partly) applied: run verify.sql instead'
union all
select 'no_name_conflicts',
       not exists (select 1 from pg_constraint
                    where conrelid = 'public.transactions'::regclass
                      and conname in ('transactions_review_flags_check',
                        'transactions_channel_check', 'transactions_link_kind_check',
                        'transactions_refunded_amount_check'))
       and not exists (select 1 from pg_indexes where schemaname = 'public'
                        and indexname in ('transactions_user_ref_key_uidx',
                          'transactions_user_linked_original_idx')),
       'none of the new constraint / index names exist yet'
union all
select 'statuses_all_known',
       not exists (select 1 from public.transactions
                    where status not in ('completed', 'pending', 'failed',
                      'refunded', 'unverified', 'rejected')),
       'every row passes the new status check'
union all
select 'account_id_is_not_null_today',
       (select is_nullable = 'NO' from information_schema.columns
         where table_schema = 'public' and table_name = 'transactions'
           and column_name = 'account_id'),
       'rollback.sql restores NOT NULL'
union all
select 'no_null_account_ids', (select count(*) from public.transactions
                                where account_id is null) = 0,
       'existing data has no Unassigned rows'
union all
select 'rls_enabled', (select relrowsecurity from pg_class
                        where oid = 'public.transactions'::regclass),
       'transactions RLS on (covers the new columns)'
union all
select 'rows_by_status (info)', true,
       coalesce((select string_agg(status || '/' || entry_source || ': ' || n, ', '
                                   order by status, entry_source)
                   from (select status, entry_source, count(*) n
                           from public.transactions group by 1, 2) s), 'none')
       || ' — unchanged by this migration (no backfill)';
