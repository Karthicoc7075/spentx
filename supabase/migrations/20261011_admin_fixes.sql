-- ============================================================================
-- 20261011_admin_fixes.sql — admin portal security + correctness overhaul.
--
-- Run AFTER 20261011_investments_goals.sql and 20261011_security_audit_fixes.sql.
-- Idempotent: safe to run more than once. Works whether or not the optional
-- 20261011_merchant_category_rules.sql has been applied (the merchant-rule
-- admin RPCs report "relation does not exist" until it is).
--
-- Contents (audit issue numbers in brackets):
--   1. public.users.email can only be set to the caller's verified auth email;
--      rows cannot be moved to another id.                               [1, 40]
--   2. require_admin()/is_admin() + every admin_* SECURITY DEFINER function get
--      a pinned search_path and no anon/public EXECUTE.                  [43]
--   3. Admin delete = soft delete (deleted_at) where the column exists; hard
--      delete only for tables without it. Restore RPC.                   [5]
--   4. admin_get_user_overview fixed + user-360 data.          [2, 30, 31, 32]
--   5. IST month boundaries, consistent totals, set-based queries.  [32-34]
--   6. Table registry covers newer tables; audited insert RPC with a narrow
--      allow-list (no ledger rows, no logs, no global settings). [21, 22, 42]
--   7. Impersonation sessions carry mode (read|write) + reason.       [20]
--   8. Config tables are audited by trigger (direct RLS writes).      [36]
--   9. Audit-log search/count, backups list, metrics, exact user lookup,
--      API-log purge.                                         [28, 29, 35, 45]
-- ============================================================================

-- 1. Identity protection on public.users -------------------------------------
create or replace function public.protect_user_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_jwt_email text;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') then
    return new;
  end if;

  begin
    v_jwt_email := lower(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email');
  exception when others then
    v_jwt_email := null;
  end;

  if tg_op = 'INSERT' then
    if coalesce(new.email, '') <> '' and lower(new.email) is distinct from v_jwt_email then
      raise exception 'users.email must match the signed-in account email'
        using errcode = '42501';
    end if;
  else
    if new.id is distinct from old.id then
      raise exception 'users.id cannot be changed' using errcode = '42501';
    end if;
    if new.email is distinct from old.email
       and lower(coalesce(new.email, '')) is distinct from v_jwt_email then
      raise exception 'users.email can only be set to your verified sign-in email'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_user_identity on public.users;
create trigger protect_user_identity
before insert or update on public.users
for each row execute function public.protect_user_identity();

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'users_update_own') then
    execute 'alter policy "users_update_own" on public.users using (id = auth.uid()) with check (id = auth.uid())';
  end if;
end $$;

create or replace function public.protect_user_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') then
    if tg_op = 'INSERT' then
      if new.role is distinct from 'user' then
        raise exception 'Only trusted administrators may assign user roles'
          using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role then
      raise exception 'Only trusted administrators may change user roles'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- 2. Guards + small helpers ---------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create or replace function public.require_admin()
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_ist_month_start(p_at timestamptz default now())
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select date_trunc('month', p_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
$$;

create or replace function public.admin_escape_like(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- 3. Audit log shape ----------------------------------------------------------
alter table public.admin_action_logs add column if not exists after jsonb;
alter table public.admin_action_logs add column if not exists reason text;
alter table public.admin_action_logs drop constraint if exists admin_action_logs_action_check;
alter table public.admin_action_logs
  add constraint admin_action_logs_action_check
  check (action in (
    'view_table','view_row','create','update','delete','soft_delete','restore','export',
    'password_reset','impersonate_start','impersonate_end','reset_all',
    'resend_verification','force_verify_email','suspend','unsuspend',
    'settings_update','rule_update','purge_logs','impersonate_view'
  ));
create index if not exists admin_action_logs_created_idx on public.admin_action_logs (created_at desc);
create index if not exists admin_action_logs_action_idx on public.admin_action_logs (action, created_at desc);

create or replace function public.admin_log_action(
  p_action text,
  p_table text default null,
  p_record_id text default null,
  p_target_user_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  -- Client-callable actions are view/export only; every mutation is logged by
  -- the RPC or route that performs it.
  if p_action not in ('view_table','view_row','export') then
    raise exception 'invalid admin action %', p_action;
  end if;
  insert into public.admin_action_logs (admin_id, action, table_name, record_id, target_user_id)
  values (auth.uid(), p_action, p_table, p_record_id, p_target_user_id);
end;
$$;

-- 4. Table registry -------------------------------------------------------------
create or replace function public.admin_allowed_tables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'users','accounts','account_purposes','purposes','categories','contributors',
    'transactions','transaction_splits','transaction_items','monthly_plans','budget_templates',
    'smart_views','friends','friend_splits','friend_settlements','outings','outing_expenses',
    'outing_categories','settlements','purpose_shares','share_links','share_access_logs',
    'share_invite_deliveries','audit_logs','activity_logs','backup_history',
    'account_balance_history','net_worth_history','global_settings','mail_templates',
    'reflections','smart_alerts','income_streams','income_targets','savings_goals',
    'goal_contributions','investments','projector_settings','recurring_bills',
    'user_merchants','user_devices','login_history','ai_chat_messages','ai_insights',
    'sms_template_rules','sms_detection_rules','sms_block_rules','admin_action_logs',
    'user_api_logs','admin_impersonation_sessions'
  ];
$$;

create or replace function public.admin_deletable_tables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'accounts','account_purposes','purposes','categories','contributors',
    'transactions','transaction_splits','transaction_items','monthly_plans','budget_templates',
    'smart_views','friends','friend_splits','friend_settlements','outings','outing_expenses',
    'outing_categories','settlements','purpose_shares','share_links','backup_history',
    'account_balance_history','net_worth_history','mail_templates','reflections',
    'smart_alerts','income_streams','income_targets','savings_goals','goal_contributions',
    'investments','projector_settings','user_merchants','user_devices',
    'ai_chat_messages','ai_insights','sms_template_rules','sms_detection_rules','sms_block_rules'
  ];
$$;

create or replace function public.admin_updatable_tables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select public.admin_deletable_tables() || array['users'];
$$;

-- Insert is narrower: no ledger rows (use create_transaction_with_splits via
-- impersonation), no logs, no global settings.
create or replace function public.admin_insertable_tables()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'accounts','purposes','categories','contributors','friends','outings',
    'outing_categories','budget_templates','smart_views','mail_templates',
    'sms_template_rules','sms_detection_rules','sms_block_rules'
  ];
