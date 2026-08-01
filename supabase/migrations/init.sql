-- ============================================================================
-- SpentX — Single Consolidated Supabase Schema (v2)
-- ============================================================================
-- One file, safe to run once against a FRESH, EMPTY Supabase project (SQL
-- Editor → paste this whole file → Run).
--
-- This supersedes and merges everything previously spread across:
--   0001_init.sql, 0002_auth_fixes.sql, 0003_new_user_bootstrap.sql,
--   0005_categories_created_at.sql, [prior consolidated schema],
--   0006_smart_views.sql, 0008_investment_category_flag.sql,
--   0009_drop_investments.sql, 0010_fix_create_transaction_after_investments_drop.sql
--
-- 0004_user_signup_spec.sql and 0007_plan_allocation_validation.sql were
-- both empty (0 bytes) in the migration history — nothing to merge from
-- either. If either was meant to contain something, it was never written;
-- flagging here so it isn't assumed to be covered by this file.
--
-- Changes folded in since the prior consolidated version:
--   - smart_views: reusable, MONTH-AGNOSTIC filter templates (Account +
--     Purpose + Category + Contributor). Deliberately has no date/month
--     column — applying a saved view must never change the currently
--     selected month on the Analysis page.
--   - Investments as a separate entity are GONE. There is no
--     `investments` table in this file at all — it was created and then
--     destructively dropped in the real migration history (confirmed
--     with the user: only test data existed, nothing to preserve). An
--     "investment" is now simply an expense transaction whose category
--     is flagged `is_investment = true`. `categories` gained that column;
--     the shared default "Investment" category (cat-exp-15) is seeded
--     pre-flagged.
--   - `transactions` no longer has is_investment / investment_type /
--     investment_details / linked_investment_id — removed from the table
--     definition itself (not created-then-dropped, since this is a fresh
--     schema, not a patch history).
--   - create_transaction_with_splits() reflects the post-investments
--     shape of `transactions` — no investment-related columns referenced.
--   - investment_totals view joins on category NAME, not id/slug — this
--     was corrected empirically against the real running app:
--     transaction_splits.category_id stores the category's *name* in
--     this codebase's actual write path, not a stable id/slug as
--     originally assumed. If a future refactor changes writes to use
--     stable ids instead of names, this view's join condition must be
--     updated to match — it is NOT currently id-based, intentionally,
--     because that would silently stop matching real data.
--   - monthly_plans gets a database-level trigger enforcing total
--     allocations <= expected_income, as a backstop behind the
--     client-side check (0007 was meant to add this but shipped empty).
--
-- This is a FULL schema — every table, index, view, function, trigger,
-- RLS policy, and storage bucket the app needs. Nothing else needs to be
-- run afterward for the database side of a fresh deployment.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- Global settings — single source of truth for app identity, version,
-- maintenance mode, per-user resource limits, and shared default
-- categories. Exactly one row (id = 'app'). Do not add a second config
-- table for any future global setting — add a column here instead.
-- ============================================================================

create table public.global_settings (
  id text primary key default 'app',
  app_name text not null default 'SpentX',
  logo_url text,
  default_safe_spending_percentage numeric(5,2) not null default 20,
  max_category_limit integer not null default 50,
  max_purposes_limit integer not null default 10,
  max_accounts_limit integer not null default 10,
  max_contributors_limit integer not null default 10,
  app_version text not null default '1.0.0',
  maintenance_mode boolean not null default false,
  default_monthly_budget numeric(14,2) not null default 0,
  default_categories jsonb not null default '[]'
);

