-- VERIFY after 20261004000100_protect_user_roles.sql + post_step_restore_function.sql. READ-ONLY.
select 'trigger_present' as check_name,
       exists (select 1 from pg_trigger t where t.tgname = 'protect_user_role'
               and t.tgrelid = 'public.users'::regclass and not t.tgisinternal
               and t.tgenabled <> 'D'
               and t.tgfoid = 'public.protect_user_role()'::regprocedure) as ok,
       'BEFORE INSERT OR UPDATE on public.users' as detail
union all
select 'function_is_admin_fixes_version',
       md5(pg_get_functiondef('public.protect_user_role()'::regprocedure))
         = 'c63c0dc5bdeb8c908543492602606cef',
       'false = post_step_restore_function.sql not run yet (file body lacks supabase_auth_admin)'
union all
select 'search_path_pinned',
       (select 'search_path=""' = any (proconfig) from pg_proc
         where oid = 'public.protect_user_role()'::regprocedure),
       'SET search_path = '''''
union all
select 'identity_trigger_still_there',
       exists (select 1 from pg_trigger where tgname = 'protect_user_identity'
               and tgrelid = 'public.users'::regclass),
       'protect_user_identity unaffected';
-- Manual functional check (needs a test user's JWT; do NOT run as postgres):
--   update public.users set role = 'admin' where id = auth.uid();  -> must fail 42501
