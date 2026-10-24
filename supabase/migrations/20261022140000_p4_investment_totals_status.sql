-- Phase 4 (Oct 22, 2026): investment_totals counts only confirmed rows.
--
-- Finding: since 20261021120000_p0_tx_status_flags (applied Oct 22) the
-- status check also allows 'reversed' and 'unknown', and the app now sends
-- 'pending'. The view only excluded unverified / rejected / failed /
-- refunded, so those rows would be counted as invested money.
-- Fix: allow-list 'completed' and skip reversal entries. Same columns, same
-- order and types, same security_invoker = on (RLS applies); grants are
-- kept by CREATE OR REPLACE. Nothing depends on this view.
--
-- Run order: precheck -> this file -> verify. Rollback restores the old
-- definition exactly. Safe to run more than once. Changes no data.
-- Today all 75 live transactions are 'completed', so totals do not change.

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
    -- Phase 4: only confirmed money counts (same rule as the app's
    -- Countable / computePortfolio). Excludes unverified, rejected, failed,
    -- refunded (as before) and the Phase 0 statuses pending, reversed and
    -- unknown, plus reversal entries.
    and coalesce(t.status, 'completed') = 'completed'
    and coalesce(t.link_kind, '') <> 'reversal'
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
