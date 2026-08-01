-- ============================================================================
-- Sharing: optional per-contributor scoping + one-active-share-per-purpose
-- ============================================================================

-- Optional contributor scope for a share — null means "all contributors in
-- the purpose" (today's behavior, unchanged). Recorded on both tables for
-- the same reason link_token is: share_links is what get_shared_transactions
-- actually enforces against, purpose_shares.contributor_id is the owner-
-- facing record used to redisplay/reconstruct the invite in the Sharing tab.
alter table public.share_links
  add column if not exists contributor_id uuid references public.contributors(id);
alter table public.purpose_shares
  add column if not exists contributor_id uuid references public.contributors(id);

-- One active (non-revoked) share per (owner, purpose, viewer email) — a
-- second invite to the same email for the same purpose must revoke the
-- existing one first, rather than silently creating a duplicate row/link.
-- Partial index so revoked history doesn't block re-inviting.
create unique index if not exists purpose_shares_active_owner_purpose_email_idx
  on public.purpose_shares (owner_id, purpose_id, viewer_email)
  where status <> 'revoked';

-- Re-scope get_shared_transactions to the share's contributor when one is
-- set — same output columns as before, so create or replace is safe here.
create or replace function public.get_shared_transactions(p_token uuid)
returns table (
  id uuid,
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
    t.merchant,
    ts.amount,
    t.type,
    t.transaction_date,
    ts.category_id,
    a.name as account_name,
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
  order by t.transaction_date desc;
$$ language sql security definer stable;
