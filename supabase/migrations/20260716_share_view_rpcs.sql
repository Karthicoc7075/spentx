-- ============================================================================
-- No-login share view: extend the anonymous share_links/RPC path so the real
-- Dashboard/Transactions/Analysis pages can be reused for a token-only,
-- unauthenticated visitor (auth.uid() is null for them, so none of the
-- purpose_shares/viewer_id-based RLS policies ever apply — every one of
-- these functions is security definer and re-validates the token itself,
-- scoping strictly to that token's own owner_id/purpose_id).
-- ============================================================================

-- share_access_logs.share_id was NOT NULL -> purpose_shares, which only
-- exists for the separate email-invite/"claimed viewer" flow. A pure
-- anonymous share_links token visit has no purpose_shares row at all.
alter table public.share_access_logs alter column share_id drop not null;

-- View counters for the token-only flow live on share_links itself, since
-- there's no purpose_shares row to bump for an anonymous visit.
alter table public.share_links
  add column if not exists last_viewed_at timestamptz,
  add column if not exists total_views integer not null default 0;

-- get_shared_transactions output columns are changing, so it must be
-- dropped and recreated rather than CREATE OR REPLACE (Postgres disallows
-- changing the result columns of a TABLE-returning function in place).
drop function if exists public.get_shared_transactions(uuid);

create function public.get_shared_transactions(p_token uuid)
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
  order by t.transaction_date desc;
$$ language sql security definer stable;

-- Single-purpose lookup for the shared token — never accepts a
-- caller-supplied purpose id, only what the token itself resolves to.
create or replace function public.get_shared_purposes(p_token uuid)
returns table (
  id uuid,
  name text,
  color text,
  is_default boolean,
  is_active boolean
) as $$
  select p.id, p.name, p.color, p.is_default, p.is_active
  from public.share_links sl
  join public.purposes p on p.id = sl.purpose_id and p.user_id = sl.owner_id
  where sl.token = p_token
    and (sl.expires_at is null or sl.expires_at > now());
$$ language sql security definer stable;

-- Monthly plan for the shared purpose only, scoped from the token — the
-- month is the only caller-supplied parameter, owner_id/purpose_id always
-- come from the resolved share_links row.
create or replace function public.get_shared_monthly_plan(p_token uuid, p_month text)
returns public.monthly_plans as $$
  select mp.*
  from public.share_links sl
  join public.monthly_plans mp
    on mp.user_id = sl.owner_id
   and mp.purpose_id = sl.purpose_id
   and mp.month = p_month
  where sl.token = p_token
    and (sl.expires_at is null or sl.expires_at > now())
  limit 1;
$$ language sql security definer stable;

-- Records a page view for a token-only share session. Re-validates the
-- token itself; owner_id/purpose_id always come from the resolved
-- share_links row, never from the caller.
create or replace function public.log_shared_page_view(p_token uuid, p_page text)
returns void as $$
declare
  v_share public.share_links;
begin
  select * into v_share
  from public.share_links
  where token = p_token and (expires_at is null or expires_at > now());

  if v_share is null then
    return;
  end if;

  insert into public.share_access_logs (share_id, owner_id, purpose_id, token, page)
  values (null, v_share.owner_id, v_share.purpose_id, p_token, p_page);

  update public.share_links
  set last_viewed_at = now(),
      total_views = total_views + 1
  where token = p_token;
end;
$$ language plpgsql security definer;

-- get_share_link was never granted to anon in the original migration either
-- (grep confirms no `grant ... to anon` exists anywhere in init.sql) — so a
-- genuinely anonymous visitor could never call it, and the share feature has
-- likely never worked end-to-end for a true no-login visit. Fixing that here.
grant execute on function public.get_share_link(uuid) to anon;
grant execute on function public.get_shared_transactions(uuid) to anon;
grant execute on function public.get_shared_purposes(uuid) to anon;
grant execute on function public.get_shared_monthly_plan(uuid, text) to anon;
grant execute on function public.log_shared_page_view(uuid, text) to anon;
