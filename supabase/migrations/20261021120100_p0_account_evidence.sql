-- Phase 0 (Data Foundations) migration 2: account evidence. Plan v6, "SQL"
-- migration 2. NOT RUN — follow migration-checks/MIGRATION_TEMPLATE.md.
--
-- Adds aliases, linked debit cards, evidence state / count, who created
-- the account, the standard bank key, and a verified identity. Every
-- existing account reads as user-created and user-confirmed
-- (evidence_state 'user', created_by 'user'), which is what it is.
--
-- No hard unique on (bank, last4): two real accounts can share them. Only a
-- soft lookup index, plus uniqueness on
-- (user, bank_key, type, last4, verified_identity) for live accounts that
-- have a verified identity; precheck.sql shows it holds for existing data
-- (existing rows have no bank_key / verified_identity yet, so none of them
-- is in that index).
--
-- RLS: columns only on public.accounts; the existing accounts_own policy
-- (user_id = auth.uid()) covers them. No new table.

begin;

-- Fail fast instead of queueing behind (and blocking) app traffic if the
-- table is busy; nothing is changed when this times out. Just run again.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.accounts
  add column if not exists aliases text[] not null default '{}',
  add column if not exists linked_card_last4 text[] not null default '{}',
  add column if not exists evidence_state text not null default 'user',
  add column if not exists evidence_count integer not null default 0,
  add column if not exists created_by text not null default 'user',
  add column if not exists bank_key text,
  add column if not exists verified_identity text;

alter table public.accounts drop constraint if exists accounts_evidence_state_check;
alter table public.accounts add constraint accounts_evidence_state_check
  check (evidence_state in ('candidate', 'confirmed', 'user'));

alter table public.accounts drop constraint if exists accounts_created_by_check;
alter table public.accounts add constraint accounts_created_by_check
  check (created_by in ('user', 'auto'));

alter table public.accounts drop constraint if exists accounts_evidence_count_check;
alter table public.accounts add constraint accounts_evidence_count_check
  check (evidence_count >= 0);

-- Soft lookup (not unique).
create index if not exists accounts_user_bank_last4_idx
  on public.accounts (user_id, bank_key, last4)
  where deleted_at is null;

create unique index if not exists accounts_user_identity_uidx
  on public.accounts (user_id, bank_key, type, last4, verified_identity)
  where deleted_at is null
    and bank_key is not null and verified_identity is not null;

commit;
