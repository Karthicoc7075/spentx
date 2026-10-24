-- Migration: 20261012_goal_investment_sync.sql
-- Synchronizes Goals and Investments when linked transactions are created, updated, or deleted.
-- Ensures category "Goal" is available and locks/syncs data models cleanly.

-- ---------------------------------------------------------------------------
-- 1. Ensure "Goal" category exists for all users
-- ---------------------------------------------------------------------------
insert into public.categories (user_id, name, type, color, icon, is_active, can_delete)
select u.id, 'Goal', 'expense', '#6366f1', '🎯', true, false
from auth.users u
where not exists (
  select 1 from public.categories c
  where c.user_id = u.id and lower(btrim(c.name)) in ('goal', 'savings goal') and c.deleted_at is null
);

-- Ensure global default categories include "Goal" and "Investment"
do $$
begin
  if exists (select 1 from public.global_settings where id = 'app') then
    update public.global_settings
    set default_categories = case
      when not (default_categories::text like '%"Goal"%') then
        default_categories || '[{"name": "Goal", "type": "expense", "color": "#6366f1", "icon": "🎯", "isDefault": true}]'::jsonb
      else default_categories
    end
    where id = 'app';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Enhanced Trigger: Sync Savings Goals on Transaction UPDATE & DELETE
-- ---------------------------------------------------------------------------
create or replace function public.tg_sync_goal_contributions_on_tx_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_delta numeric(14,2);
  v_goal_id uuid;
  v_tag text;
  v_found boolean := false;
  v_tx_id text;
  v_user_id uuid;
  v_tags text[];
  v_amount numeric(14,2);
begin
  v_tx_id := case when tg_op = 'DELETE' then old.id::text else coalesce(new.id::text, old.id::text) end;
  v_user_id := case when tg_op = 'DELETE' then old.user_id else coalesce(new.user_id, old.user_id) end;
  v_tags := case when tg_op = 'DELETE' then old.tags else coalesce(new.tags, old.tags) end;
  v_amount := old.total_amount;

  -- Case A: Transaction Delete, Soft-Delete, or Deactivation -> Reverse Goal Contribution
  if (tg_op = 'DELETE'
      or (new.deleted_at is not null and old.deleted_at is null)
      or (coalesce(new.is_active, true) = false and coalesce(old.is_active, true) = true)) then
    v_found := false;
    for r in
      update public.goal_contributions
         set deleted_at = now()
       where user_id = v_user_id
         and transaction_id = v_tx_id
         and deleted_at is null
      returning goal_id, amount
    loop
      v_found := true;
      update public.savings_goals
         set saved_amount = greatest(0, round(saved_amount - r.amount, 2))
       where id = r.goal_id and user_id = v_user_id;
    end loop;

    -- Fallback: if no contribution row existed, check tags for goal:<goal_id>
    if not v_found and v_tags is not null then
      foreach v_tag in array v_tags
      loop
        if v_tag like 'goal:%' then
          begin
            v_goal_id := substring(v_tag from 6)::uuid;
            update public.savings_goals
               set saved_amount = greatest(0, round(saved_amount - v_amount, 2))
             where id = v_goal_id and user_id = v_user_id;
          exception when others then
            -- Ignore malformed uuid
          end;
        end if;
      end loop;
    end if;

  -- Case B: Transaction Un-deletion -> Restore Goal Contribution
  elsif (tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null
         and coalesce(new.is_active, true) = true) then
    for r in
      update public.goal_contributions
         set deleted_at = null
       where user_id = new.user_id
         and transaction_id = new.id::text
         and deleted_at is not null
      returning goal_id, amount
    loop
      update public.savings_goals
         set saved_amount = round(saved_amount + r.amount, 2)
       where id = r.goal_id and user_id = new.user_id;
    end loop;

  -- Case C: Transaction Amount Update -> Sync Contribution & Goal Saved Amount
  elsif (tg_op = 'UPDATE' and coalesce(new.is_active, true) and new.deleted_at is null
         and old.total_amount is distinct from new.total_amount) then
    v_delta := round(new.total_amount - old.total_amount, 2);
    v_found := false;

    -- 1. Try finding contribution by transaction_id
    for r in
      update public.goal_contributions
         set amount = round(new.total_amount, 2)
       where user_id = new.user_id
         and transaction_id = new.id::text
         and deleted_at is null
      returning goal_id
    loop
      v_found := true;
      update public.savings_goals
         set saved_amount = greatest(0, round(saved_amount + v_delta, 2))
       where id = r.goal_id and user_id = new.user_id;
    end loop;

    -- 2. If no contribution found yet, check tags for goal:<goal_id>
    if not v_found and new.tags is not null then
      foreach v_tag in array new.tags
      loop
        if v_tag like 'goal:%' then
          begin
            v_goal_id := substring(v_tag from 6)::uuid;
            update public.savings_goals
               set saved_amount = greatest(0, round(saved_amount + v_delta, 2))
             where id = v_goal_id and user_id = new.user_id;
          exception when others then
            -- Ignore malformed uuid
          end;
        end if;
      end loop;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Drop old trigger if exists and attach enhanced trigger
