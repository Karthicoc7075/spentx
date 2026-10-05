-- ---------------------------------------------------------------------------
-- 7-Day Automatic Outing Purge
--
-- Outings that have been soft-deleted (is_active = false, deleted_at is not null)
-- for more than 7 days are permanently eradicated from the database, along with
-- all of their child records (outing_expenses, settlements, outing_members,
-- and soft-deleted outing transactions).
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_deleted_outings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_outing_ids uuid[];
begin
  select array_agg(id) into expired_outing_ids
  from public.outings
  where is_active = false
    and deleted_at is not null
    and deleted_at < now() - interval '7 days';

  if expired_outing_ids is not null and array_length(expired_outing_ids, 1) > 0 then
    -- 1. Permanently remove soft-deleted transactions attached to these outings
    delete from public.transactions
    where outing_id = any(expired_outing_ids)
      and is_active = false;

    -- 2. Permanently remove outing expenses
    delete from public.outing_expenses
    where outing_id = any(expired_outing_ids);

    -- 3. Permanently remove settlements
    delete from public.settlements
    where outing_id = any(expired_outing_ids);

    -- 4. Permanently remove outing members
    delete from public.outing_members
    where outing_id = any(expired_outing_ids);

    -- 5. Permanently remove the outings
    delete from public.outings
    where id = any(expired_outing_ids);
  end if;
end;
$$;

grant execute on function public.purge_expired_deleted_outings() to authenticated, anon;
