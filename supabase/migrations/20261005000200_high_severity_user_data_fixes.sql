begin;

-- Shared UI uses token-scoped RPCs. Raw financial rows belong to owners only.
drop policy if exists purposes_select on public.purposes;
create policy purposes_select on public.purposes for select using (user_id = auth.uid());
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select using (user_id = auth.uid());
drop policy if exists transaction_splits_select on public.transaction_splits;
create policy transaction_splits_select on public.transaction_splits for select using (user_id = auth.uid());
drop policy if exists monthly_plans_select on public.monthly_plans;
create policy monthly_plans_select on public.monthly_plans for select using (user_id = auth.uid());

-- Claiming is performed by the existing authenticated RPC, never arbitrary
-- viewer writes to scope, owner, expiry or status.
drop policy if exists purpose_shares_update on public.purpose_shares;
drop policy if exists purpose_shares_claim_by_email on public.purpose_shares;
drop policy if exists purpose_shares_insert_viewer_claim on public.purpose_shares;
create policy purpose_shares_update on public.purpose_shares for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Revoke the bearer link in the same transaction as the owner's revoke.
-- All existing shared RPCs and website endpoints already validate this link.
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


-- Manual bills have the same UI and local cache, now with an owner-only backup.
create table public.recurring_bills (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key (user_id, id)
);
alter table public.recurring_bills enable row level security;
create policy recurring_bills_own on public.recurring_bills for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.recurring_bills to authenticated;

-- Private delivery reservations prevent replay and concurrent email abuse.
create table public.share_invite_deliveries (
  id uuid primary key default gen_random_uuid(),
  share_id uuid unique references public.purpose_shares(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reserved_at timestamptz not null default now()
);
alter table public.share_invite_deliveries enable row level security;
revoke all on public.share_invite_deliveries from anon, authenticated;
grant all on public.share_invite_deliveries to service_role;
create or replace function public.reserve_share_invite(p_share_id uuid, p_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text, 0));
  if not exists (select 1 from public.purpose_shares where id = p_share_id
    and owner_id = p_owner_id and kind = 'email' and status <> 'revoked'
    and (expires_at is null or expires_at > now())) then return false; end if;
  if (select count(*) from public.share_invite_deliveries where owner_id = p_owner_id
    and reserved_at > now() - interval '1 hour') >= 10 then return false; end if;
  insert into public.share_invite_deliveries(share_id, owner_id) values (p_share_id, p_owner_id)
    on conflict (share_id) do nothing;
  return found;
end;
$$;
revoke all on function public.reserve_share_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_share_invite(uuid, uuid) to service_role;

commit;
