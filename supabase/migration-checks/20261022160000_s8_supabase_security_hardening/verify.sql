-- VERIFY for supabase/migrations/20261022160000_s8_supabase_security_hardening.sql (Phase S8).
-- READ-ONLY. Run after applying the migration. Every check must return ok = true.

select 'monthly_plan_actuals_security_invoker' as check_name,
       coalesce((
         select (cv.reloptions is not null and 'security_invoker=true' = any(cv.reloptions))
         from pg_class cv
         join pg_namespace n on n.oid = cv.relnamespace
         where n.nspname = 'public' and cv.relname = 'monthly_plan_actuals'
       ), false) as ok,
       'View monthly_plan_actuals enforces querying user RLS' as detail
union all
select 'investment_totals_security_invoker',
       coalesce((
         select (cv.reloptions is not null and 'security_invoker=true' = any(cv.reloptions))
         from pg_class cv
         join pg_namespace n on n.oid = cv.relnamespace
         where n.nspname = 'public' and cv.relname = 'investment_totals'
       ), false),
       'View investment_totals enforces querying user RLS'
union all
select 'pg_trgm_not_in_public',
       not exists (
         select 1 from pg_extension e
         join pg_namespace n on n.oid = e.extnamespace
         where e.extname = 'pg_trgm' and n.nspname = 'public'
       ),
       'pg_trgm extension relocated from public schema'
union all
select 'no_unpinned_search_path_functions',
       (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef = true
          and (p.proconfig is null or not exists (
            select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
          ))) = 0,
       'Zero public SECURITY DEFINER functions have mutable search_path'
union all
select 'admin_reset_blocked_for_anon',
       case when to_regprocedure('public.admin_reset_user_data(uuid)') is not null
            then not has_function_privilege('anon', 'public.admin_reset_user_data(uuid)', 'execute')
            else true end,
       'admin_reset_user_data EXECUTE revoked from anon'
union all
select 'admin_reset_all_blocked_for_anon',
       case when to_regprocedure('public.admin_reset_all_users_to_onboarding()') is not null
            then not has_function_privilege('anon', 'public.admin_reset_all_users_to_onboarding()', 'execute')
            else true end,
       'admin_reset_all_users_to_onboarding EXECUTE revoked from anon'
union all
select 'complete_account_setup_blocked_for_anon',
       case when to_regprocedure('public.complete_account_setup()') is not null
            then not has_function_privilege('anon', 'public.complete_account_setup()', 'execute')
            else true end,
       'complete_account_setup EXECUTE revoked from anon'
union all
select 'trigger_functions_blocked_for_anon',
       (case when to_regprocedure('public.enforce_purpose_share_claim_only()') is not null
             then not has_function_privilege('anon', 'public.enforce_purpose_share_claim_only()', 'execute')
             else true end)
       and (case when to_regprocedure('public.handle_new_user()') is not null
                 then not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
                 else true end)
       and (case when to_regprocedure('public.sync_share_link_access()') is not null
                 then not has_function_privilege('anon', 'public.sync_share_link_access()', 'execute')
                 else true end),
       'Trigger functions EXECUTE revoked from anon'
union all
select 'public_share_functions_accessible_to_anon',
       (case when to_regprocedure('public.get_share_link(uuid)') is not null
             then has_function_privilege('anon', 'public.get_share_link(uuid)', 'execute')
             else true end)
       and (case when to_regprocedure('public.get_shared_transactions(uuid)') is not null
                 then has_function_privilege('anon', 'public.get_shared_transactions(uuid)', 'execute')
                 else true end)
       and (case when to_regprocedure('public.get_shared_purposes(uuid)') is not null
                 then has_function_privilege('anon', 'public.get_shared_purposes(uuid)', 'execute')
                 else true end),
       'Intentionally public share-link RPCs remain accessible to anon';
