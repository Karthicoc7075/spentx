-- VERIFY for supabase/migrations/20261011_user_merchants_trust.sql (Phase S5b).
-- READ-ONLY. Every row must show ok = true. Then compare
-- supabase/backup/verify.sql (user_merchants / user_rules data_md5).

select 'columns' as check_name,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'user_merchants'
           and column_name in ('purpose', 'updated_at', 'is_trusted', 'deleted_at')) = 4
       as ok, 'purpose, updated_at, is_trusted, deleted_at exist' as detail
union all
select 'no_null_purpose',
       not exists (select 1 from public.user_merchants where purpose is null),
       'purpose is NOT NULL (default Personal)'
union all
select 'active_index',
       to_regclass('public.user_merchants_user_active_idx') is not null,
       'user_merchants_user_active_idx'
union all
select 'touch_trigger',
       exists (select 1 from pg_trigger where not tgisinternal
               and tgname = 'user_merchants_touch_updated_at'
               and tgrelid = 'public.user_merchants'::regclass),
       'updated_at maintained by trigger'
union all
select 'rls_enabled',
       (select relrowsecurity from pg_class
         where oid = 'public.user_merchants'::regclass),
       'row level security on'
union all
select 'own_row_policies',
       (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'user_merchants'
           and policyname in ('user_merchants_select_own', 'user_merchants_insert_own',
                              'user_merchants_update_own', 'user_merchants_delete_own')) = 4,
       '4 own-row policies';
