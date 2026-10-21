-- ROLLBACK for supabase/migrations/20261011_admin_fixes.sql  (Phase S5b companion)
-- Generated from a READ-ONLY catalog capture of live (project vdhayvlweuglpvzweunq)
-- with supabase/migration-checks/capture_rollback.sql on 2026-10-21 ~14:00 IST.
--
-- STATUS on live (checked 2026-10-21 ~14:00 IST): ALREADY APPLIED (its objects exist).
-- No capture existed before it ran, so this file cannot rebuild the state
-- from before 2026-10-11. It restores the definitions captured from live on
-- 2026-10-21 ~14:00 IST — use it if a re-run or an edit of this migration changes them.
-- To go further back, restore from the pg_dump backup (supabase/backup/RESTORE.md).
-- Tables/columns this migration added are NOT dropped here (that loses data);
-- see the commented section at the end.
--
-- BEFORE running: take a backup (supabase/backup/backup.sh) and run
-- precheck.sql. If its fingerprint differs from the one below, this file
-- is stale: re-run capture_rollback.sql and regenerate it.
--   function fingerprint at capture: e38135e3abc02c0c9e2c8253703d781c (48 functions)
-- AFTER running: run supabase/backup/verify.sql and compare data_md5.

begin;
set local search_path = public, extensions;


