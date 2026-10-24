-- PRECHECK for supabase/migrations/20261022120000_p2_sms_rules_version.sql
-- (Phase 2). READ-ONLY. Every row must show ok = true; otherwise stop.

select 'bump_function_exists' as check_name,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'mcr_bump_rules_version') as ok,
       'reused, not created' as detail
union all
select 'touch_function_exists',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = 'mcr_touch_updated_at'),
       'reused, not created'
union all
select 'rules_version_has_unique_table_name',
       exists (select 1 from pg_index i
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                where i.indrelid = 'public.rules_version'::regclass
                  and i.indisunique and a.attname = 'table_name'
                  and array_length(i.indkey::int2[], 1) = 1),
       'needed by on conflict (table_name)'
union all
select 'is_active_and_updated_at_columns',
       (select count(*) = 6 from information_schema.columns
         where table_schema = 'public'
           and table_name in ('sms_template_rules', 'sms_detection_rules', 'sms_block_rules')
           and column_name in ('is_active', 'updated_at')),
       'all three tables have is_active and updated_at'
union all
select 'not_yet_applied',
       not exists (select 1 from pg_trigger
                    where tgname in ('sms_template_rules_ver_ins', 'sms_detection_rules_ver_ins',
                                     'sms_block_rules_ver_ins')),
       'false = already applied: run verify.sql instead'
union all
select 'row_counts (info)', true,
       'templates ' || (select count(*) from public.sms_template_rules)::text
       || ', detection ' || (select count(*) from public.sms_detection_rules)::text
       || ', block ' || (select count(*) from public.sms_block_rules)::text
       || ' (must be identical in verify.sql)';
