-- ============================================================================
-- Deleting a friend must not leave their splits, settlements or settlement
-- transactions behind.
--
-- `friends` has no foreign keys pointing at it — friend_splits and outings
-- both store their roster as a jsonb array of members ({id, name, friendId,
-- isCurrentUser}). So nothing cascades automatically and the cleanup has to
-- match on the jsonb roster.
--
-- Mirrors cascade_delete_outing (20260736): soft-delete anything the user can
-- still see, so the operation stays reversible.
-- ============================================================================

-- Settlement history is a leaf record with no restore path of its own; it is
-- removed outright when its parent split goes.
create index if not exists friend_splits_members_idx
  on public.friend_splits using gin (members);

create or replace function public.cascade_delete_friend(
  p_friend_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_split_ids uuid[];
begin
  -- Splits whose roster contains this friend.
  select coalesce(array_agg(fs.id), '{}')
    into v_split_ids
  from public.friend_splits fs
  where fs.user_id = p_user_id
    and fs.is_active = true
    and fs.members @> jsonb_build_array(
          jsonb_build_object('friendId', p_friend_id::text)
        );

  if array_length(v_split_ids, 1) > 0 then
    -- The ledger rows those splits describe.
    update public.transactions
      set is_active = false, deleted_at = now()
      where user_id = p_user_id
        and is_active = true
        and id in (
          select fs.transaction_id
          from public.friend_splits fs
          where fs.id = any(v_split_ids)
        );

    delete from public.friend_settlements
      where user_id = p_user_id
        and friend_split_id = any(v_split_ids);

    update public.friend_splits
      set is_active = false, deleted_at = now(), deleted_by = p_user_id
      where user_id = p_user_id
        and id = any(v_split_ids);
  end if;

  update public.friends
    set is_active = false, deleted_at = now(), deleted_by = p_user_id
    where id = p_friend_id and user_id = p_user_id;
end;
$$;

grant execute on function public.cascade_delete_friend(uuid, uuid) to authenticated;

comment on function public.cascade_delete_friend(uuid, uuid) is
  'Soft-deletes a friend along with their friend splits and the ledger rows those splits describe, and removes those splits settlement history. Outing membership is deliberately left intact — removing a member from a past trip would silently rewrite that trip''s balances.';
