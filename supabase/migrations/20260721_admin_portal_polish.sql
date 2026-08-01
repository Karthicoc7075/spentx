-- ============================================================================
-- Admin portal polish: default-category CRUD RPCs, generic audited row
-- UPDATE, expanded action vocabulary. Extends 20260720_admin_portal.sql —
-- same require_admin() + allow-list + %I/%L discipline throughout.
--
-- Deviations from the planning doc, on purpose:
--   * record_id stays text (established in the base migration) and the
--     category RPCs store the category slug in it instead of null — a log
--     row that says WHICH category changed is strictly more useful.
--   * admin_update_row takes p_id text and resolves the real PK column per
--     table (share_links.token, income_targets/projector_settings.user_id),
--     matching admin_delete_row; the doc's `p_id uuid ... where id = $1`
--     would fail on those tables.
--   * 'password_reset' is a first-class action value (the doc offered this
--     as the finer-grained option) so the log viewer can filter it.
--   * 'impersonate_view' is dropped from the constraint — impersonation was
--     deliberately not built.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Action vocabulary first — the functions below log 'create'/'update'.
-- ----------------------------------------------------------------------------
alter table public.admin_action_logs drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in ('view_table','view_row','create','update','delete','export','password_reset'));

-- Keep the explicit-logging RPC's own validation in sync.
create or replace function public.admin_log_action(
  p_action text,
  p_table text default null,
  p_record_id text default null,
  p_target_user_id uuid default null
) returns void as $$
begin
  perform public.require_admin();

  if p_action not in ('view_table','view_row','create','update','export','password_reset') then
    raise exception 'invalid admin action %', p_action;
  end if;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id)
  values (auth.uid(), p_action, p_table, p_record_id, p_target_user_id);
end;
$$ language plpgsql security definer;

-- ----------------------------------------------------------------------------
-- Part 1 — Default categories CRUD (global_settings.default_categories).
-- These are the ONLY generic-admin write paths into global_settings; the
-- table stays excluded from admin_update_row/admin_delete_row below.
-- ----------------------------------------------------------------------------
create or replace function public.admin_add_default_category(
  p_id text, p_name text, p_type text, p_color text, p_icon text
) returns void as $$
declare
  v_next_order integer;
begin
  perform public.require_admin();

  if p_type not in ('income','expense') then
    raise exception 'type must be income or expense';
  end if;
  if coalesce(trim(p_id), '') = '' or coalesce(trim(p_name), '') = '' then
    raise exception 'id and name are required';
  end if;

  if exists (
    select 1
    from public.global_settings gs, jsonb_array_elements(gs.default_categories) elem
    where gs.id = 'app' and elem->>'id' = p_id
  ) then
    raise exception 'category id % already exists', p_id;
  end if;

  select coalesce(max((elem->>'order')::integer), 0) + 1
    into v_next_order
    from public.global_settings gs, jsonb_array_elements(gs.default_categories) elem
    where gs.id = 'app';

  update public.global_settings
  set default_categories = default_categories || jsonb_build_array(
    jsonb_build_object(
      'id', p_id, 'name', p_name, 'type', p_type,
      'color', p_color, 'icon', coalesce(p_icon, ''),
      'order', coalesce(v_next_order, 1),
      'isInvestment', false
    )
  )
  where id = 'app';

  insert into public.admin_action_logs (admin_id, action, table_name, record_id)
  values (auth.uid(), 'create', 'global_settings.default_categories', p_id);
end;
$$ language plpgsql security definer;

grant execute on function public.admin_add_default_category(text, text, text, text, text) to authenticated;

create or replace function public.admin_update_default_category(
  p_id text, p_name text, p_color text, p_icon text
) returns void as $$
declare
  v_before jsonb;
begin
  perform public.require_admin();

  select elem into v_before
  from public.global_settings gs, jsonb_array_elements(gs.default_categories) elem
  where gs.id = 'app' and elem->>'id' = p_id;

  if v_before is null then
    raise exception 'category % not found', p_id;
  end if;

  update public.global_settings
  set default_categories = (
    select jsonb_agg(
      case when elem->>'id' = p_id
        then elem || jsonb_build_object('name', p_name, 'color', p_color, 'icon', coalesce(p_icon, ''))
        else elem
      end
    )
    from jsonb_array_elements(default_categories) elem
  )
  where id = 'app';

  insert into public.admin_action_logs (admin_id, action, table_name, record_id, before)
  values (auth.uid(), 'update', 'global_settings.default_categories', p_id, v_before);