$$;

create or replace function public.admin_table_pk(p_table text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_table
    when 'share_links' then 'token'
    when 'income_targets' then 'user_id'
    when 'projector_settings' then 'user_id'
    else 'id'
  end;
$$;

create or replace function public.admin_table_user_col(p_table text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_table = 'users' then 'id'
    when p_table in ('purpose_shares','share_links','share_invite_deliveries') then 'owner_id'
    when p_table in ('global_settings','mail_templates','sms_template_rules',
                     'sms_detection_rules','sms_block_rules') then null
    when p_table in ('admin_action_logs','admin_impersonation_sessions') then 'target_user_id'
    else 'user_id'
  end;
$$;

create or replace function public.admin_table_has_column(p_table text, p_column text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_column
  );
$$;

create or replace function public.admin_assert_table(p_table text, p_list text[])
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_table is null or not (p_table = any(p_list)) then
    raise exception 'table % is not allowed for this admin operation', p_table;
  end if;
  if to_regclass('public.' || quote_ident(p_table)) is null then
    raise exception 'table % does not exist yet — run its migration first', p_table;
  end if;
end;
$$;

create or replace function public.admin_table_meta()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(jsonb_build_object(
    'table', t,
    'pk', public.admin_table_pk(t),
    'userCol', public.admin_table_user_col(t),
    'deletable', t = any(public.admin_deletable_tables()),
    'updatable', t = any(public.admin_updatable_tables()),
    'insertable', t = any(public.admin_insertable_tables()),
    'softDelete', public.admin_table_has_column(t, 'deleted_at'),
    'columns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.column_name,
        'type', c.data_type,
        'udt', c.udt_name,
        'nullable', c.is_nullable = 'YES',
        'hasDefault', c.column_default is not null
      ) order by c.ordinal_position), '[]'::jsonb)
      from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t
    )
  ) order by t), '[]'::jsonb)
  into v_result
  from unnest(public.admin_allowed_tables()) as t
  where to_regclass('public.' || quote_ident(t)) is not null;

  return v_result;
end;
$$;

-- 5. Browse / count / insert / update / delete / restore ------------------------
drop function if exists public.admin_list_table(text, integer, integer, text, text, uuid);
drop function if exists public.admin_count_table(text, uuid);

create or replace function public.admin_table_where(
  p_table text, p_filter_user uuid, p_search text
) returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_user_col text;
  v_where text := 'true';
begin
  if p_filter_user is not null then
    v_user_col := public.admin_table_user_col(p_table);
    if v_user_col is null then
      raise exception 'table % is not filterable by user', p_table;
    end if;
    v_where := v_where || format(' and t.%I = %L', v_user_col, p_filter_user);
  end if;
  if nullif(btrim(coalesce(p_search, '')), '') is not null then
    v_where := v_where || format(
      ' and to_jsonb(t)::text ilike %L escape %L',
      '%' || public.admin_escape_like(btrim(p_search)) || '%', '\'
    );
  end if;
  return v_where;
end;
$$;