insert into public.global_settings (id, app_name, default_categories)
values (
  'app',
  'SpentX',
  '[
    {"id":"cat-inc-1","name":"Salary","type":"income","color":"#10b981","icon":"briefcase","order":1},
    {"id":"cat-inc-2","name":"Freelance / Business","type":"income","color":"#0ea5e9","icon":"laptop","order":2},
    {"id":"cat-inc-3","name":"Investments","type":"income","color":"#22c55e","icon":"trending-up","order":3},
    {"id":"cat-inc-4","name":"Rental Income","type":"income","color":"#6366f1","icon":"home","order":4},
    {"id":"cat-inc-5","name":"Bonus","type":"income","color":"#f59e0b","icon":"sparkles","order":5},
    {"id":"cat-inc-6","name":"Gifts Received","type":"income","color":"#ec4899","icon":"gift","order":6},
    {"id":"cat-inc-7","name":"Interest","type":"income","color":"#14b8a6","icon":"percent","order":7},
    {"id":"cat-inc-8","name":"Other Income","type":"income","color":"#94a3b8","icon":"circle-dollar-sign","order":8},
    {"id":"cat-exp-1","name":"Food & Dining","type":"expense","color":"#f97316","icon":"utensils","order":101},
    {"id":"cat-exp-2","name":"Groceries","type":"expense","color":"#22c55e","icon":"shopping-basket","order":102},
    {"id":"cat-exp-3","name":"Transportation","type":"expense","color":"#3b82f6","icon":"car","order":103},
    {"id":"cat-exp-4","name":"Rent / Housing","type":"expense","color":"#6366f1","icon":"home","order":104},
    {"id":"cat-exp-5","name":"Utilities","type":"expense","color":"#eab308","icon":"zap","order":105},
    {"id":"cat-exp-6","name":"Healthcare","type":"expense","color":"#ef4444","icon":"heart-pulse","order":106},
    {"id":"cat-exp-7","name":"Entertainment","type":"expense","color":"#a855f7","icon":"film","order":107},
    {"id":"cat-exp-8","name":"Shopping","type":"expense","color":"#ec4899","icon":"shopping-bag","order":108},
    {"id":"cat-exp-9","name":"Education","type":"expense","color":"#06b6d4","icon":"graduation-cap","order":109},
    {"id":"cat-exp-10","name":"Travel","type":"expense","color":"#14b8a6","icon":"plane","order":110},
    {"id":"cat-exp-11","name":"Bills & EMI","type":"expense","color":"#64748b","icon":"receipt","order":111},
    {"id":"cat-exp-12","name":"Personal Care","type":"expense","color":"#f43f5e","icon":"sparkle","order":112},
    {"id":"cat-exp-13","name":"Gifts & Donations","type":"expense","color":"#f59e0b","icon":"gift","order":113},
    {"id":"cat-exp-14","name":"Miscellaneous","type":"expense","color":"#94a3b8","icon":"circle-ellipsis","order":114},
    {"id":"cat-exp-15","name":"Investment","type":"expense","color":"#6366f1","icon":"trending-up","order":115,"isInvestment":true}
  ]'::jsonb
) on conflict (id) do nothing;

-- ============================================================================
-- Core user-owned tables
-- ============================================================================

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  schema_version smallint not null default 1,
  name text not null,
  email text not null,
  photo_url text,
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  joined_at timestamptz not null default now(),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  private_mode boolean not null default false,
  default_account_id uuid,
  notifications boolean not null default true,
  monthly_safe_spending_alert boolean not null default false,
  dashboard_kpi_cards text[],
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('bank','cash','wallet','credit')),
  last4 text,
  opening_balance numeric(14,2) not null default 0,
  opening_balance_date date,
  purpose_ids uuid[] default '{}',
  is_default boolean not null default false,
  can_delete boolean not null default true,
  is_active boolean not null default true,
  needs_rename boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index accounts_one_default_per_user
  on public.accounts (user_id) where (is_default and is_active);

alter table public.users
  add constraint users_default_account_fk
  foreign key (default_account_id) references public.accounts(id);

create table public.purposes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  is_default boolean not null default false,
  can_delete boolean not null default true,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  color text not null,
  icon text not null default 'tag',
  is_investment boolean not null default false,
  can_delete boolean not null default true,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.contributors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  is_default boolean not null default false,
  can_delete boolean not null default true,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Transactions
