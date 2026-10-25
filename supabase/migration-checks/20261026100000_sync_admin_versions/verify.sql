-- VERIFY for supabase/migrations/20261026100000_sync_admin_versions.sql
-- READ-ONLY. Every row with a real check must show ok = true.

select 'every_admin_table_has_one_bumper' as check_name,
       not exists (
         select 1
           from unnest(array['category_catalog', 'merchant_brands',
                             'merchant_keyword_rules', 'sms_template_rules',
                             'sms_block_rules', 'sms_detection_rules', 'global_settings']) t(name)
          where to_regclass('public.' || t.name) is not null
            and not exists (
              select 1 from pg_trigger tg
               where not tg.tgisinternal
                 and tg.tgrelid = ('public.' || t.name)::regclass
                 and tg.tgfoid in ('public.sx_bump_rules_version'::regproc,
                                   coalesce(to_regproc('public.mcr_bump_rules_version'),
                                            'public.sx_bump_rules_version'::regproc)))
       ) as ok,
       'insert/update/delete bump rules_version' as detail
union all
select 'no_double_bumpers',
       not exists (
         select 1 from pg_trigger tg
          where not tg.tgisinternal
            and tg.tgfoid = 'public.sx_bump_rules_version'::regproc
            and exists (
              select 1 from pg_trigger o
               where o.tgrelid = tg.tgrelid and not o.tgisinternal
                 and o.tgfoid = to_regproc('public.mcr_bump_rules_version'))),
       'a table uses sx_ OR mcr_, never both'
union all
select 'rules_version_rows',
       (select count(*) = 7 from public.rules_version
         where table_name in ('category_catalog', 'merchant_brands',
                              'merchant_keyword_rules', 'sms_template_rules',
                              'sms_block_rules', 'sms_detection_rules', 'global_settings')),
       'one row per area'
union all
select 'global_settings_updated_at',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'global_settings'
                  and column_name = 'updated_at'),
       'column added'
union all
select 'rules_version_select_policy',
       exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'rules_version'
                  and policyname = 'rules_version_select_authenticated' and cmd = 'SELECT'),
       'authenticated can read'
union all
select 'rules_version_no_user_write_policy',
       not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = 'rules_version'
                      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                      and roles && array['authenticated', 'anon', 'public']::name[]
                      and policyname like 'rules_version_%sx%'),
       'this migration added no write policy'
union all
select 'bump_fn_not_callable_by_clients',
       not has_function_privilege('anon', 'public.sx_bump_rules_version()', 'execute')
       and not has_function_privilege('authenticated', 'public.sx_bump_rules_version()', 'execute'),
       'execute revoked'
union all
select 'rules_version_in_realtime',
       exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and tablename = 'rules_version'),
       'publication'
union all
select 'rls_on_admin_tables',
       (select bool_and(relrowsecurity) from pg_class
         where relnamespace = 'public'::regnamespace
           and relname in ('rules_version', 'global_settings', 'category_catalog',
                           'merchant_brands', 'merchant_keyword_rules',
                           'sms_template_rules', 'sms_block_rules',
                           'sms_detection_rules')),
       'RLS still on';
