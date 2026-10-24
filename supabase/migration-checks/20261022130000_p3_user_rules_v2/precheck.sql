-- PRECHECK for supabase/migrations/20261022130000_p3_user_rules_v2.sql
-- (Phase 3). READ-ONLY. Every row must show ok = true; otherwise stop.

select 'user_merchants_exists' as check_name,
       to_regclass('public.user_merchants') is not null as ok,
       'table the migration extends' as detail
union all
select 'trust_columns_present',
       (select count(*) = 2 from information_schema.columns
         where table_schema = 'public' and table_name = 'user_merchants'
           and column_name in ('is_trusted', 'deleted_at')),
       'the trigger reads is_trusted and deleted_at'
union all
select 'v2_columns_not_yet_added',
       not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'user_merchants'
                      and column_name in ('is_family', 'kind', 'revision', 'upi_id_normalized')),
       'false = already applied (safe to skip)'
union all
select 'revisions_table_absent',
       to_regclass('public.user_merchant_revisions') is null,
       'false = already applied (safe to skip)'
union all
select 'no_duplicate_rules',
       not exists (select 1 from public.user_merchants
                    group by user_id, normalized_payee having count(*) > 1),
       'unique (user_id, normalized_payee) still holds'
union all
select 'row_count_snapshot',
       true,
       (select count(*)::text || ' rules' from public.user_merchants);
