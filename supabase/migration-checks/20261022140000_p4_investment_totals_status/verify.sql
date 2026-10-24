-- VERIFY for 20261022140000_p4_investment_totals_status.sql. READ-ONLY.
-- Every row must show ok = true.

select 'completed_only' as check_name,
       pg_get_viewdef('public.investment_totals'::regclass, true)
         like '%COALESCE(t.status, ''completed''::text) = ''completed''::text%' as ok,
       'new status rule in place' as detail
union all
select 'reversal_entries_skipped',
       pg_get_viewdef('public.investment_totals'::regclass, true) like '%reversal%',
       'link_kind reversal excluded'
union all
select 'security_invoker_on',
       coalesce((select 'security_invoker=on' = any(reloptions) from pg_class
                  where oid = 'public.investment_totals'::regclass), false),
       'RLS still applies'
union all
select 'anon_no_access',
       not has_table_privilege('anon', 'public.investment_totals', 'select'),
       'anon cannot read'
union all
select 'authenticated_select',
       has_table_privilege('authenticated', 'public.investment_totals', 'select'),
       'app can read';
