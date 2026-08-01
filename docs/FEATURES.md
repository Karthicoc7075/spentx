# SpentX — Full Features Documentation

> **SpentX** is a personal finance web app (Next.js + Supabase) for tracking income/expense, multi-purpose budgeting, wealth, outings/splits, sharing, AI coaching, and an admin portal.

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Authentication & onboarding](#2-authentication--onboarding)
3. [Dashboard](#3-dashboard)
4. [Transactions](#4-transactions)
5. [Analysis (Analytics)](#5-analysis-analytics)
6. [Monthly Plan](#6-monthly-plan)
7. [Wealth](#7-wealth)
8. [Outings](#8-outings)
9. [Friends](#9-friends)
10. [Alerts](#10-alerts)
11. [Settings](#11-settings)
12. [Growth (income planning)](#12-growth-income-planning)
13. [Journal (weekly reflections)](#13-journal-weekly-reflections)
14. [AI features](#14-ai-features)
15. [Purpose sharing & read-only viewers](#15-purpose-sharing--read-only-viewers)
16. [Reports & export](#16-reports--export)
17. [Admin portal](#17-admin-portal)
18. [Platform / cross-cutting features](#18-platform--cross-cutting-features)
19. [API surface (app routes)](#19-api-surface-app-routes)
20. [Tech stack](#20-tech-stack)
21. [Feature ↔ data map](#21-feature--data-map)

---

## 1. Product overview

### What SpentX does

| Area | Capability |
|------|------------|
| Ledger | Full income/expense tracking with multi-category splits |
| Purposes | Separate money contexts (Personal, Home, etc.) |
| Plan | Monthly budget allocations with plan-vs-actual |
| Wealth | Net worth, accounts, investments, snapshots |
| Social money | Outings, friend splits, settlements |
| Insights | Analysis, smart views, smart alerts, AI coach |
| Collaboration | Share a purpose read-only (email or magic link) |
| Ops | Admin users, database browser, API logs, impersonation |

### Primary navigation (owner)

| Route | Label |
|-------|-------|
| `/` | Dashboard |
| `/transactions` | Transactions |
| `/analytics` | Analysis |
| `/plan` | Plan |
| `/wealth` | Wealth |
| `/outings` | Outings |
| `/friends` | Friends |
| `/alerts` | Alerts |
| `/settings` | Settings |

### Secondary / supporting UI (components exist)

| Feature | Status in routes | Components |
|---------|------------------|------------|
| Growth | Folder exists; not in main nav | `GrowthPage`, income streams/targets |
| Journal | Folder exists; not in main nav | `JournalPage`, reflections, AI weekly summary |

### Roles

| Role | Access |
|------|--------|
| `user` | Full own data |
| `admin` | Own data + `/admin/*` portal |
| Signed-in **viewer** | Dashboard, Transactions, Analysis only (shared purposes) |
| **Anonymous share visitor** | `/share/[token]/*` pages only |

---

## 2. Authentication & onboarding

### Auth pages

| Route | Feature |
|-------|---------|
| `/auth/sign-up` | Email/password registration |
| `/auth/sign-in` | Login |
| `/auth/confirm` | Email verification confirm |
| `/auth/forgot-password` | Request reset email |
| `/auth/reset-password` | Set new password |
| `/auth/callback` | OAuth / magic-link callback |

### Auth capabilities

- Sign up with name + email + password
- Email verification resend (`/api/auth/resend-verification`)
- Password reset flow (Resend/email templates)
- Session via Supabase Auth (SSR client)
- Sign out
- Auth gate: unauthenticated users redirected away from app shell
- Maintenance mode: when `global_settings.maintenance_mode` is on, non-admins see maintenance notice; admins remain unrestricted

### New-user bootstrap (automatic)

On first login/signup the workspace is created (DB trigger + client `bootstrapUserWorkspace`):

| Seeded entity | Detail |
|---------------|--------|
| Profile | `users` row (currency INR, timezone Asia/Kolkata, language en) |
| Purposes | **Personal** (default, non-deletable) + **Family** (toggleable, non-deletable — mandatory for every user since existing workspaces were also backfilled) |
| Accounts | **Cash** (default) + **Account 1** bank (`needs_rename`) |
| Contributor | **Me** (default, non-deletable) |
| Budget template | Default Budget |
| Optional | account↔purpose links, net-worth day zero, device/login history |
| Activity | `user_registered` activity log |

### Initial account setup modal

Dashboard can prompt bank onboarding / rename placeholder accounts (`show_bank_onboarding`).

---

## 3. Dashboard

**Route:** `/`  
**Components:** `DashboardPage`, KPI row, trend/category charts, recent transactions, AI coach drawer, quick actions.

### Features

| Feature | Description |
|---------|-------------|
| Time-aware greeting | Context-aware hello |
| Date presets | Last 7 days, this/last month, specific month, 3/6/12 months, custom |
| Purpose filter chips | Filter KPIs/charts by purpose |
| Configurable KPI cards | User-ordered cards: net worth, income, expense, savings, cash, bank, investment, monthly balance |
| KPI deltas & sparklines | Period-over-period change |
| Income vs expense trend | Daily/period charts |
| Category breakdown chart | Top expense categories |
| Recent transactions | Latest activity list |
| Quick actions menu | Fast paths (add transaction, etc.) |
| Add transaction slide-over | Inline ledger entry |
| AI Coach drawer | Chat coach with financial context |
| Sync status | Online/offline awareness |
| Private mode respect | Amounts masked when enabled |
| Multi-purpose trend | Cross-purpose spend trends |

### KPI keys (`DashboardKpiKey`)

```
net-worth, total-income, total-expense, net-savings,
cash-in-hand, bank-balance, investment-value, monthly-balance
```

---

## 4. Transactions

**Route:** `/transactions`  
**Components:** ledger table, filters, pagination, detail panel, add slide-over.

### Core ledger features

| Feature | Description |
|---------|-------------|
| Full CRUD | Create, update, delete transactions |
| Income & expense | Typed entries |
| Multi-split entries | One payment → multiple purposes/categories/amounts |
| Account assignment | Bank / cash / wallet / credit |
| Contributor tagging | Household income attribution |
| Outing link | Optional `outingId` |
| Merchant, note, description | Free text |
| Payment method | Default UPI |
| Tags | Text tags |
| Status | completed / pending / failed / refunded |
| Sources | manual, mobile, bank-sync, import |
| Entry source | manual, mobile-manual, sms-auto-detected |
| Month key indexing | Fast month queries |
| Receipts | `receipt_url` storage support |
| Search / filters | Type, account, category, purpose, contributor, amount range, date |
| Pagination | Large ledgers |
| Transaction detail panel | Side detail view |
| Realtime subscription | Live updates when enabled |
| Export | Via shell export control |

### Atomic write

`create_transaction_with_splits` writes parent + all split rows in one DB call (also impersonation variant for admins).

### Opening balance category

Special category **"Opening Balance"** is excluded from double-counting when account `openingBalance` is already applied in wealth math.

---

## 5. Analysis (Analytics)

**Route:** `/analytics`  
**Components:** `AnalysisPage`, breakdowns, smart views, plan-vs-actual, merchants.

### Features

| Feature | Description |
|---------|-------------|
| Hero stats | Income, expense, net savings, savings rate, investment total/rate, tx count |
| Date presets | This/last month, last 3 months, this year, custom |
| Compare modes | Previous month, avg 3 months, avg 6 months |
| Category breakdown | Spend by category |
| Contributor breakdown | Who spent/contributed |
| Monthly comparison timeline | Multi-month view |
| Plan vs actual table | Budget utilization per category |
| Top merchants table | Highest merchants by spend |
| Smart Views panel | Save/load filter templates (account + purpose + categories + contributor) — **never** stores month |
| Sort options | Newest/oldest, amount high/low, merchant/category A–Z |
| Outing filters | Type, with-whom, status (when outing context present) |
| Trend granularity | Daily or weekly |
| Purpose / merchant / status / tags filters | Deep filtering |

### Smart Views

Named reusable filters stored in `smart_views`. Applying a view only sets dimensional filters; the current month selection stays unchanged.

---

## 6. Monthly Plan

**Route:** `/plan`  
**Components:** plan overview, pie chart, allocation sheet, month selector, utilization gauge, saved plans, fits-income banner.

### Features

| Feature | Description |
|---------|-------------|
| Per-month plans | Keyed by `YYYY-MM` (+ optional purpose) |
| Plan titles | Optional labels (e.g. “July Smart 2026”) |
| Expected income | Monthly income assumption |
| Category allocations | Planned amounts + colors + notes + rollover flag |
| Daily safe limit | Derived / stored safe daily spend |
| Savings target | Goal field |
| Budget lock | `isBudgetLocked` |
| Change history | JSON audit of plan edits |
| Plan templates | Save/reuse `budget_templates` |
| Utilization gauge | Actual vs planned |
| Fits income banner | Allocations must not exceed expected income |
| Plan vs actual | Integrated with Analysis |
| Add category modal | Manage allocation categories |
| DB enforcement | Trigger rejects allocations > expected income |

---

## 7. Wealth

**Route:** `/wealth`  
**Components:** segment cards, net-worth chart, snapshots, investment card, transfers, filtered txs.

### Features

| Feature | Description |
|---------|-------------|
| Net worth indicator | Total liquid + bank + investment view |
| Segment cards | Bank vs cash (and account drill-down filters) |
| Account balances | Opening balance + income − expense (excluding opening-balance ledger rows) |
| Total investment | Sum of expenses in investment-flagged categories |
| Balance snapshots | Log historical balances per account |
| Net worth history chart | Time series (`net_worth_history` / computed) |
| Quick account transfer | Move value between accounts (app logic) |
| Wealth-filtered transactions | Filter ledger by wealth segment/account |
| Savings goals | Target / saved / monthly contribution |
| Emergency fund health | Months of expenses covered |
| Future-self projector | Age, savings rate, growth/return assumptions → scenario milestones |
| Opening balance setup | Create account with opening balance + optional seed transaction |

**Investment model:** No separate investments table. Flag category with `is_investment` (defaults include **Investment**).

---

## 8. Outings

**Route:** `/outings`, `/outings/[id]`  
**Badge in nav:** NEW

### List features

| Feature | Description |
|---------|-------------|
| Create outing modal | Title, type, location, budget, dates, members |
| Outing types/categories | Trip, Temple, Restaurant, Movies, Other (and free-form filters) |
| Status | active / completed / cancelled |
| Soft delete | Archive outings |
| Budget tracking | Optional budget vs total spent |

### Trip detail features

| Feature | Description |
|---------|-------------|
| Members panel | Add friends/people, UPI ids, current user flag |
| Expense list | All outing expenses |
| Add expense dialog | Amount, category, paid-by, split type |
| Split types | equally, solo, custom (also percentage/shares in DB) |
| Expense detail sheet | Per-expense view |
| Split flow diagram | Visual who-owes-whom |
| Analysis panel | Outing-level stats |
| Settlements | Record payments between members (partial supported) |
| Settlement history | Past settlements |
| Auto-add mode | Detect bank/mobile/import txs during outing dates → prompt rollup |
| Linked transactions | `linked_transaction_id` bridges outing expense ↔ ledger; a unique DB index on `(user_id, linked_transaction_id)` prevents web's auto-sync and mobile's SMS auto-add from double-creating an expense for the same transaction |
| Rollup prompt dialog | Confirm adding detected expense into outing |

### Outing rollup — single ledger total per trip

The Transactions and Dashboard pages never show each individual outing expense in the main ledger — they hide every transaction tagged with an `outingId` except one synthetic **rollup transaction** (tagged `outing-rollup`, merchant = outing name, amount = trip total). This rollup is created/updated/deleted by `syncOutingRollup` logic whenever outing expenses change — both from manual edits inside a trip (`TripDetailPage`) **and** from the background auto-link hook (`useOutingTransactionSync`, which tags matching bank/SMS/mobile spends with an `outingId` and creates the linked `outing_expenses` row). Any feature change that adds a new way to attach a transaction to an outing must also trigger this rollup sync, or the trip's total will silently disappear from the Transactions/Dashboard views while the individual expense still exists inside the outing itself.

### Balance engine

`computeMemberBalances` / `computeTripSummary`:

- +amount for payer of each expense  
- −split amount for each participant  
- settlements adjust balances  
- Shows your share and pending settlement pressure  

---

## 9. Friends

**Route:** `/friends`, `/friends/[id]`

| Feature | Description |
|---------|-------------|
| Friend list | Name, phone, email, UPI(s), notes |
| Soft delete | `is_active` |
| Friend detail | Edit contact / UPI for settlements |
| Outing integration | Members can reference `friendId` |

---

## 10. Alerts

**Route:** `/alerts`  
**Engine:** `generateSmartAlerts`

### Alert types

| Type | When |
|------|------|
| `burn-rate` | Mid-month spend already >50% of plan → projected overspend |
| `plan-deviation` | Category weekly spend >> weekly share of allocation |
| `daily-limit` | Daily safe spending exceeded |
| `budget-threshold` | Budget utilization thresholds |
| `reflection-reminder` | Weekly reflection due |
| `income` | Income-related notifications |

### Alert UX

| Feature | Description |
|---------|-------------|
| Severity | low / medium / high |
| Read / unread | Mark one or all read |
| Notification bell | Shell header unread indicator |
| Persistence | `smart_alerts` table |
| Realtime | Optional subscribe to alerts |

---

## 11. Settings

**Route:** `/settings`  
**Tabs:**

| Tab | Features |
|-----|----------|
| **Profile** | Name, email, photo, phone |
| **Preferences** | Theme (light/dark/system), notifications, private mode, monthly safe-spending alert, default account, dashboard KPI order |
| **Purposes** | Create/rename/archive purposes (limit via global settings) |
| **Sharing** | Invite viewers by email, magic links, revoke, view stats, optional contributor scope |
| **Contributors** | Manage household contributors (Me locked) |
| **Categories** | Custom categories; investment flag; merge with global defaults |
| **Accounts** | CRUD accounts, opening balance, types, soft delete, default account |
| **Security** | Password reset send; mobile app PIN reset request (`app_pin_reset_at` marker — PIN itself never stored server-side) |
| **Data & Backups** | Manual backup ZIP, restore, backup history, auto-backup hooks |
| **Global Settings** | Admin only — app config, maintenance, limits |
| **SMS Rules** | Admin only — template / detection / block rules for mobile SMS parsing, incl. a sample-message trainer that tags words (Amount/Bank/Date/etc.) to build a template pattern |

### Resource limits (from `global_settings`)

- max categories, purposes, accounts, contributors  
- default safe spending %  
- default monthly budget  

---

## 12. Growth (income planning)

**UI:** `GrowthPage` (+ hooks/libs). Route folder present; feature fully implemented in components.

| Feature | Description |
|---------|-------------|
| Income streams | Named sources, amount, monthly/one-time, last received |
| Auto-detect streams | Seed streams from income transactions |
| Income targets | 3 / 6 / 12 month targets + active horizon |
| Income trend chart | Up to 12 months |
| Growth suggestions | Heuristic AI-style suggestions from spend/income gap |

**Tables:** `income_streams`, `income_targets`.

---

## 13. Journal (weekly reflections)

**UI:** `JournalPage` (+ AI weekly summary). Route folder present; feature implemented in components.

| Feature | Description |
|---------|-------------|
| Weekly reflection form | Mood, wins, unnecessary spend, plan adherence, next week goals |
| Week picker | Historical weeks |
| Standout transactions | Auto-picked notable spends for the week |
| History list | Past reflections |
| AI weekly summary | Patterns, suggestions, encouragement, narrative |
| Monthly reflection rollup | Aggregated month summary |
| Persist AI summary | Stored on reflection row |

**Table:** `reflections`.  
**API:** `/api/ai/weekly-summary`.

---

## 14. AI features

| Feature | Entry point | Backend |
|---------|-------------|---------|
| AI Coach chat | Dashboard drawer | `/api/ai` → Gemini (`GEMINI_API_KEY`) |
| Chat history | Per-user messages | `ai_chat_messages` |
| Financial insights / health score | Insights module | `/api/ai/financial-insights` → `ai_insights` |
| Weekly journal summary | Journal | `/api/ai/weekly-summary` |
| Personalized suggestions | Dashboard / growth | Client heuristics + optional AI |
| Growth suggestions | Growth page | Client `buildGrowthSuggestions` |
| Wealth suggestions | Wealth | Client helpers |

Coach context includes expected income, planned total, and recent transactions.

---

## 15. Purpose sharing & read-only viewers

### Owner capabilities (Settings → Sharing)

| Feature | Description |
|---------|-------------|
| Invite by email | Creates `purpose_shares` + optional email |
| Magic share link | Token in `share_links` |
| Optional contributor scope | Viewer only sees one contributor’s splits |
| Expiry | Optional `expires_at` |
| Revoke | Status → revoked |
| View analytics | last viewed, total views, access logs |

### Viewer modes

| Mode | URL / auth | Access |
|------|------------|--------|
| Claimed viewer | Signed-in user with `purpose_shares.viewer_id` | App shell: Dashboard, Transactions, Analysis only (read-only) |
| Anonymous token | `/share/[token]` (+ dashboard, transactions, analysis subroutes) | No login; data via security-definer RPCs |

### Shared pages (`/share/[token]/...`)

- Dashboard  
- Transactions  
- Analysis  
- Page-view logging via `log_shared_page_view`

---

## 16. Reports & export

| Feature | Description |
|---------|-------------|
| PDF report generator | Monthly / custom / plan-vs-actual |
| Report preview | UI preview before download |
| Narrative summary | Text summary of period |
| Categories & top merchants | Included sections |
| Shell export button | Export current view data |
| Backup ZIP | Full user data package (`fflate`) for download/restore |

---

## 17. Admin portal

**Gate:** `users.role = 'admin'` (UI + `require_admin()` RPCs).  
**Nav (admin mode):**

| Route | Feature |
|-------|---------|
| `/admin` | Overview KPIs (users, volume, backups, storage, maintenance) |
| `/admin/users` | Search users, spend summary |
| `/admin/users/[id]` | Profile, accounts, purposes, category spend, recent txs, last backup |
| `/admin/users/[id]/impersonate/*` | Impersonation shell (dashboard, txs, plan, analysis, friends, outings, alerts, settings) |
| `/admin/categories` | Global default categories CRUD |
| `/admin/database` | Allow-listed table browser, filter by user, audited delete/update |
| `/admin/backups` | Cross-user backup monitoring |
| `/admin/logs` | Admin action log |
| `/admin/api-logs` | Universal API traffic logs (filters: date, email, role, status, type) |
| `/admin/settings` | Global settings / maintenance |

### Admin powers

| Power | Notes |
|-------|-------|
| User password reset | `/api/admin/users/[id]/reset-password` |
| User delete/manage | Service-role admin API routes; writes a before-image audit log before deletion, then deletes via `auth.admin.deleteUser()` — `admin_action_logs`/`admin_impersonation_sessions` FKs are `ON DELETE SET NULL` so this doesn't FK-violate the audit row the delete flow itself just wrote |
| Impersonation | No fake auth session; proxy scopes to target; dual attribution |
| Action audit | Every sensitive view/mutate logged |
| Impersonation inactivity | ~30 minutes enforced by proxy |

### Impersonation principle

Admin’s JWT stays. Proxy validates `admin_impersonation_sessions`, executes as service role with **forced** target user id, logs:

- `user_api_logs.user_id` = target  
- `user_api_logs.impersonated_by_admin_id` = admin  
- `admin_action_logs.impersonation_session_id` = session  

---

## 18. Platform / cross-cutting features

| Feature | Description |
|---------|-------------|
| Theme system | Light / dark / system + CSS variables |
| Private mode | Mask currency amounts |
| Global filters | Shared date/category/account/purpose/contributor state |
| Global search | Cross-entity search UI |
| React Query caching | Hooks + query keys + local query cache helpers |
| Realtime | Transactions, outings, alerts, AI chat (where subscribed) |
| Transparent API proxy | All Supabase traffic via `/api/proxy/[...path]` for logging |
| Realtime log endpoint | `/api/realtime-log` |
| Email send | `/api/send-email` (share invites, auth emails) |
| Soft deletes | Accounts, purposes, categories, contributors, friends, outings |
| Data rebuild helpers | Category merge / migration utilities |
| Supabase setup screen | Shown when env not configured |
| Responsive shell | Mobile sidebar + desktop rail |
| Currency formatting | INR-first (`formatCurrency`) |

---

## 19. API surface (app routes)

### Auth

| Method path | Purpose |
|-------------|---------|
| `/api/auth/sign-up` | Registration |
| `/api/auth/forgot-password` | Reset request |
| `/api/auth/resend-verification` | Resend verify email |

### AI

| Path | Purpose |
|------|---------|
| `/api/ai` | Coach chat (Gemini) |
| `/api/ai/financial-insights` | Health score / tips |
| `/api/ai/weekly-summary` | Journal summary |

### Admin / ops

| Path | Purpose |
|------|---------|
| `/api/admin/users/[id]` | Admin user management |
| `/api/admin/users/[id]/reset-password` | Force password reset email |
| `/api/impersonation/end` | End impersonation session |
| `/api/proxy/[...path]` | Proxied Supabase + API logging |
| `/api/realtime-log` | Realtime subscription logging |
| `/api/send-email` | Transactional email |

---

## 20. Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router |
| UI | React 19, Tailwind 4, shadcn/Radix, Lucide |
| Charts | Recharts |
| Forms | react-hook-form + zod |
| Data | Supabase JS + SSR, TanStack Query |
| PDF | jspdf + autotable |
| Backup compression | fflate |
| AI | Google Gemini 2.5 Flash (server) |

---

## 21. Feature ↔ data map

| Feature | Primary tables |
|---------|----------------|
| Auth profile | `users` |
| Accounts / balances | `accounts`, `account_balance_history`, `account_purposes` |
| Ledger | `transactions`, `transaction_splits` |
| Categories | `categories`, `global_settings.default_categories` |
| Purposes / sharing | `purposes`, `purpose_shares`, `share_links`, `share_access_logs` |
| Plan | `monthly_plans`, `budget_templates` |
| Analysis smart views | `smart_views` |
| Wealth | `net_worth_history`, `savings_goals`, `projector_settings`, investment via categories |
| Growth | `income_streams`, `income_targets` |
| Journal | `reflections` |
| Alerts | `smart_alerts` |
| Outings | `outings`, `outing_expenses`, `settlements`, `friends` |
| AI | `ai_chat_messages`, `ai_insights` |
| Backups | `backup_history` + storage `backups` |
| SMS (mobile) | `sms_template_rules`, `sms_detection_rules`, `sms_block_rules`, `user_merchants` (per-user learned payee→merchant map) |
| Devices/login | `user_devices`, `login_history` |
| Admin | `admin_action_logs`, `admin_impersonation_sessions`, `user_api_logs` |
| Config | `global_settings`, `mail_templates` |

---

*Keep this document updated when shipping user-facing product changes.*  
*Companion docs: [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) · [WORKFLOWS.md](./WORKFLOWS.md) · [FULL_APP_DOCUMENTATION.md](./FULL_APP_DOCUMENTATION.md) (single consolidated reference: routes, schema, lib/hooks, components, flows) · [app/FLUTTER_APP_DOCUMENTATION.md](./app/FLUTTER_APP_DOCUMENTATION.md) (mobile app, same backend)*
