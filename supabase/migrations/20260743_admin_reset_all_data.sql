-- Migration: 20260743_admin_reset_all_data.sql
-- Description: RPC function for Admin Portal to reset all application data and logs
-- Requires admin authorization and password confirmation ('karthi').

create or replace function public.admin_reset_all_data(admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_deleted integer := 0;
begin
  -- Validate password
  if admin_password is null or trim(admin_password) <> 'karthi' then
    raise exception 'Unauthorized: Incorrect admin password.';
  end if;

  -- Delete all application data tables
  delete from public.transaction_splits;
  delete from public.transactions;
  delete from public.settlements;
  delete from public.outing_expenses;
  delete from public.outings;
  delete from public.accounts;
  delete from public.monthly_plans;
  delete from public.income_streams;
  delete from public.income_targets;
  delete from public.savings_goals;
  delete from public.projector_settings;
  delete from public.reflections;
  delete from public.smart_alerts;
  delete from public.friends;
  delete from public.purpose_shares;
  delete from public.share_links;
  delete from public.share_access_logs;
  delete from public.ai_chat_messages;
  delete from public.ai_insights;
  delete from public.sms_template_rules;
  delete from public.sms_detection_rules;
  delete from public.sms_block_rules;
  delete from public.audit_logs;
  delete from public.activity_logs;
  delete from public.backup_history;
  delete from public.account_balance_history;
  delete from public.admin_action_logs;
  delete from public.api_logs;

  return jsonb_build_object(
    'success', true,
    'message', 'All application data and logs have been reset successfully.'
  );
end;
$$;

comment on function public.admin_reset_all_data is
  'Purges all application database records and logs when authorized by admin password karthi.';
