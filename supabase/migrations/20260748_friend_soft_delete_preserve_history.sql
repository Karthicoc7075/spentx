-- ============================================================================
-- Deleting a friend must NOT rewrite history.
--
-- 20260747's cascade_delete_friend soft-deleted the friend's splits and the
-- ledger rows they described. That made past outings and split expenses
-- confusing: a member's share would simply vanish and the totals stopped
-- adding up.
--
-- A friend is now purely soft-deleted. Every historical record keeps
-- referencing them; the UI renders "Sanjay (Deleted)" instead of hiding
-- the row. Only the friend's *active profile*
 goes away.
-- ============================================================================

create or replace function public.cascade_delete_friend(
  p_friend_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Deliberately touches nothing but the friend row. outing members,
  -- outing_expenses, friend_splits, friend_settlements and transactions all
  -- keep their references so historical amounts and shares stay intact.
  update public.friends
    set is_active = false,
        deleted_at = now(),
        deleted_by = p_user_id
    where id = p_friend_id
      and user_id = p_user_id;
end;
$$;

grant execute on function public.cascade_delete_friend(uuid, uuid) to authenticated;

comment on function public.cascade_delete_friend(uuid, uuid) is
  'Soft-deletes a friend only. Historical outings, member shares, friend splits, settlements and transactions are preserved verbatim and continue to reference the deleted friend.';

-- Undo any history that 20260747 soft-deleted before this correction landed.
-- Splits/transactions whose only reason for being inactive was a friend
-- deletion are brought back; the friend stays deleted.
update public.friend_splits fs
  set is_active = true, deleted_at = null, deleted_by = null
  where fs.is_active = false
    and fs.deleted_by is not null
    and exists (
      select 1
      from public.friends f
      where f.user_id = fs.user_id
        and f.is_active = false
        and fs.members @> jsonb_build_array(
              jsonb_build_object('friendId', f.id::text)
            )
    );

update public.transactions t
  set is_active = true, deleted_at = null
  where t.is_active = false
    and exists (
      select 1
      from public.friend_splits fs
      where fs.transaction_id = t.id
        and fs.is_active = true
    );
