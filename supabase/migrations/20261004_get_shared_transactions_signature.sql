-- Idempotent fix for databases that already applied
-- 20260930_shared_transactions_exclude_deleted_outings.sql
-- (or failed it). Does not rewrite earlier migration history.

-- Restore get_shared_transactions after the 12-column CREATE OR REPLACE.
-- PostgreSQL rejects CREATE OR REPLACE when the return row type changes, so
-- production that already applied 20260930_p0_sharing_fixes.sql (13 columns,
-- including split_id) cannot apply a 12-column replace. Drop first, then
-- create the signature the app selects:
--   id, split_id, merchant, amount, type, transaction_date, category_id,
--   account_name (account TYPE label only, never accounts.name),
--   note, description, contributor_name, tags, status.
-- Excludes soft-deleted transactions and outings that are inactive, deleted,
-- or status = cancelled.

drop function if exists public.get_shared_transactions(uuid);

create function public.get_shared_transactions(p_token uuid)
returns table (
  id uuid,
  split_id uuid,
  merchant text,
  amount numeric,
  type text,
  transaction_date timestamptz,
  category_id text,
  account_name text,
  note text,
  description text,
  contributor_name text,
  tags text[],
  status text
) as $$
  select
    t.id,
    ts.id as split_id,
    t.merchant,
    ts.amount,
    t.type,
    t.transaction_date,
    ts.category_id,
    case
      when a.type = 'bank' then 'Bank'
      when a.type = 'cash' then 'Cash'
      when a.type = 'wallet' then 'Wallet'
      when a.type = 'credit' then 'Credit'
      else coalesce(initcap(a.type), 'Account')
    end as account_name,
    t.note,
    t.description,
    c.name as contributor_name,
    t.tags,
    t.status
  from public.share_links sl
  join public.transaction_splits ts on ts.purpose_id = sl.purpose_id
  join public.transactions t on t.id = ts.transaction_id and t.user_id = sl.owner_id
  left join public.accounts a on a.id = t.account_id
  left join public.contributors c on c.id = ts.contributor_id
  where sl.token = p_token
    and (sl.expires_at is null or sl.expires_at > now())
    and (sl.contributor_id is null or ts.contributor_id = sl.contributor_id)
    and (t.is_active = true or t.is_active is null)
    and t.deleted_at is null
    and (
      t.outing_id is null
      or not exists (
        select 1 from public.outings o
        where o.id = t.outing_id
          and (
            o.is_active = false
            or o.deleted_at is not null
            or o.status = 'cancelled'
          )
      )
    )
  order by t.transaction_date desc;
$$ language sql security definer stable;

grant execute on function public.get_shared_transactions(uuid) to anon;
grant execute on function public.get_shared_transactions(uuid) to authenticated;
