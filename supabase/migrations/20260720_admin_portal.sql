-- ============================================================================
-- Admin portal: dedicated RPC layer + append-only admin action log.
--
-- Deliberate design (do not "simplify" these away):
--   * Existing per-user RLS policies are NOT relaxed for admins. Admin access
--     flows exclusively through the narrow SECURITY DEFINER functions below,
--     each of which starts with require_admin() — that check is what stands
--     in for RLS on these functions.
--   * Every table-name parameter is validated against an explicit allow-list
--     and interpolated only via format() %I (identifier quoting). Never
--     switch to string concatenation and never drop the allow-list check.
--   * admin_action_logs is append-only: no update/delete policy exists, and
--     the log tables are excluded from the delete allow-list. Purging old
--     logs, if ever needed, must be a separate retention feature.
--   * record_id is text (not uuid) because primary keys vary across tables:
--     share_links is keyed by token, income_targets/projector_settings by
--     user_id, and mail_templates/global_settings use text ids.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Reusable guard: every admin RPC starts by calling this.
-- ----------------------------------------------------------------------------
create or replace function public.require_admin()
returns void as $$
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'admin access required';
  end if;
end;
$$ language plpgsql security definer stable;

-- ----------------------------------------------------------------------------
-- Admin action log (Step 5) — created BEFORE the RPCs that write to it.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null check (action in ('view_table','view_row','delete','export','impersonate_view')),
  table_name text,
  record_id text,
  before jsonb,
  target_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists admin_action_logs_admin_idx
  on public.admin_action_logs (admin_id, created_at desc);
create index if not exists admin_action_logs_target_user_idx
  on public.admin_action_logs (target_user_id, created_at desc);

alter table public.admin_action_logs enable row level security;

-- Admins can read the log (accountability review); nobody can update or
-- delete it, including admins themselves — genuinely append-only.
drop policy if exists "admin_action_logs_select_admin" on public.admin_action_logs;
create policy "admin_action_logs_select_admin" on public.admin_action_logs
  for select using (public.is_admin());
drop policy if exists "admin_action_logs_insert_admin" on public.admin_action_logs;
create policy "admin_action_logs_insert_admin" on public.admin_action_logs
  for insert with check (public.is_admin());
-- Deliberately no update/delete policy — matches audit_logs/activity_logs.

-- ----------------------------------------------------------------------------
-- Allow-lists + per-table metadata helpers.
-- ----------------------------------------------------------------------------

-- Tables the admin Database Viewer may READ.
create or replace function public.admin_allowed_tables()
returns text[] as $$
  select array[
    'users','accounts','purposes','categories','contributors',
    'transactions','transaction_splits','monthly_plans','budget_templates',
    'smart_views','friends','outings','outing_expenses','settlements',
    'purpose_shares','share_links','share_access_logs','audit_logs',
    'activity_logs','backup_history','account_balance_history',
    'global_settings','mail_templates','reflections','smart_alerts',
    'income_streams','income_targets','savings_goals','projector_settings',
    'ai_chat_messages','ai_insights','sms_template_rules',
    'sms_detection_rules','sms_block_rules','admin_action_logs'
  ];
$$ language sql immutable;

-- Tables the admin may DELETE rows from. Excluded on purpose:
--   * append-only logs: audit_logs, activity_logs, share_access_logs,
--     admin_action_logs — tamper-evident records must stay tamper-evident.
--   * global_settings — the single shared config row; deleting it would
--     break the app for everyone.
--   * users — cascade + auth.users deletion needs the service role key and
--     goes through the dedicated /api/admin/users/[id] route handler.
create or replace function public.admin_deletable_tables()
returns text[] as $$
  select array[
    'accounts','purposes','categories','contributors',
    'transactions','transaction_splits','monthly_plans','budget_templates',
    'smart_views','friends','outings','outing_expenses','settlements',
    'purpose_shares','share_links','backup_history',
    'account_balance_history','mail_templates','reflections','smart_alerts',
    'income_streams','income_targets','savings_goals','projector_settings',
    'ai_chat_messages','ai_insights','sms_template_rules',
    'sms_detection_rules','sms_block_rules'
  ];
