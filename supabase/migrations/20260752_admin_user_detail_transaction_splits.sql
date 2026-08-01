-- Enhance admin_get_user_overview to return outing_id, outing_name, purpose_name, friend splits, user outings, and user friends
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
    'txCount', (select count(*) from public.transactions where user_id = p_user_id),
    'totalSpend', public.admin_user_spend_amount(p_user_id, null),
    'totalIncome', (
      select coalesce(sum(total_amount), 0) from public.transactions
      where user_id = p_user_id and type = 'income'
        and lower(coalesce(
          (select ts.category_id from public.transaction_splits ts
           where ts.transaction_id = transactions.id limit 1),
          ''
        )) is distinct from 'opening balance'
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
          -- Ledger splits (exclude display rollups)
          select ts.category_id, ts.amount
          from public.transaction_splits ts
          join public.transactions t on t.id = ts.transaction_id
          where t.user_id = p_user_id
            and t.type = 'expense'
            and not public.is_outing_rollup_transaction(t)
          union all
          -- Unlinked outing cash by category
          select coalesce(nullif(oe.category_id, ''), 'Travel') as category_id,
                 oe.amount
          from public.outing_expenses oe
          where oe.user_id = p_user_id
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
            case
              when t.type = 'income' then t.total_amount
              else -t.total_amount
            end
          )
          from public.transactions t
          where t.account_id = a.id
            and t.user_id = p_user_id
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
    'outings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'startDate', o.start_date, 'endDate', o.end_date,
        'status', o.status,
        'totalAmount', public.outing_live_total(p_user_id, o.id)
      )), '[]'::jsonb)
      from public.outings o
      where o.user_id = p_user_id and o.deleted_at is null
    ),
    'friends', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'phone', f.phone,
        'netBalance', coalesce((
          select sum(
            case
              when ts.is_return then -ts.amount
              else ts.amount
            end
          )
          from public.transaction_splits ts
          join public.transactions t on t.id = ts.transaction_id
          where ts.friend_id = f.id and t.user_id = p_user_id
        ), 0)
      )), '[]'::jsonb)
      from public.friends f
      where f.user_id = p_user_id
    ),
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
          (select name from public.outings o where o.id = t.outing_id) as outing_name,
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
