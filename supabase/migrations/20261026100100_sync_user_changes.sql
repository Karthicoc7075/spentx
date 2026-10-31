-- Sync optimization 2/2: user data changes reach the user's other devices
-- (phone <-> web) within seconds, with cheap delta pulls.
--
-- WHAT
--   * public.user_changes (user_id, area, version, origin, updated_at):
--     ONE small row per user per table. A statement-level trigger bumps it
--     whenever that user's rows change, so a phone needs ONE Realtime channel
--     (filter user_id=eq.<uid>) for every table instead of one per table.
--     It carries no financial data: only a table name, a counter and the
--     writing client's id (random per app launch, header x-sx-client).
--   * RLS: a user can SELECT only their own rows. No INSERT / UPDATE / DELETE
--     policy; only the SECURITY DEFINER trigger function writes.
--   * Delta pulls by updated_at need a server clock on every write. UPDATE
--     already sets updated_at = now() (touch triggers); this adds the same on
--     INSERT, so a row created with no internet and pushed later is not older than the
--     other device's cursor. Missing UPDATE touch triggers are added too.
--     Only the updated_at timestamp is set; no other column, no data change.
--   * (user_id, updated_at) indexes where missing.
--   * Realtime publication: user_changes only.
--
-- SAFETY: additive and idempotent (safe to run twice). No drop of anything
-- that existed before, no data delete, no RLS loosened on any table.
-- Tables / columns that do not exist are skipped.
-- Run AFTER 20261026100000_sync_admin_versions.sql.
-- Run order: precheck.sql, this file, verify.sql
-- (supabase/migration-checks/20261026100100_sync_user_changes/).

begin;

-- 1. Table + RLS --------------------------------------------------------------
create table if not exists public.user_changes (
  user_id uuid not null,
  area text not null,
  version bigint not null default 1,
  origin text,
  updated_at timestamptz not null default now(),
  primary key (user_id, area)
);

comment on table public.user_changes is
  'Per-user change counter per synced table (no financial data). Bumped by statement triggers; clients subscribe with Realtime and delta-pull the area.';

alter table public.user_changes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'user_changes'
       and policyname = 'user_changes_select_own'
  ) then
    create policy user_changes_select_own
      on public.user_changes
      for select
      to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

revoke all on public.user_changes from anon;
revoke insert, update, delete, truncate on public.user_changes from authenticated;
grant select on public.user_changes to authenticated;

-- 2. Bump function -------------------------------------------------------------
-- TG_ARGV[0] = owner column (user_id, or id for public.users).
create or replace function public.sx_bump_user_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_col text := coalesce(TG_ARGV[0], 'user_id');
  src text;
  client text;
begin
  begin
    client := left(
      coalesce(current_setting('request.headers', true)::json ->> 'x-sx-client', ''),
      64);
  exception when others then
    client := '';
  end;
  if client = '' then
    client := null;
  end if;

  if TG_OP = 'DELETE' then
    src := 'old_rows';
  else
    src := 'new_rows';
  end if;

  execute format(
    'insert into public.user_changes as uc (user_id, area, version, origin, updated_at)
       select distinct s.%I, %L, 1, $1, now()
         from %I s
        where s.%I is not null
     on conflict (user_id, area) do update
       set version = uc.version + 1,
           origin = excluded.origin,
           updated_at = now()',
    owner_col, TG_TABLE_NAME, src, owner_col)
  using client;
  return null;
end;
$$;

revoke all on function public.sx_bump_user_change() from public;
revoke all on function public.sx_bump_user_change() from anon;
revoke all on function public.sx_bump_user_change() from authenticated;

-- Touch function (also created by 20261026100000; repeated so this file
-- works on its own).
create or replace function public.sx_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.sx_touch_updated_at() from public;
revoke all on function public.sx_touch_updated_at() from anon;
revoke all on function public.sx_touch_updated_at() from authenticated;

-- 3. Triggers + indexes per synced user table ---------------------------------
do $$
declare
  t text;
  owner_col text;
  has_updated boolean;
  has_upd_touch boolean;
begin
  foreach t in array array[
    'transactions', 'transaction_splits', 'transaction_items',
    'accounts', 'purposes', 'categories', 'contributors',
    'user_merchants', 'monthly_plans', 'outings', 'outing_expenses',
    'outing_categories', 'friends', 'friend_splits', 'friend_settlements',
    'settlements', 'savings_goals', 'investments', 'projector_settings',
    'recurring_bills', 'user_self_upi', 'users'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    owner_col := case when t = 'users' then 'id' else 'user_id' end;
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = owner_col
    ) then
      continue;
    end if;

    -- user_changes bump (one per statement).
    if not exists (
      select 1 from pg_trigger
       where not tgisinternal and tgrelid = ('public.' || t)::regclass
         and tgname = t || '_sx_chg_ins'
    ) then
      execute format(
        'create trigger %I after insert on public.%I
           referencing new table as new_rows
           for each statement execute function public.sx_bump_user_change(%L)',
        t || '_sx_chg_ins', t, owner_col);
    end if;
    if not exists (
      select 1 from pg_trigger
       where not tgisinternal and tgrelid = ('public.' || t)::regclass
         and tgname = t || '_sx_chg_upd'
    ) then
      execute format(
        'create trigger %I after update on public.%I
           referencing new table as new_rows
           for each statement execute function public.sx_bump_user_change(%L)',
        t || '_sx_chg_upd', t, owner_col);
    end if;
    if not exists (
      select 1 from pg_trigger
       where not tgisinternal and tgrelid = ('public.' || t)::regclass
         and tgname = t || '_sx_chg_del'
    ) then
      execute format(
        'create trigger %I after delete on public.%I
           referencing old table as old_rows
           for each statement execute function public.sx_bump_user_change(%L)',
        t || '_sx_chg_del', t, owner_col);
    end if;

    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) into has_updated;
    if not has_updated then
      continue; -- e.g. recurring_bills: no column added here, full pull stays
    end if;

    -- Server clock on INSERT (UPDATE is already touched).
    if not exists (
      select 1 from pg_trigger
       where not tgisinternal and tgrelid = ('public.' || t)::regclass
         and tgname = t || '_sx_touch_ins'
    ) then
      execute format(
        'create trigger %I before insert on public.%I
           for each row execute function public.sx_touch_updated_at()',
        t || '_sx_touch_ins', t);
    end if;

    -- UPDATE touch only where the table has none yet.
    select exists (
      select 1
        from pg_trigger tg
        join pg_proc p on p.oid = tg.tgfoid
       where not tg.tgisinternal
         and tg.tgrelid = ('public.' || t)::regclass
         and (tg.tgtype & 16) <> 0          -- UPDATE
         and (tg.tgtype & 2) <> 0           -- BEFORE
         and (p.proname ilike '%touch%' or p.proname ilike '%updated_at%'
              or tg.tgname ilike '%touch%' or tg.tgname ilike '%updated_at%')
    ) into has_upd_touch;
    if not has_upd_touch then
      execute format(
        'create trigger %I before update on public.%I
           for each row execute function public.sx_touch_updated_at()',
        t || '_sx_touch_upd', t);
    end if;

    -- Delta index.
    execute format(
      'create index if not exists %I on public.%I (%I, updated_at)',
      t || '_sx_owner_updated_idx', t, owner_col);
  end loop;
end $$;

-- 4. Realtime: user_changes only ------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'user_changes'
     ) then
    execute 'alter publication supabase_realtime add table public.user_changes';
  end if;
end $$;

commit;
