-- ROLLBACK for supabase/migrations/20261011_security_audit_fixes.sql  (Phase S5b companion)
-- Generated from a READ-ONLY catalog capture of live (project vdhayvlweuglpvzweunq)
-- with supabase/migration-checks/capture_rollback.sql on 2026-10-21 ~14:00 IST.
--
-- STATUS on live (checked 2026-10-21 ~14:00 IST): ALREADY APPLIED (its objects exist).
-- No capture existed before it ran, so this file cannot rebuild the state
-- from before 2026-10-11. It restores the definitions captured from live on
-- 2026-10-21 ~14:00 IST — use it if a re-run or an edit of this migration changes them.
-- To go further back, restore from the pg_dump backup (supabase/backup/RESTORE.md).
-- Tables/columns this migration added are NOT dropped here (that loses data);
-- see the commented section at the end.
--
-- BEFORE running: take a backup (supabase/backup/backup.sh) and run
-- precheck.sql. If its fingerprint differs from the one below, this file
-- is stale: re-run capture_rollback.sql and regenerate it.
--   function fingerprint at capture: a4fc301f9b5a8c22eb5b43aa01ce74f3 (9 functions)
-- AFTER running: run supabase/backup/verify.sql and compare data_md5.

begin;
set local search_path = public, extensions;


