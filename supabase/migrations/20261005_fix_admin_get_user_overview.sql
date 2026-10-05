-- Migration: Fix admin_get_user_overview RPC (remove invalid ts.is_return column reference)
-- Date: 2026-10-05

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
        'netBalance', 0
      )), '[]'::jsonb)
      from public.friends f
      where f.user_id = p_user_id
        and f.is_active = true
        and f.deleted_at is null
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
              'friendId', null,
              'amount', ts.amount,
              'isReturn', false,
              'friendName', coalesce((select name from public.purposes p where p.id = ts.purpose_id), 'Split')
            )), '[]'::jsonb)
            from public.transaction_splits ts
            where ts.transaction_id = t.id
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