-- ============================================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version smallint not null default 1,
  account_id uuid not null references public.accounts(id) on delete restrict,
  merchant text not null,
  total_amount numeric(14,2) not null,
  type text not null check (type in ('income','expense')),
  payment_method text not null default 'UPI',
  source text not null check (source in ('manual','mobile','bank-sync','import')),
  entry_source text not null check (entry_source in ('manual','mobile-manual','sms-auto-detected')),
  transaction_date timestamptz not null,
  month_key text not null,
  description text,
  note text,
  receipt_url text,
  reference text,
  reference_id text,
  -- Merchant learning key (UPI VPA / phone / stable id) — not display title.
  upi text,
  raw_identifier text,
  status text not null default 'completed' check (status in ('completed','pending','failed','refunded')),
  has_splits boolean not null default false,
  tags text[],
  outing_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index transactions_user_month_idx on public.transactions (user_id, month_key);
create index transactions_user_account_idx on public.transactions (user_id, account_id);
create index transactions_user_type_idx on public.transactions (user_id, type);
create index transactions_merchant_idx on public.transactions using gin (to_tsvector('simple', merchant));
create index transactions_user_upi_idx on public.transactions (user_id, upi)
  where upi is not null and btrim(upi) <> '';
create index transactions_user_raw_identifier_idx on public.transactions (user_id, raw_identifier)
  where raw_identifier is not null and btrim(raw_identifier) <> '';

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose_id uuid not null references public.purposes(id) on delete restrict,
  category_id text,
  contributor_id uuid references public.contributors(id) on delete set null,
  outing_id uuid,
  amount numeric(14,2) not null,
  note text
);

create index transaction_splits_transaction_idx on public.transaction_splits (transaction_id);
create index transaction_splits_purpose_idx on public.transaction_splits (purpose_id);
create index transaction_splits_outing_idx on public.transaction_splits (outing_id);

-- ============================================================================
-- Planning
-- ============================================================================

create table public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version smallint not null default 1,
  month text not null,
  title text,
  purpose_id uuid references public.purposes(id) on delete cascade,
  expected_income numeric(14,2) not null default 0,
  allocations jsonb not null default '[]',
  daily_safe_limit numeric(14,2),
  savings_target numeric(14,2),
  budget_set_at timestamptz,
  is_budget_locked boolean default false,
  change_history jsonb default '[]',
  last_modified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, purpose_id)
);

create table public.budget_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version smallint not null default 1,
  template_name text not null,
  expected_income numeric(14,2) not null default 0,
  allocations jsonb not null default '[]',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.smart_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_id uuid references public.accounts(id) on delete set null,
  purpose_id uuid references public.purposes(id) on delete set null,
  category_ids text[] not null default '{}',
  contributor_id uuid references public.contributors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Social — friends, outings, splits, settlements
-- ============================================================================

create table public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  -- Primary UPI (usually first of upi_ids). One friend can have many handles.
  upi text,
  upi_ids text[] not null default '{}',
  notes text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index friends_user_upi_idx on public.friends (user_id, upi)
  where upi is not null and btrim(upi) <> '';
create index friends_upi_ids_gin_idx on public.friends using gin (upi_ids);

create table public.outings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null,
  type text,
  location text,
  budget numeric(14,2),
  start_date timestamptz not null,
  end_date timestamptz,
  members jsonb not null default '[]',
  participants uuid[] not null default '{}',
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  auto_add_mode boolean not null default false,
  total_spent numeric(14,2),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outings_user_status_idx on public.outings (user_id, status);

-- Per-user outing type picker (Trip / Other / custom names)
create table public.outing_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outing_categories_name_not_blank check (btrim(name) <> '')
);
create unique index outing_categories_user_name_uidx
  on public.outing_categories (user_id, lower(btrim(name)));
create index outing_categories_user_sort_idx
  on public.outing_categories (user_id, sort_order, name);

alter table public.transactions
  add constraint transactions_outing_fk
  foreign key (outing_id) references public.outings(id) on delete set null;
alter table public.transaction_splits
  add constraint transaction_splits_outing_fk
  foreign key (outing_id) references public.outings(id) on delete set null;