create or replace function public.admin_list_table(
  p_table text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_order_by text default null,
  p_order_dir text default 'desc',
  p_filter_user uuid default null,
  p_search text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_col text;
  v_dir text := case when lower(coalesce(p_order_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_result jsonb;
begin
  perform public.require_admin();
  perform public.admin_assert_table(p_table, public.admin_allowed_tables());

  if p_order_by is not null then
    if not public.admin_table_has_column(p_table, p_order_by) then
      raise exception 'column % does not exist on table %', p_order_by, p_table;
    end if;
    v_order_col := p_order_by;
  elsif public.admin_table_has_column(p_table, 'created_at') then
    v_order_col := 'created_at';
  else
    v_order_col := public.admin_table_pk(p_table);
  end if;

  execute format(
    'select coalesce(jsonb_agg(s.j order by s.ord), ''[]''::jsonb)
       from (select to_jsonb(t) as j,
                    row_number() over (order by t.%I %s nulls last) as ord
               from public.%I t where %s
              order by t.%I %s nulls last limit %s offset %s) s',
    v_order_col, v_dir,
    p_table,
    public.admin_table_where(p_table, p_filter_user, p_search),
    v_order_col, v_dir,
    greatest(1, least(coalesce(p_limit, 50), 200)),
    greatest(0, coalesce(p_offset, 0))
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_count_table(
  p_table text,
  p_filter_user uuid default null,
  p_search text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  perform public.require_admin();
  perform public.admin_assert_table(p_table, public.admin_allowed_tables());
  execute format('select count(*) from public.%I t where %s',
                 p_table, public.admin_table_where(p_table, p_filter_user, p_search))
    into v_count;
  return v_count;
end;
$$;

create or replace function public.admin_row_target(p_table text, p_row jsonb)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_col text := public.admin_table_user_col(p_table);
begin
  if v_col is null or p_row is null or not (p_row ? v_col) then
    return null;
  end if;
  return (p_row ->> v_col)::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.admin_insert_row(p_table text, p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cols text;
  v_bad text;
  v_row jsonb;
begin
  perform public.require_admin();
  perform public.admin_assert_table(p_table, public.admin_insertable_tables());

  if p_record is null or jsonb_typeof(p_record) <> 'object' or p_record = '{}'::jsonb then
    raise exception 'record cannot be empty';
  end if;

  select string_agg(k, ', ') into v_bad
  from jsonb_object_keys(p_record) k
  where not public.admin_table_has_column(p_table, k);
  if v_bad is not null then
    raise exception 'unknown column(s) for %: %', p_table, v_bad;
  end if;

  select string_agg(format('%I', k), ', ') into v_cols from jsonb_object_keys(p_record) k;

  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning to_jsonb(public.%I.*)',
    p_table, v_cols, v_cols, p_table, p_table
  ) using p_record into v_row;

  insert into public.admin_action_logs (admin_id, action, table_name, record_id, after, target_user_id)
  values (auth.uid(), 'create', p_table, v_row ->> public.admin_table_pk(p_table), v_row,
          public.admin_row_target(p_table, v_row));

  return v_row;
end;
$$;

create or replace function public.admin_update_row(
  p_table text, p_id text, p_updates jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk text;
  v_before jsonb;
  v_after jsonb;
  v_set_clause text;
begin
  perform public.require_admin();
  perform public.admin_assert_table(p_table, public.admin_updatable_tables());

  v_pk := public.admin_table_pk(p_table);

  execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
    using p_id into v_before;
  if v_before is null then
    raise exception 'row not found';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_updates) k
    where k <> v_pk and not public.admin_table_has_column(p_table, k)
  ) then
    raise exception 'update contains a key that is not a column of %', p_table;
  end if;

  -- jsonb null -> SQL NULL (jsonb_each_text yields NULL; %L renders NULL)
  select string_agg(format('%I = %L', key, value), ', ')
  into v_set_clause
  from jsonb_each_text(p_updates)
  where key <> v_pk;

  if v_set_clause is null then
    raise exception 'no updates provided';
  end if;

  execute format('update public.%I set %s where %I::text = $1', p_table, v_set_clause, v_pk)
    using p_id;

  execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
    using p_id into v_after;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, before, after, target_user_id)
  values (auth.uid(), 'update', p_table, p_id, v_before, v_after,
          public.admin_row_target(p_table, v_before));
end;
$$;

-- Soft delete where the table has deleted_at, so phones receive a tombstone
-- through normal sync instead of a row that silently vanishes. Tables without
-- deleted_at are hard-deleted (decided at runtime from information_schema;
-- today: account_purposes, transaction_splits, transaction_items, monthly_plans,
-- friend_settlements, outing_categories, purpose_shares, share_links,
-- backup_history, account_balance_history, net_worth_history, mail_templates,
-- reflections, smart_alerts, income_streams, income_targets, projector_settings,
-- user_merchants, user_devices, ai_chat_messages, ai_insights, sms_* rules).
create or replace function public.admin_delete_row(p_table text, p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk text;
  v_before jsonb;
  v_after jsonb;
  v_set text;
begin
  perform public.require_admin();
  perform public.admin_assert_table(p_table, public.admin_deletable_tables());

  v_pk := public.admin_table_pk(p_table);

  execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
    using p_id into v_before;
  if v_before is null then
    raise exception 'row not found';
  end if;

  if public.admin_table_has_column(p_table, 'deleted_at') then
    if v_before ->> 'deleted_at' is not null then
      raise exception 'row is already deleted';
    end if;
    v_set := 'deleted_at = now()';
    if public.admin_table_has_column(p_table, 'is_active') then
      v_set := v_set || ', is_active = false';
    end if;
    if public.admin_table_has_column(p_table, 'deleted_by') then
      v_set := v_set || format(', deleted_by = %L::uuid', auth.uid());
    end if;
    if public.admin_table_has_column(p_table, 'updated_at') then
      v_set := v_set || ', updated_at = now()';
    end if;
    execute format('update public.%I set %s where %I::text = $1', p_table, v_set, v_pk)
      using p_id;
    execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
      using p_id into v_after;

    insert into public.admin_action_logs
      (admin_id, action, table_name, record_id, before, after, target_user_id)
    values (auth.uid(), 'soft_delete', p_table, p_id, v_before, v_after,
            public.admin_row_target(p_table, v_before));
  else
    execute format('delete from public.%I where %I::text = $1', p_table, v_pk)
      using p_id;
    insert into public.admin_action_logs
      (admin_id, action, table_name, record_id, before, target_user_id)
    values (auth.uid(), 'delete', p_table, p_id, v_before,
            public.admin_row_target(p_table, v_before));
  end if;
end;
$$;

create or replace function public.admin_restore_row(p_table text, p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk text;
  v_before jsonb;
  v_after jsonb;
  v_set text;
begin
  perform public.require_admin();
  perform public.admin_assert_table(p_table, public.admin_deletable_tables());
  if not public.admin_table_has_column(p_table, 'deleted_at') then
    raise exception 'table % does not support restore (hard delete)', p_table;
  end if;

  v_pk := public.admin_table_pk(p_table);
  execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
    using p_id into v_before;
  if v_before is null then
    raise exception 'row not found';
  end if;
  if v_before ->> 'deleted_at' is null then
    raise exception 'row is not deleted';
  end if;

  v_set := 'deleted_at = null';
  if public.admin_table_has_column(p_table, 'is_active') then
    v_set := v_set || ', is_active = true';
  end if;
  if public.admin_table_has_column(p_table, 'deleted_by') then
    v_set := v_set || ', deleted_by = null';
  end if;
  if public.admin_table_has_column(p_table, 'updated_at') then
    v_set := v_set || ', updated_at = now()';
  end if;
  execute format('update public.%I set %s where %I::text = $1', p_table, v_set, v_pk)
    using p_id;
  execute format('select to_jsonb(t) from public.%I t where %I::text = $1', p_table, v_pk)
    using p_id into v_after;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, before, after, target_user_id)
  values (auth.uid(), 'restore', p_table, p_id, v_before, v_after,
          public.admin_row_target(p_table, v_before));
end;
$$;

-- 6. Money helpers (IST + confirmed-status aware) -------------------------------
create or replace function public.admin_tx_is_confirmed(t public.transactions)
returns boolean
language sql
stable
set search_path = public
as $$
  select t.is_active is not false
     and t.deleted_at is null
     and coalesce(t.status, 'completed') not in ('unverified', 'rejected', 'failed');
$$;

create or replace function public.admin_tx_first_category(p_tx uuid)
returns text
language sql
stable
set search_path = public
as $$
  select lower(coalesce(
    (select ts.category_id from public.transaction_splits ts where ts.transaction_id = p_tx limit 1),
    ''
  ));
$$;

create or replace function public.admin_tx_counts_for_balance(t public.transactions)
returns boolean
language sql
stable
set search_path = public
as $$
  -- mirrors lib/wealth.ts isBalanceExcludedTransaction (status part)
  select t.is_active is not false
     and t.deleted_at is null
     and coalesce(t.status, 'completed') not in ('unverified', 'rejected');
$$;

create or replace function public.admin_user_spend_amount(
  p_user_id uuid,
  p_from timestamptz default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(tx.total_amount)::numeric
      from public.transactions tx
      where tx.user_id = p_user_id
        and tx.type = 'expense'
        and public.admin_tx_is_confirmed(tx)
        and not coalesce(public.is_outing_rollup_transaction(tx), false)
        and not coalesce(public.is_transfer_transaction(tx), false)
        and public.admin_tx_first_category(tx.id) not in ('opening balance', 'settlements', 'settlement', 'transfer')
        and (p_from is null or tx.transaction_date >= p_from)
    ), 0)
    + coalesce((
      select sum(oe.amount)::numeric
      from public.outing_expenses oe
      where oe.user_id = p_user_id
        and oe.is_active = true
        and oe.deleted_at is null
        and oe.linked_transaction_id is null
        and coalesce(oe.source, '') is distinct from 'bank-detected'
        and (p_from is null or (oe.expense_date is not null and oe.expense_date >= p_from))
    ), 0);
$$;

create or replace function public.admin_user_income_amount(
  p_user_id uuid,
  p_from timestamptz default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(t.total_amount), 0)::numeric
  from public.transactions t
  where t.user_id = p_user_id
    and t.type = 'income'
    and public.admin_tx_is_confirmed(t)
    and not coalesce(public.is_reimbursement_transaction(t), false)
    and not coalesce(public.is_transfer_transaction(t), false)
    and public.admin_tx_first_category(t.id) not in (
      'opening balance', 'settlements', 'settlement', 'repayment', 'friend repayment', 'transfer'
    )
    and (p_from is null or t.transaction_date >= p_from);
$$;

-- 7. Users list / count / exact lookup -------------------------------------------
drop function if exists public.admin_list_users(text, integer, integer);

create or replace function public.admin_user_matches(u public.users, p_search text)
returns boolean
language sql
stable
set search_path = public
as $$
  select nullif(btrim(coalesce(p_search, '')), '') is null
      or u.email ilike '%' || public.admin_escape_like(btrim(p_search)) || '%' escape '\'
      or u.name ilike '%' || public.admin_escape_like(btrim(p_search)) || '%' escape '\'
      or coalesce(u.phone, '') ilike '%' || public.admin_escape_like(btrim(p_search)) || '%' escape '\'
      or u.id::text = lower(btrim(p_search));
$$;

create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_role text default null,
  p_sort text default 'joined_desc'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_month_start timestamptz := public.admin_ist_month_start();
begin
  perform public.require_admin();

  -- Page first, then compute the per-user aggregates for that page only.
  with page as (
    select u.id, u.name, u.email, u.role, u.joined_at,
           row_number() over (
             order by
               case when p_sort = 'joined_asc' then u.joined_at end asc,
               case when p_sort = 'name_asc' then lower(u.name) end asc,
               case when p_sort = 'email_asc' then lower(u.email) end asc,
               u.joined_at desc
           ) as ord
    from public.users u
    where public.admin_user_matches(u, p_search)
      and (p_role is null or u.role = p_role)
    order by ord
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', p.email, 'role', p.role,
      'joinedAt', p.joined_at,
      'txCount', (select count(*) from public.transactions tx
                  where tx.user_id = p.id and tx.is_active = true and tx.deleted_at is null),
      'monthSpend', public.admin_user_spend_amount(p.id, v_month_start),
      'totalSpend', public.admin_user_spend_amount(p.id, null),
      'emailConfirmed', au.email_confirmed_at is not null,
      'bannedUntil', au.banned_until,
      'lastSignInAt', au.last_sign_in_at,
      'lastSeenAt', (select max(d.last_seen_at) from public.user_devices d where d.user_id = p.id)
    ) order by p.ord), '[]'::jsonb)
  into v_result
  from page p
  left join auth.users au on au.id = p.id;

  return v_result;
end;
$$;

create or replace function public.admin_count_users(
  p_search text default null,
  p_role text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  perform public.require_admin();
  select count(*) into v_count
  from public.users u
  where public.admin_user_matches(u, p_search)
    and (p_role is null or u.role = p_role);
  return v_count;
end;
$$;

-- Exact lookup (email case-insensitive, or uuid) — never a partial match.
create or replace function public.admin_find_user(p_query text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  perform public.require_admin();
  if v_q = '' then
    return null;
  end if;
  if v_q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from public.users where id = v_q::uuid;
    return v_id;
  end if;
  select id into v_id from public.users where lower(email) = v_q limit 1;
  return v_id;
end;
$$;

-- 8. User overview (360) ------------------------------------------------------
create or replace function public.admin_get_user_overview(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_month_start timestamptz := public.admin_ist_month_start();
begin
  perform public.require_admin();

  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'user not found';
  end if;

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', u.id, 'name', u.name, 'email', u.email, 'role', u.role,
        'joinedAt', u.joined_at, 'phone', u.phone,
        'setupCompleted', u.setup_completed, 'timezone', u.timezone
      )
      from public.users u where u.id = p_user_id
    ),
    'auth', (
      select jsonb_build_object(
        'emailConfirmedAt', au.email_confirmed_at,
        'lastSignInAt', au.last_sign_in_at,
        'bannedUntil', au.banned_until,
        'createdAt', au.created_at
      )
      from auth.users au where au.id = p_user_id
    ),
    'txCount', (
      select count(*) from public.transactions
      where user_id = p_user_id and is_active = true and deleted_at is null
    ),
    'unverifiedCount', (
      select count(*) from public.transactions
      where user_id = p_user_id and is_active = true and deleted_at is null and status = 'unverified'
    ),
    'totalSpend', public.admin_user_spend_amount(p_user_id, null),
    'totalIncome', public.admin_user_income_amount(p_user_id, null),
    'monthSpend', public.admin_user_spend_amount(p_user_id, v_month_start),
    'monthIncome', public.admin_user_income_amount(p_user_id, v_month_start),
    'spendByCategory', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'categoryId', s.category_id,
        'name', coalesce(c.name, s.category_id),
        'amount', s.amount
      ) order by s.amount desc), '[]'::jsonb)
      from (
        select x.category_id, sum(x.amount) as amount
        from (
          select ts.category_id, ts.amount
          from public.transaction_splits ts
          join public.transactions t on t.id = ts.transaction_id
          where t.user_id = p_user_id
            and t.type = 'expense'
            and public.admin_tx_is_confirmed(t)
            and not coalesce(public.is_outing_rollup_transaction(t), false)
            and not coalesce(public.is_transfer_transaction(t), false)
          union all
          select coalesce(nullif(oe.category_id, ''), 'Travel'), oe.amount
          from public.outing_expenses oe
          where oe.user_id = p_user_id
            and oe.is_active = true
            and oe.deleted_at is null
            and oe.linked_transaction_id is null
            and coalesce(oe.source, '') is distinct from 'bank-detected'
        ) x
        group by x.category_id
        order by sum(x.amount) desc
        limit 12
      ) s
      left join public.categories c on c.id::text = s.category_id
    ),
    'accounts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'type', a.type, 'last4', a.last4,
        'openingBalance', a.opening_balance,
        'isActive', a.is_active,
        'balance',
          a.opening_balance
          + coalesce((
              select sum(t.total_amount) from public.transactions t
              where t.user_id = p_user_id
                and public.admin_tx_counts_for_balance(t)
                and not coalesce(public.is_outing_rollup_transaction(t), false)
                and public.admin_tx_first_category(t.id) is distinct from 'opening balance'
                and ((t.type = 'income' and t.account_id = a.id)
                     or (t.type = 'transfer' and t.to_account_id = a.id))
            ), 0)
          - coalesce((
              select sum(t.total_amount) from public.transactions t
              where t.user_id = p_user_id
                and t.account_id = a.id
                and t.type in ('expense', 'transfer')
                and public.admin_tx_counts_for_balance(t)
                and not coalesce(public.is_outing_rollup_transaction(t), false)
            ), 0)
          - coalesce((
              select sum(oe.amount) from public.outing_expenses oe
              where oe.user_id = p_user_id
                and oe.is_active = true
                and oe.deleted_at is null
                and oe.linked_transaction_id is null
                and coalesce(oe.source, '') is distinct from 'bank-detected'
                and (
                  lower(coalesce(oe.account_name, '')) = lower(a.name)
                  or (
                    (a.type = 'cash' or lower(a.name) = 'cash')
                    and (oe.account_name is null
                         or lower(oe.account_name) in ('', 'cash')
                         or lower(coalesce(oe.payment_mode, '')) = 'cash')
                  )
                )
            ), 0)
      ) order by a.name), '[]'::jsonb)
      from public.accounts a
      where a.user_id = p_user_id and a.deleted_at is null
    ),
    'purposes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'color', p.color, 'isActive', p.is_active
      ) order by p.name), '[]'::jsonb)
      from public.purposes p
      where p.user_id = p_user_id and p.deleted_at is null
    ),
    'outings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.title, 'startDate', o.start_date, 'endDate', o.end_date,
        'status', o.status,
        'totalAmount', public.outing_live_total(p_user_id, o.id)
      ) order by o.start_date desc nulls last), '[]'::jsonb)
      from public.outings o
      where o.user_id = p_user_id and o.is_active = true and o.deleted_at is null
    ),
    -- Net balances are not duplicated in SQL: the admin opens the read-only
    -- impersonated Friends page, which uses the exact same balance lib.
    -- admin_get_user_balance_inputs exposes the raw inputs for tooling.
    'friends', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'phone', f.phone
      ) order by f.name), '[]'::jsonb)
      from public.friends f
      where f.user_id = p_user_id and f.is_active = true and f.deleted_at is null
    ),
    'recentTransactions', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.transaction_date desc), '[]'::jsonb)
      from (
        select
          t.id,
          t.merchant,
          case
            when coalesce(public.is_outing_rollup_transaction(t), false) and t.outing_id is not null
              then public.outing_live_total(p_user_id, t.outing_id)
            else t.total_amount
          end as total_amount,
          t.type,
          t.transaction_date,
          t.status,
          t.entry_source,
          t.outing_id,
          (select o.title from public.outings o where o.id = t.outing_id) as outing_name,
          -- purpose lives on transaction_splits, not transactions (#2)
          (select string_agg(distinct p.name, ', ')
             from public.transaction_splits ts
             join public.purposes p on p.id = ts.purpose_id
            where ts.transaction_id = t.id) as purpose_name,
          (select a.name from public.accounts a where a.id = t.account_id) as account_name,
          (select a.name from public.accounts a where a.id = t.to_account_id) as to_account_name,
          (
            select coalesce(jsonb_agg(jsonb_build_object(
              'amount', ts.amount,
              'category', coalesce(c.name, ts.category_id),
              'purpose', p.name,
              'contributor', ct.name
            )), '[]'::jsonb)
            from public.transaction_splits ts
            left join public.categories c on c.id::text = ts.category_id
            left join public.purposes p on p.id = ts.purpose_id
            left join public.contributors ct on ct.id = ts.contributor_id
            where ts.transaction_id = t.id
          ) as splits
        from public.transactions t
        where t.user_id = p_user_id and t.is_active = true and t.deleted_at is null
        order by t.transaction_date desc
        limit 50
      ) r
    ),
    'lastBackup', (
      select to_jsonb(b) from (
        select created_at, status, type, size_bytes, error_message
        from public.backup_history
        where user_id = p_user_id
        order by created_at desc
        limit 1
      ) b
    ),
    'devices', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.last_seen_at desc nulls last), '[]'::jsonb)
      from (
        select id, device_label, platform, user_agent, last_seen_at, created_at
        from public.user_devices where user_id = p_user_id
        order by last_seen_at desc nulls last limit 20
      ) d
    ),
    'logins', (
      select coalesce(jsonb_agg(to_jsonb(l) order by l.logged_in_at desc), '[]'::jsonb)
      from (
        select id, logged_in_at, platform, user_agent
        from public.login_history where user_id = p_user_id
        order by logged_in_at desc limit 20
      ) l
    ),
    'recentErrors', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb)
      from (
        select id, created_at, api_type, api_name, method, status_code, error_message, platform, app_version
        from public.user_api_logs
        where user_id = p_user_id and status = 'error'
        order by created_at desc limit 20
      ) e
    ),
    'sms', jsonb_build_object(
      'detected30d', (
        select count(*) from public.transactions t
        where t.user_id = p_user_id
          and (t.entry_source = 'sms-auto-detected' or t.is_auto_detected is true)
          and t.created_at >= now() - interval '30 days'
      ),
      'lastDetectedAt', (
        select max(t.created_at) from public.transactions t
        where t.user_id = p_user_id
          and (t.entry_source = 'sms-auto-detected' or t.is_auto_detected is true)
      ),
      'learnedMerchants', (select count(*) from public.user_merchants m where m.user_id = p_user_id)
    ),
    'wealth', jsonb_build_object(
      'goals', (select count(*) from public.savings_goals g where g.user_id = p_user_id and g.deleted_at is null),
      'investments', (select count(*) from public.investments i where i.user_id = p_user_id and i.deleted_at is null)
    )
  ) into v_result;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id)
  values (auth.uid(), 'view_row', 'users', p_user_id::text, p_user_id);

  return v_result;
