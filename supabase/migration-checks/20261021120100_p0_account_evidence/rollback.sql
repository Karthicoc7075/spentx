-- ROLLBACK for 20261021120100_p0_account_evidence (Phase 0).
-- Only new objects are removed; no existing definition was changed.

begin;

drop index if exists public.accounts_user_identity_uidx;
drop index if exists public.accounts_user_bank_last4_idx;
alter table public.accounts drop constraint if exists accounts_evidence_count_check;
alter table public.accounts drop constraint if exists accounts_created_by_check;
alter table public.accounts drop constraint if exists accounts_evidence_state_check;

-- The columns stay (the app falls back when they are missing, and ignores
-- them when present). Drop only after an explicit decision:
-- alter table public.accounts drop column if exists aliases;            -- DATA LOSS
-- alter table public.accounts drop column if exists linked_card_last4;  -- DATA LOSS
-- alter table public.accounts drop column if exists evidence_state;     -- DATA LOSS
-- alter table public.accounts drop column if exists evidence_count;     -- DATA LOSS
-- alter table public.accounts drop column if exists created_by;         -- DATA LOSS
-- alter table public.accounts drop column if exists bank_key;           -- DATA LOSS
-- alter table public.accounts drop column if exists verified_identity;  -- DATA LOSS

commit;
