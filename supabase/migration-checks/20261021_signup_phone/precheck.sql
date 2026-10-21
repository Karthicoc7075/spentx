-- PRECHECK for supabase/migrations/20261021_signup_phone.sql  (Phase S5b). READ-ONLY.
-- Run before the migration (and before rollback.sql). Every row must show
-- ok = true; otherwise stop. Then take the backup and save the output of
-- supabase/backup/verify.sql.

-- One statement, so the SQL editor shows every row.
select 'rollback_fingerprint' as check_name,
       (select md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)))
         = 'e12d924d90746b59a876246eb6a9b11e' as ok,
       'live handle_new_user() still equals the copy in rollback.sql' as detail
union all
-- not applied yet (no phone column, no search_path pin)
select 'not_yet_applied',
       position('raw_user_meta_data->>''phone''' in
                pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 0,
       'false = already applied: run verify.sql instead'
union all
select 'signup_trigger',
       exists (select 1 from pg_trigger
               where tgname = 'on_auth_user_created'
                 and tgrelid = 'auth.users'::regclass and tgenabled <> 'D'),
       'on_auth_user_created on auth.users'
union all
-- rollback.sql step 8 is exact only while nobody has a phone yet
select 'no_existing_phones',
       (select count(*) from public.users
         where phone is not null and btrim(phone) <> '') = 0,
       (select count(*) from public.users
         where phone is not null and btrim(phone) <> '')::text
         || ' users already have a phone (2026-10-21: 0)'
union all
select 'backfill_rows (info)', true,
       (select count(*) from public.users pu
          join (select au.id,
                       nullif(regexp_replace(coalesce(au.raw_user_meta_data->>'phone', ''),
                              '[[:space:]().-]', '', 'g'), '') as phone
                  from auth.users au) cleaned on cleaned.id = pu.id
         where cleaned.phone is not null
           and (pu.phone is null or btrim(pu.phone) = ''))::text
         || ' users will get a phone from signup metadata (2026-10-21: 2)';