end;
$$;

create or replace function public.admin_get_user_balance_inputs(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'outings', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from public.outings o
                 where o.user_id = p_user_id and o.is_active = true and o.deleted_at is null),
    'outingExpenses', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from public.outing_expenses e
                 where e.user_id = p_user_id and e.is_active = true and e.deleted_at is null),
    'settlements', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.settlements s
                 where s.user_id = p_user_id and coalesce(s.is_active, true) and s.deleted_at is null),
    'friendSplits', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.friend_splits f
                 where f.user_id = p_user_id and f.is_active = true and f.deleted_at is null),
    'friendSettlements', (select coalesce(jsonb_agg(to_jsonb(fs)), '[]'::jsonb) from public.friend_settlements fs
                 where fs.user_id = p_user_id)
  );
end;
$$;

-- 9. Overview + metrics ---------------------------------------------------------
create or replace function public.admin_get_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_storage jsonb := '[]'::jsonb;
  v_expense numeric;
  v_income numeric;
  v_month_start timestamptz := public.admin_ist_month_start();
begin
  perform public.require_admin();

  begin
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', bucket_id, 'objects', object_count, 'bytes', total_bytes
      ) order by total_bytes desc), '[]'::jsonb)
      from (
        select bucket_id, count(*) as object_count,
               coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes
        from storage.objects group by bucket_id
      ) s
    $q$ into v_storage;
  exception when others then
    v_storage := '[]'::jsonb;
  end;

  -- Same rules as admin_user_spend_amount, set-based across all users.
  select
    coalesce((
      select sum(tx.total_amount) from public.transactions tx
      where tx.type = 'expense'
        and public.admin_tx_is_confirmed(tx)
        and not coalesce(public.is_outing_rollup_transaction(tx), false)
        and not coalesce(public.is_transfer_transaction(tx), false)
        and public.admin_tx_first_category(tx.id) not in ('opening balance', 'settlements', 'settlement', 'transfer')
    ), 0)
    + coalesce((
      select sum(oe.amount) from public.outing_expenses oe
      where oe.is_active = true and oe.deleted_at is null
        and oe.linked_transaction_id is null
        and coalesce(oe.source, '') is distinct from 'bank-detected'
    ), 0)
  into v_expense;

  select coalesce(sum(t.total_amount), 0) into v_income
  from public.transactions t
  where t.type = 'income'
    and public.admin_tx_is_confirmed(t)
    and not coalesce(public.is_reimbursement_transaction(t), false)
    and not coalesce(public.is_transfer_transaction(t), false)
    and public.admin_tx_first_category(t.id) not in (
      'opening balance', 'settlements', 'settlement', 'repayment', 'friend repayment', 'transfer'
    );

  return jsonb_build_object(
    'totalUsers', (select count(*) from public.users),
    'newUsersWeek', (select count(*) from public.users where joined_at >= now() - interval '7 days'),
    'newUsersMonth', (select count(*) from public.users where joined_at >= v_month_start),
    'activeUsers7d', (
      select count(distinct user_id) from public.user_api_logs
      where created_at >= now() - interval '7 days' and user_id is not null and actor_role = 'user'
    ),
    'suspendedUsers', (select count(*) from auth.users where banned_until is not null and banned_until > now()),
    'totalTransactions', (select count(*) from public.transactions where is_active = true and deleted_at is null),
    'expenseVolume', v_expense,
    'incomeVolume', v_income,
    'totalVolume', v_expense + v_income,
    'backupsLast7d', (select count(*) from public.backup_history where created_at >= now() - interval '7 days'),
    'backupFailuresLast7d', (
      select count(*) from public.backup_history
      where created_at >= now() - interval '7 days' and status = 'failed'
    ),
    'apiErrors24h', (
      select count(*) from public.user_api_logs
      where created_at >= now() - interval '24 hours' and status = 'error'
    ),
    'maintenanceMode', (select maintenance_mode from public.global_settings where id = 'app'),
    'storage', v_storage
  );
