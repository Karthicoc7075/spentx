-- Phase 0 (Data Foundations) migration 1: transaction status, review flags
-- and provenance. Plan v6, "SQL" migration 1. NOT RUN — follow
-- migration-checks/MIGRATION_TEMPLATE.md (backup, precheck, rollback
-- capture, this file, verify).
--
-- What changes
--   * status: adds 'reversed' and 'unknown' (existing values unchanged;
--     the app keeps success = 'completed', cancelled = 'rejected').
--   * new nullable / defaulted columns, so existing rows and the current app
--     keep working: review_flags, channel, rule_id, rule_version,
--     source_event_ids, linked_original_id, link_kind, refunded_amount,
--     ref_key, balance_applied.
--   * Additive only: no drop, no table rewrite (constant defaults and a
--     nullable column are catalog-only on Postgres 11+; live is 17). The
--     CHECKs scan existing rows once and change nothing.
--   * account_id may be empty (Unassigned). The FK stays.
--   * unique (user_id, ref_key) for live rows that carry a ref key.
--
-- Backfill: none needed. Every existing row keeps its status: manual and
-- verified rows are already 'completed'; SMS rows still awaiting review are
-- already 'pending' / 'unverified'. No row is turned into success, and no
-- unclear row is assumed successful. balance_applied stays null on existing
-- rows (null = "not recorded"; the app's shared totals rule decides), so no
-- existing row is written.
--
-- RLS: only columns are added to public.transactions; its existing
-- user_id = auth.uid() policies cover them. No new table.

begin;

-- Fail fast instead of queueing behind (and blocking) app traffic if the
-- table is busy; nothing is changed when this times out. Just run again.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('completed', 'pending', 'failed', 'refunded',
                    'unverified', 'rejected', 'reversed', 'unknown'));

alter table public.transactions
  add column if not exists review_flags text[] not null default '{}',
  add column if not exists channel text,
  add column if not exists rule_id text,
  add column if not exists rule_version bigint,
  add column if not exists source_event_ids text[] not null default '{}',
  add column if not exists linked_original_id text,
  add column if not exists link_kind text,
  add column if not exists refunded_amount numeric(14,2) not null default 0,
  add column if not exists ref_key text;

alter table public.transactions drop constraint if exists transactions_review_flags_check;
alter table public.transactions add constraint transactions_review_flags_check
  check (review_flags <@ array['needsCategory', 'needsAccount',
                               'needsClassification']::text[]);

alter table public.transactions drop constraint if exists transactions_channel_check;
alter table public.transactions add constraint transactions_channel_check
  check (channel is null or channel in ('upi', 'card', 'imps', 'neft', 'rtgs',
                                        'atm', 'wallet', 'cash'));

alter table public.transactions drop constraint if exists transactions_link_kind_check;
alter table public.transactions add constraint transactions_link_kind_check
  check ((link_kind is null and linked_original_id is null)
         or (link_kind in ('refund', 'reversal')));

alter table public.transactions drop constraint if exists transactions_refunded_amount_check;
alter table public.transactions add constraint transactions_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= abs(total_amount));

-- Unassigned: a confirmed expense with no account yet.
alter table public.transactions alter column account_id drop not null;

-- Set once a row's effect has been applied to its account balance, so the
-- same row never moves a balance twice (Safety 1 / 3). Null on existing rows.
alter table public.transactions
  add column if not exists balance_applied boolean;

create unique index if not exists transactions_user_ref_key_uidx
  on public.transactions (user_id, ref_key)
  where ref_key is not null;

create index if not exists transactions_user_linked_original_idx
  on public.transactions (user_id, linked_original_id)
  where linked_original_id is not null;

commit;
