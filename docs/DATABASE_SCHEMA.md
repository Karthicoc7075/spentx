# SpentX — Full Database Schema

> Source of truth: `supabase/migrations/init.sql` plus incremental migrations  
> `20260716` … `20260729`.  
> Backend: **Supabase (PostgreSQL)** with Row Level Security (RLS).  
> Auth identity lives in Supabase `auth.users`; app profile rows live in `public.users`.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Entity relationship summary](#2-entity-relationship-summary)
3. [Global / system tables](#3-global--system-tables)
4. [Core user workspace](#4-core-user-workspace)
5. [Transactions & splits](#5-transactions--splits)
6. [Planning](#6-planning)
7. [Social — friends, outings, settlements](#7-social--friends-outings-settlements)
8. [Sharing](#8-sharing)
9. [Wealth, growth & journal](#9-wealth-growth--journal)
10. [AI](#10-ai)
11. [SMS parsing rules](#11-sms-parsing-rules)
12. [Logs, backups & devices](#12-logs-backups--devices)
13. [Admin portal tables](#13-admin-portal-tables)
14. [Views](#14-views)
15. [Functions, RPCs & triggers](#15-functions-rpcs--triggers)
16. [Row Level Security](#16-row-level-security)
17. [Storage buckets](#17-storage-buckets)
18. [Migration history](#18-migration-history)
19. [Important design notes](#19-important-design-notes)

---

## 1. Architecture overview

| Layer | Technology |
|-------|------------|
| App | Next.js 16 (App Router), React 19 |
| Auth | Supabase Auth (`auth.users`) |
| Database | PostgreSQL via Supabase |
| Access control | RLS on every public table + admin SECURITY DEFINER RPCs |
| API path | Browser → Next.js `/api/proxy/[...path]` → Supabase (logged in `user_api_logs`) |
| Storage | Supabase Storage: `receipts`, `backups` |
| Extensions | `pgcrypto` (UUIDs); optional `pg_cron` for log retention |

### Soft-delete pattern

Many user-owned entities use soft delete instead of hard delete:

| Column | Meaning |
|--------|---------|
| `is_active` | `false` = archived / hidden from pickers |
| `deleted_at` | When archived |
| `deleted_by` | Who archived (`auth.users` id) |

Applied to: `accounts`, `purposes`, `categories`, `contributors`, `friends`, `outings`.

### Identity conventions

| Concept | Storage |
|---------|---------|
| User id | `uuid` = `auth.users.id` |
| Primary keys | Mostly `uuid` + `gen_random_uuid()` |
| Money | `numeric(14,2)` |
| Month keys | `text` as `YYYY-MM` |
| Category on splits | `transaction_splits.category_id` stores **category name** (text), not always a UUID — joins in views match on **name** |

---

## 2. Entity relationship summary

```
auth.users
    │
    ├── users (profile + settings)
    │     └── default_account_id → accounts
    │
    ├── accounts ──┬── account_purposes ── purposes
    │              └── account_balance_history
    │
    ├── categories (user custom; defaults in global_settings)
    ├── contributors
    ├── user_merchants (learned SMS payee → merchant map)
    │
    ├── transactions ── transaction_splits
    │       │                  │
    │       │                  ├── purpose_id → purposes
    │       │                  ├── contributor_id → contributors
    │       │                  └── outing_id → outings
    │       └── outing_id → outings
    │
    ├── monthly_plans / budget_templates / smart_views
    ├── friends
    ├── outings ── outing_expenses ── settlements
    ├── purpose_shares / share_links / share_access_logs
    ├── reflections / smart_alerts
    ├── income_streams / income_targets / savings_goals / projector_settings
    ├── ai_chat_messages / ai_insights
    ├── net_worth_history
    ├── audit_logs / activity_logs / backup_history
    ├── user_devices / login_history
    └── user_api_logs (admin-readable)

global_settings (single row id='app')
mail_templates
sms_*_rules
admin_action_logs
admin_impersonation_sessions
```

---

## 3. Global / system tables

### 3.1 `global_settings`

Single shared config row (`id = 'app'`). Do not add a second global config table — add columns here.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | `text` PK | `'app'` | Only one row |
| `app_name` | `text` | `'SpentX'` | |
| `logo_url` | `text` | null | |
| `default_safe_spending_percentage` | `numeric(5,2)` | `20` | |
| `max_category_limit` | `integer` | `50` | Per-user cap |
| `max_purposes_limit` | `integer` | `10` | |
| `max_accounts_limit` | `integer` | `10` | |
| `max_contributors_limit` | `integer` | `10` | |
| `app_version` | `text` | `'1.0.0'` | |
| `maintenance_mode` | `boolean` | `false` | Non-admins blocked in UI |
| `default_monthly_budget` | `numeric(14,2)` | `0` | |
| `default_categories` | `jsonb` | `[]` | Seeded shared categories |

**Seeded default categories** (abbreviated):  
Income: Salary, Freelance / Business, Investments, Rental Income, Bonus, Gifts Received, Interest, Other Income.  
Expense: Food & Dining, Groceries, Transportation, Rent / Housing, Utilities, Healthcare, Entertainment, Shopping, Education, Travel, Bills & EMI, Personal Care, Gifts & Donations, Miscellaneous, **Investment** (`isInvestment: true`).

Each default category object shape:

```json
{
  "id": "cat-exp-1",
  "name": "Food & Dining",
  "type": "expense",
  "color": "#f97316",
  "icon": "utensils",
  "order": 101,
  "isInvestment": false
}
```

### 3.2 `mail_templates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | Template key |
| `name` | `text` | |
| `subject` | `text` | |
| `html` | `text` | |
| `variables` | `text[]` | Placeholder names |
| `is_active` | `boolean` | |
| `updated_at` | `timestamptz` | |

---

## 4. Core user workspace

### 4.1 `users`

App profile linked 1:1 with `auth.users`.

| Column | Type | Default / check | Notes |
|--------|------|-----------------|-------|
| `id` | `uuid` PK | → `auth.users(id)` ON DELETE CASCADE | |
| `schema_version` | `smallint` | `1` | |
| `name` | `text` | not null | |
| `email` | `text` | not null | |
| `photo_url` | `text` | | |
| `phone` | `text` | | |
| `role` | `text` | `'user'` | `user` \| `admin` |
| `joined_at` | `timestamptz` | `now()` | |
| `theme` | `text` | `'system'` | `light` \| `dark` \| `system` |
| `private_mode` | `boolean` | `false` | Masks amounts in UI |
| `default_account_id` | `uuid` | FK → `accounts` | Set after accounts exist |
| `notifications` | `boolean` | `true` | |
| `monthly_safe_spending_alert` | `boolean` | `false` | |
| `dashboard_kpi_cards` | `text[]` | | Ordered KPI keys |
| `currency` | `text` | `'INR'` | *migration 20260718* |
| `timezone` | `text` | `'Asia/Kolkata'` | *migration 20260718* |
| `language` | `text` | `'en'` | *migration 20260718* |
| `show_bank_onboarding` | `boolean` | `true` | *migration 20260718* |
| `app_pin_reset_at` | `timestamptz` | null | *migration 20260725* — marks a mobile-app PIN reset request; **the PIN itself is never stored server-side** |
| `updated_at` | `timestamptz` | `now()` | Trigger-maintained |

### 4.2 `accounts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | Owner |
| `name` | `text` | e.g. Cash, HDFC |
| `type` | `text` | `bank` \| `cash` \| `wallet` \| `credit` |
| `last4` | `text` | Optional last 4 digits |
| `opening_balance` | `numeric(14,2)` | Seed balance |
| `opening_balance_date` | `date` | When opening balance applies |
| `purpose_ids` | `uuid[]` | Legacy array; also see `account_purposes` |
| `is_default` | `boolean` | One active default per user (partial unique index) |
| `can_delete` | `boolean` | System Cash = false |
| `is_active` | `boolean` | Soft delete |
| `needs_rename` | `boolean` | Bootstrap bank placeholder |
| `deleted_at` / `deleted_by` | | Soft-delete metadata |
| `created_at` / `updated_at` | `timestamptz` | |

**Index:** `accounts_one_default_per_user` unique on `(user_id)` where `is_default and is_active`.

### 4.3 `account_purposes` *(migration 20260718)*

Junction table linking accounts ↔ purposes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `account_id` | `uuid` → accounts | CASCADE |
| `purpose_id` | `uuid` → purposes | CASCADE |
| `created_at` | `timestamptz` | |
| UNIQUE | `(account_id, purpose_id)` | |

### 4.4 `purposes`

Budget “buckets” (e.g. Personal, Home, Trip fund). Transactions are attributed via splits.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `name` | `text` | |
| `color` | `text` | |
| `is_default` | `boolean` | Personal is default |
| `can_delete` | `boolean` | |
| `is_active` | `boolean` | Soft delete |
| `deleted_at` / `deleted_by` | | |
| `created_at` | `timestamptz` | |

> **Migration 20260724:** "Family" is now a mandatory (but toggleable, non-deletable) purpose seeded alongside "Personal" for every user — `handle_new_user()` was updated to create both on signup, and existing workspaces were backfilled with a Family purpose if missing.

### 4.5 `categories`

User-owned **custom** categories. Shared defaults live in `global_settings.default_categories` (merged in app read-model).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `name` | `text` | |
| `type` | `text` | `income` \| `expense` |
| `color` | `text` | |
| `icon` | `text` | default `'tag'` |
| `is_investment` | `boolean` | Expense counts toward Total Investment |
| `can_delete` | `boolean` | |
| `is_active` | `boolean` | Soft delete |
| `deleted_at` / `deleted_by` | | |
| `created_at` | `timestamptz` | |

### 4.6 `contributors`

Who contributed income / is tagged on a split (household members). Permanent default: **Me**.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `name` | `text` | |
| `color` | `text` | |
| `is_default` | `boolean` | Me = true, non-deletable |
| `can_delete` | `boolean` | |
| `is_active` | `boolean` | Soft delete |
| `deleted_at` / `deleted_by` | | |
| `created_at` | `timestamptz` | |

### 4.7 `user_merchants` *(migration 20260727)*

Per-user (not global) learned SMS payee → merchant mapping: the first SMS from a payee needs manual verification; subsequent SMS from the same normalized payee auto-adds a transaction.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` → auth.users | CASCADE |
| `payee` | `text` | Raw payee string from the SMS |
| `normalized_payee` | `text` | Normalized for matching |
| `title` | `text` | Display name |
| `purpose` | `text` | default `'Personal'` |
| `category` | `text` | default `'Other'` |
| `is_auto_apply` | `boolean` | default `true` |
| `verified_at` | `timestamptz` | |
| `created_at` / `updated_at` | `timestamptz` | |
| UNIQUE | `(user_id, normalized_payee)` | |

RLS: owner-only, split select/insert/update/delete policies. No corresponding TypeScript type in `src/types/index.ts` — likely typed locally near its usage or mobile-only.

---

## 5. Transactions & splits

### 5.1 `transactions`

Parent document: identity + total amount. **Per-purpose category/amount lives in `transaction_splits`.**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `schema_version` | `smallint` | `1` |
| `account_id` | `uuid` → accounts | ON DELETE RESTRICT |
| `merchant` | `text` | |
| `total_amount` | `numeric(14,2)` | |
| `type` | `text` | `income` \| `expense` |
| `payment_method` | `text` | default `'UPI'` |
| `source` | `text` | `manual` \| `mobile` \| `bank-sync` \| `import` |
| `entry_source` | `text` | `manual` \| `mobile-manual` \| `sms-auto-detected` |
| `transaction_date` | `timestamptz` | |
| `month_key` | `text` | `YYYY-MM` denormalized |
| `description` | `text` | |
| `note` | `text` | |
| `receipt_url` | `text` | Storage path/URL |
| `reference` | `text` | Free-text ref / UTR |
| `reference_id` | `text` | Alias / secondary ref |
| `upi` | `text` | **Merchant identifier** (UPI VPA / phone / stable id) — *migration 20260733* |
| `raw_identifier` | `text` | Stable learning key (often same as `upi`) — *migration 20260733* |
| `status` | `text` | `completed` \| `pending` \| `failed` \| `refunded` |
| `has_splits` | `boolean` | True if >1 split row |
| `tags` | `text[]` | legacy `upi:…` tags still accepted; prefer `upi` column |
| `outing_id` | `uuid` → outings | ON DELETE SET NULL |
| `created_at` / `updated_at` | `timestamptz` | |

**Indexes:**  
`(user_id, transaction_date desc)`, `(user_id, month_key)`, `(user_id, account_id)`, `(user_id, type)`, GIN full-text on `merchant`, partial indexes on `(user_id, upi)` and `(user_id, raw_identifier)`.

> **Removed / not present:** There is **no** `investments` table. Investment = expense whose category has `is_investment = true`. Parent `transactions` has **no** `is_investment` / `investment_*` columns.

### 5.2 `transaction_splits`

Source of truth for per-purpose math.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `transaction_id` | `uuid` → transactions | CASCADE |
| `user_id` | `uuid` | |
| `purpose_id` | `uuid` → purposes | RESTRICT |
| `category_id` | `text` | **Name-based** in current write path |
| `contributor_id` | `uuid` → contributors | SET NULL |
| `outing_id` | `uuid` → outings | SET NULL |
| `amount` | `numeric(14,2)` | |
| `note` | `text` | |

**Indexes:** transaction, purpose, outing.

Atomic create RPC: `create_transaction_with_splits(p_transaction jsonb, p_splits jsonb)`.

---

## 6. Planning

### 6.1 `monthly_plans`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `schema_version` | `smallint` | |
| `month` | `text` | `YYYY-MM` |
| `title` | `text` | Optional display title (*20260719*) |
| `purpose_id` | `uuid` → purposes | CASCADE; null = all/unscoped |
| `expected_income` | `numeric(14,2)` | |
| `allocations` | `jsonb` | Array of planned category amounts |
| `daily_safe_limit` | `numeric(14,2)` | |
| `savings_target` | `numeric(14,2)` | |
| `budget_set_at` | `timestamptz` | |
| `is_budget_locked` | `boolean` | |
| `change_history` | `jsonb` | Audit trail of plan edits |
| `last_modified_by` | `uuid` | |
| `created_at` / `updated_at` | | |
| UNIQUE | `(user_id, month, purpose_id)` | |

**Allocation object (jsonb element):**

```json
{
  "id": "...",
  "category": "Food & Dining",
  "plannedAmount": 8000,
  "color": "#f97316",
  "notes": "",
  "rollover": false
}
```

**Trigger:** `monthly_plans_validate_allocations` — sum of `plannedAmount` must be ≤ `expected_income`.

### 6.2 `budget_templates`

Reusable plan templates (e.g. Default Budget on signup).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `schema_version` | `smallint` | |
| `template_name` | `text` | |
| `expected_income` | `numeric(14,2)` | |
| `allocations` | `jsonb` | Same shape as plans |
| `is_default` | `boolean` | |
| `created_at` / `updated_at` | | |

### 6.3 `smart_views`

Reusable **month-agnostic** filter templates for Analysis.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `name` | `text` | |
| `account_id` | `uuid` | nullable |
| `purpose_id` | `uuid` | nullable |
| `category_ids` | `text[]` | |
| `contributor_id` | `uuid` | nullable |
| `created_at` / `updated_at` | | |

No date/month column by design — applying a view never changes the selected month.

---

## 7. Social — friends, outings, settlements

### 7.1 `friends`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `name` | `text` | |
| `phone` / `email` | `text` | |
| `upi` | `text` | Primary / preferred UPI VPA |
| `upi_ids` | `text[]` not null default `{}` | **All** UPI handles for one friend (GPay, PhonePe, bank, …) — *hardened in 20260734* |
| `notes` | `text` | |
| `is_active` | `boolean` | Soft delete |
| `deleted_at` / `deleted_by` | | |
| `created_at` / `updated_at` | | |

### 7.2 `outings`

Group trips / dinners / shared events.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | Owner workspace |
| `created_by` | `uuid` | Creator |
| `title` | `text` | |
| `type` | `text` | Free-form type/category |
| `location` | `text` | |
| `budget` | `numeric(14,2)` | Optional cap |
| `start_date` / `end_date` | `timestamptz` | |
| `members` | `jsonb` | Array of member objects |
| `participants` | `uuid[]` | App user ids (shared outings) |
| `status` | `text` | `active` \| `completed` \| `cancelled` |
| `auto_add_mode` | `boolean` | Auto-link bank/mobile expenses |
| `total_spent` | `numeric(14,2)` | Rollup |
| `is_active` | `boolean` | Soft delete |
| `deleted_at` / `deleted_by` | | |
| `created_at` / `updated_at` | | |

**Member object (jsonb):**

```json
{
  "id": "member-local-id",
  "name": "Rahul",
  "upiId": "rahul@upi",
  "friendId": "optional-friends-uuid",
  "isCurrentUser": true
}
```

### 7.3 `outing_expenses`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `outing_id` | `uuid` → outings | CASCADE |
| `description` | `text` | |
| `amount` | `numeric(14,2)` | |
| `category_id` | `text` | |
| `expense_date` | `timestamptz` | |
| `paid_by_member_id` | `text` | Matches member id in outing |
| `split_type` | `text` | `equally` \| `solo` \| `custom` \| `percentage` \| `shares` |
| `splits` | `jsonb` | `[{ memberId, amount }]` |
| `source` | `text` | `manual` \| `bank-detected` |
| `linked_transaction_id` | `uuid` → transactions | SET NULL |
| `created_at` / `updated_at` | | |

**Index (migration 20260728):** unique partial index `(user_id, linked_transaction_id) where linked_transaction_id is not null` — prevents a race between web's outing auto-sync (`useOutingTransactionSync`) and mobile's SMS auto-add from double-inserting an outing expense for the same transaction. The migration also de-duplicated existing rows first, keeping the earliest per `(user_id, linked_transaction_id)`.

### 7.4 `settlements`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `outing_id` | `uuid` → outings | CASCADE |
| `from_member_id` | `text` | Who paid |
| `to_member_id` | `text` | Who received |
| `amount` | `numeric(14,2)` | |
| `is_partial` | `boolean` | |
| `settled_date` | `timestamptz` | |
| `note` | `text` | |
| `created_at` | `timestamptz` | |

---

## 8. Sharing

Two complementary flows:

1. **Email invite / claimed viewer** → `purpose_shares` + signed-in viewer RLS  
2. **No-login token link** → `share_links` + security-definer RPCs for `anon`

### 8.1 `purpose_shares`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `owner_id` | `uuid` | Sharer |
| `viewer_email` | `text` | Invitee email |
| `viewer_id` | `uuid` | Set when claimed |
| `purpose_id` | `uuid` → purposes | |
| `role` | `text` | Only `'viewer'` |
| `link_token` | `uuid` | Optional link claim |
| `contributor_id` | `uuid` | Optional scope (*20260717*) |
| `expires_at` | `timestamptz` | |
| `status` | `text` | `pending` \| `active` \| `revoked` |
| `last_viewed_at` | `timestamptz` | Denormalized |
| `total_views` | `integer` | Denormalized |
| `created_at` | `timestamptz` | |
| UNIQUE | `(purpose_id, viewer_id)` | |
| Partial unique | `(owner_id, purpose_id, viewer_email)` where status ≠ revoked | One active share |

### 8.2 `share_links`

Token is the **primary key** (secret).

| Column | Type | Notes |
|--------|------|-------|
| `token` | `uuid` PK | Secret in URL `/share/[token]` |
| `owner_id` | `uuid` | |
| `purpose_id` | `uuid` | |
| `purpose_name` | `text` | Snapshot |
| `viewer_email` | `text` | |
| `contributor_id` | `uuid` | Optional filter (*20260717*) |
| `expires_at` | `timestamptz` | |
| `last_viewed_at` | `timestamptz` | Token-only views (*20260716*) |
| `total_views` | `integer` | default 0 |
| `created_at` | `timestamptz` | |

### 8.3 `share_access_logs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `share_id` | `uuid` | Nullable for pure token visits |
| `owner_id` | `uuid` | |
| `purpose_id` | `uuid` | |
| `token` | `uuid` → share_links | |
| `viewed_at` | `timestamptz` | |
| `page` | `text` | dashboard / transactions / analysis |
| `device` / `browser` / `os` / `country` | `text` | Optional UA metadata |

---

## 9. Wealth, growth & journal

### 9.1 `account_balance_history`

Manual / logged balance snapshots per account.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `account_id` | `uuid` | CASCADE |
| `user_id` | `uuid` | |
| `balance` | `numeric(14,2)` | |
| `snapshot_date` | `date` | |
| `month_key` | `text` | |
| `created_at` | `timestamptz` | |
| UNIQUE | `(account_id, snapshot_date)` | |

### 9.2 `net_worth_history` *(20260718)*

Daily net-worth rollup per user.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `snapshot_date` | `date` | |
| `cash_balance` | `numeric(14,2)` | |
| `bank_balance` | `numeric(14,2)` | |
| `investment_value` | `numeric(14,2)` | |
| `net_worth` | `numeric(14,2)` | |
| `created_at` | `timestamptz` | |
| UNIQUE | `(user_id, snapshot_date)` | |

### 9.3 `reflections` (Journal)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `week_start` | `date` | Week key |
| `mood` | `integer` | default 3 |
| `wins` | `text` | |
| `unnecessary_spend` | `text` | |
| `plan_adherence` | `integer` | default 3 |
| `plan_adherence_note` | `text` | |
| `different_next_week` | `text` | |
| `standout_transactions` | `text` | |
| `ai_summary` | `text` | Generated |
| `created_at` / `updated_at` | | |
| UNIQUE | `(user_id, week_start)` | |

### 9.4 `smart_alerts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `type` | `text` | burn-rate, plan-deviation, daily-limit, etc. |
| `title` / `message` | `text` | |
| `severity` | `text` | `low` \| `medium` \| `high` |
| `read` | `boolean` | |
| `created_at` | `timestamptz` | |

### 9.5 `income_streams` (Growth)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `source` | `text` | Label |
| `amount` | `numeric(14,2)` | |
| `frequency` | `text` | `monthly` \| `one-time` |
| `last_received` | `date` | |
| `created_at` / `updated_at` | | |

### 9.6 `income_targets`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `uuid` PK | One row per user |
| `target_3_months` | `numeric(14,2)` | |
| `target_6_months` | `numeric(14,2)` | |
| `target_12_months` | `numeric(14,2)` | |
| `active_horizon` | `integer` | `3` \| `6` \| `12` |
| `updated_at` | `timestamptz` | |

### 9.7 `savings_goals`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `name` | `text` | |
| `target_amount` | `numeric(14,2)` | |
| `saved_amount` | `numeric(14,2)` | |
| `monthly_contribution` | `numeric(14,2)` | |
| `created_at` / `updated_at` | | |

### 9.8 `projector_settings`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `uuid` PK | |
| `settings` | `jsonb` | Future-self projection inputs |
| `updated_at` | `timestamptz` | |

---

## 10. AI

### 10.1 `ai_chat_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `role` | `text` | `user` \| `assistant` |
| `content` | `text` | |
| `timestamp` | `timestamptz` | |

### 10.2 `ai_insights`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `month` | `text` | `YYYY-MM` |
| `type` | `text` | e.g. `financial_health` |
| `health_score` | `integer` | |
| `summary` | `text` | |
| `tips` | `text[]` | |
| `generated_at` | `timestamptz` | |
| UNIQUE | `(user_id, month, type)` | |

---

## 11. SMS parsing rules

Admin-managed; readable by authenticated users (mobile app consumption).

### 11.1 `sms_template_rules`

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `bank_name` | text |
| `type` | text (debit / credit / transfer) |
| `mode` | text (upi / atm / card) |
| `template_pattern` | text |
| `extraction_map` | jsonb |
| `keywords` | text[] |
| `is_active` | boolean |
| `created_by` | uuid |
| `sample_message` | text — *migration 20260726* |
| `similarity_threshold` | numeric — *migration 20260726* |
| `created_at` / `updated_at` | |

### 11.2 `sms_detection_rules`

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `match_pattern` | text |
| `contains_keywords` / `exclude_keywords` | text[] |
| `amount_pattern` | text |
| `type` / `mode` / `bank_name` | text |
| `is_active` | boolean |
| `created_by` | uuid |
| `sample_message`, `name_pattern`, `date_pattern`, `ref_pattern`, `account_pattern`, `upi_pattern` | text — *migration 20260726* |
| timestamps | |

### 11.3 `sms_block_rules`

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `name` | text |
| `keywords` | text[] |
| `pattern` | text |
| `similarity_threshold` | numeric(4,3) default 0.8 |
| `is_active` | boolean |
| `created_by` | uuid |
| `sample_message` | text — *migration 20260726* |
| timestamps | |

> **Migration 20260726 ("SMS rules mobile parity"):** widened all three rule tables with `sample_message`/pattern-detail columns so the mobile app's on-device SMS trainer and the web admin rule editor stay in sync.

---

## 12. Logs, backups & devices

### 12.1 `audit_logs` (append-oriented)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `table_name` | `text` | |
| `record_id` | `uuid` | |
| `action` | `text` | `create` \| `update` \| `delete` |
| `before` / `after` | `jsonb` | |
| `created_at` | `timestamptz` | |

### 12.2 `activity_logs`

Human-readable activity feed.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `type` | `text` | See allowed values below |
| `message` | `text` | |
| `entity_table` | `text` | |
| `entity_id` | `uuid` | |
| `created_at` | `timestamptz` | |

**Allowed `type` values:**

```
account_created, account_deleted,
transaction_added, transaction_updated, transaction_deleted,
plan_updated, purpose_shared, purpose_share_revoked,
outing_completed, outing_created, settlement_recorded,
backup_created, category_created, contributor_created,
user_registered, purpose_created, budget_template_created
```

### 12.3 `backup_history`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | |
| `schema_version` | `smallint` | |
| `type` | `text` | `automatic` \| `manual` |
| `frequency` | `text` | `daily` \| `weekly` \| `monthly` |
| `storage_path` | `text` | In `backups` bucket |
| `size_bytes` | `bigint` | |
| `backup_schema_version` | `text` | App backup format version |
| `manifest` | `text[]` | Tables/collections included |
| `status` | `text` | `success` \| `failed` |
| `error_message` | `text` | |
| `created_at` | `timestamptz` | |

App backup constants: `BACKUP_VERSION = "1.0"`, `BACKUP_SCHEMA_VERSION = "2.0-supabase"`.

### 12.4 `user_devices` *(20260718)*

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `user_id` | uuid |
| `device_label` | text |
| `user_agent` | text |
| `platform` | text |
| `last_seen_at` | timestamptz |
| `created_at` | timestamptz |

### 12.5 `login_history` *(20260718)*

| Column | Type |
|--------|------|
| `id` | uuid PK |
| `user_id` | uuid |
| `logged_in_at` | timestamptz |
| `user_agent` | text |
| `platform` | text |

### 12.6 `user_api_logs` *(20260722)*

Every proxied REST/RPC/auth/storage call. **Admin-only read.** Writes via service role only.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | No FK (survives account delete) |
| `user_email` / `user_name` | `text` | Snapshot |
| `actor_role` | `text` | `user` \| `admin` \| `anonymous` |
| `api_type` | `text` | `rest_select/insert/update/delete`, `rpc`, `route_handler`, `auth`, `storage`, `realtime` |
| `api_name` | `text` | Table / function / path |
| `method` | `text` | HTTP method |
| `status` | `text` | `success` \| `error` |
| `status_code` | `integer` | |
| `error_message` | `text` | |
| `request_size_bytes` / `response_size_bytes` | `integer` | |
| `duration_ms` | `integer` | |
| `ip_address` | `text` | |
| `device` / `browser` / `os` / `user_agent` | `text` | |
| `impersonated_by_admin_id` | `uuid` | Set during impersonation (*20260723*) |
| `created_at` | `timestamptz` | |

**Retention:** `cleanup_user_api_logs()` deletes rows older than **90 days** (pg_cron when available).

---

## 13. Admin portal tables

### 13.1 `admin_action_logs` *(20260720+, expanded later)*

Append-only. No update/delete policies.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `admin_id` | `uuid` → auth.users | nullable, `ON DELETE SET NULL` (*fixed 20260729*) |
| `action` | `text` | See below |
| `table_name` | `text` | |
| `record_id` | `text` | Text PK support (token, etc.) |
| `before` | `jsonb` | Pre-delete / pre-update image |
| `target_user_id` | `uuid` | nullable, `ON DELETE SET NULL` (*fixed 20260729*) |
| `impersonation_session_id` | `uuid` | *20260723* |
| `created_at` | `timestamptz` | |

**Action vocabulary (final after 20260723):**

```
view_table, view_row, create, update, delete, export,
password_reset, impersonate_start, impersonate_end
```

### 13.2 `admin_impersonation_sessions` *(20260723)*

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `admin_id` | `uuid` | Real admin — nullable, `ON DELETE SET NULL` (*fixed 20260729*) |
| `target_user_id` | `uuid` | Impersonated user — nullable, `ON DELETE SET NULL` (*fixed 20260729*) |
| `started_at` | `timestamptz` | |
| `ended_at` | `timestamptz` | null while active |
| `last_active_at` | `timestamptz` | Proxy enforces ~30 min inactivity |

**Design:** No Supabase Auth session is created for the target. Admin JWT remains; proxy forces target scope with service role and attributes both parties in logs.

> **Migration 20260729 ("admin delete user FK fix"):** both `admin_action_logs` and `admin_impersonation_sessions` had their `admin_id`/`target_user_id` foreign keys relaxed from the default (which would block the delete) to `ON DELETE SET NULL`. This matters because the admin "Delete user" flow (`DELETE /api/admin/users/[id]`) writes a before-image audit log **before** calling `auth.admin.deleteUser(id)` — without this fix, deleting a user could FK-violate against the very audit row the delete flow itself just wrote.

---

## 14. Views

### 14.1 `monthly_plan_actuals`

Joins `monthly_plans` with transactions/splits for the plan month:

| Output | Meaning |
|--------|---------|
| `plan_id`, `user_id`, `month`, `purpose_id` | Plan identity |
| `expected_income` | From plan |
| `actual_expense` / `actual_income` | Summed from splits |
| `total_planned` | Sum of allocation plannedAmounts |
| `remaining_budget` | expected − actual expense |
| `variance` | actual expense − total planned |

### 14.2 `investment_totals`

Per-user sum of expense split amounts where category is investment (user category `is_investment` **or** matching default category `isInvestment` by **name**).

| Output | Meaning |
|--------|---------|
| `user_id` | Owner |
| `total_invested` | Sum |

---

## 15. Functions, RPCs & triggers

### 15.1 Auth / bootstrap

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger on `auth.users` INSERT: creates profile, Personal purpose, Cash + Account 1, Me contributor, Default Budget template |
| Trigger `on_auth_user_created` | Calls `handle_new_user` |

Client also runs idempotent `bootstrapUserWorkspace()` for schema-complete setup (currency, account_purposes, net worth, devices, login).

### 15.2 Transactions

| Function | Purpose |
|----------|---------|
| `create_transaction_with_splits(jsonb, jsonb)` | Atomic parent + splits (invoker; uses `auth.uid()`) |
| `impersonation_create_transaction_with_splits(uuid, jsonb, jsonb)` | Service-role only; injects target `p_user_id` |

### 15.3 Plans

| Function | Purpose |
|----------|---------|
| `validate_plan_allocations()` | BEFORE INSERT/UPDATE on monthly_plans |
| Trigger `monthly_plans_validate_allocations` | Enforces allocations ≤ expected_income |

### 15.4 Sharing (security definer; many granted to `anon`)

| Function | Purpose |
|----------|---------|
| `get_share_link(uuid)` | Resolve non-expired token |
| `get_shared_transactions(uuid)` | Shared purpose txs (+ contributor filter) |
| `get_shared_purposes(uuid)` | Purpose row for token |
| `get_shared_monthly_plan(uuid, text)` | Plan for month |
| `log_shared_page_view(uuid, text)` | Access log + view counters |

### 15.5 Admin RPCs (all start with `require_admin()`)

| Function | Purpose |
|----------|---------|
| `require_admin()` | Raises if not admin |
| `is_admin()` | Boolean helper |
| `admin_allowed_tables()` | Read allow-list |
| `admin_deletable_tables()` | Delete allow-list |
| `admin_table_pk(text)` | PK column name |
| `admin_table_user_col(text)` | User-scope column |
| `admin_table_meta()` | Viewer sidebar metadata |
| `admin_list_table(...)` | Paginated table browser |
| `admin_count_table(...)` | Counts |
| `admin_delete_row(text, text)` | Audited delete |
| `admin_update_row(...)` | Audited update (*polish*) |
| `admin_log_action(...)` | Explicit view/export log |
| `admin_list_action_logs(...)` | Action log reader (+ impersonation filter) |
| `admin_get_overview()` | Dashboard KPIs |
| `admin_list_users(...)` | User list + spend |
| `admin_get_user_overview(uuid)` | User detail (auto-logs view_row) |
| `admin_add/update/delete_default_category(...)` | Global category CRUD |
| `admin_list_api_logs(...)` / `admin_count_api_logs(...)` | API log filters |
| `admin_start_impersonation(uuid)` | Start session |
| `admin_end_impersonation(uuid)` | End session |
| `cleanup_user_api_logs()` | 90-day retention (service/cron only) |

### 15.6 Misc triggers

| Trigger | Table | Action |
|---------|-------|--------|
| `*_touch_updated_at` | users, accounts, transactions, smart_views | Set `updated_at = now()` |
| `purpose_shares_claim_guard` | purpose_shares | Claim may only set viewer_id/status |

---

## 16. Row Level Security

**Enabled on all public tables listed in this document.**

### Patterns

| Pattern | Tables / policies |
|---------|-------------------|
| Owner CRUD | Most user tables: `user_id = auth.uid()` |
| Owner profile | `users`: select/update/insert own |
| Shared read (signed-in viewer) | `purposes`, `transactions`, `transaction_splits`, `monthly_plans` via `purpose_shares.viewer_id` |
| Outings | Select: creator or participant; write: creator |
| Purpose shares | Owner + viewer email claim path |
| Share links | Owner list/insert/delete |
| Share access logs | Owner select; open insert |
| Global config | Authenticated select; admin write |
| SMS rules | Authenticated select; admin write |
| Admin action logs | Admin select/insert only (no update/delete) |
| User API logs | Admin select only; client insert blocked (`with check false`) |
| Impersonation sessions | Admin only |

Admins do **not** bypass normal RLS. Cross-user access goes only through SECURITY DEFINER admin RPCs.

---

## 17. Storage buckets

| Bucket | Public | Path convention | RLS |
|--------|--------|-----------------|-----|
| `receipts` | false | `{user_id}/...` | Owner folder only |
| `backups` | false | `{user_id}/...` | Owner folder only |

---

## 18. Migration history

| File | What it adds |
|------|----------------|
| `init.sql` | Full v2 schema (tables, views, RLS, bootstrap, storage) |
| `20260716_share_view_rpcs.sql` | Anonymous share RPCs, share_links view counters, nullable share_id |
| `20260717_share_contributor_scope.sql` | `contributor_id` on shares/links; one-active-share index |
| `20260718_user_bootstrap_schema_fixes.sql` | users prefs, account_purposes, net_worth_history, user_devices, login_history, activity types |
| `20260719_monthly_plans_title.sql` | `monthly_plans.title` |
| `20260720_admin_portal.sql` | admin_action_logs + admin RPC layer |
| `20260721_admin_portal_polish.sql` | Default category RPCs, update row, expanded actions |
| `20260722_user_api_logs.sql` | Universal API logging + retention |
| `20260723_impersonation.sql` | Impersonation sessions + attribution columns + RPC |
| `20260724_default_family_purpose.sql` | Makes "Family" a mandatory (toggleable, non-deletable) purpose for every user; backfills existing workspaces; updates `handle_new_user()` |
| `20260725_app_pin_reset.sql` | `users.app_pin_reset_at` — mobile-app PIN reset marker (PIN itself never stored server-side) |
| `20260726_sms_rules_mobile_parity.sql` | Widens `sms_template_rules`/`sms_detection_rules`/`sms_block_rules` with `sample_message` + pattern-detail columns to match mobile's on-device SMS trainer |
| `20260727_user_merchants.sql` | New `user_merchants` table — per-user learned SMS payee → merchant mapping |
| `20260728_outing_expenses_dedupe.sql` | Unique partial index on `outing_expenses(user_id, linked_transaction_id)`; de-duplicates existing rows first |
| `20260729_admin_delete_user_fk_fix.sql` | Relaxes `admin_action_logs`/`admin_impersonation_sessions` `admin_id`/`target_user_id` FKs to `ON DELETE SET NULL` so admin user-deletion doesn't FK-violate its own audit log |
| `20260730_account_purpose_name_uniqueness.sql` | Account/purpose name uniqueness + soft-delete behavior |
| `20260731_outing_expense_account.sql` | `outing_expenses.account_name` / `payment_mode` |
| `20260732_admin_spend_outing_totals.sql` | Admin spend / outing totals RPCs |
| `20260733_transaction_merchant_identifier.sql` | `transactions.upi` + `raw_identifier` columns, backfill from tags/refs, RPC updates |
| `20260734_friend_multi_upi.sql` | Harden `friends.upi_ids` (not null default `{}`), backfill, GIN index for multi-UPI per friend |
| `20260735_outing_categories.sql` | Per-user `outing_categories` picker (Trip/Other/custom); seeds defaults; RLS |

**Fresh deploy:** run `init.sql` then migrations in date order.

---

## 19. Important design notes

1. **Investments are not a table** — they are expense transactions in categories with `is_investment` / `isInvestment`.
2. **Splits own the money math** — parent `transactions.total_amount` is identity total; category/purpose/contributor live on splits.
3. **`category_id` on splits is name-keyed** in the live write path; `investment_totals` joins on name intentionally.
4. **Soft delete** preserves history; hard deletes are rare (admin tools / cascade).
5. **Admin access is RPC-gated**, not “admin can read all tables via RLS.”
6. **API traffic** is audited in `user_api_logs` via Next proxy; data mutations during impersonation are dual-attributed.
7. **Share tokens** use security-definer RPCs because anonymous visitors have no `auth.uid()`.
8. **Plan validation** is client + DB trigger (allocations cannot exceed expected income).
9. **Known duplicate modeling:** `accounts.purpose_ids` (uuid[]) and the `account_purposes` junction table both express the same accounts↔purposes relationship simultaneously — unresolved duplication, not a clean migration; treat as a flag for future cleanup rather than a deliberate two-tier design.
10. **Known TS/DB drift:** `outing_expenses.split_type` allows `percentage`/`shares` at the DB layer (added for mobile), but the web `SplitType` TypeScript type only defines `equally | solo | custom` — those two values are valid to write but currently unmodeled on the web client.

---

*Document generated from SpentX codebase schema. Keep in sync when adding migrations.*  
*Companion docs: [FEATURES.md](./FEATURES.md) · [WORKFLOWS.md](./WORKFLOWS.md) · [FULL_APP_DOCUMENTATION.md](./FULL_APP_DOCUMENTATION.md) (single consolidated reference: routes, schema, lib/hooks, components, flows) · [app/FLUTTER_APP_DOCUMENTATION.md](./app/FLUTTER_APP_DOCUMENTATION.md) (mobile app, same backend)*