end;
$$;

create or replace function public.admin_get_metrics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 30), 180));
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date := (now() at time zone 'Asia/Kolkata')::date - (greatest(7, least(coalesce(p_days, 30), 180)) - 1);
  v_start_ts timestamptz;
  v_result jsonb;
begin
  perform public.require_admin();
  v_start_ts := v_start::timestamp at time zone 'Asia/Kolkata';

  with days as (
    select generate_series(v_start, v_today, interval '1 day')::date as d
  ),
  signups as (
    select (joined_at at time zone 'Asia/Kolkata')::date as d, count(*) as n
    from public.users where joined_at >= v_start_ts group by 1
  ),
  actives as (
    select (created_at at time zone 'Asia/Kolkata')::date as d, count(distinct user_id) as n
    from public.user_api_logs
    where created_at >= v_start_ts and user_id is not null and actor_role = 'user'
    group by 1
  ),
  txs as (
    select (created_at at time zone 'Asia/Kolkata')::date as d,
           count(*) as total,
           count(*) filter (where entry_source = 'sms-auto-detected' or is_auto_detected is true) as sms
    from public.transactions
    where created_at >= v_start_ts and deleted_at is null
    group by 1
  ),
  calls as (
    select (created_at at time zone 'Asia/Kolkata')::date as d,
           count(*) as total,
           count(*) filter (where status = 'error') as errors
    from public.user_api_logs where created_at >= v_start_ts group by 1
  )
  select jsonb_build_object(
    'days', v_days,
    'series', coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(days.d, 'YYYY-MM-DD'),
      'signups', coalesce(signups.n, 0),
      'activeUsers', coalesce(actives.n, 0),
      'transactions', coalesce(txs.total, 0),
      'smsDetected', coalesce(txs.sms, 0),
      'apiCalls', coalesce(calls.total, 0),
      'apiErrors', coalesce(calls.errors, 0)
    ) order by days.d), '[]'::jsonb)
  )
  into v_result
  from days
  left join signups on signups.d = days.d
  left join actives on actives.d = days.d
  left join txs on txs.d = days.d
  left join calls on calls.d = days.d;

  return v_result;
