-- Migration: 20261012_admin_reset_user_data.sql
-- Description: Adds admin functions to reset user data back to fresh onboarding
-- without deleting their auth credentials.

create or replace function public.admin_reset_user_data(p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_purpose_id uuid;
  v_family_purpose_id uuid;
  v_cash_account_id uuid;
begin
  -- 1. Ensure caller is an admin
  perform public.require_admin();

  if p_target_user_id is null then
    raise exception 'Target user id is required.';
  end if;

  -- 2. Never allow resetting another admin or self via this endpoint
  select exists (
    select 1 from public.users where id = p_target_user_id and role = 'admin'
  ) into v_is_admin;

  if v_is_admin then
    raise exception 'Cannot reset an admin account.';
  end if;

  -- 3. Unlink default account from user to prevent FK conflicts
  update public.users
  set default_account_id = null
  where id = p_target_user_id;

  -- 4. Delete user data across all tables in safe dependency order
  -- Snapshots & Net Worth History
  delete from public.daily_snapshots where user_id = p_target_user_id;
  delete from public.net_worth_history where user_id = p_target_user_id;
  delete from public.account_balance_history where user_id = p_target_user_id;

  -- Transactions & Splits
  delete from public.transaction_items where user_id = p_target_user_id;
  delete from public.transaction_splits where user_id = p_target_user_id;
  delete from public.transactions where user_id = p_target_user_id;

  -- Outings & Social Splits
  delete from public.outing_settlements where user_id = p_target_user_id;
  delete from public.outing_expenses where user_id = p_target_user_id;
  delete from public.outing_participants where user_id = p_target_user_id;
  delete from public.outings where user_id = p_target_user_id or created_by = p_target_user_id;

  delete from public.friend_settlements where user_id = p_target_user_id;
  delete from public.friend_splits where user_id = p_target_user_id;
  delete from public.friends where user_id = p_target_user_id;
  delete from public.settlements where user_id = p_target_user_id;

  -- Wealth, Goals & Investments
  delete from public.goal_contributions where user_id = p_target_user_id;
  delete from public.savings_goals where user_id = p_target_user_id;
  delete from public.investments where user_id = p_target_user_id;

  -- Budgets & Plans
  delete from public.monthly_plans where user_id = p_target_user_id;
  delete from public.budgets where user_id = p_target_user_id;
  delete from public.budget_templates where user_id = p_target_user_id;

  -- Sharing
  delete from public.share_access_logs where owner_id = p_target_user_id;
  delete from public.share_invite_deliveries where owner_id = p_target_user_id;
  delete from public.share_links where owner_id = p_target_user_id;
  delete from public.purpose_shares where owner_id = p_target_user_id or viewer_id = p_target_user_id;

  -- Features & Rules
  delete from public.smart_alerts where user_id = p_target_user_id;
  delete from public.reflections where user_id = p_target_user_id;
  delete from public.income_targets where user_id = p_target_user_id;
  delete from public.income_streams where user_id = p_target_user_id;
  delete from public.projector_settings where user_id = p_target_user_id;
  delete from public.ai_chat_messages where user_id = p_target_user_id;
  delete from public.ai_insights where user_id = p_target_user_id;
  delete from public.user_merchants where user_id = p_target_user_id;
  delete from public.recurring_bills where user_id = p_target_user_id;

  -- Accounts & Purposes
  delete from public.account_purposes where user_id = p_target_user_id;
  delete from public.accounts where user_id = p_target_user_id;
  delete from public.categories where user_id = p_target_user_id;
  delete from public.purposes where user_id = p_target_user_id;
  delete from public.contributors where user_id = p_target_user_id;

  -- 5. Seed fresh starter data (same as handle_new_user)
  insert into public.purposes (user_id, name, color, is_default, can_delete, is_active)
  values (p_target_user_id, 'Personal', '#8b7ff0', true, false, true)
  returning id into v_purpose_id;

  insert into public.purposes (user_id, name, color, is_default, can_delete, is_active)
  values (p_target_user_id, 'Family', '#14B8A6', false, false, true)
  returning id into v_family_purpose_id;

  insert into public.accounts (user_id, name, type, is_default, can_delete)
  values (p_target_user_id, 'Cash', 'cash', true, false)
  returning id into v_cash_account_id;

  insert into public.contributors (user_id, name, is_default, can_delete)
  values (p_target_user_id, 'Me', true, false);

  insert into public.budget_templates (
    user_id, template_name, expected_income, allocations, is_default
  )
  values (p_target_user_id, 'Default Budget', 0, '[]'::jsonb, true);

  -- 6. Reset user profile onboarding flags
  update public.users
  set default_account_id = v_cash_account_id,
      setup_completed = false,
      show_bank_onboarding = true,
      updated_at = now()
  where id = p_target_user_id;

  -- 7. Audit log entry
  insert into public.admin_action_logs (
    admin_id, action, table_name, record_id, target_user_id, before
  ) values (
    auth.uid(), 'reset_user_data', 'users', p_target_user_id, p_target_user_id,
    jsonb_build_object('reset_to_onboarding', true, 'timestamp', now())
  );

  return jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'default_account_id', v_cash_account_id
  );
end;
$$;

revoke all on function public.admin_reset_user_data(uuid) from public;
grant execute on function public.admin_reset_user_data(uuid) to authenticated;

-- Function to reset all non-admin users' data back to onboarding
create or replace function public.admin_reset_all_users_to_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  perform public.require_admin();

  for r in (
    select id from public.users where role != 'admin'
  ) loop
    perform public.admin_reset_user_data(r.id);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'reset_count', v_count
  );
end;
$$;

revoke all on function public.admin_reset_all_users_to_onboarding() from public;
grant execute on function public.admin_reset_all_users_to_onboarding() to authenticated;