create table public.outing_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outing_id uuid not null references public.outings(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null,
  category_id text,
  expense_date timestamptz not null,
  paid_by_member_id text not null,
  split_type text not null check (split_type in ('equally','solo','custom','percentage','shares')),
  splits jsonb not null default '[]',
  source text not null default 'manual' check (source in ('manual','bank-detected')),
  linked_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outing_id uuid not null references public.outings(id) on delete cascade,
  from_member_id text not null,
  to_member_id text not null,
  amount numeric(14,2) not null,
  is_partial boolean not null default false,
  settled_date timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Sharing
-- ============================================================================

create table public.purpose_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  viewer_email text not null,
  viewer_id uuid references auth.users(id),
  purpose_id uuid not null references public.purposes(id) on delete cascade,
  role text not null default 'viewer' check (role = 'viewer'),
  link_token uuid,
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  last_viewed_at timestamptz,
  total_views integer not null default 0,
  created_at timestamptz not null default now(),
  unique (purpose_id, viewer_id)
);

create table public.share_links (
  token uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  purpose_id uuid not null references public.purposes(id) on delete cascade,
  purpose_name text not null,
  viewer_email text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.share_access_logs (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.purpose_shares(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  purpose_id uuid not null references public.purposes(id) on delete cascade,
  token uuid not null references public.share_links(token) on delete cascade,
  viewed_at timestamptz not null default now(),
  page text not null,
  device text,
  browser text,
  os text,
  country text
);

create index share_access_logs_owner_idx on public.share_access_logs (owner_id, viewed_at desc);

-- ============================================================================
-- Logs
-- ============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('create','update','delete')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'account_created','account_deleted','transaction_added',
    'transaction_updated','transaction_deleted','plan_updated',
    'purpose_shared','purpose_share_revoked','outing_completed',
    'outing_created','settlement_recorded','backup_created',
    'category_created','contributor_created'
  )),
  message text not null,
  entity_table text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index activity_logs_user_idx on public.activity_logs (user_id, created_at desc);

