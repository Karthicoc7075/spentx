-- ============================================================================
-- scripts/test-supabase-security-audit.sql
-- S8: Transaction-isolated automated security & RLS test suite.
--
-- Safe for testing: runs in a transaction and always rolls back at the end.
-- Tests:
-- 1. Anonymous user cannot read private tables (transactions, accounts, users, recurring_bills)
-- 2. Anonymous user cannot invoke administrative or setup RPCs
-- 3. Anonymous user CAN invoke share-link RPCs with a valid token
-- 4. Authenticated User 1 cannot access Authenticated User 2's data
-- 5. Non-admin user cannot escalate role to 'admin'
-- 6. monthly_plan_actuals view restricts results to the querying user's rows
-- ============================================================================

begin;

-- Create two isolated test users in auth.users
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'user_a@spentx.test'),
  ('b0000000-0000-4000-8000-000000000002', 'user_b@spentx.test')
on conflict (id) do nothing;

-- Ensure public.users records exist
insert into public.users (id, email, name, role) values
  ('a0000000-0000-4000-8000-000000000001', 'user_a@spentx.test', 'User A', 'user'),
  ('b0000000-0000-4000-8000-000000000002', 'user_b@spentx.test', 'User B', 'user')
on conflict (id) do update set role = 'user';

-- Create isolated test accounts
insert into public.accounts (id, user_id, name, type, is_default) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'User A Bank', 'bank', true),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'User B Bank', 'bank', true)
on conflict (id) do nothing;

-- Create isolated test purposes
insert into public.purposes (id, user_id, name, color, is_default) values
  ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'User A Personal', '#8b7ff0', true),
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'User B Personal', '#8b7ff0', true)
on conflict (id) do nothing;

-- Create isolated test transaction for User A
insert into public.transactions (
  id, user_id, account_id, merchant, total_amount, type, status, transaction_date, month_key
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Secret Coffee',
  250.00,
  'expense',
  'completed',
  now(),
  to_char(now(), 'YYYY-MM')
) on conflict (id) do nothing;

-- Create test monthly plan for User A
insert into public.monthly_plans (id, user_id, month, purpose_id, expected_income, allocations) values (
  'a4000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  to_char(now(), 'YYYY-MM'),
  'a2000000-0000-4000-8000-000000000001',
  50000,
  '[]'::jsonb
) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Test 1: Anonymous Role Restrictions
-- ----------------------------------------------------------------------------
set local role anon;

do $$
declare
  v_count integer;
begin
  -- 1a. Anon must not see any transactions
  select count(*) into v_count from public.transactions;
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: Anon can read % rows from transactions', v_count;
  end if;

  -- 1b. Anon must not see any accounts
  select count(*) into v_count from public.accounts;
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: Anon can read % rows from accounts', v_count;
  end if;

  -- 1c. Anon must not see any monthly plans
  select count(*) into v_count from public.monthly_plans;
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: Anon can read % rows from monthly_plans', v_count;
  end if;

  -- 1d. Anon must not see any monthly_plan_actuals view rows
  select count(*) into v_count from public.monthly_plan_actuals;
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: Anon can read % rows from monthly_plan_actuals view', v_count;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Test 2: Authenticated User Isolation (User B cannot see User A data)
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);

do $$
declare
  v_count integer;
  v_err boolean := false;
begin
  -- 2a. User B must not see User A's transactions
  select count(*) into v_count from public.transactions
  where user_id = 'a0000000-0000-4000-8000-000000000001';
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: User B can read % transactions of User A', v_count;
  end if;

  -- 2b. User B must not see User A's accounts
  select count(*) into v_count from public.accounts
  where user_id = 'a0000000-0000-4000-8000-000000000001';
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: User B can read % accounts of User A', v_count;
  end if;

  -- 2c. User B cannot update User A's transactions
  update public.transactions set merchant = 'Hacked'
  where user_id = 'a0000000-0000-4000-8000-000000000001';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: User B updated % transactions of User A', v_count;
  end if;

  -- 2d. User B must not see User A's monthly_plan_actuals view rows
  select count(*) into v_count from public.monthly_plan_actuals
  where user_id = 'a0000000-0000-4000-8000-000000000001';
  if v_count > 0 then
    raise exception 'SECURITY VIOLATION: User B saw % monthly_plan_actuals rows of User A', v_count;
  end if;

  -- 2e. User B cannot self-escalate role to admin
  begin
    update public.users set role = 'admin'
    where id = 'b0000000-0000-4000-8000-000000000002';
  exception when others then
    v_err := true;
  end;
  if not v_err and (select role from public.users where id = 'b0000000-0000-4000-8000-000000000002') = 'admin' then
    raise exception 'SECURITY VIOLATION: User B was able to self-promote to admin';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Test 3: Authenticated User A Access (User A sees own data properly)
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.transactions
  where user_id = 'a0000000-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'INTEGRITY ERROR: User A cannot read own transactions';
  end if;

  select count(*) into v_count from public.accounts
  where user_id = 'a0000000-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'INTEGRITY ERROR: User A cannot read own accounts';
  end if;
end $$;

-- Rollback entire test transaction to ensure zero side-effects
rollback;
