-- VERIFY after supabase/migrations/20261022150000_p0_ref_key_live_index.sql
-- READ-ONLY. Every row must show ok = true.

select 'live_index_exists' as check_name,
       to_regclass('public.transactions_user_ref_key_live_uidx') is not null as ok,
       'new guard' as detail
union all
select 'live_index_is_unique_partial',
       coalesce((select indisunique and indpred is not null and indisvalid
                   from pg_index
                  where indexrelid = to_regclass('public.transactions_user_ref_key_live_uidx')),
                false),
       (select indexdef from pg_indexes
         where schemaname = 'public'
           and indexname = 'transactions_user_ref_key_live_uidx')
union all
select 'old_index_dropped',
       to_regclass('public.transactions_user_ref_key_uidx') is null,
       'replaced by the live-only index'
union all
select 'row_count_unchanged_info', true,
       (select count(*)::text from public.transactions)
         || ' transactions (compare with the backup manifest / precheck time)';
