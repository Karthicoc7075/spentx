-- Sync optimization 1/2: admin data versions (categories, rules, templates,
-- app name) reach every open app within seconds.
--
-- WHAT
--   * public.sx_bump_rules_version(): statement-level trigger function. One
--     bump per INSERT / UPDATE / DELETE statement (a 5,000 row import bumps
--     once). Self-contained (does not depend on mcr_bump_rules_version, whose
--     body is not in the repo). SECURITY DEFINER, search_path pinned, no
--     EXECUTE for anon / authenticated / public.
--   * Version triggers ONLY on admin tables that have none yet (a table that
--     already bumps through mcr_bump_rules_version is left alone), so no
--     table is bumped twice.
--   * global_settings gets updated_at + a touch trigger (column only, no data
--     change) and its own rules_version row, so an app-name change shows
--     without an app update.
--   * rules_version: authenticated users may SELECT (extra permissive policy,
--     existing policies untouched). No INSERT / UPDATE / DELETE policy: only
--     the trigger function (definer) and the service role write it.
--   * rules_version joins the supabase_realtime publication (only this table
--     is added here). It holds no user data.
--
-- SAFETY: additive and idempotent (safe to run twice). No drop of anything
-- that existed before, no data delete, RLS never loosened on data tables.
-- Run order: precheck.sql, this file, verify.sql
-- (supabase/migration-checks/20261026100000_sync_admin_versions/).

begin;

-- 1. Bump function ----------------------------------------------------------
create or replace function public.sx_bump_rules_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  has_active boolean;
  n integer;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = TG_TABLE_NAME
       and column_name = 'is_active'
  ) into has_active;

  if has_active then
    execute format('select count(*) from public.%I where is_active', TG_TABLE_NAME) into n;
  else
    execute format('select count(*) from public.%I', TG_TABLE_NAME) into n;
  end if;

  insert into public.rules_version as rv (table_name, version, row_count, updated_at)
  values (TG_TABLE_NAME, 1, n, now())
  on conflict (table_name) do update
    set version = rv.version + 1,
        row_count = excluded.row_count,
        updated_at = now();
  return null;
end;
$$;

revoke all on function public.sx_bump_rules_version() from public;
revoke all on function public.sx_bump_rules_version() from anon;
revoke all on function public.sx_bump_rules_version() from authenticated;

-- Touch function for tables that need updated_at kept current.
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

-- 2. global_settings.updated_at (column only) --------------------------------
alter table public.global_settings
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where not tgisinternal
       and tgrelid = 'public.global_settings'::regclass
       and tgname = 'global_settings_sx_touch'
  ) then
    create trigger global_settings_sx_touch
      before update on public.global_settings
      for each row execute function public.sx_touch_updated_at();
  end if;
end $$;

-- 3. Version triggers where missing -----------------------------------------
do $$
declare
  t text;
  already boolean;
  has_active boolean;
  mcr oid := to_regproc('public.mcr_bump_rules_version');
  sx oid := 'public.sx_bump_rules_version'::regproc;
begin
  foreach t in array array[
    'category_catalog', 'merchant_brands',
    'merchant_keyword_rules',
    'sms_template_rules', 'sms_block_rules', 'sms_detection_rules',
    'global_settings'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    select exists (
      select 1 from pg_trigger
       where not tgisinternal
         and tgrelid = ('public.' || t)::regclass
         and (tgfoid = sx or (mcr is not null and tgfoid = mcr))
    ) into already;

    if not already then
      execute format(
        'create trigger %I after insert on public.%I
           referencing new table as new_rows
           for each statement execute function public.sx_bump_rules_version()',
        t || '_sx_ver_ins', t);
      execute format(
        'create trigger %I after update on public.%I
           referencing new table as new_rows
           for each statement execute function public.sx_bump_rules_version()',
        t || '_sx_ver_upd', t);
      execute format(
        'create trigger %I after delete on public.%I
           referencing old table as old_rows
           for each statement execute function public.sx_bump_rules_version()',
        t || '_sx_ver_del', t);
    end if;

    -- Starting row so the app has something to compare (never overwrites).
    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'is_active'
    ) into has_active;
    execute format(
      'insert into public.rules_version (table_name, version, row_count, updated_at)
         values (%L, 1, (select count(*) from public.%I %s), now())
       on conflict (table_name) do nothing',
      t, t, case when has_active then 'where is_active' else '' end);
  end loop;
end $$;

-- 4. rules_version: read for signed-in users, writes only via trigger --------
alter table public.rules_version enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'rules_version'
       and policyname = 'rules_version_select_authenticated'
  ) then
    create policy rules_version_select_authenticated
      on public.rules_version
      for select
      to authenticated
      using (true);
  end if;
end $$;

grant select on public.rules_version to authenticated;

-- 5. Realtime: rules_version only --------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'rules_version'
     ) then
    execute 'alter publication supabase_realtime add table public.rules_version';
  end if;
end $$;

commit;
