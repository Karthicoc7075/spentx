-- ROLLBACK for 20261022140000_p4_investment_totals_status.sql.
-- Restores the definition from 20261011_investments_goals.sql (status
-- exclusion list only). Changes no data.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace view public.investment_totals
with (security_invoker = on)
as
with inv as (
  select i.user_id,
         sum(i.invested_amount) as invested,
         sum(i.current_value) as current_value,
         count(*) as holdings
  from public.investments i
  where i.user_id = auth.uid() and i.deleted_at is null
  group by i.user_id
),
linked as (
  select distinct unnest(i.source_transaction_ids) as tx_id
  from public.investments i
  where i.user_id = auth.uid() and i.deleted_at is null
),
tx as (
  select t.user_id, sum(ts.amount) as amt
  from public.transactions t
  join public.transaction_splits ts on ts.transaction_id = t.id and ts.user_id = t.user_id
  where t.user_id = auth.uid()
    and t.type = 'expense'
    and coalesce(t.is_active, true)
    and t.deleted_at is null
    and t.status not in ('unverified', 'rejected', 'failed', 'refunded')
    and not (coalesce(t.tags, '{}'::text[]) && array['transfer', 'settlement'])
    and (
      exists (
        select 1 from public.categories c
        where c.user_id = t.user_id
          and c.name = ts.category_id
          and c.is_investment
          and c.deleted_at is null
      )
      or exists (
        select 1
        from public.global_settings gs,
             jsonb_array_elements(coalesce(gs.default_categories, '[]'::jsonb)) e
        where gs.id = 'app'
          and e->>'name' = ts.category_id
          and coalesce((e->>'isInvestment')::boolean, false)
      )
      or lower(btrim(coalesce(ts.category_id, ''))) in
         ('investment', 'investments', 'mutual fund', 'mutual funds', 'stocks', 'sip')
    )
    and not exists (select 1 from linked l where l.tx_id = t.id::text)
  group by t.user_id
)
select coalesce(inv.user_id, tx.user_id) as user_id,
       coalesce(inv.invested, 0) + coalesce(tx.amt, 0) as total_invested,
       coalesce(inv.current_value, 0) + coalesce(tx.amt, 0) as total_current_value,
       coalesce(inv.holdings, 0)::int as holdings_count,
       coalesce(tx.amt, 0) as unlinked_transactions_total
from inv
full join tx on tx.user_id = inv.user_id;

revoke all on public.investment_totals from anon;
grant select on public.investment_totals to authenticated;

commit;
