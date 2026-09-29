-- Allow "force_verify_email" as an admin_action_logs action, for the new
-- POST /api/admin/users/[id]/force-verify-email route.
alter table public.admin_action_logs drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in ('view_table','view_row','create','update','delete','export','password_reset','impersonate_start','impersonate_end','reset_all','resend_verification','force_verify_email'));