-- ---- 1. Functions (exact captured bodies)
CREATE OR REPLACE FUNCTION public.admin_user_spend_amount(p_user_id uuid, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce((
      select sum(tx.total_amount)::numeric
      from public.transactions tx
      where tx.user_id = p_user_id
        and tx.type = 'expense'
        and public.admin_tx_is_confirmed(tx)
        and not coalesce(public.is_outing_rollup_transaction(tx), false)
        and not coalesce(public.is_transfer_transaction(tx), false)
        and public.admin_tx_first_category(tx.id) not in ('opening balance', 'settlements', 'settlement', 'transfer')
        and (p_from is null or tx.transaction_date >= p_from)
    ), 0)
    + coalesce((
      select sum(oe.amount)::numeric
      from public.outing_expenses oe
      where oe.user_id = p_user_id
        and oe.is_active = true
        and oe.deleted_at is null
        and oe.linked_transaction_id is null
        and coalesce(oe.source, '') is distinct from 'bank-detected'
        and (p_from is null or (oe.expense_date is not null and oe.expense_date >= p_from))
    ), 0);
$function$
;

CREATE OR REPLACE FUNCTION public.cascade_delete_friend(p_friend_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.cascade_delete_outing(p_outing_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.purge_expired_deleted_outings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.restore_deleted_outing(p_outing_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.spentx_caller_may_act_for(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.spentx_ist_month_key(p_ts timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select to_char(p_ts at time zone 'Asia/Kolkata', 'YYYY-MM')
$function$
;

CREATE OR REPLACE FUNCTION public.tg_reverse_goal_contributions_on_tx_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.tg_transactions_ist_month_key()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.transaction_date is not null then
    new.month_key := public.spentx_ist_month_key(new.transaction_date);
  end if;
  return new;
end;
$function$
;


-- ---- 2. Function grants
revoke all on function public.admin_user_spend_amount(p_user_id uuid, p_from timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.admin_user_spend_amount(p_user_id uuid, p_from timestamp with time zone) to service_role;

revoke all on function public.cascade_delete_friend(p_friend_id uuid, p_user_id uuid) from public, anon, authenticated, service_role; grant execute on function public.cascade_delete_friend(p_friend_id uuid, p_user_id uuid) to authenticated; grant execute on function public.cascade_delete_friend(p_friend_id uuid, p_user_id uuid) to service_role;

revoke all on function public.cascade_delete_outing(p_outing_id uuid, p_user_id uuid) from public, anon, authenticated, service_role; grant execute on function public.cascade_delete_outing(p_outing_id uuid, p_user_id uuid) to authenticated; grant execute on function public.cascade_delete_outing(p_outing_id uuid, p_user_id uuid) to service_role;

revoke all on function public.purge_expired_deleted_outings() from public, anon, authenticated, service_role; grant execute on function public.purge_expired_deleted_outings() to authenticated; grant execute on function public.purge_expired_deleted_outings() to service_role;

revoke all on function public.restore_deleted_outing(p_outing_id uuid, p_user_id uuid) from public, anon, authenticated, service_role; grant execute on function public.restore_deleted_outing(p_outing_id uuid, p_user_id uuid) to authenticated; grant execute on function public.restore_deleted_outing(p_outing_id uuid, p_user_id uuid) to service_role;

revoke all on function public.spentx_caller_may_act_for(p_user_id uuid) from public, anon, authenticated, service_role; grant execute on function public.spentx_caller_may_act_for(p_user_id uuid) to authenticated; grant execute on function public.spentx_caller_may_act_for(p_user_id uuid) to anon; grant execute on function public.spentx_caller_may_act_for(p_user_id uuid) to service_role; grant execute on function public.spentx_caller_may_act_for(p_user_id uuid) to public;

revoke all on function public.spentx_ist_month_key(p_ts timestamp with time zone) from public, anon, authenticated, service_role; grant execute on function public.spentx_ist_month_key(p_ts timestamp with time zone) to authenticated; grant execute on function public.spentx_ist_month_key(p_ts timestamp with time zone) to anon; grant execute on function public.spentx_ist_month_key(p_ts timestamp with time zone) to service_role; grant execute on function public.spentx_ist_month_key(p_ts timestamp with time zone) to public;

revoke all on function public.tg_reverse_goal_contributions_on_tx_delete() from public, anon, authenticated, service_role; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to authenticated; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to anon; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to service_role; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to public;

revoke all on function public.tg_transactions_ist_month_key() from public, anon, authenticated, service_role; grant execute on function public.tg_transactions_ist_month_key() to authenticated; grant execute on function public.tg_transactions_ist_month_key() to anon; grant execute on function public.tg_transactions_ist_month_key() to service_role; grant execute on function public.tg_transactions_ist_month_key() to public;


-- ---- 3. Triggers
drop trigger if exists transactions_ist_month_key on transactions; CREATE TRIGGER transactions_ist_month_key BEFORE INSERT OR UPDATE OF transaction_date, month_key ON public.transactions FOR EACH ROW EXECUTE FUNCTION tg_transactions_ist_month_key();


-- ---- 4. Row level security
alter table public.goal_contributions enable row level security;

alter table public.share_access_logs enable row level security;


-- ---- 5. Policies
drop policy if exists goal_contributions_select_own on public.goal_contributions; create policy goal_contributions_select_own on public.goal_contributions as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));

drop policy if exists share_access_logs_select_owner on public.share_access_logs; create policy share_access_logs_select_owner on public.share_access_logs as PERMISSIVE for SELECT to public using ((owner_id = auth.uid()));


-- ---- 7. Table grants
revoke all on public.goal_contributions from anon, authenticated; grant maintain on public.goal_contributions to authenticated; grant references on public.goal_contributions to authenticated; grant select on public.goal_contributions to authenticated; grant trigger on public.goal_contributions to authenticated; grant truncate on public.goal_contributions to authenticated;

revoke all on public.share_access_logs from anon, authenticated; grant maintain on public.share_access_logs to anon; grant references on public.share_access_logs to anon; grant select on public.share_access_logs to anon; grant trigger on public.share_access_logs to anon; grant truncate on public.share_access_logs to anon; grant delete on public.share_access_logs to authenticated; grant insert on public.share_access_logs to authenticated; grant maintain on public.share_access_logs to authenticated; grant references on public.share_access_logs to authenticated; grant select on public.share_access_logs to authenticated; grant trigger on public.share_access_logs to authenticated; grant truncate on public.share_access_logs to authenticated; grant update on public.share_access_logs to authenticated;

commit;

-- ---- Objects this migration CREATED (not dropped; uncomment only with a
-- verified backup and only if the app no longer needs them):
-- alter table public.goal_contributions drop column if exists reversed_at;   -- DATA LOSS
-- drop trigger if exists transactions_ist_month_key on public.transactions;
-- drop function if exists public.spentx_caller_may_act_for(uuid);
-- NOTE: transactions_reverse_goal_contributions is intentionally ABSENT on live
-- (dropped by 20261012_goal_investment_sync.sql). Do not re-run this file
-- without re-running 20261012_goal_investment_sync.sql afterwards.
