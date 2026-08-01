-- Name uniqueness for accounts and purposes.
--
-- Why: mobile derives deterministic remote ids from (user, name) — see
-- SyncIds.forAccount / forPurpose in the Flutter sync layer. Two active rows
-- with the same name for one user therefore collapse into one id on mobile
-- and corrupt the name-keyed pull/merge. Web had no constraint at all
-- (only accounts_one_default_per_user), and saveAccount() upserts by id, so
-- a double-submit of the onboarding form or a network retry could create
-- duplicate same-named accounts.
--
-- Scoped to ACTIVE rows only: both tables soft-delete via is_active=false,
-- and a user must stay free to re-create an account with the name of one
-- they previously archived.

-- ---------------------------------------------------------------------------
-- 1. Collapse any pre-existing active duplicates before adding the index,
--    otherwise index creation fails on dirty data. Keeps the oldest row of
--    each (user, lower(name)) group and archives the rest rather than
--    hard-deleting — transactions reference accounts and must not dangle.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, lower(trim(name))
      order by created_at asc, id asc
    ) as rn
  from public.accounts
  where is_active
)
update public.accounts a
set is_active = false,
    deleted_at = now()
from ranked r
where a.id = r.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, lower(trim(name))
      order by created_at asc, id asc
    ) as rn
  from public.purposes
  where is_active
)
update public.purposes p
set is_active = false,
    deleted_at = now()
from ranked r
where p.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2. Enforce going forward. Case-insensitive and trim-insensitive so "cash",
--    "Cash" and " Cash " can't coexist — mobile lowercases/trims before
--    hashing the name into an id, so anything it would collide on must
--    collide here too.
-- ---------------------------------------------------------------------------
create unique index if not exists accounts_user_active_name_uidx
  on public.accounts (user_id, lower(trim(name)))
  where is_active;

create unique index if not exists purposes_user_active_name_uidx
  on public.purposes (user_id, lower(trim(name)))
  where is_active;
