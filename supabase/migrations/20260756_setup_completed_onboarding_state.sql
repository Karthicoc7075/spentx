-- Onboarding state becomes ACCOUNT state, not device state or an inference.
--
-- Until now "has this user finished setup?" was answered three different ways,
-- none of them authoritative:
--
--   * mobile  — AuthService.accountHasExistingData(): counted rows and guessed
--               ("more than 1 purpose ⇒ already onboarded"). That guess broke
--               the moment 20260724_default_family_purpose.sql started seeding
--               BOTH Personal and Family, so every brand-new account already
--               had 2 purposes and mobile skipped onboarding entirely.
--   * web     — users.show_bank_onboarding plus name-matching against a
--               hardcoded list of seeded account/purpose names.
--   * device  — Hive `has_seen_onboarding`, which cannot survive a reinstall
--               and does not belong to the account at all.
--
-- Counting seeded rows can never answer this question: handle_new_user creates
-- purposes, accounts, a contributor and a budget template for every signup, so
-- "has data" is true from the first millisecond of an account's life. The only
-- reliable answer is an explicit flag the app sets when setup actually
-- finishes.
--
-- This also fixes the delete-and-re-signup case. Deleting a user cascades from
-- auth.users, so signing up again with the same email produces a NEW user id
-- and a NEW public.users row — which now starts at setup_completed = false and
-- therefore gets a genuinely fresh onboarding. Nothing about the old account's
-- state can leak into the new one, because none of it survives the delete.

-- ============================================================================
-- 1. The column
-- ============================================================================

-- Defaults to false so any row created from here on is treated as "needs
-- setup" until the app says otherwise. Step 2 immediately corrects the
-- existing rows this default would otherwise mislabel.
alter table public.users
  add column if not exists setup_completed boolean not null default false;

comment on column public.users.setup_completed is
  'True once the user has finished first-run onboarding (account count, '
  'account details, purpose types). The single source of truth for whether '
  'onboarding runs, shared by web and mobile. Never inferred from row counts: '
  'handle_new_user seeds purposes/accounts, so a fresh account always "has '
  'data". Set false at creation, true by completeOnboardingSetup().';

-- ============================================================================
-- 2. Backfill — existing users must not be sent back through onboarding
-- ============================================================================

-- Every pre-existing row got `false` from the default above, which would
-- re-onboard the entire user base on next open. Mark an account complete when
-- there is real evidence it has been used beyond the signup seed. The tests
-- mirror the two heuristics being retired, applied once, here, rather than on
-- every app launch forever.
update public.users u
set setup_completed = true
where u.setup_completed = false
  and (
    -- Web already recorded an explicit answer: the flag is only cleared when
    -- onboarding was completed or deliberately skipped.
    u.show_bank_onboarding = false

    -- Any transaction at all means the account is in real use.
    or exists (
      select 1 from public.transactions t where t.user_id = u.id
    )

    -- An account beyond the two seeded by handle_new_user ('Cash',
    -- 'Account 1') means the user added their own.
    or (
      select count(*) from public.accounts a
      where a.user_id = u.id and a.is_active = true
    ) > 2

    -- Likewise a purpose beyond the two seeded ('Personal', 'Family').
    or (
      select count(*) from public.purposes p
      where p.user_id = u.id and p.is_active = true
    ) > 2

    -- A renamed seed account is also a completed setup: onboarding is what
    -- clears needs_rename on 'Account 1'.
    or exists (
      select 1 from public.accounts a
      where a.user_id = u.id
        and a.is_active = true
        and a.type = 'bank'
        and coalesce(a.needs_rename, false) = false
    )
  );

-- ============================================================================
-- 3. New signups start incomplete
-- ============================================================================

-- handle_new_user is replaced wholesale rather than patched so the inserted
-- column list stays readable. Body is identical to
-- 20260724_default_family_purpose.sql apart from the explicit
-- setup_completed => false, which documents the intent at the one place a
-- users row is born (the column default would cover it silently).
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_purpose_id uuid;
  v_family_purpose_id uuid;
  v_cash_account_id uuid;
  v_bank_account_id uuid;
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
    -- A new auth user is always a new account, even when the email matches one
    -- that was deleted: the id differs, so nothing is being reused.
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

-- ============================================================================
-- 4. Completion RPC
-- ============================================================================

-- A user may only ever flip their OWN flag, and only forward. Exposed as an
-- RPC so web and mobile share one write path and neither needs update rights
-- on the column through a broader policy.
create or replace function public.complete_account_setup()
returns boolean as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.users
  set setup_completed = true,
      -- Keep the older web flag in step so any surface still reading it
      -- agrees with setup_completed instead of re-prompting.
      show_bank_onboarding = false,
      updated_at = now()
  where id = auth.uid();

  return true;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.complete_account_setup() from public;
grant execute on function public.complete_account_setup() to authenticated;
