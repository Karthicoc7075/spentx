-- ROLLBACK for supabase/migrations/20261022160000_s8_supabase_security_hardening.sql (Phase S8).
-- Safe rollback: restores previous view security_invoker setting and schema locations.
-- Does NOT touch financial records or tables.

begin;

-- 1. Reset view security_invoker option on monthly_plan_actuals
do $$
begin
  if exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'monthly_plan_actuals'
  ) then
    execute 'alter view public.monthly_plan_actuals reset (security_invoker)';
  end if;
end $$;

-- 2. Move pg_trgm back to public if needed
do $$
begin
  if exists (
    select 1 from pg_extension
    where extname = 'pg_trgm' and extnamespace = 'extensions'::regnamespace
  ) then
    alter extension pg_trgm set schema public;
  end if;
end $$;

-- 3. Re-grant execute to public/anon on functions if strictly required
do $$
begin
  if to_regprocedure('public.admin_reset_all_users_to_onboarding()') is not null then
    grant execute on function public.admin_reset_all_users_to_onboarding() to public;
  end if;
  if to_regprocedure('public.admin_reset_user_data(uuid)') is not null then
    grant execute on function public.admin_reset_user_data(uuid) to public;
  end if;
  if to_regprocedure('public.complete_account_setup()') is not null then
    grant execute on function public.complete_account_setup() to public;
  end if;
end $$;

commit;