end;
$$;

-- 10. Audit log search + count ------------------------------------------------------
drop function if exists public.admin_list_action_logs(integer, integer, text, uuid, uuid);
drop function if exists public.admin_list_action_logs(integer, integer, text, uuid, uuid, uuid);

create or replace function public.admin_action_log_matches(
  l public.admin_action_logs,
  au_email text, tu_email text,
  p_action text, p_admin_id uuid, p_target_user_id uuid, p_session uuid,
  p_search text, p_from timestamptz, p_to timestamptz
) returns boolean
language sql
stable
set search_path = public
as $$
  select (p_action is null or l.action = p_action)
     and (p_admin_id is null or l.admin_id = p_admin_id)
     and (p_target_user_id is null or l.target_user_id = p_target_user_id)
     and (p_session is null or l.impersonation_session_id = p_session)
     and (p_from is null or l.created_at >= p_from)
     and (p_to is null or l.created_at <= p_to)
     and (
       nullif(btrim(coalesce(p_search, '')), '') is null
       or concat_ws(' ', l.action, l.table_name, l.record_id, l.reason, au_email, tu_email,
                    l.target_user_id::text, l.before::text, l.after::text)
          ilike '%' || public.admin_escape_like(btrim(p_search)) || '%' escape '\'
     );
$$;