$$ language sql immutable;

-- Primary-key column per allow-listed table (PKs are not uniformly "id").
create or replace function public.admin_table_pk(p_table text)
returns text as $$
  select case p_table
    when 'share_links' then 'token'
    when 'income_targets' then 'user_id'
    when 'projector_settings' then 'user_id'
    else 'id'
  end;
$$ language sql immutable;

-- Which column scopes a table to a user (for the "find user X's rows"
-- filter). Null means the table has no per-user scoping (global config).
create or replace function public.admin_table_user_col(p_table text)
returns text as $$
  select case
    when p_table = 'users' then 'id'
    when p_table in ('purpose_shares','share_links') then 'owner_id'
    when p_table in ('global_settings','mail_templates','sms_template_rules',
                     'sms_detection_rules','sms_block_rules') then null
    when p_table = 'admin_action_logs' then 'target_user_id'
    else 'user_id'
  end;
$$ language sql immutable;

-- Metadata for the Database Viewer sidebar: one row per allow-listed table.
create or replace function public.admin_table_meta()
returns jsonb as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(jsonb_build_object(
    'table', t,
    'pk', public.admin_table_pk(t),
    'userCol', public.admin_table_user_col(t),
    'deletable', t = any(public.admin_deletable_tables())
  )), '[]'::jsonb)
  into v_result
  from unnest(public.admin_allowed_tables()) as t;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_table_meta() to authenticated;

-- ----------------------------------------------------------------------------
-- Generic table browser RPCs (Database Viewer).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_table(
  p_table text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_order_by text default null,
  p_order_dir text default 'desc',
  p_filter_user uuid default null
) returns jsonb as $$
declare
  v_order_col text;
  v_user_col text;
  v_where text := 'true';
  v_result jsonb;
begin
  perform public.require_admin();

  if not (p_table = any(public.admin_allowed_tables())) then
    raise exception 'table % is not in the admin-accessible allow-list', p_table;
  end if;

  -- Resolve the order column: caller's choice if it really exists on the
  -- table, otherwise created_at when present, otherwise the primary key.
  if p_order_by is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_table
        and column_name = p_order_by
    ) then
      raise exception 'column % does not exist on table %', p_order_by, p_table;
    end if;
    v_order_col := p_order_by;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table
      and column_name = 'created_at'
  ) then
    v_order_col := 'created_at';
  else
    v_order_col := public.admin_table_pk(p_table);
  end if;

  if p_filter_user is not null then
    v_user_col := public.admin_table_user_col(p_table);
    if v_user_col is null then
      raise exception 'table % is not filterable by user', p_table;
    end if;
    v_where := format('%I = %L', v_user_col, p_filter_user);
  end if;

  -- Dynamic query, but constrained to the explicit allow-list above and
  -- interpolated exclusively via %I/%L — never naive concatenation.
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       from (select * from public.%I where %s order by %I %s limit %s offset %s) t',
    p_table,
    v_where,
    v_order_col,
    case when lower(p_order_dir) = 'asc' then 'asc' else 'desc' end,
    greatest(1, least(coalesce(p_limit, 50), 200)),
    greatest(0, coalesce(p_offset, 0))
  ) into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_list_table(text, integer, integer, text, text, uuid) to authenticated;

create or replace function public.admin_count_table(
  p_table text,
  p_filter_user uuid default null
) returns bigint as $$
declare
  v_user_col text;
  v_where text := 'true';
  v_count bigint;
