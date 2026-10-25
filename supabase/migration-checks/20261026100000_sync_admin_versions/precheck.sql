-- PRECHECK for supabase/migrations/20261026100000_sync_admin_versions.sql
-- READ-ONLY. Run before the migration and keep the output.

select 'rules_version_rows (info)' as check_name, true as ok,
       (select string_agg(table_name || ':' || version, ', ' order by table_name)
          from public.rules_version) as detail
union all
select 'existing_version_triggers (info)', true,
       (select string_agg(c.relname || '.' || tg.tgname || '->' || p.proname, ', ' order by c.relname, tg.tgname)
          from pg_trigger tg
          join pg_class c on c.oid = tg.tgrelid
          join pg_proc p on p.oid = tg.tgfoid
         where not tg.tgisinternal
           and c.relname in ('category_catalog', 'merchant_brands',
                             'merchant_keyword_rules', 'sms_template_rules',
                             'sms_block_rules', 'sms_detection_rules', 'global_settings'))
union all
select 'rules_version_policies (info)', true,
       (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '/'), ', ')
          from pg_policies where schemaname = 'public' and tablename = 'rules_version')
union all
select 'global_settings_has_updated_at (info)', true,
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'global_settings'
           and column_name = 'updated_at')
union all
select 'rules_version_in_realtime (info)', true,
       (select count(*)::text from pg_publication_tables
         where pubname = 'supabase_realtime' and tablename = 'rules_version')
union all
select 'rls_on_admin_tables', 
       (select bool_and(relrowsecurity) from pg_class
         where relnamespace = 'public'::regnamespace
           and relname in ('rules_version', 'global_settings', 'category_catalog',
                           'merchant_brands', 'merchant_keyword_rules',
                           'sms_template_rules', 'sms_block_rules',
                           'sms_detection_rules')),
       'must stay true after the migration';
