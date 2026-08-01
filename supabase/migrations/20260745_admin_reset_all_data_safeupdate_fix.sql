-- Migration: 20260745_admin_reset_all_data_safeupdate_fix.sql
-- Description: Fixes admin_reset_all_data() failing with "DELETE requires a
-- WHERE clause" on every table.
--
-- Supabase enables the pg-safeupdate extension, which rejects any DELETE (or
-- UPDATE) statement that has no literal WHERE clause — including one built
-- and executed dynamically inside a plpgsql function via EXECUTE. The purge
-- loop in 20260744 ran `delete from public.%I` with no WHERE at all, so every
-- iteration hit that guard and the whole purge failed (the user-deletion half
-- of the reset, which goes through the Supabase Admin API rather than SQL
-- DELETE, is unaffected and already succeeded for anyone who hit this).
--
-- Fix: append `where true`, which satisfies the guard's syntactic check
-- without changing what gets deleted (still every row).

create or replace function public.admin_reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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

  update public.users set default_account_id = null where default_account_id is not null;

  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
    into pending
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not (c.relname::text = any (preserved))
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_class'::regclass
        and d.objid = c.oid
        and d.deptype = 'e'
    );

  while array_length(pending, 1) is not null and pass < 25 loop
    pass := pass + 1;
    remaining := '{}';

    foreach tbl in array pending loop
      begin
        execute format('delete from public.%I where true', tbl);
        purged := purged || tbl;
      exception when foreign_key_violation then
        remaining := remaining || tbl;
      end;
    end loop;

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