create table public.backup_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schema_version smallint not null default 1,
  type text not null check (type in ('automatic','manual')),
  frequency text check (frequency in ('daily','weekly','monthly')),
  storage_path text,
  size_bytes bigint,
  backup_schema_version text not null,
  manifest text[] not null,
  status text not null check (status in ('success','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table public.account_balance_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  balance numeric(14,2) not null,
  snapshot_date date not null,
  month_key text not null,
  created_at timestamptz not null default now(),
  unique (account_id, snapshot_date)
);

create index account_balance_history_user_date_idx on public.account_balance_history (user_id, snapshot_date desc);

-- ============================================================================
-- Mail
-- ============================================================================

create table public.mail_templates (
  id text primary key,
  name text not null,
  subject text not null,
  html text not null,
  variables text[] not null default '{}',
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Reflections, alerts, income planning, savings, AI
-- ============================================================================

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  mood integer not null default 3,
  wins text not null default '',
  unnecessary_spend text not null default '',
  plan_adherence integer not null default 3,
  plan_adherence_note text,
  different_next_week text not null default '',
  standout_transactions text,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.smart_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  severity text not null check (severity in ('low','medium','high')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.income_streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  amount numeric(14,2) not null,
  frequency text not null check (frequency in ('monthly','one-time')),
  last_received date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.income_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_3_months numeric(14,2) not null default 0,
  target_6_months numeric(14,2) not null default 0,
  target_12_months numeric(14,2) not null default 0,
  active_horizon integer not null default 3 check (active_horizon in (3,6,12)),
  updated_at timestamptz not null default now()
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null,
  saved_amount numeric(14,2) not null default 0,
  monthly_contribution numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projector_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  timestamp timestamptz not null default now()
);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  type text not null,
  health_score integer not null,
  summary text not null,
  tips text[] not null default '{}',
  generated_at timestamptz not null default now(),
  unique (user_id, month, type)
);

-- ============================================================================
-- SMS parsing rules (admin-managed)
-- ============================================================================

create table public.sms_template_rules (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  type text not null,
  mode text not null,
  template_pattern text not null,
  extraction_map jsonb,
  keywords text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sms_detection_rules (
  id uuid primary key default gen_random_uuid(),
  match_pattern text not null,
  contains_keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  amount_pattern text,
  type text not null,
  mode text not null,
  bank_name text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sms_block_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  keywords text[] not null default '{}',
  pattern text,
  similarity_threshold numeric(4,3) not null default 0.8,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Views
-- ============================================================================

create view public.monthly_plan_actuals as
select
  mp.id as plan_id,
  mp.user_id,
  mp.month,
  mp.purpose_id,
  mp.expected_income,
  coalesce(sum(ts.amount) filter (where t.type = 'expense'), 0) as actual_expense,
  coalesce(sum(ts.amount) filter (where t.type = 'income'), 0) as actual_income,
  (select coalesce(sum((a->>'plannedAmount')::numeric), 0) from jsonb_array_elements(mp.allocations) a) as total_planned,
  mp.expected_income - coalesce(sum(ts.amount) filter (where t.type = 'expense'), 0) as remaining_budget,
  coalesce(sum(ts.amount) filter (where t.type = 'expense'), 0)
    - (select coalesce(sum((a->>'plannedAmount')::numeric), 0) from jsonb_array_elements(mp.allocations) a) as variance
from public.monthly_plans mp
left join public.transaction_splits ts on ts.purpose_id = mp.purpose_id or mp.purpose_id is null
left join public.transactions t on t.id = ts.transaction_id
  and t.user_id = mp.user_id
  and to_char(t.transaction_date, 'YYYY-MM') = mp.month
group by mp.id, mp.user_id, mp.month, mp.purpose_id, mp.expected_income, mp.allocations;

create view public.investment_totals as
select
  t.user_id,
  coalesce(sum(ts.amount) filter (
    where c.is_investment = true or gc.is_investment = true
  ), 0) as total_invested
from public.transactions t
join public.transaction_splits ts on ts.transaction_id = t.id
left join public.categories c on c.name = ts.category_id
left join lateral (
  select (elem->>'isInvestment')::boolean as is_investment
  from public.global_settings gs, jsonb_array_elements(gs.default_categories) elem
  where elem->>'name' = ts.category_id
  limit 1
) gc on true
where t.type = 'expense'
group by t.user_id;

-- ============================================================================
-- Functions & triggers
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_purpose_id uuid;
  v_cash_account_id uuid;
  v_bank_account_id uuid;
begin
  insert into public.users (
    id, name, email, theme, notifications, monthly_safe_spending_alert, private_mode
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    'dark',
    true,
    true,
    false
  );

  insert into public.purposes (user_id, name, color, is_default, can_delete)
  values (new.id, 'Personal', '#8b7ff0', true, false)
  returning id into v_purpose_id;

  insert into public.accounts (user_id, name, type, is_default, can_delete)
  values (new.id, 'Cash', 'cash', true, false)
  returning id into v_cash_account_id;

  insert into public.accounts (user_id, name, type, is_default, can_delete, needs_rename)
  values (new.id, 'Account 1', 'bank', false, true, true)
  returning id into v_bank_account_id;

  update public.users set default_account_id = v_cash_account_id where id = new.id;

  insert into public.contributors (user_id, name, is_default, can_delete)
  values (new.id, 'Me', true, false);

  insert into public.budget_templates (
    user_id, template_name, expected_income, allocations, is_default
  )
  values (new.id, 'Default Budget', 0, '[]'::jsonb, true);

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.get_share_link(p_token uuid)
returns public.share_links as $$
  select * from public.share_links
  where token = p_token and (expires_at is null or expires_at > now());
$$ language sql security definer stable;

-- get_share_link only resolves the token to owner/purpose — the anonymous
-- viewer still has no auth.uid(), so the transactions/transaction_splits/
-- accounts RLS policies (owner-only, or purpose_shares-linked-viewer) block
-- every row and the shared page renders all zeros. This mirrors
-- get_share_link's pattern (security definer, re-validates the token/expiry
-- itself) to return just the shared purpose's transactions, bypassing RLS
-- safely since every row is scoped through the token's own owner_id/purpose_id.
create or replace function public.get_shared_transactions(p_token uuid)
returns table (
  id uuid,
  merchant text,
  amount numeric,
  type text,
  transaction_date timestamptz,
  category_id text,
  account_name text,
  note text,
  description text
) as $$
  select
    t.id,
    t.merchant,
    ts.amount,
    t.type,
    t.transaction_date,
    ts.category_id,
    a.name as account_name,
    t.note,
    t.description
  from public.share_links sl
  join public.transaction_splits ts on ts.purpose_id = sl.purpose_id
  join public.transactions t on t.id = ts.transaction_id and t.user_id = sl.owner_id
  left join public.accounts a on a.id = t.account_id
  where sl.token = p_token
    and (sl.expires_at is null or sl.expires_at > now())
  order by t.transaction_date desc;
$$ language sql security definer stable;

create or replace function public.create_transaction_with_splits(
  p_transaction jsonb,
  p_splits jsonb
) returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.transactions (
    user_id, account_id, merchant, total_amount, type, payment_method, source,
    entry_source, transaction_date, month_key, description, note, reference,
    reference_id, upi, raw_identifier, status, has_splits, tags, outing_id
  )
  select
    auth.uid(),
    (p_transaction->>'accountId')::uuid,
    p_transaction->>'merchant',
    (p_transaction->>'totalAmount')::numeric,
    p_transaction->>'type',
    coalesce(p_transaction->>'paymentMethod', 'UPI'),
    coalesce(p_transaction->>'source', 'manual'),
    coalesce(p_transaction->>'entrySource', 'manual'),
    (p_transaction->>'transactionDate')::timestamptz,
    p_transaction->>'monthKey',
    p_transaction->>'description',
    p_transaction->>'note',
    p_transaction->>'reference',
    p_transaction->>'referenceId',
    nullif(coalesce(p_transaction->>'upi', p_transaction->>'upiId', ''), ''),
    nullif(coalesce(
      p_transaction->>'rawIdentifier',
      p_transaction->>'raw_identifier',
      p_transaction->>'upi',
      p_transaction->>'upiId',
      ''
    ), ''),
    coalesce(p_transaction->>'status', 'completed'),
    jsonb_array_length(p_splits) > 1,
    array(select jsonb_array_elements_text(coalesce(p_transaction->'tags', '[]'::jsonb))),
    nullif(p_transaction->>'outingId', '')::uuid
  returning id into v_transaction_id;

  insert into public.transaction_splits (
    transaction_id, user_id, purpose_id, category_id, contributor_id, outing_id, amount, note
  )
  select
    v_transaction_id,
    auth.uid(),
    (s->>'purposeId')::uuid,
    s->>'categoryId',
    nullif(s->>'contributorId', '')::uuid,
    nullif(s->>'outingId', '')::uuid,
    (s->>'amount')::numeric,
    s->>'note'
  from jsonb_array_elements(p_splits) s;

  return v_transaction_id;
end;
$$ language plpgsql security invoker;

create or replace function public.validate_plan_allocations()
returns trigger as $$
declare
  v_total numeric;
begin
  select coalesce(sum((a->>'plannedAmount')::numeric), 0)
    into v_total
    from jsonb_array_elements(NEW.allocations) a;

  if v_total > NEW.expected_income then
    raise exception 'monthly_plans: total allocations (%) exceed expected income (%)', v_total, NEW.expected_income;
  end if;

  return NEW;
end;
$$ language plpgsql;

create trigger monthly_plans_validate_allocations
  before insert or update on public.monthly_plans
  for each row execute function public.validate_plan_allocations();

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_touch_updated_at before update on public.users
  for each row execute function public.touch_updated_at();
create trigger accounts_touch_updated_at before update on public.accounts
  for each row execute function public.touch_updated_at();
create trigger transactions_touch_updated_at before update on public.transactions
  for each row execute function public.touch_updated_at();
create trigger smart_views_touch_updated_at before update on public.smart_views
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.purposes enable row level security;
alter table public.categories enable row level security;
alter table public.contributors enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.budget_templates enable row level security;
alter table public.smart_views enable row level security;
alter table public.friends enable row level security;
alter table public.outings enable row level security;
alter table public.outing_expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.purpose_shares enable row level security;
alter table public.share_links enable row level security;
alter table public.share_access_logs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.activity_logs enable row level security;
alter table public.backup_history enable row level security;
alter table public.account_balance_history enable row level security;
alter table public.global_settings enable row level security;
alter table public.mail_templates enable row level security;
alter table public.reflections enable row level security;
alter table public.smart_alerts enable row level security;
alter table public.income_streams enable row level security;
alter table public.income_targets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.projector_settings enable row level security;
alter table public.ai_chat_messages enable row level security;
alter table public.ai_insights enable row level security;
alter table public.sms_template_rules enable row level security;
alter table public.sms_detection_rules enable row level security;
alter table public.sms_block_rules enable row level security;

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

create policy "users_select_own" on public.users for select using (id = auth.uid());
create policy "users_update_own" on public.users for update using (id = auth.uid());
create policy "users_insert_own" on public.users for insert with check (id = auth.uid());

create policy "purposes_select" on public.purposes for select using (
  user_id = auth.uid() or
  exists (select 1 from public.purpose_shares ps
    where ps.purpose_id = purposes.id and ps.viewer_id = auth.uid() and ps.owner_id = purposes.user_id)
);
create policy "purposes_write_own" on public.purposes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "accounts_own" on public.accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_own" on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "contributors_own" on public.contributors for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "transactions_select" on public.transactions for select using (
  user_id = auth.uid() or
  exists (
    select 1 from public.transaction_splits ts
    join public.purpose_shares ps on ps.purpose_id = ts.purpose_id
    where ts.transaction_id = transactions.id
      and ps.viewer_id = auth.uid()
      and ps.owner_id = transactions.user_id
  )
);
create policy "transactions_insert_own" on public.transactions for insert with check (user_id = auth.uid());
create policy "transactions_update_own" on public.transactions for update using (user_id = auth.uid());
create policy "transactions_delete_own" on public.transactions for delete using (user_id = auth.uid());

create policy "transaction_splits_select" on public.transaction_splits for select using (
  user_id = auth.uid() or
  exists (select 1 from public.purpose_shares ps
    where ps.purpose_id = transaction_splits.purpose_id and ps.viewer_id = auth.uid() and ps.owner_id = transaction_splits.user_id)
);
create policy "transaction_splits_write_own" on public.transaction_splits for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "monthly_plans_select" on public.monthly_plans for select using (
  user_id = auth.uid() or
  (purpose_id is not null and exists (select 1 from public.purpose_shares ps
    where ps.purpose_id = monthly_plans.purpose_id and ps.viewer_id = auth.uid() and ps.owner_id = monthly_plans.user_id))
);
create policy "monthly_plans_write_own" on public.monthly_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "budget_templates_own" on public.budget_templates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "smart_views_own" on public.smart_views for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "friends_own" on public.friends for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "outing_expenses_own" on public.outing_expenses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settlements_own" on public.settlements for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "outings_select" on public.outings for select using (
  created_by = auth.uid() or auth.uid() = any(participants)
);
create policy "outings_write_own" on public.outings for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "purpose_shares_select" on public.purpose_shares for select using (
  owner_id = auth.uid() or viewer_id = auth.uid() or viewer_email = auth.jwt()->>'email'
);
create policy "purpose_shares_insert_owner" on public.purpose_shares for insert with check (owner_id = auth.uid() and role = 'viewer');
create policy "purpose_shares_insert_viewer_claim" on public.purpose_shares for insert with check (
  viewer_id = auth.uid() and role = 'viewer' and
  exists (select 1 from public.share_links sl
    where sl.token = purpose_shares.link_token
      and sl.owner_id = purpose_shares.owner_id
      and sl.purpose_id = purpose_shares.purpose_id)
);
create policy "purpose_shares_update" on public.purpose_shares for update using (owner_id = auth.uid() or viewer_id = auth.uid());
create policy "purpose_shares_delete_owner" on public.purpose_shares for delete using (owner_id = auth.uid());