begin
  perform public.require_admin();

  if not (p_table = any(public.admin_allowed_tables())) then
    raise exception 'table % is not in the admin-accessible allow-list', p_table;
  end if;

  if p_filter_user is not null then
    v_user_col := public.admin_table_user_col(p_table);
    if v_user_col is null then
      raise exception 'table % is not filterable by user', p_table;
    end if;
    v_where := format('%I = %L', v_user_col, p_filter_user);
  end if;

  execute format('select count(*) from public.%I where %s', p_table, v_where)
    into v_count;
  return v_count;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_count_table(text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Row delete (Database Viewer) — logs a before-image, always.
-- ----------------------------------------------------------------------------
create or replace function public.admin_delete_row(p_table text, p_id text)
returns void as $$
declare
  v_pk text;
  v_before jsonb;
  v_target uuid;
  v_user_col text;
begin
  perform public.require_admin();

  if not (p_table = any(public.admin_deletable_tables())) then
    raise exception 'table % is not in the admin delete allow-list', p_table;
  end if;

  v_pk := public.admin_table_pk(p_table);

  -- pk::text comparison so uuid and text keys both work.
  execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
    using p_id into v_before;

  if v_before is null then
    raise exception 'row not found';
  end if;

  -- Best-effort: capture which user the deleted row belonged to.
  v_user_col := public.admin_table_user_col(p_table);
  if v_user_col is not null and v_before ? v_user_col then
    begin
      v_target := (v_before ->> v_user_col)::uuid;
    exception when others then
      v_target := null;
    end;
  end if;

  execute format('delete from public.%I where %I::text = $1', p_table, v_pk)
    using p_id;

  -- Admin action log — not optional.
  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, before, target_user_id)
  values (auth.uid(), 'delete', p_table, p_id, v_before, v_target);
end;
$$ language plpgsql security definer;

grant execute on function public.admin_delete_row(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Explicit action logging for reads/exports (called from the admin UI:
-- once per table-open / user-detail-view / export — not per pagination).
-- ----------------------------------------------------------------------------
create or replace function public.admin_log_action(
  p_action text,
  p_table text default null,
  p_record_id text default null,
  p_target_user_id uuid default null
) returns void as $$
begin
  perform public.require_admin();

  if p_action not in ('view_table','view_row','export','impersonate_view') then
    raise exception 'invalid admin action %', p_action;
  end if;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id)
  values (auth.uid(), p_action, p_table, p_record_id, p_target_user_id);
end;
$$ language plpgsql security definer;

grant execute on function public.admin_log_action(text, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin action log reader (with admin/user email context for the viewer UI).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_action_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_action text default null,
  p_admin_id uuid default null,
  p_target_user_id uuid default null
) returns jsonb as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_result
  from (
    select to_jsonb(l) || jsonb_build_object(
      'admin_email', au.email,
      'admin_name', au.name,
      'target_email', tu.email,
      'target_name', tu.name
    ) as row_json
    from public.admin_action_logs l
    left join public.users au on au.id = l.admin_id
    left join public.users tu on tu.id = l.target_user_id
    where (p_action is null or l.action = p_action)
      and (p_admin_id is null or l.admin_id = p_admin_id)
      and (p_target_user_id is null or l.target_user_id = p_target_user_id)
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) sub;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_list_action_logs(integer, integer, text, uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin dashboard overview (Step 3).
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_overview()
returns jsonb as $$
declare
  v_storage jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  perform public.require_admin();

  -- Storage usage per bucket (row count + total bytes) — optional: if the
  -- storage schema isn't reachable, report an empty list rather than fail.
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', bucket_id,
      'objects', object_count,
      'bytes', total_bytes
    )), '[]'::jsonb) into v_storage
    from (
      select bucket_id,
             count(*) as object_count,
             coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes
      from storage.objects
      group by bucket_id
    ) s;
  exception when others then
    v_storage := '[]'::jsonb;
  end;

  select jsonb_build_object(
    'totalUsers', (select count(*) from public.users),
    'newUsersWeek', (select count(*) from public.users where joined_at >= now() - interval '7 days'),
    'newUsersMonth', (select count(*) from public.users where joined_at >= now() - interval '30 days'),
    'totalTransactions', (select count(*) from public.transactions),
    'totalVolume', (select coalesce(sum(total_amount), 0) from public.transactions),
    'expenseVolume', (select coalesce(sum(total_amount), 0) from public.transactions where type = 'expense'),
    'incomeVolume', (select coalesce(sum(total_amount), 0) from public.transactions where type = 'income'),
    'backupsLast7d', (select count(*) from public.backup_history where created_at >= now() - interval '7 days'),
    'backupFailuresLast7d', (select count(*) from public.backup_history where created_at >= now() - interval '7 days' and status = 'failed'),
    'maintenanceMode', (select maintenance_mode from public.global_settings where id = 'app'),
    'storage', v_storage
  ) into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_get_overview() to authenticated;

