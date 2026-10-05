-- Migration: Stop seeding placeholder "Account 1" on user signup and purge unused placeholders
-- Date: 2026-10-05

-- 1. Redefine handle_new_user trigger function to ONLY seed Cash, Personal, Family, and Me
create or replace function public.handle_new_user()
returns trigger as $$
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
$$ language plpgsql security definer;

-- 2. Delete any existing placeholder "Account 1" records that have no transactions
delete from public.accounts a
where a.name = 'Account 1'
  and not exists (
    select 1 from public.transactions t
    where t.account_id = a.id
  );