create policy "purpose_shares_claim_by_email" on public.purpose_shares
  for update
  using (
    lower(viewer_email) = lower(auth.jwt()->>'email')
    and viewer_id is null
  )
  with check (
    viewer_id = auth.uid()
  );

create or replace function public.enforce_purpose_share_claim_only()
returns trigger as $$
begin
  if OLD.viewer_id is null and NEW.viewer_id is not null and auth.uid() = NEW.viewer_id then
    if NEW.owner_id is distinct from OLD.owner_id
      or NEW.purpose_id is distinct from OLD.purpose_id
      or NEW.role is distinct from OLD.role
      or NEW.expires_at is distinct from OLD.expires_at
      or NEW.link_token is distinct from OLD.link_token
      or NEW.viewer_email is distinct from OLD.viewer_email
    then
      raise exception 'purpose_shares: claim update may only set viewer_id/status';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger purpose_shares_claim_guard
  before update on public.purpose_shares
  for each row execute function public.enforce_purpose_share_claim_only();

create policy "share_links_list_owner" on public.share_links for select using (owner_id = auth.uid());
create policy "share_links_insert_owner" on public.share_links for insert with check (owner_id = auth.uid());
create policy "share_links_delete_owner" on public.share_links for delete using (owner_id = auth.uid());

