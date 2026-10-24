-- VERIFY for supabase/migrations/20261022120000_p2_sms_rules_version.sql
-- READ-ONLY. Every row must show ok = true.

select 'triggers_present' as check_name,
       (select count(*) = 12 from pg_trigger
         where not tgisinternal
           and tgrelid in ('public.sms_template_rules'::regclass,
                           'public.sms_detection_rules'::regclass,
                           'public.sms_block_rules'::regclass)
           and tgname ~ '_(touch|ver_ins|ver_upd|ver_del)$') as ok,
       '4 per table' as detail
union all
select 'rules_version_rows',
       (select count(*) = 3 from public.rules_version
         where table_name in ('sms_template_rules', 'sms_detection_rules', 'sms_block_rules')),
       'one row per SMS rule table'
union all
select 'template_row_count_matches',
       (select row_count from public.rules_version where table_name = 'sms_template_rules')
       = (select count(*) from public.sms_template_rules where is_active),
       'active templates counted'
union all
select 'merchant_versions_untouched (info)', true,
       (select string_agg(table_name || ':' || version, ', ' order by table_name)
          from public.rules_version
         where table_name not like 'sms_%')
union all
select 'row_counts (info)', true,
       'templates ' || (select count(*) from public.sms_template_rules)::text
       || ', detection ' || (select count(*) from public.sms_detection_rules)::text
       || ', block ' || (select count(*) from public.sms_block_rules)::text
       || ' (same as precheck)'
union all
select 'rls_unchanged',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.sms_template_rules'::regclass,
                       'public.sms_detection_rules'::regclass,
                       'public.sms_block_rules'::regclass,
                       'public.rules_version'::regclass)),
       'RLS still on';
