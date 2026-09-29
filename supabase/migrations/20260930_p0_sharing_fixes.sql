-- ============================================================================
-- Migration: P0 & P1 Sharing, Privacy, and Performance Fixes
-- 1. Add kind column & backfill link shares on purpose_shares
-- 2. Partial unique index for email invites only (links identified by id)
-- 3. Dedicated RPC link_purpose_shares_for_viewer (pending only)
-- 4. Extend get_shared_transactions (split_id, privacy-safe account type, cancelled outings check)
-- 5. Add get_shared_categories RPC function
-- ============================================================================

-- 1. Add kind column if not exists and enforce check constraint
alter table public.purpose_shares
  add column if not exists kind text not null default 'email';

alter table public.purpose_shares
  alter column viewer_email drop not null;

alter table public.share_links
  alter column viewer_email drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purpose_shares_kind_check'
  ) then
    alter table public.purpose_shares
      add constraint purpose_shares_kind_check check (kind in ('link', 'email'));
  end if;
end $$;

-- Backfill legacy link shares
update public.purpose_shares
set kind = 'link'
where lower(viewer_email) like 'link-share-%@spentx.app';

-- 2. Update unique index: one active email invite per (owner_id, purpose_id, viewer_email) where kind = 'email'
drop index if exists public.purpose_shares_active_owner_purpose_email_idx;

create unique index if not exists purpose_shares_active_owner_purpose_email_idx
  on public.purpose_shares (owner_id, purpose_id, lower(viewer_email))
  where kind = 'email' and status <> 'revoked';

-- 3. Dedicated RPC to link purpose shares on sign-in
-- Securely verifies that caller matches auth.uid() and caller's verified email matches the share!
-- Only updates pending rows where viewer_id is null and kind = 'email'; revoked rows stay revoked!
drop function if exists public.link_purpose_shares_for_viewer(uuid, text);

create or replace function public.link_purpose_shares_for_viewer(
  p_viewer_id uuid default auth.uid(),
  p_email text default null
)
returns integer as $$
declare
  v_caller_id uuid;
  v_caller_email text;
  v_updated integer := 0;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_viewer_id is not null and p_viewer_id <> v_caller_id then
    raise exception 'Unauthorized: caller id does not match viewer id';
  end if;

  select email into v_caller_email
  from auth.users
  where id = v_caller_id;

  if v_caller_email is null or v_caller_email = '' then
    return 0;
  end if;

  if p_email is not null and lower(trim(p_email)) <> lower(trim(v_caller_email)) then
    raise exception 'Unauthorized: caller email does not match requested email';
  end if;

  update public.purpose_shares
  set viewer_id = v_caller_id, status = 'active'
  where lower(viewer_email) = lower(trim(v_caller_email))
    and kind = 'email'
    and status = 'pending'
    and viewer_id is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$ language plpgsql security definer;

revoke execute on function public.link_purpose_shares_for_viewer(uuid, text) from anon;
revoke execute on function public.link_purpose_shares_for_viewer(uuid, text) from public;
grant execute on function public.link_purpose_shares_for_viewer(uuid, text) to authenticated;

-- 4. Privacy-safe get_shared_transactions: returns split_id, masked account type, and filters cancelled outings
drop function if exists public.get_shared_transactions(uuid);

create or replace function public.get_shared_transactions(p_token uuid)
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

-- 5. get_shared_categories RPC function
drop function if exists public.get_shared_categories(uuid);

create or replace function public.get_shared_categories(p_token uuid)
returns table (
  id text,
  name text,
  color text,
  icon text,
  type text
) as $$
  with token_info as (
    select sl.owner_id, sl.purpose_id
    from public.share_links sl
    where sl.token = p_token
      and (sl.expires_at is null or sl.expires_at > now())
  ),
  global_cats as (
    select
      elem->>'id' as id,
      elem->>'name' as name,
      elem->>'color' as color,
      coalesce(elem->>'icon', 'tag') as icon,
      coalesce(elem->>'type', 'expense') as type
    from public.global_settings gs,
    lateral jsonb_array_elements(gs.default_categories) elem
    where gs.id = 'app'
      and exists (select 1 from token_info)
  ),
  custom_cats as (
    select distinct
      c.id::text as id,
      c.name,
      c.color,
      coalesce(c.icon, 'tag') as icon,
      coalesce(c.type, 'expense') as type
    from token_info ti
    join public.transaction_splits ts on ts.purpose_id = ti.purpose_id
    join public.transactions t on t.id = ts.transaction_id and t.user_id = ti.owner_id
    join public.categories c on (c.id::text = ts.category_id or c.name = ts.category_id)
    where (t.is_active = true or t.is_active is null)
      and t.deleted_at is null
  )
  select * from global_cats
  union
  select * from custom_cats;
$$ language sql security definer stable;

grant execute on function public.get_shared_categories(uuid) to anon;
grant execute on function public.get_shared_categories(uuid) to authenticated;