create or replace function public.admin_list_action_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_action text default null,
  p_admin_id uuid default null,
  p_target_user_id uuid default null,
  p_impersonation_session_id uuid default null,
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(sub.row_json order by sub.created_at desc), '[]'::jsonb) into v_result
  from (
    select l.created_at, to_jsonb(l) || jsonb_build_object(
      'admin_email', au.email, 'admin_name', au.name,
      'target_email', tu.email, 'target_name', tu.name
    ) as row_json
    from public.admin_action_logs l
    left join public.users au on au.id = l.admin_id
    left join public.users tu on tu.id = l.target_user_id
    where public.admin_action_log_matches(l, au.email, tu.email, p_action, p_admin_id,
            p_target_user_id, p_impersonation_session_id, p_search, p_from, p_to)
    order by l.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 1000))
    offset greatest(0, coalesce(p_offset, 0))
  ) sub;

  return v_result;
end;
$$;

create or replace function public.admin_count_action_logs(
  p_action text default null,
  p_admin_id uuid default null,
  p_target_user_id uuid default null,
  p_impersonation_session_id uuid default null,
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  perform public.require_admin();
  select count(*) into v_count
  from public.admin_action_logs l
  left join public.users au on au.id = l.admin_id
  left join public.users tu on tu.id = l.target_user_id
  where public.admin_action_log_matches(l, au.email, tu.email, p_action, p_admin_id,
          p_target_user_id, p_impersonation_session_id, p_search, p_from, p_to);
  return v_count;
end;
$$;

-- 11. Backups list (server-side status filter + joined email) -----------------------
create or replace function public.admin_list_backups(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.require_admin();
  select coalesce(jsonb_agg(s.row_json order by s.created_at desc), '[]'::jsonb) into v_result
  from (
    select b.created_at,
           (to_jsonb(b) - 'manifest') || jsonb_build_object('user_email', u.email, 'user_name', u.name) as row_json
    from public.backup_history b
    left join public.users u on u.id = b.user_id
    where p_status is null or b.status = p_status
    order by b.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  ) s;
  return v_result;
end;
$$;

create or replace function public.admin_count_backups(p_status text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  perform public.require_admin();
  select count(*) into v_count from public.backup_history where p_status is null or status = p_status;
  return v_count;
end;
$$;

-- 12. API-log retention ------------------------------------------------------------
create or replace function public.admin_purge_api_logs(p_older_than_days integer default 30)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(7, coalesce(p_older_than_days, 30));
  v_count bigint;
begin
  perform public.require_admin();
  delete from public.user_api_logs where created_at < now() - make_interval(days => v_days);
  get diagnostics v_count = row_count;
  insert into public.admin_action_logs (admin_id, action, table_name, after)
  values (auth.uid(), 'purge_logs', 'user_api_logs',
          jsonb_build_object('older_than_days', v_days, 'deleted', v_count));
  return v_count;
end;
$$;

-- 13. Impersonation: read-only by default, write needs a reason ----------------------
alter table public.admin_impersonation_sessions add column if not exists mode text not null default 'read';
alter table public.admin_impersonation_sessions add column if not exists reason text;
alter table public.admin_impersonation_sessions drop constraint if exists admin_impersonation_sessions_mode_check;
alter table public.admin_impersonation_sessions
  add constraint admin_impersonation_sessions_mode_check check (mode in ('read', 'write'));

drop function if exists public.admin_start_impersonation(uuid);

create or replace function public.admin_start_impersonation(
  p_target_user_id uuid,
  p_mode text default 'read',
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_mode text := coalesce(nullif(lower(btrim(coalesce(p_mode, ''))), ''), 'read');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.require_admin();

  if v_mode not in ('read', 'write') then
    raise exception 'invalid impersonation mode %', p_mode;
  end if;
  if v_mode = 'write' and (v_reason is null or length(v_reason) < 5) then
    raise exception 'write-mode impersonation requires a reason (at least 5 characters)';
  end if;
  if p_target_user_id = auth.uid() then
    raise exception 'cannot impersonate yourself';
  end if;
  if not exists (select 1 from public.users where id = p_target_user_id) then
    raise exception 'target user not found';
  end if;

  insert into public.admin_impersonation_sessions (admin_id, target_user_id, mode, reason)
  values (auth.uid(), p_target_user_id, v_mode, v_reason)
  returning id into v_session_id;

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id, impersonation_session_id, reason, after)
  values (auth.uid(), 'impersonate_start', 'admin_impersonation_sessions',
          v_session_id::text, p_target_user_id, v_session_id, v_reason,
          jsonb_build_object('mode', v_mode));

  return v_session_id;
end;
$$;

-- Service-role-only: add_goal_contribution scopes by auth.uid(), so the proxy
-- calls this wrapper with the session's target user injected.
create or replace function public.impersonation_add_goal_contribution(
  p_user_id uuid,
  p_goal_id uuid,
  p_amount numeric,
  p_contribution_id uuid default null,
  p_transaction_id text default null,
  p_note text default null,
  p_source text default 'web'
) returns public.savings_goals
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  return public.add_goal_contribution(p_goal_id, p_amount, p_contribution_id,
                                      p_transaction_id, p_note, p_source);
end;
$$;

-- 14. Audit trail for config edits made directly under RLS ----------------------------
create or replace function public.admin_audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := case when tg_table_name in ('global_settings', 'mail_templates')
                        then 'settings_update' else 'rule_update' end;
begin
  if v_uid is null or not exists (select 1 from public.users where id = v_uid and role = 'admin') then
    return coalesce(new, old);
  end if;
  insert into public.admin_action_logs (admin_id, action, table_name, record_id, before, after)
  values (
    v_uid, v_action, tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then jsonb_build_object('_op', 'delete') else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['global_settings','mail_templates','sms_template_rules','sms_detection_rules','sms_block_rules'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists admin_audit_config_change on public.%I', t);
      execute format('create trigger admin_audit_config_change after insert or update or delete on public.%I
                      for each row execute function public.admin_audit_config_change()', t);
    end if;
  end loop;
end $$;

-- 15. Merchant/category rule management (tables from 20261011_merchant_category_rules.sql)
create or replace function public.admin_upsert_merchant_brand(p_brand jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_brand ->> 'id', '')::uuid;
  v_before jsonb;
  v_row jsonb;
begin
  perform public.require_admin();
  if to_regclass('public.merchant_brands') is null then
    raise exception 'merchant_brands does not exist yet — run 20261011_merchant_category_rules.sql';
  end if;
  if nullif(btrim(coalesce(p_brand ->> 'canonical_name', '')), '') is null then
    raise exception 'canonical_name is required';
  end if;
  if nullif(btrim(coalesce(p_brand ->> 'category_slug', '')), '') is null then
    raise exception 'category_slug is required';
  end if;

  if v_id is not null then
    execute 'select to_jsonb(b) from public.merchant_brands b where b.id = $1' using v_id into v_before;
  end if;

  if v_before is null then
    execute $q$
      insert into public.merchant_brands
        (canonical_name, normalized_name, category_slug, aliases, upi_handles, sms_patterns, is_active, source)
      values (
        btrim($1 ->> 'canonical_name'),
        coalesce(nullif(btrim($1 ->> 'normalized_name'), ''), btrim($1 ->> 'canonical_name')),
        btrim($1 ->> 'category_slug'),
        coalesce(array(select jsonb_array_elements_text(coalesce($1 -> 'aliases', '[]'))), '{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce($1 -> 'upi_handles', '[]'))), '{}'),
        coalesce(array(select jsonb_array_elements_text(coalesce($1 -> 'sms_patterns', '[]'))), '{}'),
        coalesce(($1 ->> 'is_active')::boolean, true),
        'admin'
      )
      returning to_jsonb(merchant_brands.*)
    $q$ using p_brand into v_row;
  else
    execute $q$
      update public.merchant_brands set
        canonical_name = btrim($1 ->> 'canonical_name'),
        category_slug = btrim($1 ->> 'category_slug'),
        aliases = case when $1 ? 'aliases'
                       then array(select jsonb_array_elements_text($1 -> 'aliases')) else aliases end,
        upi_handles = case when $1 ? 'upi_handles'
                       then array(select jsonb_array_elements_text($1 -> 'upi_handles')) else upi_handles end,
        sms_patterns = case when $1 ? 'sms_patterns'
                       then array(select jsonb_array_elements_text($1 -> 'sms_patterns')) else sms_patterns end,
        is_active = coalesce(($1 ->> 'is_active')::boolean, is_active),
        updated_at = now()
      where id = $2
      returning to_jsonb(merchant_brands.*)
    $q$ using p_brand, v_id into v_row;
  end if;

  insert into public.admin_action_logs (admin_id, action, table_name, record_id, before, after)
  values (auth.uid(), 'rule_update', 'merchant_brands', v_row ->> 'id', v_before, v_row);
  return v_row;
end;
$$;

create or replace function public.admin_upsert_keyword_rule(p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p_rule ->> 'id', '')::bigint;
  v_before jsonb;
  v_row jsonb;
begin
  perform public.require_admin();
  if to_regclass('public.merchant_keyword_rules') is null then
    raise exception 'merchant_keyword_rules does not exist yet — run 20261011_merchant_category_rules.sql';
  end if;
  if nullif(btrim(coalesce(p_rule ->> 'keyword', '')), '') is null then
    raise exception 'keyword is required';
  end if;

  if v_id is not null then
    execute 'select to_jsonb(r) from public.merchant_keyword_rules r where r.id = $1' using v_id into v_before;
  end if;

  if v_before is null then
    if nullif(btrim(coalesce(p_rule ->> 'category_slug', '')), '') is null then
      raise exception 'category_slug is required';
    end if;
    execute $q$
      insert into public.merchant_keyword_rules
        (keyword, match_type, category_slug, priority, applies_to, direction, note, is_active)
      values (
        lower(btrim($1 ->> 'keyword')),
        coalesce(nullif($1 ->> 'match_type', ''), 'word'),
        btrim($1 ->> 'category_slug'),
        coalesce(($1 ->> 'priority')::int, 50),
        coalesce(nullif($1 ->> 'applies_to', ''), 'merchant'),
        coalesce(nullif($1 ->> 'direction', ''), 'any'),
        $1 ->> 'note',
        coalesce(($1 ->> 'is_active')::boolean, true)
      )
      returning to_jsonb(merchant_keyword_rules.*)
    $q$ using p_rule into v_row;
  else
    execute $q$
      update public.merchant_keyword_rules set
        keyword = lower(btrim($1 ->> 'keyword')),
        match_type = coalesce(nullif($1 ->> 'match_type', ''), match_type),
        category_slug = coalesce(nullif(btrim($1 ->> 'category_slug'), ''), category_slug),
        priority = coalesce(($1 ->> 'priority')::int, priority),
        applies_to = coalesce(nullif($1 ->> 'applies_to', ''), applies_to),
        direction = coalesce(nullif($1 ->> 'direction', ''), direction),
        note = case when $1 ? 'note' then $1 ->> 'note' else note end,
        is_active = coalesce(($1 ->> 'is_active')::boolean, is_active),
        updated_at = now()
      where id = $2
      returning to_jsonb(merchant_keyword_rules.*)
    $q$ using p_rule, v_id into v_row;
  end if;

  insert into public.admin_action_logs (admin_id, action, table_name, record_id, before, after)
  values (auth.uid(), 'rule_update', 'merchant_keyword_rules', v_row ->> 'id', v_before, v_row);
  return v_row;
end;
$$;

-- 16. Hardening sweep: pinned search_path, no anon/public EXECUTE on admin
--     functions; service-role-only for impersonation_* and the spend helpers.
do $$
declare
  r record;
  v_service_only boolean;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%' or p.proname in ('require_admin', 'is_admin')
           or p.proname like 'impersonation\_%')
  loop
    execute format('alter function %s set search_path = public', r.sig);
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', r.sig);
    end if;

    v_service_only := r.proname like 'impersonation\_%'
                      or r.proname in ('admin_user_spend_amount', 'admin_user_income_amount');

    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      if v_service_only then
        execute format('revoke all on function %s from authenticated', r.sig);
      else
        execute format('grant execute on function %s to authenticated', r.sig);
      end if;
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- is_admin() is evaluated inside RLS policies for every signed-in user.
grant execute on function public.is_admin() to authenticated;

-- Ask PostgREST to pick up the new/dropped signatures immediately.
notify pgrst, 'reload schema';
