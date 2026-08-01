-- Fixes schema drift between src/lib/user-bootstrap.ts (new-user signup
-- workspace bootstrap) and the actual database: several columns/tables that
-- code already writes to were never migrated, causing sign-up to fail with
-- "Could not find the 'X' column/table ... in the schema cache".

-- ============================================================================
-- users: missing preference columns
-- ============================================================================

alter table public.users
  add column if not exists currency text not null default 'INR',
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists language text not null default 'en',
  add column if not exists show_bank_onboarding boolean not null default true;

-- ============================================================================
-- activity_logs: widen the "type" check constraint to include the values
-- user-bootstrap.ts already writes ('user_registered', 'purpose_created',
-- 'budget_template_created') alongside the existing set.
-- ============================================================================

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'activity_logs'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type%';

  if constraint_name is not null then
    execute format('alter table public.activity_logs drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.activity_logs
  add constraint activity_logs_type_check check (type in (
    'account_created','account_deleted','transaction_added',
    'transaction_updated','transaction_deleted','plan_updated',
    'purpose_shared','purpose_share_revoked','outing_completed',
    'outing_created','settlement_recorded','backup_created',
    'category_created','contributor_created',
    'user_registered','purpose_created','budget_template_created'
  ));

-- ============================================================================
-- account_purposes: junction table linking accounts to purposes
-- ============================================================================

create table if not exists public.account_purposes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  purpose_id uuid not null references public.purposes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (account_id, purpose_id)
);

create index if not exists account_purposes_user_idx on public.account_purposes (user_id);

alter table public.account_purposes enable row level security;

create policy "account_purposes_own" on public.account_purposes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- net_worth_history: daily net-worth snapshot per user
-- ============================================================================

create table if not exists public.net_worth_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  cash_balance numeric(14,2) not null default 0,
  bank_balance numeric(14,2) not null default 0,
  investment_value numeric(14,2) not null default 0,
  net_worth numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

create index if not exists net_worth_history_user_date_idx
  on public.net_worth_history (user_id, snapshot_date desc);

alter table public.net_worth_history enable row level security;

create policy "net_worth_history_select_own" on public.net_worth_history
  for select using (user_id = auth.uid());
create policy "net_worth_history_insert_own" on public.net_worth_history
  for insert with check (user_id = auth.uid());
create policy "net_worth_history_update_own" on public.net_worth_history
  for update using (user_id = auth.uid());

-- ============================================================================
-- user_devices: known devices/browsers per user
-- ============================================================================

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text,
  user_agent text,
  platform text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_devices_user_idx on public.user_devices (user_id);

alter table public.user_devices enable row level security;

create policy "user_devices_select_own" on public.user_devices
  for select using (user_id = auth.uid());
create policy "user_devices_insert_own" on public.user_devices
  for insert with check (user_id = auth.uid());
create policy "user_devices_update_own" on public.user_devices
  for update using (user_id = auth.uid());

-- ============================================================================
-- login_history: login event audit trail per user
-- ============================================================================

create table if not exists public.login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  user_agent text,
  platform text
);

create index if not exists login_history_user_idx
  on public.login_history (user_id, logged_in_at desc);

alter table public.login_history enable row level security;

create policy "login_history_select_own" on public.login_history
  for select using (user_id = auth.uid());
create policy "login_history_insert_own" on public.login_history
  for insert with check (user_id = auth.uid());
