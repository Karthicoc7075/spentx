-- VERIFY after supabase/migrations/20261021_signup_phone.sql (Phase S5b).
-- READ-ONLY. Every row must show ok = true. Then run
-- supabase/backup/verify.sql: every data_md5 must equal the pre-migration
-- run (users.row_md5 changes on purpose: phone was filled).

select 'function_copies_phone' as check_name,
       position('raw_user_meta_data->>''phone''' in
                pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0
       as ok, 'handle_new_user() writes users.phone' as detail
union all
select 'search_path_pinned',
       coalesce((select 'search_path=public' = any (proconfig) from pg_proc
                 where oid = 'public.handle_new_user()'::regprocedure), false),
       'SECURITY DEFINER with search_path = public'
union all
select 'signup_trigger',
       exists (select 1 from pg_trigger
               where tgname = 'on_auth_user_created'
                 and tgrelid = 'auth.users'::regclass and tgenabled <> 'D'),
       'on_auth_user_created still enabled'
union all
select 'backfill_complete',
       not exists (
         select 1 from public.users pu
         join auth.users au on au.id = pu.id
         where nullif(regexp_replace(coalesce(au.raw_user_meta_data->>'phone', ''),
                      '[[:space:]().-]', '', 'g'), '') is not null
           and (pu.phone is null or btrim(pu.phone) = '')),
       'no user with a signup phone is missing users.phone'
union all
select 'every_auth_user_has_profile',
       not exists (select 1 from auth.users au
                   left join public.users pu on pu.id = au.id
                   where pu.id is null),
       'auth.users without public.users row = 0'
union all
select 'defaults_per_user',
       not exists (
         select 1 from public.users u
         where not exists (select 1 from public.purposes p
                           where p.user_id = u.id and p.name = 'Personal')
            or not exists (select 1 from public.accounts a
                           where a.user_id = u.id and a.type = 'cash')),
       'every user still has Personal purpose + Cash account';
