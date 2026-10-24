-- PRECHECK for supabase/migrations/20261022130100_p3_user_self_upi.sql
-- (Phase 3). READ-ONLY. Every row must show ok = true; otherwise stop.

select 'table_absent' as check_name,
       to_regclass('public.user_self_upi') is null as ok,
       'false = already applied (safe to skip)' as detail
union all
select 'pgcrypto_or_pg13_gen_random_uuid',
       exists (select 1 from pg_proc where proname = 'gen_random_uuid'),
       'default for id';
