-- PRECHECK for supabase/migrations/20261022140000_p4_investment_totals_status.sql
-- READ-ONLY. Every row must show ok = true.

select 'view_exists' as check_name,
       to_regclass('public.investment_totals') is not null as ok,
       'the view being replaced' as detail
union all
select 'security_invoker_on',
       coalesce((select 'security_invoker=on' = any(reloptions) from pg_class
                  where oid = 'public.investment_totals'::regclass), false),
       'kept by the new definition'
union all
select 'same_columns',
       (select string_agg(attname, ',' order by attnum) from pg_attribute
         where attrelid = 'public.investment_totals'::regclass and attnum > 0
           and not attisdropped)
         = 'user_id,total_invested,total_current_value,holdings_count,unlinked_transactions_total',
       'CREATE OR REPLACE needs the same columns'
union all
select 'no_dependents',
       not exists (select 1 from pg_depend d join pg_rewrite r on r.oid = d.objid
                    where d.refobjid = 'public.investment_totals'::regclass
                      and r.ev_class <> 'public.investment_totals'::regclass),
       'nothing else uses the view'
union all
select 'p0_applied_link_kind',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'transactions'
                  and column_name = 'link_kind'),
       'needs 20261021120000_p0_tx_status_flags'
union all
select 'rows_newly_excluded_info',
       true,
       (select count(*)::text from public.transactions
         where status in ('pending', 'reversed', 'unknown')
            or coalesce(link_kind, '') = 'reversal')
         || ' rows that the new view no longer counts (0 expected today)';
