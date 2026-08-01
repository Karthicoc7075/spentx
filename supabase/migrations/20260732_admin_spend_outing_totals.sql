-- Admin Users "Spend this month" / "Total spend" must match the app:
--   ledger expenses EXCLUDING display-only outing-rollup rows
--   + unlinked outing_expenses (manual trip cash not on the ledger)
--
-- Before this, admin summed every expense transaction, so a stale
-- "Outing total" rollup (e.g. first spend ₹1,000) was counted while the
-- remaining outing_expenses (full trip ₹8,788) were ignored.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_outing_rollup_transaction(t public.transactions)
returns boolean
language sql
stable
as $$
  select
    t.type = 'expense'
    and t.outing_id is not null
    and (
      coalesce(t.tags, '{}'::text[]) @> array['outing-rollup']::text[]
      or lower(coalesce(t.note, '')) like 'outing total%'
      or lower(coalesce(t.description, '')) like 'outing total%'
    );
$$;

-- Live outing total (same idea as web computeOutingRollupAmount).
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
    ), 0)
    + coalesce((
      select sum(tx.total_amount)::numeric
      from public.transactions tx
      where tx.user_id = p_user_id
        and tx.outing_id = p_outing_id
        and tx.type = 'expense'
        and not public.is_outing_rollup_transaction(tx)
        and not exists (
          select 1
          from public.outing_expenses oe
          where oe.user_id = p_user_id
            and oe.outing_id = p_outing_id
            and oe.linked_transaction_id = tx.id
        )
    ), 0);
$$;

-- Canonical user spend for admin list / detail / overview.
-- p_from: when set, only include activity on/after that timestamp (month filter).
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
        and not public.is_outing_rollup_transaction(tx)
        and lower(coalesce(tx.payment_method, '')) is distinct from 'transfer'
        and lower(coalesce(
          (select ts.category_id from public.transaction_splits ts
           where ts.transaction_id = tx.id limit 1),
          ''
        )) not in ('settlements', 'transfer')
        and (p_from is null or tx.transaction_date >= p_from)
    ), 0)
    + coalesce((
      select sum(oe.amount)::numeric
      from public.outing_expenses oe
      where oe.user_id = p_user_id
        and oe.linked_transaction_id is null
        and coalesce(oe.source, '') is distinct from 'bank-detected'
        and (
          p_from is null
          or (
            oe.expense_date is not null
            and oe.expense_date >= p_from
          )
        )
    ), 0);
$$;

grant execute on function public.is_outing_rollup_transaction(public.transactions) to authenticated;
grant execute on function public.outing_live_total(uuid, uuid) to authenticated;
grant execute on function public.admin_user_spend_amount(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- /admin/users list
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
      'id', u.id,
      'name', u.name,
      'email', u.email,
      'role', u.role,
      'joinedAt', u.joined_at,
      'txCount', coalesce(t.tx_count, 0),
      'monthSpend', public.admin_user_spend_amount(u.id, v_month_start),
      'totalSpend', public.admin_user_spend_amount(u.id, null)
    ) as row_json
    from public.users u
    left join lateral (
      select count(*) as tx_count
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

-- ---------------------------------------------------------------------------
-- /admin/users/[id] detail
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
          -- Unlinked manual outing cash reduces Cash (and named account matches)
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
          t.status
        from public.transactions t
        where t.user_id = p_user_id
        order by t.transaction_date desc
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

  insert into public.admin_action_logs
    (admin_id, action, table_name, record_id, target_user_id)
  values (auth.uid(), 'view_row', 'users', p_user_id::text, p_user_id);

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_get_user_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin overview expense volume (same exclusion + unlinked cash)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_overview()
returns jsonb as $$
declare
  v_storage jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  perform public.require_admin();

  -- Storage usage per bucket — optional: if storage isn't reachable, empty list.
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
    'totalVolume', (
      select coalesce(sum(total_amount), 0) from public.transactions t
      where not public.is_outing_rollup_transaction(t)
    ),
    'expenseVolume', (
      select coalesce(sum(public.admin_user_spend_amount(u.id, null)), 0)
      from public.users u
    ),
    'incomeVolume', (
      select coalesce(sum(total_amount), 0) from public.transactions where type = 'income'
    ),
    'backupsLast7d', (select count(*) from public.backup_history where created_at >= now() - interval '7 days'),
    'backupFailuresLast7d', (
      select count(*) from public.backup_history
      where created_at >= now() - interval '7 days' and status = 'failed'
    ),
    'maintenanceMode', (select maintenance_mode from public.global_settings where id = 'app'),
    'storage', v_storage
  ) into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

grant execute on function public.admin_get_overview() to authenticated;
