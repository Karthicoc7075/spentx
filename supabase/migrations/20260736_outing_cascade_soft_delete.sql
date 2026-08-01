-- Deleting an outing must hide it AND everything linked to it (its real
-- ledger transactions, outing_expenses, settlements) immediately, while
-- staying fully restorable — not "unlink and keep as a normal transaction"
-- (the old behavior), which is what let a newly-created outing with
-- overlapping dates silently re-adopt a deleted outing's transactions via
-- the bank-transaction auto-relink sync (useOutingTransactionSync ->
-- getOutingCandidatesForTransaction only skips already-tagged
-- "outing-unlinked" transactions, and the old cascade delete never set
-- that tag).
--
-- Fix: soft-delete the whole graph (outing + its transactions + its
-- outing_expenses + its settlements) atomically in one RPC, and provide a
-- matching restore RPC for Settings > Data & Backups > Deleted Outings.

alter table public.transactions
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

alter table public.outing_expenses
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

alter table public.settlements
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

create index if not exists transactions_user_active_idx
  on public.transactions (user_id, is_active);

-- ---------------------------------------------------------------------------
-- Cascade delete: outing + its transactions + its outing_expenses + its
-- settlements, all soft-deleted atomically.
-- ---------------------------------------------------------------------------
create or replace function public.cascade_delete_outing(p_outing_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transactions
    set is_active = false, deleted_at = now()
    where outing_id = p_outing_id and user_id = p_user_id and is_active = true;

  update public.outing_expenses
    set is_active = false, deleted_at = now()
    where outing_id = p_outing_id and user_id = p_user_id and is_active = true;

  update public.settlements
    set is_active = false, deleted_at = now()
    where outing_id = p_outing_id and user_id = p_user_id and is_active = true;

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

-- ---------------------------------------------------------------------------
-- Restore: reverse of the above, used by Settings > Data & Backups.
-- ---------------------------------------------------------------------------
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
