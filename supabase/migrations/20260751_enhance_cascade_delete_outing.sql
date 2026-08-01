-- ---------------------------------------------------------------------------
-- Migration: 20260751_enhance_cascade_delete_outing.sql
-- Ensure cascade_delete_outing soft-deletes transactions linked directly via
-- outing_id OR indirectly via outing_expenses.linked_transaction_id.
-- ---------------------------------------------------------------------------

create or replace function public.cascade_delete_outing(p_outing_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Soft-delete transactions linked directly via outing_id
  update public.transactions
    set is_active = false, deleted_at = now()
    where outing_id = p_outing_id and user_id = p_user_id and is_active = true;

  -- 2. Soft-delete transactions linked via outing_expenses.linked_transaction_id
  update public.transactions t
    set is_active = false, deleted_at = now()
    from public.outing_expenses oe
    where oe.outing_id = p_outing_id
      and oe.user_id = p_user_id
      and oe.linked_transaction_id = t.id
      and t.is_active = true;

  -- 3. Soft-delete outing_expenses
  update public.outing_expenses
    set is_active = false, deleted_at = now()
    where outing_id = p_outing_id and user_id = p_user_id and is_active = true;

  -- 4. Soft-delete settlements
  update public.settlements
    set is_active = false, deleted_at = now()
    where outing_id = p_outing_id and user_id = p_user_id and is_active = true;

  -- 5. Soft-delete the outing itself
  update public.outings
    set is_active = false,
        status = 'completed',
        deleted_at = now(),
        deleted_by = p_user_id,
        total_spent = 0
    where id = p_outing_id and user_id = p_user_id;
end;
$$;

grant execute on function public.cascade_delete_outing(uuid, uuid) to authenticated;

create or replace function public.restore_deleted_outing(p_outing_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transactions
    set is_active = true, deleted_at = null
    where outing_id = p_outing_id and user_id = p_user_id and is_active = false;

  update public.transactions t
    set is_active = true, deleted_at = null
    from public.outing_expenses oe
    where oe.outing_id = p_outing_id
      and oe.user_id = p_user_id
      and oe.linked_transaction_id = t.id
      and t.is_active = false;

  update public.outing_expenses
    set is_active = true, deleted_at = null
    where outing_id = p_outing_id and user_id = p_user_id and is_active = false;

  update public.settlements
    set is_active = true, deleted_at = null
    where outing_id = p_outing_id and user_id = p_user_id and is_active = false;

  update public.outings
    set is_active = true,
        status = 'active',
        deleted_at = null,
        deleted_by = null
    where id = p_outing_id and user_id = p_user_id;
end;
$$;

grant execute on function public.restore_deleted_outing(uuid, uuid) to authenticated;
