-- ROLLBACK for supabase/migrations/20261011_investments_goals.sql  (Phase S5b companion)
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
--   function fingerprint at capture: 228bce5c1288d12a20ac58ffb71e0794 (8 functions)
-- AFTER running: run supabase/backup/verify.sql and compare data_md5.

begin;
set local search_path = public, extensions;


-- ---- 1. Functions (exact captured bodies)
CREATE OR REPLACE FUNCTION public.add_goal_contribution(p_goal_id uuid, p_amount numeric, p_contribution_id uuid DEFAULT NULL::uuid, p_transaction_id text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_source text DEFAULT 'web'::text)
 RETURNS savings_goals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid := coalesce(p_contribution_id, gen_random_uuid());
  v_goal public.savings_goals;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'Amount must not be zero' using errcode = '22023';
  end if;

  -- Replay of an already-applied contribution (outbox retry): no-op.
  if exists (select 1 from public.goal_contributions where id = v_id and user_id = v_uid) then
    select * into v_goal from public.savings_goals where id = p_goal_id and user_id = v_uid;
    return v_goal;
  end if;

  select * into v_goal
  from public.savings_goals
  where id = p_goal_id and user_id = v_uid and deleted_at is null and is_active
  for update;
  if not found then
    raise exception 'Goal not found' using errcode = 'P0002';
  end if;
  if v_goal.saved_amount + p_amount < 0 then
    raise exception 'Withdrawal is larger than the saved amount' using errcode = '22023';
  end if;

  insert into public.goal_contributions (id, user_id, goal_id, amount, transaction_id, note, source)
  values (v_id, v_uid, p_goal_id, round(p_amount, 2), nullif(p_transaction_id, ''), p_note,
          case when p_source in ('web','mobile') then p_source else 'web' end);

  update public.savings_goals
     set saved_amount = round(saved_amount + p_amount, 2)
   where id = p_goal_id and user_id = v_uid
  returning * into v_goal;
  return v_goal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_goal_contribution(p_contribution_id uuid)
 RETURNS savings_goals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_c public.goal_contributions;
  v_goal public.savings_goals;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  update public.goal_contributions
     set deleted_at = now()
   where id = p_contribution_id and user_id = v_uid and deleted_at is null
  returning * into v_c;
  if not found then
    return null;
  end if;
  update public.savings_goals
     set saved_amount = greatest(0, round(saved_amount - v_c.amount, 2))
   where id = v_c.goal_id and user_id = v_uid
  returning * into v_goal;
  return v_goal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spentx_investment_type(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case regexp_replace(lower(coalesce(p_raw, '')), '[^a-z]', '', 'g')
    when 'mutualfund' then 'mutual_fund'
    when 'mutualfunds' then 'mutual_fund'
    when 'mf' then 'mutual_fund'
    when 'sip' then 'mutual_fund'
    when 'stocks' then 'stocks'
    when 'stock' then 'stocks'
    when 'equity' then 'stocks'
    when 'fixeddeposit' then 'fixed_deposit'
    when 'fd' then 'fixed_deposit'
    when 'bonds' then 'bonds'
    when 'bond' then 'bonds'
    when 'gold' then 'gold'
    when 'crypto' then 'crypto'
    when 'realestate' then 'real_estate'
    when 'liquid' then 'liquid'
    else 'other'
  end
$function$
;

CREATE OR REPLACE FUNCTION public.spentx_legacy_uuid(p_user uuid, p_kind text, p_id text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_id::uuid
    else md5(p_user::text || ':' || p_kind || ':' || p_id)::uuid
  end
$function$
;

CREATE OR REPLACE FUNCTION public.spentx_try_numeric(p text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return nullif(p, '')::numeric;
exception when others then
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.spentx_try_timestamptz(p text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return p::timestamptz;
exception when others then
  return null;
end;
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

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;


-- ---- 2. Function grants
revoke all on function public.add_goal_contribution(p_goal_id uuid, p_amount numeric, p_contribution_id uuid, p_transaction_id text, p_note text, p_source text) from public, anon, authenticated, service_role; grant execute on function public.add_goal_contribution(p_goal_id uuid, p_amount numeric, p_contribution_id uuid, p_transaction_id text, p_note text, p_source text) to authenticated; grant execute on function public.add_goal_contribution(p_goal_id uuid, p_amount numeric, p_contribution_id uuid, p_transaction_id text, p_note text, p_source text) to service_role;

revoke all on function public.remove_goal_contribution(p_contribution_id uuid) from public, anon, authenticated, service_role; grant execute on function public.remove_goal_contribution(p_contribution_id uuid) to authenticated; grant execute on function public.remove_goal_contribution(p_contribution_id uuid) to service_role;

revoke all on function public.spentx_investment_type(p_raw text) from public, anon, authenticated, service_role; grant execute on function public.spentx_investment_type(p_raw text) to authenticated; grant execute on function public.spentx_investment_type(p_raw text) to anon; grant execute on function public.spentx_investment_type(p_raw text) to service_role; grant execute on function public.spentx_investment_type(p_raw text) to public;

revoke all on function public.spentx_legacy_uuid(p_user uuid, p_kind text, p_id text) from public, anon, authenticated, service_role; grant execute on function public.spentx_legacy_uuid(p_user uuid, p_kind text, p_id text) to authenticated; grant execute on function public.spentx_legacy_uuid(p_user uuid, p_kind text, p_id text) to anon; grant execute on function public.spentx_legacy_uuid(p_user uuid, p_kind text, p_id text) to service_role; grant execute on function public.spentx_legacy_uuid(p_user uuid, p_kind text, p_id text) to public;

revoke all on function public.spentx_try_numeric(p text) from public, anon, authenticated, service_role; grant execute on function public.spentx_try_numeric(p text) to authenticated; grant execute on function public.spentx_try_numeric(p text) to anon; grant execute on function public.spentx_try_numeric(p text) to service_role; grant execute on function public.spentx_try_numeric(p text) to public;

revoke all on function public.spentx_try_timestamptz(p text) from public, anon, authenticated, service_role; grant execute on function public.spentx_try_timestamptz(p text) to authenticated; grant execute on function public.spentx_try_timestamptz(p text) to anon; grant execute on function public.spentx_try_timestamptz(p text) to service_role; grant execute on function public.spentx_try_timestamptz(p text) to public;

revoke all on function public.tg_reverse_goal_contributions_on_tx_delete() from public, anon, authenticated, service_role; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to authenticated; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to anon; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to service_role; grant execute on function public.tg_reverse_goal_contributions_on_tx_delete() to public;

revoke all on function public.touch_updated_at() from public, anon, authenticated, service_role; grant execute on function public.touch_updated_at() to authenticated; grant execute on function public.touch_updated_at() to anon; grant execute on function public.touch_updated_at() to service_role; grant execute on function public.touch_updated_at() to public;


-- ---- 3. Triggers
drop trigger if exists investments_touch_updated_at on investments; CREATE TRIGGER investments_touch_updated_at BEFORE INSERT OR UPDATE ON public.investments FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

drop trigger if exists tr_savings_goals_touch on savings_goals; CREATE TRIGGER tr_savings_goals_touch BEFORE INSERT OR UPDATE ON public.savings_goals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ---- 4. Row level security
alter table public.goal_contributions enable row level security;

alter table public.investments enable row level security;


-- ---- 5. Policies
drop policy if exists goal_contributions_select_own on public.goal_contributions; create policy goal_contributions_select_own on public.goal_contributions as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));

drop policy if exists investments_insert_own on public.investments; create policy investments_insert_own on public.investments as PERMISSIVE for INSERT to public with check ((user_id = auth.uid()));

drop policy if exists investments_select_own on public.investments; create policy investments_select_own on public.investments as PERMISSIVE for SELECT to public using ((user_id = auth.uid()));

drop policy if exists investments_update_own on public.investments; create policy investments_update_own on public.investments as PERMISSIVE for UPDATE to public using ((user_id = auth.uid())) with check ((user_id = auth.uid()));


-- ---- 6. Constraints
alter table accounts drop constraint if exists accounts_type_check; alter table accounts add constraint accounts_type_check CHECK ((type = ANY (ARRAY['bank'::text, 'cash'::text, 'wallet'::text, 'credit'::text]))) NOT VALID;

alter table goal_contributions drop constraint if exists goal_contributions_amount_check; alter table goal_contributions add constraint goal_contributions_amount_check CHECK ((amount <> (0)::numeric));

alter table goal_contributions drop constraint if exists goal_contributions_source_check; alter table goal_contributions add constraint goal_contributions_source_check CHECK ((source = ANY (ARRAY['web'::text, 'mobile'::text, 'migration'::text])));

alter table investments drop constraint if exists investments_amounts_check; alter table investments add constraint investments_amounts_check CHECK (((invested_amount >= (0)::numeric) AND (current_value >= (0)::numeric)));

alter table investments drop constraint if exists investments_name_check; alter table investments add constraint investments_name_check CHECK ((length(btrim(name)) > 0));

alter table investments drop constraint if exists investments_type_check; alter table investments add constraint investments_type_check CHECK ((type = ANY (ARRAY['mutual_fund'::text, 'stocks'::text, 'fixed_deposit'::text, 'bonds'::text, 'gold'::text, 'crypto'::text, 'real_estate'::text, 'liquid'::text, 'other'::text])));

alter table savings_goals drop constraint if exists savings_goals_saved_nonnegative; alter table savings_goals add constraint savings_goals_saved_nonnegative CHECK ((saved_amount >= (0)::numeric)) NOT VALID;

alter table savings_goals drop constraint if exists savings_goals_target_positive; alter table savings_goals add constraint savings_goals_target_positive CHECK ((target_amount > (0)::numeric)) NOT VALID;


-- ---- 7. Table grants
revoke all on public.goal_contributions from anon, authenticated; grant maintain on public.goal_contributions to authenticated; grant references on public.goal_contributions to authenticated; grant select on public.goal_contributions to authenticated; grant trigger on public.goal_contributions to authenticated; grant truncate on public.goal_contributions to authenticated;

revoke all on public.investment_totals from anon, authenticated; grant delete on public.investment_totals to authenticated; grant insert on public.investment_totals to authenticated; grant maintain on public.investment_totals to authenticated; grant references on public.investment_totals to authenticated; grant select on public.investment_totals to authenticated; grant trigger on public.investment_totals to authenticated; grant truncate on public.investment_totals to authenticated; grant update on public.investment_totals to authenticated;

revoke all on public.investments from anon, authenticated; grant delete on public.investments to authenticated; grant insert on public.investments to authenticated; grant maintain on public.investments to authenticated; grant references on public.investments to authenticated; grant select on public.investments to authenticated; grant trigger on public.investments to authenticated; grant truncate on public.investments to authenticated; grant update on public.investments to authenticated;

commit;

-- ---- Objects this migration CREATED (not dropped; uncomment only with a
-- verified backup and only if the app no longer needs them):
-- drop view if exists public.investment_totals;
-- drop table if exists public.goal_contributions;   -- DATA LOSS
-- drop table if exists public.investments;          -- DATA LOSS
-- alter table public.savings_goals drop column if exists is_active, drop column if exists deleted_at,
--   drop column if exists target_date, drop column if exists color, drop column if exists icon;  -- DATA LOSS
