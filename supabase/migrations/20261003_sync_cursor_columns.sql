-- Phone local-first sync cursor.
-- Adds updated_at where a user-owned table the app already writes could not
-- be pulled with `updated_at > last_sync`. deleted_at is already present on
-- purposes, categories, contributors, and settlements; this file does not add
-- deleted_at to tables that are hard-deleted (merchants, plans, splits, items,
-- snapshots).
--
-- Do not assume this has been applied. Run it once in the Supabase SQL editor.
-- touch_updated_at() already exists (init.sql). Recreated here so the triggers
-- below still work if this file is applied on its own.

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

alter table public.purposes
  add column if not exists updated_at timestamptz not null default now();
alter table public.categories
  add column if not exists updated_at timestamptz not null default now();
alter table public.contributors
  add column if not exists updated_at timestamptz not null default now();
alter table public.transaction_splits
  add column if not exists updated_at timestamptz not null default now();
alter table public.transaction_items
  add column if not exists updated_at timestamptz not null default now();
alter table public.settlements
  add column if not exists updated_at timestamptz not null default now();
alter table public.friend_settlements
  add column if not exists updated_at timestamptz not null default now();
alter table public.net_worth_history
  add column if not exists updated_at timestamptz not null default now();
alter table public.account_balance_history
  add column if not exists updated_at timestamptz not null default now();

create index if not exists purposes_user_updated_idx
  on public.purposes (user_id, updated_at);
create index if not exists categories_user_updated_idx
  on public.categories (user_id, updated_at);
create index if not exists contributors_user_updated_idx
  on public.contributors (user_id, updated_at);
create index if not exists transaction_splits_user_updated_idx
  on public.transaction_splits (user_id, updated_at);
create index if not exists settlements_user_updated_idx
  on public.settlements (user_id, updated_at);
create index if not exists friend_settlements_user_updated_idx
  on public.friend_settlements (user_id, updated_at);

drop trigger if exists purposes_touch_updated_at on public.purposes;
create trigger purposes_touch_updated_at
  before update on public.purposes
  for each row execute function public.touch_updated_at();

drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at
  before update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists contributors_touch_updated_at on public.contributors;
create trigger contributors_touch_updated_at
  before update on public.contributors
  for each row execute function public.touch_updated_at();

drop trigger if exists transaction_splits_touch_updated_at on public.transaction_splits;
create trigger transaction_splits_touch_updated_at
  before update on public.transaction_splits
  for each row execute function public.touch_updated_at();

drop trigger if exists transaction_items_touch_updated_at on public.transaction_items;
create trigger transaction_items_touch_updated_at
  before update on public.transaction_items
  for each row execute function public.touch_updated_at();

drop trigger if exists settlements_touch_updated_at on public.settlements;
create trigger settlements_touch_updated_at
  before update on public.settlements
  for each row execute function public.touch_updated_at();

drop trigger if exists friend_settlements_touch_updated_at on public.friend_settlements;
create trigger friend_settlements_touch_updated_at
  before update on public.friend_settlements
  for each row execute function public.touch_updated_at();

drop trigger if exists net_worth_history_touch_updated_at on public.net_worth_history;
create trigger net_worth_history_touch_updated_at
  before update on public.net_worth_history
  for each row execute function public.touch_updated_at();

drop trigger if exists account_balance_history_touch_updated_at on public.account_balance_history;
create trigger account_balance_history_touch_updated_at
  before update on public.account_balance_history
  for each row execute function public.touch_updated_at();
