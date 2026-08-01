-- Persist which account paid an outing expense (manual cash/bank pick).
-- Mobile already stores accountId (name) + paymentMode locally; sync maps here.

alter table public.outing_expenses
  add column if not exists account_name text,
  add column if not exists payment_mode text;

comment on column public.outing_expenses.account_name is
  'Display name of the paying account (Cash, HDFC, …). Optional for bank-detected rows.';
comment on column public.outing_expenses.payment_mode is
  'Cash | Online | Bank | Wallet — payment style for the spend.';
