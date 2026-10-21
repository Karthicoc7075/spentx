-- PRECHECK for supabase/migrations/20261004000100_protect_user_roles.sql (S5b). READ-ONLY.
-- Live 2026-10-21 ~14:25 IST: PARTIALLY APPLIED. The function public.protect_user_role()
-- exists (newer body from 20261011_admin_fixes.sql) but the TRIGGER
-- protect_user_role on public.users is MISSING, while authenticated users can
-- UPDATE users.role (RLS users_update_own) and is_admin() trusts users.role.
-- One statement; every row must show ok = true before running.
select 'role_function_unchanged' as check_name,
       md5(pg_get_functiondef('public.protect_user_role()'::regprocedure))
         = 'c63c0dc5bdeb8c908543492602606cef' as ok,
       'live function still equals the copy in rollback.sql / post_step_restore_function.sql' as detail
union all
select 'trigger_missing',
       not exists (select 1 from pg_trigger where tgname = 'protect_user_role'
                   and tgrelid = 'public.users'::regclass and not tgisinternal),
       'false = already fixed: run verify.sql only'
union all
select 'no_unexpected_admins (info)', true,
       (select count(*) from public.users where role = 'admin')::text
         || ' admin rows — confirm each is a real admin BEFORE enabling the trigger'
union all
select 'roles_in_use (info)', true,
       (select string_agg(coalesce(role, 'NULL') || '=' || n, ', ')
          from (select role, count(*) n from public.users group by role) x);
