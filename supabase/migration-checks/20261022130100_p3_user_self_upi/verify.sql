-- VERIFY after 20261022130100_p3_user_self_upi.sql. READ-ONLY.

select 'table_exists' as check_name,
       to_regclass('public.user_self_upi') is not null as ok
union all
select 'rls_on',
       (select relrowsecurity from pg_class where oid = 'public.user_self_upi'::regclass)
union all
select 'four_owner_policies',
       (select count(*) = 4 from pg_policies
         where tablename = 'user_self_upi' and roles = '{authenticated}'
           and coalesce(qual, with_check) like '%auth.uid()%user_id%')
union all
select 'no_anon_access',
       not has_table_privilege('anon', 'public.user_self_upi', 'select')
union all
select 'unique_user_upi',
       exists (select 1 from pg_constraint where conname = 'user_self_upi_unique');
