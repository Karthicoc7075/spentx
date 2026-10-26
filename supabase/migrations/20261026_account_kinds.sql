-- Account kinds + new-account discovery (NOT RUN; apply manually after
-- migration-checks/20261026_account_kinds/precheck.sql, then run verify.sql).
--
-- Additive only. Nothing is dropped, no existing row is changed: every new
-- accounts column is nullable with no default, so existing accounts read
-- exactly as before. The app works without this migration (it strips the
-- new columns when the server answers 42703 / PGRST204).
--
-- accounts.type keeps its existing check (bank, cash, wallet, credit); a
-- debit card is not its own account (it links to a bank), so the kind is
-- recorded in the new account_kind column instead of widening type.
--
-- New owner-only table account_blocklist: cards / accounts the user marked
-- "Not mine" (issuer + kind + last 4 only; never SMS text).

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.accounts
  add column if not exists account_kind text,
  add column if not exists linked_account_id uuid,
  add column if not exists credit_limit numeric,
  add column if not exists bill_day smallint,
  add column if not exists due_day smallint,
  add column if not exists last_statement_amount numeric,
  add column if not exists last_statement_due date;

alter table public.accounts drop constraint if exists accounts_account_kind_check;
alter table public.accounts add constraint accounts_account_kind_check
  check (account_kind is null
         or account_kind in ('bank', 'debit_card', 'credit_card', 'wallet', 'cash'));

alter table public.accounts drop constraint if exists accounts_credit_fields_check;
alter table public.accounts add constraint accounts_credit_fields_check
  check ((credit_limit is null or credit_limit >= 0)
         and (bill_day is null or bill_day between 1 and 31)
         and (due_day is null or due_day between 1 and 31)
         and (last_statement_amount is null or last_statement_amount >= 0));

-- A debit card / card links to another account of the same user. ON DELETE
-- SET NULL: deleting the bank never deletes the card row.
alter table public.accounts drop constraint if exists accounts_linked_account_fkey;
alter table public.accounts add constraint accounts_linked_account_fkey
  foreign key (linked_account_id) references public.accounts(id) on delete set null;

alter table public.accounts drop constraint if exists accounts_linked_not_self_check;
alter table public.accounts add constraint accounts_linked_not_self_check
  check (linked_account_id is null or linked_account_id <> id);

create index if not exists accounts_linked_account_idx
  on public.accounts (linked_account_id)
  where linked_account_id is not null;

create table if not exists public.account_blocklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issuer text not null,
  kind text not null,
  last4 text not null,
  created_at timestamptz not null default now(),
  constraint account_blocklist_unique unique (user_id, issuer, kind, last4),
  constraint account_blocklist_kind_check
    check (kind in ('bank', 'debit_card', 'credit_card', 'wallet')),
  constraint account_blocklist_last4_check check (last4 ~ '^[0-9]{3,4}$'),
  constraint account_blocklist_issuer_check
    check (issuer = lower(issuer) and length(issuer) between 1 and 64)
);

alter table public.account_blocklist enable row level security;

drop policy if exists account_blocklist_select_own on public.account_blocklist;
create policy account_blocklist_select_own on public.account_blocklist
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists account_blocklist_insert_own on public.account_blocklist;
create policy account_blocklist_insert_own on public.account_blocklist
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists account_blocklist_delete_own on public.account_blocklist;
create policy account_blocklist_delete_own on public.account_blocklist
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.account_blocklist to authenticated;
revoke all on public.account_blocklist from anon;

commit;
