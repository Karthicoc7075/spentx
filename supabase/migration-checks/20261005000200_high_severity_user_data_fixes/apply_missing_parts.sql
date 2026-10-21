-- APPLY MISSING PARTS of supabase/migrations/20261005000200_high_severity_user_data_fixes.sql (S5b).
-- Live 2026-10-21 ~14:25 IST: PARTIALLY APPLIED. Policies, recurring_bills,
-- share_invite_deliveries and reserve_share_invite() are live; these three
-- parts are NOT (live has older versions):
--   * sync_share_link_access(): no DELETE branch; trigger only AFTER UPDATE OF
--     status, expires_at, contributor_id (deleting a share leaves its link);
--   * get_shared_transactions(): shows note/description/tags of partly-private
--     transactions to share viewers; no search_path pin.
-- The original file cannot be re-run (create table recurring_bills / create
-- trigger fail because they exist; it would roll back as a whole).
-- Text below is copied VERBATIM from the migration (lines 23-43 and 45-115);
-- the only addition is the marked "drop trigger if exists".
begin;
create or replace function public.sync_share_link_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.share_links where token = old.link_token and owner_id = old.owner_id;
    return old;
  end if;
  if new.status = 'revoked' then
    delete from public.share_links where token = old.link_token and owner_id = old.owner_id;
  else
    update public.share_links set expires_at = new.expires_at,
      contributor_id = new.contributor_id
    where token = new.link_token and owner_id = new.owner_id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_share_link_access on public.purpose_shares;  -- added: live already has an older trigger
create trigger sync_share_link_access after update or delete
  on public.purpose_shares for each row execute function public.sync_share_link_access();
delete from public.share_links sl using public.purpose_shares ps
where ps.link_token = sl.token and ps.owner_id = sl.owner_id and ps.status = 'revoked';

-- Keep the existing shared projection, but do not disclose parent notes,
-- descriptions or tags when part of the transaction remains private.
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
    case when scope.all_shared then t.note else null end,
    case when scope.all_shared then t.description else null end,
    c.name as contributor_name,
    case when scope.all_shared then t.tags else null end,
    t.status
  from public.share_links sl
  join public.transaction_splits ts on ts.purpose_id = sl.purpose_id
  join public.transactions t on t.id = ts.transaction_id and t.user_id = sl.owner_id
  left join public.accounts a on a.id = t.account_id
  left join public.contributors c on c.id = ts.contributor_id
  cross join lateral (
    select not exists (
      select 1 from public.transaction_splits other
      where other.transaction_id = t.id and (
        other.purpose_id <> sl.purpose_id or
        (sl.contributor_id is not null and other.contributor_id is distinct from sl.contributor_id)
      )
    ) as all_shared
  ) scope
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
$$ language sql security definer stable set search_path = '';
commit;
