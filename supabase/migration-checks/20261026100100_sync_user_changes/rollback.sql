-- ROLLBACK for supabase/migrations/20261026100100_sync_user_changes.sql
-- DO NOT RUN without Karthi's explicit approval. Removes the triggers and
-- the publication entry this migration added. The user_changes table and
-- the indexes are KEPT (dropping them is not needed to restore behaviour;
-- drop them later by hand only if wanted).

begin;

do $$
declare r record;
begin
  for r in
    select c.relname, tg.tgname
      from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
     where not tg.tgisinternal
       and c.relnamespace = 'public'::regnamespace
       and (tg.tgname like '%\_sx\_chg\_%' or tg.tgname like '%\_sx\_touch\_ins'
            or tg.tgname like '%\_sx\_touch\_upd')
  loop
    execute format('drop trigger if exists %I on public.%I', r.tgname, r.relname);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and tablename = 'user_changes') then
    execute 'alter publication supabase_realtime drop table public.user_changes';
  end if;
end $$;

drop function if exists public.sx_bump_user_change();

commit;