-- ----------------------------------------------------------------------------
-- User list with spend summary (Step 7, /admin/users).
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', u.id,
      'name', u.name,
      'email', u.email,
      'role', u.role,
      'joinedAt', u.joined_at,
      'txCount', coalesce(t.tx_count, 0),
      'monthSpend', coalesce(t.month_spend, 0),
      'totalSpend', coalesce(t.total_spend, 0)
    ) as row_json
    from public.users u
    left join lateral (
      select count(*) as tx_count,
             sum(total_amount) filter (where type = 'expense') as total_spend,
             sum(total_amount) filter (
               where type = 'expense'
                 and transaction_date >= date_trunc('month', now())
             ) as month_spend
      from public.transactions tx
      where tx.user_id = u.id
    ) t on true
    where p_search is null
       or u.email ilike '%' || p_search || '%'
       or u.name ilike '%' || p_search || '%'
    order by u.joined_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) sub;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_list_users(text, integer, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Per-user detail overview (Step 7, /admin/users/[id]).
-- Logs its own 'view_row' entry server-side, so the audit trail cannot be
-- skipped by a client that "forgets" to log.
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_user_overview(p_user_id uuid)
returns jsonb as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', u.id, 'name', u.name, 'email', u.email, 'role', u.role,
        'joinedAt', u.joined_at, 'phone', u.phone
      )
      from public.users u where u.id = p_user_id
    ),
    'txCount', (select count(*) from public.transactions where user_id = p_user_id),
    'totalSpend', (
      select coalesce(sum(total_amount), 0) from public.transactions
      where user_id = p_user_id and type = 'expense'
    ),
    'totalIncome', (
      select coalesce(sum(total_amount), 0) from public.transactions
      where user_id = p_user_id and type = 'income'
    ),
    'monthSpend', (
      select coalesce(sum(total_amount), 0) from public.transactions
      where user_id = p_user_id and type = 'expense'
        and transaction_date >= date_trunc('month', now())
    ),
    'spendByCategory', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'categoryId', s.category_id,
        'name', coalesce(c.name, s.category_id),
        'amount', s.amount
      ) order by s.amount desc), '[]'::jsonb)
      from (
        select ts.category_id, sum(ts.amount) as amount
        from public.transaction_splits ts
        join public.transactions t on t.id = ts.transaction_id
        where t.user_id = p_user_id and t.type = 'expense'
        group by ts.category_id
        order by sum(ts.amount) desc
        limit 12
      ) s
      left join public.categories c on c.id::text = s.category_id
    ),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'type', a.type, 'last4', a.last4,
        'openingBalance', a.opening_balance,
        'isActive', a.is_active,
        'balance', a.opening_balance + coalesce((
          select sum(case when t.type = 'income' then t.total_amount else -t.total_amount end)
          from public.transactions t
          where t.account_id = a.id and t.user_id = p_user_id
        ), 0)
      )), '[]'::jsonb)
      from public.accounts a
      where a.user_id = p_user_id and a.deleted_at is null
    ),
    'purposes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'color', p.color, 'isActive', p.is_active
      )), '[]'::jsonb)
      from public.purposes p
      where p.user_id = p_user_id and p.deleted_at is null
    ),
    'recentTransactions', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from (
        select id, merchant, total_amount, type, transaction_date, status
        from public.transactions
        where user_id = p_user_id
        order by transaction_date desc
        limit 10
      ) r
    ),
    'lastBackup', (
      select to_jsonb(b) from (
        select created_at, status, type, size_bytes
        from public.backup_history
        where user_id = p_user_id
        order by created_at desc
        limit 1
      ) b
    )
  ) into v_result;

  -- Audit: this is exactly the access the trail exists to make accountable.
  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id)
  values (auth.uid(), 'view_row', 'users', p_user_id::text, p_user_id);

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_get_user_overview(uuid) to authenticated;
