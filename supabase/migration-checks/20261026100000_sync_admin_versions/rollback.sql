-- ROLLBACK for supabase/migrations/20261026100000_sync_admin_versions.sql
-- DO NOT RUN without Karthi's explicit approval. Removes only what the
-- migration added (triggers, policy, publication entry, functions). The
-- global_settings.updated_at column and the rules_version rows are KEPT
-- (dropping a column / deleting rows is destructive and not needed).

begin;

do $$
declare r record;
begin
  for r in
    select c.relname, tg.tgname
      from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
     where not tg.tgisinternal
       and c.relnamespace = 'public'::regnamespace
       and (tg.tgname like '%\_sx\_ver\_%' or tg.tgname = 'global_settings_sx_touch')
  loop
    execute format('drop trigger if exists %I on public.%I', r.tgname, r.relname);
  end loop;
end $$;

drop policy if exists rules_version_select_authenticated on public.rules_version;

do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and tablename = 'rules_version') then
    execute 'alter publication supabase_realtime drop table public.rules_version';
  end if;
end $$;

drop function if exists public.sx_bump_rules_version();
-- sx_touch_updated_at() is shared with 20261026100100; drop it only after
-- that file is rolled back too.

commit;
