-- Detection v2 Phase 5: Savings / Current for bank accounts.
--
-- Additive and non-destructive: one nullable column. Existing rows stay
-- NULL, which the app reads as Savings. accounts_type_check is unchanged
-- (type stays bank / cash / wallet / credit). Apps that predate this column
-- keep working; the new app strips bank_subtype and retries when the
-- column is missing (42703 / PGRST204).
--
-- Run manually in the Supabase SQL editor. Safe to re-run.

alter table public.accounts
  add column if not exists bank_subtype text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_bank_subtype_check'
      and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts
      add constraint accounts_bank_subtype_check
      check (bank_subtype is null or bank_subtype in ('savings', 'current'));
  end if;
end $$;

comment on column public.accounts.bank_subtype is
  'Bank accounts only: savings | current. NULL = savings (older rows).';
