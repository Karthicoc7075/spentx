-- ============================================================================
-- 20261022160000_s8_supabase_security_hardening.sql
-- SpentX Phase S8: Full Supabase Security Hardening & RPC Audit
--
-- Idempotent: safe to run more than once.
-- Preserves all financial data, accounts, balances, rules, and Soft UI models.
--
-- Key fixes:
-- 1. Views: set security_invoker = true on public.monthly_plan_actuals and public.investment_totals
--    to prevent SECURITY DEFINER RLS bypass on views.
-- 2. Extensions: move pg_trgm from public to extensions schema (if present in public).
-- 3. Anonymous execution: REVOKE EXECUTE from anon and public on administrative, setup,
--    and trigger functions.
-- 4. Public access: explicitly preserve and pin search_path on public share-link functions
--    (get_share_link, get_shared_transactions, get_shared_purposes, get_shared_monthly_plan,
--     get_shared_categories, log_shared_page_view).
-- 5. Pin search_path = public, pg_temp on all SECURITY DEFINER functions in public to eliminate
--    mutable search_path warnings and privilege escalation risks.
-- 6. Rate-limiting & internal tables: confirm deny-all RLS on share_invite_deliveries.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. View Security Invoker (ensures views respect querying user's RLS)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'monthly_plan_actuals'
  ) then
    execute 'alter view public.monthly_plan_actuals set (security_invoker = true)';
  end if;

  if exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'investment_totals'
  ) then
    execute 'alter view public.investment_totals set (security_invoker = true)';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Extension Relocation (move pg_trgm out of public to extensions)
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_extension
    where extname = 'pg_trgm' and extnamespace = 'public'::regnamespace
  ) then
    create schema if not exists extensions;
    alter extension pg_trgm set schema extensions;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Restrict Anonymous Execution on Privileged, Admin & Internal Functions
-- ----------------------------------------------------------------------------
do $$
declare
  v_func text;
  v_funcs text[] := array[
    'admin_reset_all_users_to_onboarding()',
    'admin_reset_user_data(uuid)',
    'complete_account_setup()',
    'enforce_purpose_share_claim_only()',
    'handle_new_user()',
    'mcr_brand_sync_keys()',
    'mcr_bump_rules_version()',
    'sync_share_link_access()',
    'tg_reverse_goal_contributions_on_tx_delete()',
    'tg_sync_goal_contributions_on_tx_change()',
    'tg_sync_investments_on_tx_change()',
    'protect_user_role()',
    'protect_user_identity()'
  ];
begin
  foreach v_func in array v_funcs loop
    if to_regprocedure('public.' || v_func) is not null then
      execute format('revoke execute on function public.%s from anon, public', v_func);
    end if;
  end loop;

  -- Ensure authenticated has access only where appropriate:
  if to_regprocedure('public.admin_reset_all_users_to_onboarding()') is not null then
    grant execute on function public.admin_reset_all_users_to_onboarding() to authenticated;
  end if;
  if to_regprocedure('public.admin_reset_user_data(uuid)') is not null then
    grant execute on function public.admin_reset_user_data(uuid) to authenticated;
  end if;
  if to_regprocedure('public.complete_account_setup()') is not null then
    grant execute on function public.complete_account_setup() to authenticated;
  end if;
end $$;

-- Sweep: Revoke anon & public execute on any admin_* or trigger functions in public
do $$
declare
  r record;
begin
  for r in (
    select p.oid::regprocedure as func_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'admin_%'
        or p.prorettype = 'trigger'::regtype
      )
  ) loop
    execute format('revoke execute on function %s from anon, public', r.func_signature);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Preserve Public Share-Link Functions (Intentionally callable by anon)
-- ----------------------------------------------------------------------------
do $$
declare
  v_func text;
  v_share_funcs text[] := array[
    'get_share_link(uuid)',
    'get_shared_transactions(uuid)',
    'get_shared_purposes(uuid)',
    'get_shared_monthly_plan(uuid,text)',
    'get_shared_categories(uuid)',
    'log_shared_page_view(uuid,text)'
  ];
begin
  foreach v_func in array v_share_funcs loop
    if to_regprocedure('public.' || v_func) is not null then
      execute format('grant execute on function public.%s to anon, authenticated', v_func);
      execute format('alter function public.%s set search_path = public, pg_temp', v_func);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Pin search_path on all SECURITY DEFINER functions in public
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in (
    select p.oid::regprocedure as func_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (
        p.proconfig is null
        or not exists (
          select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
        )
      )
  ) loop
    execute format('alter function %s set search_path = public, pg_temp', r.func_signature);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Rate-limiting & Internal State Tables Guard
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.share_invite_deliveries') is not null then
    execute 'alter table public.share_invite_deliveries enable row level security';
    execute 'revoke all on public.share_invite_deliveries from anon, authenticated, public';
    execute 'grant all on public.share_invite_deliveries to service_role';
  end if;
end $$;

commit;