end;
$$ language plpgsql security definer;

grant execute on function public.admin_update_default_category(text, text, text, text) to authenticated;

-- Soft removal semantics: existing transactions keep their historical
-- category label; the category only disappears from future-entry pickers.
create or replace function public.admin_delete_default_category(p_id text)
returns void as $$
declare
  v_before jsonb;
begin
  perform public.require_admin();

  select elem into v_before
  from public.global_settings gs, jsonb_array_elements(gs.default_categories) elem
  where gs.id = 'app' and elem->>'id' = p_id;

  if v_before is null then
    raise exception 'category % not found', p_id;
  end if;

  update public.global_settings
  set default_categories = (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from jsonb_array_elements(default_categories) elem
    where elem->>'id' != p_id
  )
  where id = 'app';

  insert into public.admin_action_logs (admin_id, action, table_name, record_id, before)
  values (auth.uid(), 'delete', 'global_settings.default_categories', p_id, v_before);
end;
$$ language plpgsql security definer;

grant execute on function public.admin_delete_default_category(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Part 2 — Generic audited row UPDATE.
-- Updatable = deletable set + users (fixing a name/role is a legitimate
-- admin edit; deleting users still goes through the service-role route).
-- Excluded, same as delete: append-only logs, global_settings.
-- ----------------------------------------------------------------------------
create or replace function public.admin_updatable_tables()
returns text[] as $$
  select public.admin_deletable_tables() || array['users'];
$$ language sql immutable;

create or replace function public.admin_update_row(
  p_table text, p_id text, p_updates jsonb
) returns void as $$
declare
  v_pk text;
  v_before jsonb;
  v_set_clause text;
  v_target uuid;
  v_user_col text;
begin
  perform public.require_admin();

  if not (p_table = any(public.admin_updatable_tables())) then
    raise exception 'table % is not in the admin update allow-list', p_table;
  end if;

  v_pk := public.admin_table_pk(p_table);

  execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
    using p_id into v_before;

  if v_before is null then
    raise exception 'row not found';
  end if;

  -- Build the SET clause from the update payload's keys. Every column name
  -- goes through %I and every value through %L — never raw concatenation.
  -- The primary key is silently excluded: re-keying a row through a generic
  -- editor is never intentional.
  select string_agg(format('%I = %L', key, value), ', ')
  into v_set_clause
  from jsonb_each_text(p_updates)
  where key <> v_pk;

  if v_set_clause is null then
    raise exception 'no updates provided';
  end if;

  -- Validate every key is a real column, so a typo'd key fails loudly
  -- instead of erroring mid-statement with a confusing message.
  if exists (
    select 1 from jsonb_object_keys(p_updates) k
    where k <> v_pk and not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p_table and c.column_name = k
    )
  ) then
    raise exception 'update contains a key that is not a column of %', p_table;
  end if;

  execute format('update public.%I set %s where %I::text = $1', p_table, v_set_clause, v_pk)
    using p_id;

  v_user_col := public.admin_table_user_col(p_table);
  if v_user_col is not null and v_before ? v_user_col then
    begin
      v_target := (v_before ->> v_user_col)::uuid;
    exception when others then
      v_target := null;
    end;
  end if;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, before, target_user_id)
  values (auth.uid(), 'update', p_table, p_id, v_before, v_target);
end;
$$ language plpgsql security definer;

grant execute on function public.admin_update_row(text, text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Defense in depth (same as base migration): keep anon/public away entirely.
-- ----------------------------------------------------------------------------
revoke execute on function public.admin_add_default_category(text, text, text, text, text) from public, anon;
revoke execute on function public.admin_update_default_category(text, text, text, text) from public, anon;
revoke execute on function public.admin_delete_default_category(text) from public, anon;
revoke execute on function public.admin_update_row(text, text, jsonb) from public, anon;
