-- ROLLBACK for 20261026_account_kinds. Only new objects are removed; no
-- existing definition was changed. Run only after an explicit decision.

begin;

drop index if exists public.accounts_linked_account_idx;
alter table public.accounts drop constraint if exists accounts_linked_not_self_check;
alter table public.accounts drop constraint if exists accounts_linked_account_fkey;
alter table public.accounts drop constraint if exists accounts_credit_fields_check;
alter table public.accounts drop constraint if exists accounts_account_kind_check;

-- Data-holding objects stay (the app falls back when they are missing).
-- Drop only after an explicit decision:
-- drop table if exists public.account_blocklist;                            -- DATA LOSS ("Not mine" list)
-- alter table public.accounts drop column if exists account_kind;           -- DATA LOSS
-- alter table public.accounts drop column if exists linked_account_id;      -- DATA LOSS
-- alter table public.accounts drop column if exists credit_limit;           -- DATA LOSS
-- alter table public.accounts drop column if exists bill_day;               -- DATA LOSS
-- alter table public.accounts drop column if exists due_day;                -- DATA LOSS
-- alter table public.accounts drop column if exists last_statement_amount;  -- DATA LOSS
-- alter table public.accounts drop column if exists last_statement_due;     -- DATA LOSS

commit;
