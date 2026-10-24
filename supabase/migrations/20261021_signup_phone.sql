-- 2026-10-21 — signup phone reaches public.users.phone
--
-- The mobile signup stores the optional phone in auth user metadata
-- (raw_user_meta_data->>'phone', now as +91XXXXXXXXXX). handle_new_user never
-- copied it, so public.users.phone stayed NULL. This keeps the function
-- EXACTLY as it is live (users row, Personal + Family purposes, Cash default
-- account, Me contributor, Default Budget) and only:
--   1. sets users.phone from metadata (spaces/dashes/brackets/dots stripped,
--      empty -> NULL);
--   2. pins search_path = public (SECURITY DEFINER hardening).
-- Then a one-off, idempotent backfill for existing users whose phone is NULL.
--
-- Safe to run more than once. Run in the Supabase SQL editor.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_purpose_id uuid;
  v_family_purpose_id uuid;
  v_cash_account_id uuid;
begin
  insert into public.users (
    id, name, email, phone, theme, notifications, monthly_safe_spending_alert,
    private_mode, setup_completed
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    nullif(
      regexp_replace(
        coalesce(new.raw_user_meta_data->>'phone', ''),
        '[[:space:]().-]', '', 'g'
      ),
      ''
    ),
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
$function$;

-- One-off backfill: existing users who entered a phone at signup.
-- Only fills NULL/empty phones; never overwrites a phone set later.
update public.users pu
set phone = cleaned.phone
from (
  select
    au.id,
    nullif(
      regexp_replace(
        coalesce(au.raw_user_meta_data->>'phone', ''),
        '[[:space:]().-]', '', 'g'
      ),
      ''
    ) as phone
  from auth.users au
) as cleaned
where pu.id = cleaned.id
  and cleaned.phone is not null
  and (pu.phone is null or btrim(pu.phone) = '');