create policy "share_access_logs_select_owner" on public.share_access_logs for select using (owner_id = auth.uid());
create policy "share_access_logs_insert_any" on public.share_access_logs for insert with check (true);

create policy "audit_logs_select_own" on public.audit_logs for select using (user_id = auth.uid());
create policy "audit_logs_insert_own" on public.audit_logs for insert with check (user_id = auth.uid());
create policy "activity_logs_select_own" on public.activity_logs for select using (user_id = auth.uid());
create policy "activity_logs_insert_own" on public.activity_logs for insert with check (user_id = auth.uid());

create policy "backup_history_own" on public.backup_history for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "account_balance_history_select_own" on public.account_balance_history for select using (user_id = auth.uid());
create policy "account_balance_history_insert_own" on public.account_balance_history for insert with check (user_id = auth.uid());
create policy "account_balance_history_update_own" on public.account_balance_history for update using (user_id = auth.uid());

create policy "global_settings_select_authenticated" on public.global_settings for select using (auth.role() = 'authenticated');
create policy "global_settings_write_admin" on public.global_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "mail_templates_select_authenticated" on public.mail_templates for select using (auth.role() = 'authenticated');
create policy "mail_templates_write_admin" on public.mail_templates for all using (public.is_admin()) with check (public.is_admin());

create policy "reflections_own" on public.reflections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "smart_alerts_own" on public.smart_alerts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "income_streams_own" on public.income_streams for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "income_targets_own" on public.income_targets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "savings_goals_own" on public.savings_goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projector_settings_own" on public.projector_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ai_chat_messages_own" on public.ai_chat_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ai_insights_own" on public.ai_insights for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "sms_template_rules_select_authenticated" on public.sms_template_rules for select using (auth.role() = 'authenticated');
create policy "sms_template_rules_write_admin" on public.sms_template_rules for all using (public.is_admin()) with check (public.is_admin());
create policy "sms_detection_rules_select_authenticated" on public.sms_detection_rules for select using (auth.role() = 'authenticated');
create policy "sms_detection_rules_write_admin" on public.sms_detection_rules for all using (public.is_admin()) with check (public.is_admin());
create policy "sms_block_rules_select_authenticated" on public.sms_block_rules for select using (auth.role() = 'authenticated');
create policy "sms_block_rules_write_admin" on public.sms_block_rules for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Storage buckets
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false), ('backups', 'backups', false)
on conflict (id) do nothing;

create policy "receipts_owner_access" on storage.objects for all using (
  bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "backups_owner_access" on storage.objects for all using (
  bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text
);