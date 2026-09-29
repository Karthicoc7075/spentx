-- ---------------------------------------------------------------------------
-- Migration: 20260753_admin_user_overview_active_filter.sql
--
-- Makes admin stats exactly match what the user sees on the app.
-- Rules mirror period-totals.ts / investments.ts:
--
-- EXPENSE = type='expense', is_active=true, NOT transfer, NOT outing-rollup,
--           NOT opening balance, NOT settlement category
-- INCOME  = type='income',  is_active=true, NOT opening balance,
--           NOT settlement/transfer/reimbursement category/tag
--
-- Deleted outings set is_active=false — so cascade-deleted data is excluded.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Fix outing_live_total to exclude soft-deleted expenses/transactions
-- ---------------------------------------------------------------------------
create or replace function public.outing_live_total(p_user_id uuid, p_outing_id uuid)
returns numeric
language sql
stable
as $$
  select
    coalesce((
      select sum(oe.amount)::numeric
      from public.outing_expenses oe
      where oe.user_id = p_user_id
        and oe.outing_id = p_outing_id
        and oe.is_active = true
    ), 0)
    + coalesce((
      select sum(tx.total_amount)::numeric
      from public.transactions tx
      where tx.user_id = p_user_id
        and tx.outing_id = p_outing_id
        and tx.type = 'expense'
        and tx.is_active = true
        and not public.is_outing_rollup_transaction(tx)
        and not exists (
          select 1
          from public.outing_expenses oe
          where oe.user_id = p_user_id
            and oe.outing_id = p_outing_id
            and oe.linked_transaction_id = tx.id
            and oe.is_active = true
        )
    ), 0);
$$;

grant execute on function public.outing_live_total(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: is a transaction a transfer/settlement (should not count as
-- expense OR income). Matches isTransferTransaction() in investments.ts.
-- ---------------------------------------------------------------------------
create or replace function public.is_transfer_transaction(t public.transactions)
returns boolean
language sql
stable
as $$
  select
    -- settlement tags
    t.tags && array['settlement']::text[]
    or exists (
      select 1 from unnest(t.tags) tag
      where tag like 'settlement:%'
    )
    -- transfer tags
    or t.tags && array['transfer']::text[]
    or exists (
      select 1 from unnest(t.tags) tag
      where tag like 'transfer_to:%'
    )
    -- settlement/transfer categories
    or lower(coalesce(
      (select ts.category_id from public.transaction_splits ts
       where ts.transaction_id = t.id limit 1),
      ''
    )) in ('settlements', 'settlement', 'transfer')
    -- merchant pattern
    or lower(coalesce(t.merchant, '')) like 'transfer to %'
    or lower(coalesce(t.merchant, '')) like 'transfer from %'
    or (lower(coalesce(t.merchant, '')) like 'tr %'
        and lower(coalesce(t.merchant, '')) like '% to %');
$$;

grant execute on function public.is_transfer_transaction(public.transactions) to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: is a transaction a reimbursement/friend-return income
-- (counts as expense reversal, NOT as earned income). Matches
-- isReimbursementTransaction() in investments.ts.
-- ---------------------------------------------------------------------------
create or replace function public.is_reimbursement_transaction(t public.transactions)
returns boolean
language sql
stable
as $$
  select
    t.type = 'income'
    and (
      lower(coalesce(
        (select ts.category_id from public.transaction_splits ts
         where ts.transaction_id = t.id limit 1),
        ''
      )) in ('friend returns', 'friend repayment', 'repayment')
      or t.tags && array['reimbursement', 'friend_return', 'friend-return', 'settlement:receive']::text[]
    );
$$;

grant execute on function public.is_reimbursement_transaction(public.transactions) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fix admin_user_spend_amount — exact match with isPeriodExpense() +
--    sumSpendingExpenses(): active, not transfer, not outing-rollup,
--    not opening balance, not settlement category.
--    Also adds unlinked active outing expenses.
-- ---------------------------------------------------------------------------
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
        and tx.is_active = true
        and not public.is_outing_rollup_transaction(tx)
        and not public.is_transfer_transaction(tx)
        and lower(coalesce(
          (select ts.category_id from public.transaction_splits ts
           where ts.transaction_id = tx.id limit 1),
          ''
        )) not in ('opening balance', 'settlements', 'settlement', 'transfer')
        and (p_from is null or tx.transaction_date >= p_from)
    ), 0)
    + coalesce((
      select sum(oe.amount)::numeric
      from public.outing_expenses oe
      where oe.user_id = p_user_id
        and oe.is_active = true
        and oe.linked_transaction_id is null
        and coalesce(oe.source, '') is distinct from 'bank-detected'
        and (
          p_from is null
          or (oe.expense_date is not null and oe.expense_date >= p_from)
        )
    ), 0);
