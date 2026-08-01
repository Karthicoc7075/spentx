-- Align default purposes with the mobile app:
--   Personal  — always on (is_default, can_delete=false, is_active=true)
--   Family    — toggleable (can_delete=false, is_active starts true; user can turn off)
--
-- Also backfill Family for existing workspaces that only have Personal.

-- ---------------------------------------------------------------------------
-- 1. Seed Family for every user who does not already have a Family purpose
--    (match by lower(name) so "Family" / "family" / "Home/Family" are not
--    duplicated — Home/Family is treated as the legacy Family label).
-- ---------------------------------------------------------------------------
insert into public.purposes (user_id, name, color, is_default, can_delete, is_active)
select
  u.id,
  'Family',
  '#14B8A6',
  false,
  false,
  true
from public.users u
where not exists (
  select 1
  from public.purposes p
  where p.user_id = u.id
    and lower(trim(p.name)) in ('family', 'home/family', 'home')
);

-- Personal must remain non-deletable default when present.
update public.purposes
set
  is_default = true,
  can_delete = false,
  is_active = true
where lower(trim(name)) = 'personal';

-- Family (and legacy Home labels) stay non-deletable but toggleable via is_active.
update public.purposes
set
  can_delete = false,
  is_default = false
where lower(trim(name)) in ('family', 'home/family', 'home');

-- Prefer the canonical name "Family" for mobile name-sync.
update public.purposes
set name = 'Family', color = coalesce(nullif(color, ''), '#14B8A6')
where lower(trim(name)) in ('home/family', 'home');

-- ---------------------------------------------------------------------------
-- 2. New-user trigger: create Personal + Family on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_purpose_id uuid;
  v_family_purpose_id uuid;
  v_cash_account_id uuid;
  v_bank_account_id uuid;
begin
  insert into public.users (
    id, name, email, theme, notifications, monthly_safe_spending_alert, private_mode
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    'dark',
    true,
    true,
    false
  );

  insert into public.purposes (user_id, name, color, is_default, can_delete, is_active)
  values (new.id, 'Personal', '#8b7ff0', true, false, true)
  returning id into v_purpose_id;

  -- Mobile default: Family is present and can be turned off in Settings.
  insert into public.purposes (user_id, name, color, is_default, can_delete, is_active)
  values (new.id, 'Family', '#14B8A6', false, false, true)
  returning id into v_family_purpose_id;

  insert into public.accounts (user_id, name, type, is_default, can_delete)
  values (new.id, 'Cash', 'cash', true, false)
  returning id into v_cash_account_id;

  insert into public.accounts (user_id, name, type, is_default, can_delete, needs_rename)
  values (new.id, 'Account 1', 'bank', false, true, true)
  returning id into v_bank_account_id;

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
