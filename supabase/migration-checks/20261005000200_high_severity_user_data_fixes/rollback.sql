-- ROLLBACK for apply_missing_parts.sql of 20261005000200 (S5b).
-- Restores the versions live on 2026-10-21 ~14:25 IST (captured read-only): both functions
-- and the old trigger definition. The share_links cleanup DELETE cannot be
-- undone here (0 rows matched on 2026-10-21 ~14:25 IST); use the backup if needed.
begin;
set local search_path = public, extensions;
CREATE OR REPLACE FUNCTION public.get_shared_transactions(p_token uuid)
 RETURNS TABLE(id uuid, split_id uuid, merchant text, amount numeric, type text, transaction_date timestamp with time zone, category_id text, account_name text, note text, description text, contributor_name text, tags text[], status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.sync_share_link_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status = 'revoked' then
    delete from public.share_links where token = old.link_token and owner_id = old.owner_id;
  else
    update public.share_links set expires_at = new.expires_at,
      contributor_id = new.contributor_id
    where token = new.link_token and owner_id = new.owner_id;
  end if;
  return new;
end;
$function$
;
revoke all on function public.get_shared_transactions(p_token uuid) from public, anon, authenticated, service_role; grant execute on function public.get_shared_transactions(p_token uuid) to authenticated; grant execute on function public.get_shared_transactions(p_token uuid) to anon; grant execute on function public.get_shared_transactions(p_token uuid) to service_role; grant execute on function public.get_shared_transactions(p_token uuid) to public;
revoke all on function public.sync_share_link_access() from public, anon, authenticated, service_role; grant execute on function public.sync_share_link_access() to authenticated; grant execute on function public.sync_share_link_access() to anon; grant execute on function public.sync_share_link_access() to service_role; grant execute on function public.sync_share_link_access() to public;
drop trigger if exists sync_share_link_access on purpose_shares; CREATE TRIGGER sync_share_link_access AFTER UPDATE OF status, expires_at, contributor_id ON public.purpose_shares FOR EACH ROW EXECUTE FUNCTION sync_share_link_access();
commit;