$$;

grant execute on function public.admin_user_spend_amount(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fix admin_get_user_overview — all sub-queries respect is_active and
--    apply the same income/expense exclusion rules as the user-facing app.
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_user_overview(p_user_id uuid)
returns jsonb as $$
declare
  v_result jsonb;
  v_month_start timestamptz := date_trunc('month', now());
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
    -- Only count active (non-deleted) transactions
    'txCount', (
      select count(*) from public.transactions
      where user_id = p_user_id and is_active = true
    ),
    'totalSpend', public.admin_user_spend_amount(p_user_id, null),
    -- Income: active, type=income, NOT opening balance, NOT settlement,
    --         NOT transfer, NOT reimbursement (friend return).
    --         Matches isPeriodIncome() in period-totals.ts.
    'totalIncome', (
      select coalesce(sum(t.total_amount), 0)
      from public.transactions t
      where t.user_id = p_user_id
        and t.type = 'income'
        and t.is_active = true
        and not public.is_reimbursement_transaction(t)
        and not public.is_transfer_transaction(t)
        and lower(coalesce(
          (select ts.category_id from public.transaction_splits ts
           where ts.transaction_id = t.id limit 1),
          ''
        )) not in (
          'opening balance',
          'settlements', 'settlement',
          'repayment', 'friend repayment',
          'transfer'
        )
    ),
    'monthSpend', public.admin_user_spend_amount(p_user_id, v_month_start),
    'spendByCategory', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'categoryId', s.category_id,
        'name', coalesce(c.name, s.category_id),
        'amount', s.amount
      ) order by s.amount desc), '[]'::jsonb)
      from (
        select x.category_id, sum(x.amount) as amount
        from (
          -- Ledger splits (active, not rollup, not transfer)
          select ts.category_id, ts.amount
          from public.transaction_splits ts
          join public.transactions t on t.id = ts.transaction_id
          where t.user_id = p_user_id
            and t.type = 'expense'
            and t.is_active = true
            and not public.is_outing_rollup_transaction(t)
            and not public.is_transfer_transaction(t)
          union all
          -- Unlinked outing cash (active only)
          select coalesce(nullif(oe.category_id, ''), 'Travel') as category_id,
                 oe.amount
          from public.outing_expenses oe
          where oe.user_id = p_user_id
            and oe.is_active = true
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
        'balance', a.opening_balance + coalesce((
          select sum(
            case when t.type = 'income' then t.total_amount
                 else -t.total_amount end
          )
          from public.transactions t
          where t.account_id = a.id
            and t.user_id = p_user_id
            and t.is_active = true
            and not public.is_outing_rollup_transaction(t)
            and lower(coalesce(
              (select ts.category_id from public.transaction_splits ts
               where ts.transaction_id = t.id limit 1),
              ''
            )) is distinct from 'opening balance'
        ), 0)
        - coalesce((
          select sum(oe.amount)
          from public.outing_expenses oe
          where oe.user_id = p_user_id
            and oe.is_active = true
            and oe.linked_transaction_id is null
            and coalesce(oe.source, '') is distinct from 'bank-detected'
            and (
              lower(coalesce(oe.account_name, '')) = lower(a.name)
              or (
                (a.type = 'cash' or lower(a.name) = 'cash')
                and (
                  oe.account_name is null
                  or lower(oe.account_name) in ('', 'cash')
                  or lower(coalesce(oe.payment_mode, '')) = 'cash'
                )
              )
            )
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
    -- Only active (non-deleted) outings
    'outings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.title, 'startDate', o.start_date, 'endDate', o.end_date,
        'status', o.status,
        'totalAmount', public.outing_live_total(p_user_id, o.id)
      )), '[]'::jsonb)
      from public.outings o
      where o.user_id = p_user_id
        and o.is_active = true
        and o.deleted_at is null
    ),
    'friends', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'phone', f.phone,
        'netBalance', coalesce((
          select sum(case when ts.is_return then -ts.amount else ts.amount end)
          from public.transaction_splits ts
          join public.transactions t on t.id = ts.transaction_id
          where ts.friend_id = f.id
            and t.user_id = p_user_id
            and t.is_active = true
        ), 0)
      )), '[]'::jsonb)
      from public.friends f
      where f.user_id = p_user_id
    ),
    -- Recent transactions: active only
    'recentTransactions', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from (
        select
          t.id,
          t.merchant,
          case
            when public.is_outing_rollup_transaction(t) and t.outing_id is not null
              then public.outing_live_total(p_user_id, t.outing_id)
            else t.total_amount
          end as total_amount,
          t.type,
          t.transaction_date,
          t.status,
          t.outing_id,
          (select title from public.outings o where o.id = t.outing_id) as outing_name,
          (select name from public.purposes p where p.id = t.purpose_id) as purpose_name,
          (
            select coalesce(jsonb_agg(jsonb_build_object(
              'friendId', ts.friend_id,
              'amount', ts.amount,
              'isReturn', ts.is_return,
              'friendName', f.name
            )), '[]'::jsonb)
            from public.transaction_splits ts
            left join public.friends f on f.id = ts.friend_id
            where ts.transaction_id = t.id and ts.friend_id is not null
          ) as splits
        from public.transactions t
        where t.user_id = p_user_id
          and t.is_active = true
        order by t.transaction_date desc
        limit 50
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

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id)
  values (auth.uid(), 'view_row', 'users', p_user_id::text, p_user_id);

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_get_user_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fix admin_get_overview global totals to respect is_active
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_overview()
returns jsonb as $$
declare
  v_storage jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  perform public.require_admin();

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', bucket_id, 'objects', object_count, 'bytes', total_bytes
    )), '[]'::jsonb) into v_storage
    from (
      select bucket_id, count(*) as object_count,
             coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes
      from storage.objects group by bucket_id
    ) s;
  exception when others then
    v_storage := '[]'::jsonb;
  end;

  select jsonb_build_object(
    'totalUsers', (select count(*) from public.users),
    'newUsersWeek', (
      select count(*) from public.users where joined_at >= now() - interval '7 days'
    ),
    'newUsersMonth', (
      select count(*) from public.users where joined_at >= now() - interval '30 days'
    ),
    'totalTransactions', (
      select count(*) from public.transactions where is_active = true
    ),
    'totalVolume', (
      select coalesce(sum(total_amount), 0) from public.transactions t
      where t.is_active = true and not public.is_outing_rollup_transaction(t)
    ),
    'expenseVolume', (
      select coalesce(sum(public.admin_user_spend_amount(u.id, null)), 0)
      from public.users u
    ),
    'incomeVolume', (
      select coalesce(sum(total_amount), 0) from public.transactions
      where type = 'income' and is_active = true
    ),
    'backupsLast7d', (
      select count(*) from public.backup_history
      where created_at >= now() - interval '7 days'
    ),
    'backupFailuresLast7d', (
      select count(*) from public.backup_history
      where created_at >= now() - interval '7 days' and status = 'failed'
    ),
    'maintenanceMode', (
      select maintenance_mode from public.global_settings where id = 'app'
    ),
    'storage', v_storage
  ) into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_get_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Fix admin_list_users tx_count to only count active transactions
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb as $$
declare
  v_result jsonb;
  v_month_start timestamptz := date_trunc('month', now());
begin
  perform public.require_admin();

  select coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', u.id, 'name', u.name, 'email', u.email, 'role', u.role,
      'joinedAt', u.joined_at,
      'txCount', coalesce(t.tx_count, 0),
      'monthSpend', public.admin_user_spend_amount(u.id, v_month_start),
      'totalSpend', public.admin_user_spend_amount(u.id, null)
    ) as row_json
    from public.users u
    left join lateral (
      select count(*) as tx_count
      from public.transactions tx
      where tx.user_id = u.id and tx.is_active = true
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
