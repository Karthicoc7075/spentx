-- Migration: 20261011_security_audit_fixes.sql
-- Fixes from the 2026-10-11 app + website audit. Safe to run more than once.
-- Run AFTER 20261011_investments_goals.sql (section 4 needs goal_contributions;
-- it is skipped with a notice when that table does not exist yet).
--
--  1. impersonation_* RPCs: service role only (audit #1).
--  2. cascade_delete_outing / restore_deleted_outing / cascade_delete_friend:
--     caller must be p_user_id (audit #2). Signatures unchanged.
--  3. purge_expired_deleted_outings: no outing_members, no anon; a signed-in
--     caller only purges their own expired outings (audit #16).
--  4. goal_contributions: written only through the RPCs; restoring a
--     transaction re-applies the goal deposit its deletion reversed (audit #17).
--  5. admin_user_spend_amount: not callable by clients (audit #19).
--  6. share_access_logs: drop the "insert anything" policy (audit #20).
--     Share views are logged by the website server (service role) and the
--     token-checked log_shared_page_view() RPC, neither of which needs it.
--  7. transactions.month_key = India (Asia/Kolkata) calendar month of
--     transaction_date, enforced by trigger + one-time backfill (audit #15).
--  8. budget_templates / smart_views: deleted_at for soft delete.

-- ---------------------------------------------------------------------------
-- 0. Helper: is the caller allowed to act for p_user_id?
--    Signed-in user acting on themselves, the service role, or a direct
--    database session (SQL editor / migrations, no JWT at all).
-- ---------------------------------------------------------------------------
create or replace function public.spentx_caller_may_act_for(p_user_id uuid)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    case when v_claims is not null then v_claims::jsonb ->> 'role' end
  );
begin
  if v_role = 'service_role' then
    return true;
  end if;
  if v_role is null and v_claims is null
     and nullif(current_setting('request.jwt.claim.sub', true), '') is null then
    return true; -- direct DB session, no API request
  end if;
  return p_user_id is not null and auth.uid() is not null and p_user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. impersonation_* : service role only (every overload)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'impersonation\_%'
  loop
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', r.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', r.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Owner checks on the soft-delete / restore RPCs (same signatures)
-- ---------------------------------------------------------------------------
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
  if not public.spentx_caller_may_act_for(p_user_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.friends
    set is_active = false,
        deleted_at = now(),
        deleted_by = p_user_id
    where id = p_friend_id
      and user_id = p_user_id;
end;
$$;

create or replace function public.cascade_delete_outing(p_outing_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.spentx_caller_may_act_for(p_user_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.transactions
    set is_active = false, deleted_at = now()
    where outing_id = p_outing_id and user_id = p_user_id and is_active = true;

  update public.transactions t
    set is_active = false, deleted_at = now()
    from public.outing_expenses oe
    where oe.outing_id = p_outing_id
      and oe.user_id = p_user_id
      and oe.linked_transaction_id = t.id
      and t.user_id = p_user_id
      and t.is_active = true;

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

create or replace function public.restore_deleted_outing(p_outing_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.spentx_caller_may_act_for(p_user_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.transactions
    set is_active = true, deleted_at = null
    where outing_id = p_outing_id and user_id = p_user_id and is_active = false;

  update public.transactions t
    set is_active = true, deleted_at = null
    from public.outing_expenses oe
    where oe.outing_id = p_outing_id
      and oe.user_id = p_user_id
      and oe.linked_transaction_id = t.id
      and t.user_id = p_user_id
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

revoke all on function public.cascade_delete_friend(uuid, uuid) from public, anon;
revoke all on function public.cascade_delete_outing(uuid, uuid) from public, anon;
revoke all on function public.restore_deleted_outing(uuid, uuid) from public, anon;
grant execute on function public.cascade_delete_friend(uuid, uuid) to authenticated, service_role;
grant execute on function public.cascade_delete_outing(uuid, uuid) to authenticated, service_role;
grant execute on function public.restore_deleted_outing(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. purge_expired_deleted_outings
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_deleted_outings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_all boolean := public.spentx_caller_may_act_for(null);
  expired_outing_ids uuid[];
begin
  if not v_all and v_uid is null then
    return; -- anonymous callers purge nothing
  end if;

  select array_agg(id) into expired_outing_ids
  from public.outings
  where is_active = false
    and deleted_at is not null
    and deleted_at < now() - interval '7 days'
    and (v_all or user_id = v_uid);

  if expired_outing_ids is null or array_length(expired_outing_ids, 1) is null then
    return;
  end if;

  delete from public.transactions
  where outing_id = any(expired_outing_ids)
    and is_active = false;

  delete from public.outing_expenses
  where outing_id = any(expired_outing_ids);

  delete from public.settlements
  where outing_id = any(expired_outing_ids);

  delete from public.outings
  where id = any(expired_outing_ids);
end;
$$;

revoke all on function public.purge_expired_deleted_outings() from public, anon;
grant execute on function public.purge_expired_deleted_outings() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. goal_contributions: RPC-only writes + restore handling
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.goal_contributions') is null then
    raise notice 'goal_contributions missing: run 20261011_investments_goals.sql first, then re-run this file';
    return;
  end if;

  execute 'alter table public.goal_contributions add column if not exists reversed_at timestamptz';

  -- Clients read only; the RPCs and the transaction trigger write.
  execute 'drop policy if exists "goal_contributions_insert_own" on public.goal_contributions';
  execute 'drop policy if exists "goal_contributions_update_own" on public.goal_contributions';
  execute 'revoke insert, update, delete on public.goal_contributions from authenticated';
  execute 'revoke all on public.goal_contributions from anon';
  execute 'grant select on public.goal_contributions to authenticated';

  -- Bodies already filter every row by auth.uid(); definer lets them write
  -- now that clients cannot.
  execute 'alter function public.add_goal_contribution(uuid, numeric, uuid, text, text, text) security definer';
  execute 'alter function public.add_goal_contribution(uuid, numeric, uuid, text, text, text) set search_path = public';
  execute 'alter function public.remove_goal_contribution(uuid) security definer';
  execute 'alter function public.remove_goal_contribution(uuid) set search_path = public';

  execute $f$
create or replace function public.tg_reverse_goal_contributions_on_tx_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
declare
  r record;
  v_was_live boolean := old.deleted_at is null and coalesce(old.is_active, true);
  v_is_live boolean := new.deleted_at is null and coalesce(new.is_active, true);
begin
  if v_was_live and not v_is_live then
    -- Deleted: reverse each live deposit funded by this transaction.
    for r in
      update public.goal_contributions
         set deleted_at = now(), reversed_at = now()
       where user_id = new.user_id
         and transaction_id = new.id::text
         and deleted_at is null
      returning goal_id, amount
    loop
      update public.savings_goals
         set saved_amount = greatest(0, round(saved_amount - r.amount, 2))
       where id = r.goal_id and user_id = new.user_id;
    end loop;
  elsif v_is_live and not v_was_live then
    -- Restored: re-apply only deposits this trigger reversed (not ones the
    -- user removed on purpose).
    for r in
      update public.goal_contributions
         set deleted_at = null, reversed_at = null
       where user_id = new.user_id
         and transaction_id = new.id::text
         and deleted_at is not null
         and reversed_at is not null
      returning goal_id, amount
    loop
      update public.savings_goals
         set saved_amount = greatest(0, round(saved_amount + r.amount, 2))
       where id = r.goal_id and user_id = new.user_id;
    end loop;
  end if;
  return new;
end;
$body$
$f$;

  execute 'drop trigger if exists transactions_reverse_goal_contributions on public.transactions';
  execute 'create trigger transactions_reverse_goal_contributions
    after update of deleted_at, is_active on public.transactions
    for each row execute function public.tg_reverse_goal_contributions_on_tx_delete()';
end $$;

-- ---------------------------------------------------------------------------
-- 5. admin_user_spend_amount: only reachable through the admin_* functions
--    (security definer, owner-executed), never directly by clients.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.admin_user_spend_amount(uuid, timestamptz)') is not null then
    revoke all on function public.admin_user_spend_amount(uuid, timestamptz) from public;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      revoke all on function public.admin_user_spend_amount(uuid, timestamptz) from anon;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      revoke all on function public.admin_user_spend_amount(uuid, timestamptz) from authenticated;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. share_access_logs: no open insert policy
-- ---------------------------------------------------------------------------
drop policy if exists "share_access_logs_insert_any" on public.share_access_logs;
revoke insert, update, delete on public.share_access_logs from anon;

-- ---------------------------------------------------------------------------
-- 7. month_key = India calendar month of transaction_date
-- ---------------------------------------------------------------------------
create or replace function public.spentx_ist_month_key(p_ts timestamptz)
returns text
language sql
immutable
as $$
  select to_char(p_ts at time zone 'Asia/Kolkata', 'YYYY-MM')
$$;

create or replace function public.tg_transactions_ist_month_key()
returns trigger
language plpgsql
as $$
begin
  if new.transaction_date is not null then
    new.month_key := public.spentx_ist_month_key(new.transaction_date);
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_ist_month_key on public.transactions;
create trigger transactions_ist_month_key
  before insert or update of transaction_date, month_key on public.transactions
  for each row execute function public.tg_transactions_ist_month_key();

-- One-time backfill: only rows whose key differs (created 00:00–05:29 IST on
-- the 1st, or older UTC-based keys). Re-running finds nothing to change.
update public.transactions
   set month_key = public.spentx_ist_month_key(transaction_date)
 where transaction_date is not null
   and month_key is distinct from public.spentx_ist_month_key(transaction_date);

-- ---------------------------------------------------------------------------
-- 8. Soft delete for budget templates and smart views (app + web now set
--    deleted_at instead of deleting the row, and hide such rows).
-- ---------------------------------------------------------------------------
alter table if exists public.budget_templates add column if not exists deleted_at timestamptz;
alter table if exists public.smart_views add column if not exists deleted_at timestamptz;
