-- PRECHECK for supabase/migrations/20261022160000_s8_supabase_security_hardening.sql (Phase S8).
-- READ-ONLY. Run before applying the migration.
-- Every row with ok = false indicates an area to be hardened.

select 'view_monthly_plan_actuals' as check_name,
       exists (
         select 1 from pg_views
         where schemaname = 'public' and viewname = 'monthly_plan_actuals'
       ) as ok,
       'public.monthly_plan_actuals view present' as detail
union all
select 'security_invoker_on_monthly_plan_actuals',
       coalesce((
         select (cv.reloptions is not null and 'security_invoker=true' = any(cv.reloptions))
         from pg_class cv
         join pg_namespace n on n.oid = cv.relnamespace
         where n.nspname = 'public' and cv.relname = 'monthly_plan_actuals'
       ), false),
       'false = not yet hardened (needs security_invoker = true)'
union all
select 'pg_trgm_in_extensions_schema',
       coalesce((
         select n.nspname = 'extensions'
         from pg_extension e
         join pg_namespace n on n.oid = e.extnamespace
         where e.extname = 'pg_trgm'
       ), true),
       'false = installed in public (needs move to extensions)'
union all
select 'unpinned_search_path_functions (count)',
       true,
       (select count(*)::text from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef = true
          and (p.proconfig is null or not exists (
            select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
          ))) || ' security definer functions have unpinned search_path'
union all
select 'share_link_functions_ready',
       to_regprocedure('public.get_share_link(uuid)') is not null
       and to_regprocedure('public.get_shared_transactions(uuid)') is not null,
       'Public share RPCs present for hardening and anon grant preservation';