drop trigger if exists transactions_reverse_goal_contributions on public.transactions;
drop trigger if exists transactions_sync_goal_contributions on public.transactions;

create trigger transactions_sync_goal_contributions
  after update or delete on public.transactions
  for each row execute function public.tg_sync_goal_contributions_on_tx_change();


-- ---------------------------------------------------------------------------
-- 3. Trigger: Sync Investments on Transaction UPDATE & DELETE
-- ---------------------------------------------------------------------------
create or replace function public.tg_sync_investments_on_tx_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric(14,2);
  v_inv_id uuid;
  v_tag text;
  v_tx_id text;
  v_user_id uuid;
  v_tags text[];
  v_amount numeric(14,2);
  v_matched_id uuid := null;
begin
  v_tx_id := case when tg_op = 'DELETE' then old.id::text else coalesce(new.id::text, old.id::text) end;
  v_user_id := case when tg_op = 'DELETE' then old.user_id else coalesce(new.user_id, old.user_id) end;
  v_tags := case when tg_op = 'DELETE' then old.tags else coalesce(new.tags, old.tags) end;
  v_amount := old.total_amount;

  -- Case A: Transaction Delete, Soft-Delete, or Deactivation -> Reduce Holding Invested Amount
  if (tg_op = 'DELETE'
      or (new.deleted_at is not null and old.deleted_at is null)
      or (coalesce(new.is_active, true) = false and coalesce(old.is_active, true) = true)) then

    v_matched_id := null;

    -- Match by source_transaction_ids
    update public.investments
       set invested_amount = greatest(0, round(invested_amount - v_amount, 2)),
           current_value = greatest(0, round(current_value - v_amount, 2)),
           source_transaction_ids = array_remove(source_transaction_ids, v_tx_id)
     where user_id = v_user_id
       and v_tx_id = any(source_transaction_ids)
       and deleted_at is null
     returning id into v_matched_id;

    -- Match by investment:<id> tag ONLY if no holding was matched by source_transaction_ids
    if v_matched_id is null and v_tags is not null then
      foreach v_tag in array v_tags
      loop
        if v_tag like 'investment:%' then
          begin
            v_inv_id := substring(v_tag from 12)::uuid;
            update public.investments
               set invested_amount = greatest(0, round(invested_amount - v_amount, 2)),
                   current_value = greatest(0, round(current_value - v_amount, 2)),
                   source_transaction_ids = array_remove(source_transaction_ids, v_tx_id)
             where id = v_inv_id
               and user_id = v_user_id
               and deleted_at is null;
          exception when others then
            -- Ignore malformed uuid
          end;
        end if;
      end loop;
    end if;

  -- Case B: Transaction Amount Update -> Sync Holding Invested Amount
  elsif (tg_op = 'UPDATE' and coalesce(new.is_active, true) and new.deleted_at is null
         and old.total_amount is distinct from new.total_amount) then
    v_delta := round(new.total_amount - old.total_amount, 2);
    v_matched_id := null;

    -- Match by source_transaction_ids
    update public.investments
       set invested_amount = greatest(0, round(invested_amount + v_delta, 2)),
           current_value = greatest(0, round(current_value + v_delta, 2))
     where user_id = new.user_id
       and new.id::text = any(source_transaction_ids)
       and deleted_at is null
     returning id into v_matched_id;

    -- Match by investment:<id> tag ONLY if no holding was matched by source_transaction_ids
    if v_matched_id is null and new.tags is not null then
      foreach v_tag in array new.tags
      loop
        if v_tag like 'investment:%' then
          begin
            v_inv_id := substring(v_tag from 12)::uuid;
            update public.investments
               set invested_amount = greatest(0, round(invested_amount + v_delta, 2)),
                   current_value = greatest(0, round(current_value + v_delta, 2))
             where id = v_inv_id
               and user_id = new.user_id
               and deleted_at is null;
          exception when others then
            -- Ignore malformed uuid
          end;
        end if;
      end loop;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists transactions_sync_investments on public.transactions;
create trigger transactions_sync_investments
  after update or delete on public.transactions
  for each row execute function public.tg_sync_investments_on_tx_change();
