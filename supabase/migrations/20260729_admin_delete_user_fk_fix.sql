-- Fixes admin "Delete user" always failing with a 500.
--
-- DELETE /api/admin/users/[id] logs the deletion into admin_action_logs
-- (target_user_id = the user about to be deleted) BEFORE calling
-- admin.auth.admin.deleteUser(). Both admin_action_logs.target_user_id/
-- admin_id and admin_impersonation_sessions.target_user_id/admin_id
-- reference auth.users(id) with the default ON DELETE NO ACTION — so the
-- audit row just inserted (or any pre-existing impersonation session
-- involving that user) blocks the subsequent auth.users delete with a
-- foreign-key violation, every single time.
--
-- admin_action_logs must stay append-only and survive the user it
-- describes being deleted (that's the whole point of an audit trail), so
-- the fix is ON DELETE SET NULL, not CASCADE — the log/session rows are
-- kept, just with the now-gone user reference nulled out.

alter table public.admin_action_logs
  alter column admin_id drop not null;
alter table public.admin_action_logs
  drop constraint if exists admin_action_logs_admin_id_fkey;
alter table public.admin_action_logs
  add constraint admin_action_logs_admin_id_fkey
  foreign key (admin_id) references auth.users(id) on delete set null;

alter table public.admin_action_logs
  drop constraint if exists admin_action_logs_target_user_id_fkey;
alter table public.admin_action_logs
  add constraint admin_action_logs_target_user_id_fkey
  foreign key (target_user_id) references auth.users(id) on delete set null;

alter table public.admin_impersonation_sessions
  alter column admin_id drop not null;
alter table public.admin_impersonation_sessions
  drop constraint if exists admin_impersonation_sessions_admin_id_fkey;
alter table public.admin_impersonation_sessions
  add constraint admin_impersonation_sessions_admin_id_fkey
  foreign key (admin_id) references auth.users(id) on delete set null;

alter table public.admin_impersonation_sessions
  alter column target_user_id drop not null;
alter table public.admin_impersonation_sessions
  drop constraint if exists admin_impersonation_sessions_target_user_id_fkey;
alter table public.admin_impersonation_sessions
  add constraint admin_impersonation_sessions_target_user_id_fkey
  foreign key (target_user_id) references auth.users(id) on delete set null;
