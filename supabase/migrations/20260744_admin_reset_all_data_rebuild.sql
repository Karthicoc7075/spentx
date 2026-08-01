-- Migration: 20260744_admin_reset_all_data_rebuild.sql
-- Description: Rebuilds the Admin Portal "Reset All Database Data" purge.
--
-- Replaces 20260743's version, which had three problems:
--   1. It hard-coded a table list that had drifted from the schema — it ended
--      with `delete from public.api_logs`, a table that does not exist (the
--      real one is user_api_logs). plpgsql resolves that at runtime, so the
--      whole function raised and rolled back on every single call.
--   2. It authorised on a password string baked into the function body, so the
--      credential lived in version control and any authenticated role could
--      call it.
--   3. It missed a dozen user-scoped tables added after it was written
--      (purposes, categories, contributors, budget_templates, smart_views,
--      net_worth_history, login_history, user_devices, user_merchants,
--      account_purposes, admin_impersonation_sessions, user_api_logs...).
--
-- The rebuild enumerates public tables from the catalog instead of a literal
-- list, so new tables are covered automatically, and authorises with
-- require_admin(). Password confirmation stays in the app layer, where the
-- secret can live in an env var rather than in the database.

drop function if exists public.admin_reset_all_data(text);
drop function if exists public.admin_reset_all_data();

-- The reset writes its own audit entry; 'reset_all' needs to be a legal action.
alter table public.admin_action_logs drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in ('view_table','view_row','create','update','delete','export','password_reset','impersonate_start','impersonate_end','reset_all'));

create or replace function public.admin_reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Everything else in the public schema is purged. These four survive:
  -- users so the admin accounts (and their sessions) remain, and the three
  -- system-config/audit tables that are not user data.
  preserved constant text[] := array[
    'users',
    'global_settings',
    'mail_templates',
    'admin_action_logs'
  ];
  pending text[];
  remaining text[];
  tbl text;
  pass integer := 0;
  purged text[] := '{}';
begin
  perform public.require_admin();

  -- users.default_account_id -> accounts(id) is the only FK pointing from a
  -- preserved table into a purged one. Clear it first so accounts can be
  -- emptied without taking the admin rows that reference it down with them.
  update public.users set default_account_id = null where default_account_id is not null;

  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    into pending
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not (c.relname::text = any (preserved))
    -- Extensions can install their own tables into public (postgis'
    -- spatial_ref_sys is the classic one). Those are not application data and
    -- emptying them would break the extension, so skip anything owned by one.
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass
        and d.objid = c.oid
        and d.deptype = 'e'
    );

  -- Delete in whatever order works rather than a hand-maintained dependency
  -- order: each pass clears the tables whose children are already empty and
  -- defers the rest. Repeat until a pass makes no progress, which means what
  -- is left is genuinely blocked rather than merely out of order. This is the
  -- part that keeps the function correct as the schema grows — the previous
  -- version's fixed ordering is exactly what rotted.
  while array_length(pending, 1) is not null and pass < 25 loop
    pass := pass + 1;
    remaining := '{}';

    foreach tbl in array pending loop
      begin
        execute format('delete from public.%I', tbl);
        purged := purged || tbl;
      exception when foreign_key_violation then
        remaining := remaining || tbl;
      end;
    end loop;

    -- No table cleared this pass: further passes cannot help.
    exit when coalesce(array_length(remaining, 1), 0) = coalesce(array_length(pending, 1), 0);
    pending := remaining;
  end loop;

  if array_length(pending, 1) is not null then
    raise exception 'Reset incomplete — these tables could not be purged: %',
      array_to_string(pending, ', ');
  end if;

  return jsonb_build_object(
    'success', true,
    'tables_purged', to_jsonb(purged),
    'table_count', coalesce(array_length(purged, 1), 0)
  );
end;
$$;

comment on function public.admin_reset_all_data is
  'Purges every public table except users, global_settings, mail_templates and admin_action_logs. Admin-only (require_admin); password confirmation is enforced by the /api/admin/reset-all route.';

revoke all on function public.admin_reset_all_data() from public;
grant execute on function public.admin_reset_all_data() to authenticated;