-- ---- 1. Functions (exact captured bodies)
CREATE OR REPLACE FUNCTION public.admin_action_log_matches(l admin_action_logs, au_email text, tu_email text, p_action text, p_admin_id uuid, p_target_user_id uuid, p_session uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_allowed_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_assert_table(p_table text, p_list text[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  if p_table is null or not (p_table = any(p_list)) then
    raise exception 'table % is not allowed for this admin operation', p_table;
  end if;
  if to_regclass('public.' || quote_ident(p_table)) is null then
    raise exception 'table % does not exist yet — run its migration first', p_table;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_audit_config_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_count_action_logs(p_action text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_impersonation_session_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_count_backups(p_status text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count bigint;
begin
  perform public.require_admin();
  select count(*) into v_count from public.backup_history where p_status is null or status = p_status;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_count_table(p_table text, p_filter_user uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_count_users(p_search text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_deletable_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_row(p_table text, p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_escape_like(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_');
$function$
;

CREATE OR REPLACE FUNCTION public.admin_find_user(p_query text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_metrics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_user_balance_inputs(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_user_overview(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_insert_row(p_table text, p_record jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_insertable_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array[
    'accounts','purposes','categories','contributors','friends','outings',
    'outing_categories','budget_templates','smart_views','mail_templates',
    'sms_template_rules','sms_detection_rules','sms_block_rules'
  ];
$function$
;

CREATE OR REPLACE FUNCTION public.admin_ist_month_start(p_at timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select date_trunc('month', p_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_action_logs(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_action text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_impersonation_session_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_backups(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_table(p_table text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_order_by text DEFAULT NULL::text, p_order_dir text DEFAULT 'desc'::text, p_filter_user uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_users(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_role text DEFAULT NULL::text, p_sort text DEFAULT 'joined_desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_log_action(p_action text, p_table text DEFAULT NULL::text, p_record_id text DEFAULT NULL::text, p_target_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_purge_api_logs(p_older_than_days integer DEFAULT 30)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_restore_row(p_table text, p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_row_target(p_table text, p_row jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_start_impersonation(p_target_user_id uuid, p_mode text DEFAULT 'read'::text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_table_has_column(p_table text, p_column text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_column
  );
$function$
;

CREATE OR REPLACE FUNCTION public.admin_table_meta()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_table_pk(p_table text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_table
    when 'share_links' then 'token'
    when 'income_targets' then 'user_id'
    when 'projector_settings' then 'user_id'
    else 'id'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_table_user_col(p_table text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_table = 'users' then 'id'
    when p_table in ('purpose_shares','share_links','share_invite_deliveries') then 'owner_id'
    when p_table in ('global_settings','mail_templates','sms_template_rules',
                     'sms_detection_rules','sms_block_rules') then null
    when p_table in ('admin_action_logs','admin_impersonation_sessions') then 'target_user_id'
    else 'user_id'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_table_where(p_table text, p_filter_user uuid, p_search text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_tx_counts_for_balance(t transactions)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- mirrors lib/wealth.ts isBalanceExcludedTransaction (status part)
  select t.is_active is not false
     and t.deleted_at is null
     and coalesce(t.status, 'completed') not in ('unverified', 'rejected');
$function$
;

CREATE OR REPLACE FUNCTION public.admin_tx_first_category(p_tx uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select lower(coalesce(
    (select ts.category_id from public.transaction_splits ts where ts.transaction_id = p_tx limit 1),
    ''
  ));
$function$
;

CREATE OR REPLACE FUNCTION public.admin_tx_is_confirmed(t transactions)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select t.is_active is not false
     and t.deleted_at is null
     and coalesce(t.status, 'completed') not in ('unverified', 'rejected', 'failed');
$function$
;

CREATE OR REPLACE FUNCTION public.admin_updatable_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select public.admin_deletable_tables() || array['users'];
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_row(p_table text, p_id text, p_updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_upsert_keyword_rule(p_rule jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_upsert_merchant_brand(p_brand jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_user_income_amount(p_user_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_user_matches(u users, p_search text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select nullif(btrim(coalesce(p_search, '')), '') is null
      or u.email ilike '%' || public.admin_escape_like(btrim(p_search)) || '%' escape '\'
      or u.name ilike '%' || public.admin_escape_like(btrim(p_search)) || '%' escape '\'
      or coalesce(u.phone, '') ilike '%' || public.admin_escape_like(btrim(p_search)) || '%' escape '\'
      or u.id::text = lower(btrim(p_search));
$function$
;

CREATE OR REPLACE FUNCTION public.admin_user_spend_amount(p_user_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.impersonation_add_goal_contribution(p_user_id uuid, p_goal_id uuid, p_amount numeric, p_contribution_id uuid DEFAULT NULL::uuid, p_transaction_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_source text DEFAULT 'web'::text)
 RETURNS savings_goals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.protect_user_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.protect_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.require_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid() and role = 'admin') then
    raise exception 'admin access required' using errcode = '42501';
  end if;
end;
$function$
;


-- ---- 2. Function grants
revoke all on function public.admin_action_log_matches(l admin_action_logs, au_email text, tu_email text, p_action text, p_admin_id uuid, p_target_user_id uuid, p_session uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.admin_action_log_matches(l admin_action_logs, au_email text, tu_email text, p_action text, p_admin_id uuid, p_target_user_id uuid, p_session uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) to authenticated; grant execute on function public.admin_action_log_matches(l admin_action_logs, au_email text, tu_email text, p_action text, p_admin_id uuid, p_target_user_id uuid, p_session uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) to service_role;

revoke all on function public.admin_allowed_tables() from public, anon, authenticated, service_role; grant execute on function public.admin_allowed_tables() to authenticated; grant execute on function public.admin_allowed_tables() to service_role;

revoke all on function public.admin_assert_table(p_table text, p_list text[]) from public, anon, authenticated, service_role; grant execute on function public.admin_assert_table(p_table text, p_list text[]) to authenticated; grant execute on function public.admin_assert_table(p_table text, p_list text[]) to service_role;

revoke all on function public.admin_audit_config_change() from public, anon, authenticated, service_role; grant execute on function public.admin_audit_config_change() to authenticated; grant execute on function public.admin_audit_config_change() to service_role;

revoke all on function public.admin_count_action_logs(p_action text, p_admin_id uuid, p_target_user_id uuid, p_impersonation_session_id uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.admin_count_action_logs(p_action text, p_admin_id uuid, p_target_user_id uuid, p_impersonation_session_id uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) to authenticated; grant execute on function public.admin_count_action_logs(p_action text, p_admin_id uuid, p_target_user_id uuid, p_impersonation_session_id uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) to service_role;

revoke all on function public.admin_count_backups(p_status text) from public, anon, authenticated, service_role; grant execute on function public.admin_count_backups(p_status text) to authenticated; grant execute on function public.admin_count_backups(p_status text) to service_role;

revoke all on function public.admin_count_table(p_table text, p_filter_user uuid, p_search text) from public, anon, authenticated, service_role; grant execute on function public.admin_count_table(p_table text, p_filter_user uuid, p_search text) to authenticated; grant execute on function public.admin_count_table(p_table text, p_filter_user uuid, p_search text) to service_role;

revoke all on function public.admin_count_users(p_search text, p_role text) from public, anon, authenticated, service_role; grant execute on function public.admin_count_users(p_search text, p_role text) to authenticated; grant execute on function public.admin_count_users(p_search text, p_role text) to service_role;

revoke all on function public.admin_deletable_tables() from public, anon, authenticated, service_role; grant execute on function public.admin_deletable_tables() to authenticated; grant execute on function public.admin_deletable_tables() to service_role;

revoke all on function public.admin_delete_row(p_table text, p_id text) from public, anon, authenticated, service_role; grant execute on function public.admin_delete_row(p_table text, p_id text) to authenticated; grant execute on function public.admin_delete_row(p_table text, p_id text) to service_role;

revoke all on function public.admin_escape_like(p text) from public, anon, authenticated, service_role; grant execute on function public.admin_escape_like(p text) to authenticated; grant execute on function public.admin_escape_like(p text) to service_role;

revoke all on function public.admin_find_user(p_query text) from public, anon, authenticated, service_role; grant execute on function public.admin_find_user(p_query text) to authenticated; grant execute on function public.admin_find_user(p_query text) to service_role;

revoke all on function public.admin_get_metrics(p_days integer) from public, anon, authenticated, service_role; grant execute on function public.admin_get_metrics(p_days integer) to authenticated; grant execute on function public.admin_get_metrics(p_days integer) to service_role;

revoke all on function public.admin_get_overview() from public, anon, authenticated, service_role; grant execute on function public.admin_get_overview() to authenticated; grant execute on function public.admin_get_overview() to service_role;

revoke all on function public.admin_get_user_balance_inputs(p_user_id uuid) from public, anon, authenticated, service_role; grant execute on function public.admin_get_user_balance_inputs(p_user_id uuid) to authenticated; grant execute on function public.admin_get_user_balance_inputs(p_user_id uuid) to service_role;

revoke all on function public.admin_get_user_overview(p_user_id uuid) from public, anon, authenticated, service_role; grant execute on function public.admin_get_user_overview(p_user_id uuid) to authenticated; grant execute on function public.admin_get_user_overview(p_user_id uuid) to service_role;

revoke all on function public.admin_insert_row(p_table text, p_record jsonb) from public, anon, authenticated, service_role; grant execute on function public.admin_insert_row(p_table text, p_record jsonb) to authenticated; grant execute on function public.admin_insert_row(p_table text, p_record jsonb) to service_role;

revoke all on function public.admin_insertable_tables() from public, anon, authenticated, service_role; grant execute on function public.admin_insertable_tables() to authenticated; grant execute on function public.admin_insertable_tables() to service_role;

revoke all on function public.admin_ist_month_start(p_at timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.admin_ist_month_start(p_at timestamp with time zone) to authenticated; grant execute on function public.admin_ist_month_start(p_at timestamp with time zone) to service_role;

revoke all on function public.admin_list_action_logs(p_limit integer, p_offset integer, p_action text, p_admin_id uuid, p_target_user_id uuid, p_impersonation_session_id uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.admin_list_action_logs(p_limit integer, p_offset integer, p_action text, p_admin_id uuid, p_target_user_id uuid, p_impersonation_session_id uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) to authenticated; grant execute on function public.admin_list_action_logs(p_limit integer, p_offset integer, p_action text, p_admin_id uuid, p_target_user_id uuid, p_impersonation_session_id uuid, p_search text, p_from timestamp with time zone, p_to timestamp with time zone) to service_role;

revoke all on function public.admin_list_backups(p_status text, p_limit integer, p_offset integer) from public, anon, authenticated, service_role; grant execute on function public.admin_list_backups(p_status text, p_limit integer, p_offset integer) to authenticated; grant execute on function public.admin_list_backups(p_status text, p_limit integer, p_offset integer) to service_role;

revoke all on function public.admin_list_table(p_table text, p_limit integer, p_offset integer, p_order_by text, p_order_dir text, p_filter_user uuid, p_search text) from public, anon, authenticated, service_role; grant execute on function public.admin_list_table(p_table text, p_limit integer, p_offset integer, p_order_by text, p_order_dir text, p_filter_user uuid, p_search text) to authenticated; grant execute on function public.admin_list_table(p_table text, p_limit integer, p_offset integer, p_order_by text, p_order_dir text, p_filter_user uuid, p_search text) to service_role;

revoke all on function public.admin_list_users(p_search text, p_limit integer, p_offset integer, p_role text, p_sort text) from public, anon, authenticated, service_role; grant execute on function public.admin_list_users(p_search text, p_limit integer, p_offset integer, p_role text, p_sort text) to authenticated; grant execute on function public.admin_list_users(p_search text, p_limit integer, p_offset integer, p_role text, p_sort text) to service_role;

revoke all on function public.admin_log_action(p_action text, p_table text, p_record_id text, p_target_user_id uuid) from public, anon, authenticated, service_role; grant execute on function public.admin_log_action(p_action text, p_table text, p_record_id text, p_target_user_id uuid) to authenticated; grant execute on function public.admin_log_action(p_action text, p_table text, p_record_id text, p_target_user_id uuid) to service_role;

revoke all on function public.admin_purge_api_logs(p_older_than_days integer) from public, anon, authenticated, service_role; grant execute on function public.admin_purge_api_logs(p_older_than_days integer) to authenticated; grant execute on function public.admin_purge_api_logs(p_older_than_days integer) to service_role;

revoke all on function public.admin_restore_row(p_table text, p_id text) from public, anon, authenticated, service_role; grant execute on function public.admin_restore_row(p_table text, p_id text) to authenticated; grant execute on function public.admin_restore_row(p_table text, p_id text) to service_role;

revoke all on function public.admin_row_target(p_table text, p_row jsonb) from public, anon, authenticated, service_role; grant execute on function public.admin_row_target(p_table text, p_row jsonb) to authenticated; grant execute on function public.admin_row_target(p_table text, p_row jsonb) to service_role;

revoke all on function public.admin_start_impersonation(p_target_user_id uuid, p_mode text, p_reason text) from public, anon, authenticated, service_role; grant execute on function public.admin_start_impersonation(p_target_user_id uuid, p_mode text, p_reason text) to authenticated; grant execute on function public.admin_start_impersonation(p_target_user_id uuid, p_mode text, p_reason text) to service_role;

revoke all on function public.admin_table_has_column(p_table text, p_column text) from public, anon, authenticated, service_role; grant execute on function public.admin_table_has_column(p_table text, p_column text) to authenticated; grant execute on function public.admin_table_has_column(p_table text, p_column text) to service_role;

revoke all on function public.admin_table_meta() from public, anon, authenticated, service_role; grant execute on function public.admin_table_meta() to authenticated; grant execute on function public.admin_table_meta() to service_role;

revoke all on function public.admin_table_pk(p_table text) from public, anon, authenticated, service_role; grant execute on function public.admin_table_pk(p_table text) to authenticated; grant execute on function public.admin_table_pk(p_table text) to service_role;

revoke all on function public.admin_table_user_col(p_table text) from public, anon, authenticated, service_role; grant execute on function public.admin_table_user_col(p_table text) to authenticated; grant execute on function public.admin_table_user_col(p_table text) to service_role;

revoke all on function public.admin_table_where(p_table text, p_filter_user uuid, p_search text) from public, anon, authenticated, service_role; grant execute on function public.admin_table_where(p_table text, p_filter_user uuid, p_search text) to authenticated; grant execute on function public.admin_table_where(p_table text, p_filter_user uuid, p_search text) to service_role;

revoke all on function public.admin_tx_counts_for_balance(t transactions) from public, anon, authenticated, service_role; grant execute on function public.admin_tx_counts_for_balance(t transactions) to authenticated; grant execute on function public.admin_tx_counts_for_balance(t transactions) to service_role;

revoke all on function public.admin_tx_first_category(p_tx uuid) from public, anon, authenticated, service_role; grant execute on function public.admin_tx_first_category(p_tx uuid) to authenticated; grant execute on function public.admin_tx_first_category(p_tx uuid) to service_role;

revoke all on function public.admin_tx_is_confirmed(t transactions) from public, anon, authenticated, service_role; grant execute on function public.admin_tx_is_confirmed(t transactions) to authenticated; grant execute on function public.admin_tx_is_confirmed(t transactions) to service_role;

revoke all on function public.admin_updatable_tables() from public, anon, authenticated, service_role; grant execute on function public.admin_updatable_tables() to authenticated; grant execute on function public.admin_updatable_tables() to service_role;

revoke all on function public.admin_update_row(p_table text, p_id text, p_updates jsonb) from public, anon, authenticated, service_role; grant execute on function public.admin_update_row(p_table text, p_id text, p_updates jsonb) to authenticated; grant execute on function public.admin_update_row(p_table text, p_id text, p_updates jsonb) to service_role;

revoke all on function public.admin_upsert_keyword_rule(p_rule jsonb) from public, anon, authenticated, service_role; grant execute on function public.admin_upsert_keyword_rule(p_rule jsonb) to authenticated; grant execute on function public.admin_upsert_keyword_rule(p_rule jsonb) to service_role;

revoke all on function public.admin_upsert_merchant_brand(p_brand jsonb) from public, anon, authenticated, service_role; grant execute on function public.admin_upsert_merchant_brand(p_brand jsonb) to authenticated; grant execute on function public.admin_upsert_merchant_brand(p_brand jsonb) to service_role;

revoke all on function public.admin_user_income_amount(p_user_id uuid, p_from timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.admin_user_income_amount(p_user_id uuid, p_from timestamp with time zone) to service_role;

revoke all on function public.admin_user_matches(u users, p_search text) from public, anon, authenticated, service_role; grant execute on function public.admin_user_matches(u users, p_search text) to authenticated; grant execute on function public.admin_user_matches(u users, p_search text) to service_role;

revoke all on function public.admin_user_spend_amount(p_user_id uuid, p_from timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.admin_user_spend_amount(p_user_id uuid, p_from timestamp with time zone) to service_role;

revoke all on function public.impersonation_add_goal_contribution(p_user_id uuid, p_goal_id uuid, p_amount numeric, p_contribution_id uuid, p_transaction_id text, p_note text, p_source text) from public, anon, authenticated, service_role; grant execute on function public.impersonation_add_goal_contribution(p_user_id uuid, p_goal_id uuid, p_amount numeric, p_contribution_id uuid, p_transaction_id text, p_note text, p_source text) to service_role;

revoke all on function public.is_admin() from public, anon, authenticated, service_role; grant execute on function public.is_admin() to authenticated; grant execute on function public.is_admin() to service_role;

revoke all on function public.protect_user_identity() from public, anon, authenticated, service_role; grant execute on function public.protect_user_identity() to authenticated; grant execute on function public.protect_user_identity() to anon; grant execute on function public.protect_user_identity() to service_role; grant execute on function public.protect_user_identity() to public;

revoke all on function public.protect_user_role() from public, anon, authenticated, service_role; grant execute on function public.protect_user_role() to authenticated; grant execute on function public.protect_user_role() to anon; grant execute on function public.protect_user_role() to service_role; grant execute on function public.protect_user_role() to public;

revoke all on function public.require_admin() from public, anon, authenticated, service_role; grant execute on function public.require_admin() to authenticated; grant execute on function public.require_admin() to service_role;


-- ---- 3. Triggers
drop trigger if exists admin_audit_config_change on global_settings; CREATE TRIGGER admin_audit_config_change AFTER INSERT OR DELETE OR UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION admin_audit_config_change();

drop trigger if exists admin_audit_config_change on mail_templates; CREATE TRIGGER admin_audit_config_change AFTER INSERT OR DELETE OR UPDATE ON public.mail_templates FOR EACH ROW EXECUTE FUNCTION admin_audit_config_change();

drop trigger if exists admin_audit_config_change on sms_block_rules; CREATE TRIGGER admin_audit_config_change AFTER INSERT OR DELETE OR UPDATE ON public.sms_block_rules FOR EACH ROW EXECUTE FUNCTION admin_audit_config_change();

drop trigger if exists admin_audit_config_change on sms_detection_rules; CREATE TRIGGER admin_audit_config_change AFTER INSERT OR DELETE OR UPDATE ON public.sms_detection_rules FOR EACH ROW EXECUTE FUNCTION admin_audit_config_change();

drop trigger if exists admin_audit_config_change on sms_template_rules; CREATE TRIGGER admin_audit_config_change AFTER INSERT OR DELETE OR UPDATE ON public.sms_template_rules FOR EACH ROW EXECUTE FUNCTION admin_audit_config_change();

drop trigger if exists protect_user_identity on users; CREATE TRIGGER protect_user_identity BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION protect_user_identity();


-- ---- 4. Row level security
alter table public.users enable row level security;


-- ---- 5. Policies
drop policy if exists users_insert_own on public.users; create policy users_insert_own on public.users as PERMISSIVE for INSERT to public with check ((id = auth.uid()));

drop policy if exists users_select_own on public.users; create policy users_select_own on public.users as PERMISSIVE for SELECT to public using ((id = auth.uid()));

drop policy if exists users_update_own on public.users; create policy users_update_own on public.users as PERMISSIVE for UPDATE to public using ((id = auth.uid())) with check ((id = auth.uid()));


-- ---- 6. Constraints
alter table admin_action_logs drop constraint if exists admin_action_logs_action_check; alter table admin_action_logs add constraint admin_action_logs_action_check CHECK ((action = ANY (ARRAY['view_table'::text, 'view_row'::text, 'create'::text, 'update'::text, 'delete'::text, 'soft_delete'::text, 'restore'::text, 'export'::text, 'password_reset'::text, 'impersonate_start'::text, 'impersonate_end'::text, 'reset_all'::text, 'resend_verification'::text, 'force_verify_email'::text, 'suspend'::text, 'unsuspend'::text, 'settings_update'::text, 'rule_update'::text, 'purge_logs'::text, 'impersonate_view'::text])));

alter table admin_impersonation_sessions drop constraint if exists admin_impersonation_sessions_mode_check; alter table admin_impersonation_sessions add constraint admin_impersonation_sessions_mode_check CHECK ((mode = ANY (ARRAY['read'::text, 'write'::text])));

commit;

-- ---- Objects this migration CREATED (not dropped; uncomment only with a
-- verified backup and only if the app no longer needs them):
-- alter table public.admin_action_logs drop column if exists after, drop column if exists reason;  -- DATA LOSS
-- alter table public.admin_impersonation_sessions drop column if exists mode, drop column if exists reason;  -- DATA LOSS
