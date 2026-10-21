-- ROLLBACK for supabase/migrations/20261021_signup_phone.sql  (Phase S5b companion)
-- Generated from a READ-ONLY catalog capture of live (project vdhayvlweuglpvzweunq)
-- with supabase/migration-checks/capture_rollback.sql on 2026-10-21 ~14:00 IST.
--
-- STATUS on live (checked 2026-10-21 ~14:00 IST): NOT applied yet. handle_new_user() has no
-- phone column and no search_path pin.
-- This rollback = the exact live definition BEFORE the migration + undo of
-- the phone backfill.
--
-- BEFORE running: take a backup (supabase/backup/backup.sh) and run
-- precheck.sql. If its fingerprint differs from the one below, this file
-- is stale: re-run capture_rollback.sql and regenerate it.
--   function fingerprint at capture: e12d924d90746b59a876246eb6a9b11e (1 functions)
-- AFTER running: run supabase/backup/verify.sql and compare data_md5.

begin;
set local search_path = public, extensions;


-- ---- 1. Functions (exact captured bodies)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_purpose_id uuid;
  v_family_purpose_id uuid;
  v_cash_account_id uuid;
begin
  insert into public.users (
    id, name, email, theme, notifications, monthly_safe_spending_alert,
    private_mode, setup_completed
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    'dark',
    true,
    true,
    false,
    false
  );

  insert into public.purposes (user_id, name, color, is_default, can_delete, is_active)
  values (new.id, 'Personal', '#8b7ff0', true, false, true)
  returning id into v_purpose_id;

  -- Mobile default: Family is present and can be turned off in Settings.
  insert into public.purposes (user_id, name, color, is_default, can_delete, is_active)
  values (new.id, 'Family', '#14B8A6', false, false, true)
  returning id into v_family_purpose_id;

  -- Universal default account: Cash only (real bank accounts are added during onboarding)
  insert into public.accounts (user_id, name, type, is_default, can_delete)
  values (new.id, 'Cash', 'cash', true, false)
  returning id into v_cash_account_id;

  update public.users set default_account_id = v_cash_account_id where id = new.id;

  insert into public.contributors (user_id, name, is_default, can_delete)
  values (new.id, 'Me', true, false);

  insert into public.budget_templates (
    user_id, template_name, expected_income, allocations, is_default
  )
  values (new.id, 'Default Budget', 0, '[]'::jsonb, true);

  return new;
end;
$function$
;


-- ---- 2. Function grants
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role; grant execute on function public.handle_new_user() to authenticated; grant execute on function public.handle_new_user() to anon; grant execute on function public.handle_new_user() to service_role; grant execute on function public.handle_new_user() to public;


-- ---- 8. Undo the one-off phone backfill
-- Safe only because NO user had a phone before this migration (precheck.sql
-- asserts phone_set = 0). It clears exactly the phones copied from signup
-- metadata; a phone typed later in the app that differs is kept.
update public.users pu
set phone = null
from (
  select au.id,
         nullif(regexp_replace(coalesce(au.raw_user_meta_data->>'phone', ''),
                '[[:space:]().-]', '', 'g'), '') as phone
  from auth.users au
) as cleaned
where pu.id = cleaned.id
  and cleaned.phone is not null
  and pu.phone = cleaned.phone;

commit;
