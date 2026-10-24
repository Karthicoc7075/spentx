-- PRECHECK for supabase/migrations/20261022150000_p0_ref_key_live_index.sql
-- READ-ONLY. Every row must show ok = true. If live_duplicates is false,
-- STOP: list them with the query at the bottom and resolve them in the app
-- (never delete data from SQL).

select 'ref_key_column' as check_name,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'transactions'
                  and column_name = 'ref_key') as ok,
       'needs 20261021120000_p0_tx_status_flags' as detail
union all
select 'deleted_at_and_is_active_columns',
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'transactions'
           and column_name in ('deleted_at', 'is_active')) = 2,
       'used by the new index predicate'
union all
select 'old_index_present_or_already_migrated',
       to_regclass('public.transactions_user_ref_key_uidx') is not null
         or to_regclass('public.transactions_user_ref_key_live_uidx') is not null,
       coalesce(to_regclass('public.transactions_user_ref_key_uidx')::text,
                'old index already gone')
union all
select 'live_duplicates',
       not exists (select 1 from public.transactions
                    where ref_key is not null and deleted_at is null
                      and is_active is not false
                    group by user_id, ref_key having count(*) > 1),
       'must be none (Oct 22: 0 rows carry a ref_key at all)'
union all
select 'rows_with_ref_key_info', true,
       (select count(*)::text from public.transactions where ref_key is not null)
         || ' rows carry a ref_key';

-- Only if live_duplicates is false:
-- select user_id, ref_key, array_agg(id order by created_at) as ids
--   from public.transactions
--  where ref_key is not null and deleted_at is null and is_active is not false
--  group by 1, 2 having count(*) > 1;
