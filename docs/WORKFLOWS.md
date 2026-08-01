# SpentX — Full Workflow Documentation

> End-to-end flows: who acts, what UI is used, which tables/RPCs/APIs run, and how state moves through the system.

---

## Table of contents

1. [System workflow map](#1-system-workflow-map)
2. [Request & data access path](#2-request--data-access-path)
3. [Authentication workflows](#3-authentication-workflows)
4. [New user bootstrap workflow](#4-new-user-bootstrap-workflow)
5. [Transaction workflows](#5-transaction-workflows)
6. [Dashboard workflow](#6-dashboard-workflow)
7. [Analysis & smart views workflow](#7-analysis--smart-views-workflow)
8. [Monthly plan workflow](#8-monthly-plan-workflow)
9. [Wealth workflow](#9-wealth-workflow)
10. [Outings & settlements workflow](#10-outings--settlements-workflow)
11. [Friends workflow](#11-friends-workflow)
12. [Alerts workflow](#12-alerts-workflow)
13. [Settings & master data workflows](#13-settings--master-data-workflows)
14. [Sharing workflows](#14-sharing-workflows)
15. [Growth & journal workflows](#15-growth--journal-workflows)
16. [AI coach & insights workflow](#16-ai-coach--insights-workflow)
17. [Backup & restore workflow](#17-backup--restore-workflow)
18. [Admin workflows](#18-admin-workflows)
19. [Impersonation workflow](#19-impersonation-workflow)
20. [Maintenance mode workflow](#20-maintenance-mode-workflow)
21. [Error & edge-case workflows](#21-error--edge-case-workflows)
22. [Sequence diagrams (text)](#22-sequence-diagrams-text)

---

## 1. System workflow map

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Browser UI │────▶│  Next.js App     │────▶│  Supabase       │
│  (React)    │     │  pages + APIs    │     │  Auth + Postgres│
└─────────────┘     │  /api/proxy/*    │     │  Storage + RLS  │
                    │  /api/ai/*       │     └─────────────────┘
                    │  /api/auth/*     │              │
                    └──────────────────┘              │
                             │                        ▼
                             │               user_api_logs
                             │               admin_action_logs
                             ▼
                      Gemini / Email (Resend)
```

### Actor types

| Actor | How they authenticate | What they can do |
|-------|----------------------|------------------|
| Owner user | Supabase session | Full CRUD on own data |
| Claimed viewer | Supabase session + purpose_shares | Read shared purpose data in main app |
| Anonymous share guest | Token only (no session) | Read via share RPCs on `/share/[token]` |
| Admin | Supabase session + `role=admin` | Admin RPCs + optional impersonation |
| System | Service role (server only) | Logging, impersonated writes, cron cleanup |

---

## 2. Request & data access path

### Normal authenticated read/write

```
1. Component/hook calls lib/supabase-data.ts (or React Query hook)
2. Supabase browser client is configured to hit /api/proxy/[...path]
3. Proxy:
   a. Forwards request to Supabase REST/RPC with user JWT
   b. Writes one user_api_logs row (service role)
   c. Returns response
4. Postgres applies RLS using auth.uid()
5. React Query caches result; realtime may invalidate
```

### Why the proxy exists

- Universal API auditing (`user_api_logs`)
- Impersonation rewrite (force target user scope)
- Central place for UA/IP parsing

### Direct Next route handlers

Used when Supabase client alone is insufficient:

| Route | Why |
|-------|-----|
| `/api/ai/*` | Hold Gemini API key server-side |
| `/api/auth/*` | Custom signup/email flows |
| `/api/admin/*` | Service-role user admin ops |
| `/api/send-email` | Transactional email |
| `/api/impersonation/end` | End session server-side |

Each is wrapped with route logging where applicable (`withRouteLogging`).

---

## 3. Authentication workflows

### 3.1 Sign up

```
User → /auth/sign-up
  → POST /api/auth/sign-up (or signUpWithEmail)
  → Supabase Auth creates auth.users
  → Trigger handle_new_user() seeds minimal workspace
  → Verification email sent (template)
  → User opens confirm link → /auth/confirm or /auth/callback
  → Session established
  → ensureUserWorkspace / bootstrapUserWorkspace (idempotent full seed)
  → Redirect to /
```

**Writes:** `auth.users`, `users`, `purposes`, `accounts`, `contributors`, `budget_templates`, optional `activity_logs` / `audit_logs`.

### 3.2 Sign in

```
User → /auth/sign-in
  → signInWithEmail(email, password)
  → Session cookie/JWT
  → SupabaseProvider loads user
  → bootstrapUserWorkspace (no-op if complete)
  → Optional login_history + user_devices update
  → AppShell allows app routes
```

### 3.3 Forgot / reset password

```
User → /auth/forgot-password
  → sendPasswordReset / /api/auth/forgot-password
  → Email with recovery link
  → /auth/reset-password
  → updatePassword(newPassword)
  → Sign in with new password
```

### 3.4 Resend verification

```
User → resend action
  → /api/auth/resend-verification
  → Supabase resend
```

### 3.5 Sign out

```
User → Profile/sign out
  → signOutUser()
  → Clear query cache / local state
  → Redirect /auth/sign-in
```

### 3.6 Auth gate (AppShell)

```
If path is /auth/* or /share/* → allow
Else if no session after load → redirect sign-in
Else if claimed viewer on disallowed path → redirect /
Else if maintenance_mode and not admin → maintenance UI
Else render children
```

---

## 4. New user bootstrap workflow

Two layers ensure a usable workspace even if one path is skipped.

### Layer A — Database trigger (`handle_new_user`)

On `auth.users` INSERT:

1. Insert `users` (name/email from metadata, theme dark, notifications on)
2. Insert purposes **Personal** and **Family** (both non-deletable; Family is toggleable — mandatory for every user since migration 20260724, which also backfilled existing workspaces)
3. Insert accounts **Cash** (default) + **Account 1** (needs_rename)
4. Set `users.default_account_id` → Cash
5. Insert contributor **Me**
6. Insert budget template **Default Budget**

### Layer B — Client bootstrap (`bootstrapUserWorkspace`)

Idempotent; runs on ensure/login:

1. Ensure `users` row (+ currency, timezone, language, show_bank_onboarding)
2. Ensure at least one active purpose
3. Ensure Cash (and bank placeholder if missing)
4. Link account_purposes
5. Ensure Me contributor
6. Ensure default budget template
7. Optional: net_worth_history day, devices, login_history
8. Soft-fail activity/audit if schema drift

### Layer C — UI onboarding

```
Dashboard loads
  → fetchBankOnboardingState
  → If show_bank_onboarding → InitialAccountSetupModal
  → User renames bank / sets opening balances
  → dismissBankOnboarding → show_bank_onboarding = false
```

---

## 5. Transaction workflows

### 5.1 Add transaction (happy path)

```
User opens AddTransactionSlideOver (Dashboard or Transactions)
  → Selects type (income/expense), merchant, amount, account, date
  → Adds one or more splits: purpose, category, contributor, amount
  → Submit
  → addTransaction()
  → RPC create_transaction_with_splits(p_transaction, p_splits)
       • inserts transactions (has_splits if len>1)
       • inserts transaction_splits rows
  → Optional activity_logs: transaction_added
  → Query invalidation / realtime update
  → UI toast + list refresh
```

**Validation (app-level):**

- Sum of split amounts = total amount  
- Account required  
- Purpose/category required per split  

### 5.2 Update transaction

```
User opens detail → edit
  → updateTransaction()
  → Update parent row
  → Replace/update splits as needed
  → activity: transaction_updated
```

### 5.3 Delete transaction

```
User confirms delete
  → deleteTransaction()
  → Deletes parent; splits CASCADE
  → activity: transaction_deleted
```

### 5.4 Multi-purpose split example

```
Expense ₹1000 at Amazon
  Split 1: Personal / Shopping / Me / ₹600
  Split 2: Home / Shopping / Me / ₹400
→ One transactions row total_amount=1000, has_splits=true
→ Two transaction_splits rows
→ Analysis by purpose attributes ₹600 vs ₹400 correctly
```

### 5.5 Opening balance workflow

```
User creates account with openingBalance
  → saveAccount
  → Optionally create income-like ledger entry category "Opening Balance"
  → Wealth getAccountBalance EXCLUDES that category when adding openingBalance
    (prevents double count)
```

### 5.6 Filtered list / pagination

```
TransactionsPage
  → TransactionFilters update GlobalFilters / local filters
  → fetchTransactionsPage or filtered fetch
  → Virtualized/paginated table
  → Click row → TransactionDetailPanel
```

---

## 6. Dashboard workflow

```
AppShell loads user
  → DashboardPage
  → Parallel queries:
       useTransactions, useAccounts, usePurposes,
       useMonthlyPlanQuery, useInvestmentTotal,
       useDashboardData (derived)
  → User picks date preset / purpose chips
  → Derived KPIs, trends, category chart, recent list
  → Optional KPI config modal reorders dashboard_kpi_cards on users
  → Quick action → add transaction / navigate
  → AI Coach drawer → /api/ai with context
```

**Data flow:** mostly client-side aggregation from transactions + plans + accounts; not a single dashboard SQL view.

---

## 7. Analysis & smart views workflow

### 7.1 Analyze period

```
User opens /analytics
  → Sets date preset / custom range
  → Optional compare mode (previous month / averages)
  → Optional filters: purpose, category, account, contributor, merchant, tags, status
  → useAnalyticsData + filterAnalyticsTransactions
  → Renders hero stats, breakdowns, merchants, plan-vs-actual
```

### 7.2 Save smart view

```
User configures dimensional filters (NOT month)
  → Save Smart View
  → saveSmartView → smart_views insert
  → Panel lists views
```

### 7.3 Apply smart view

```
User clicks saved view
  → Apply account_id, purpose_id, category_ids, contributor_id to analytics filters
  → Current month/date preset remains unchanged
  → Charts recompute
```

### 7.4 Delete smart view

```
deleteSmartView → remove row → list refresh
```

---

## 8. Monthly plan workflow

### 8.1 Create / edit plan for a month

```
User → /plan → PlanMonthSelector (YYYY-MM)
  → fetchMonthlyPlan(user, month, purpose?)
  → If none: start blank / from template
  → Set expected_income
  → PlanAllocationSheet: add categories, planned amounts
  → FitsIncomeBanner shows remaining headroom
  → Save → saveMonthlyPlan
  → DB trigger validate_plan_allocations
       • IF sum(plannedAmount) > expected_income → ERROR
  → Optional title, daily_safe_limit, savings_target
  → change_history entry appended
```

### 8.2 Template workflow

```
User saves current allocations as template
  → savePlanTemplate → budget_templates
User applies template later
  → Load allocations into editor → save as monthly_plans
```

### 8.3 Plan vs actual

```
Analysis or Plan page
  → monthly_plan_actuals view OR client sum of expenses by category for month
  → Variance = actual − planned
  → Utilization gauge
```

### 8.4 Budget lock

```
User locks plan (is_budget_locked)
  → UI may restrict edits until unlocked
  → Still stored as normal row
```

---

## 9. Wealth workflow

### 9.1 Net worth calculation (client)

```
For each active account:
  balance = openingBalance + income − expense
  (exclude Opening Balance category txs)
Segment:
  cash = sum cash accounts
  bank = sum bank/wallet/credit as configured
investment = investment_totals / sum is_investment category expenses
netWorth ≈ cash + bank + investment (product definition in wealth.ts)
```

### 9.2 Log balance snapshot

```
User → LogSnapshotModal
  → saveBalanceSnapshot → account_balance_history
  → Chart uses snapshots +/or derived history
```

### 9.3 Net worth history

```
Optional daily write net_worth_history (bootstrap / rebuild)
  → NetWorthHistoryChart reads points
```

### 9.4 Quick transfer

```
User selects from account, to account, amount
  → Creates paired expense/income (or transfer-like) transactions
  → Balances update on next fetch
```

### 9.5 Savings goal

```
CRUD savings_goals
  → Progress = saved_amount / target_amount
```

### 9.6 Future-self projector

```
User edits projector_settings (age, rates, monthly savings)
  → Client computes scenarios (current / disciplined / aggressive)
  → Chart milestones by age
```

---

## 10. Outings & settlements workflow

### 10.1 Create outing

```
User → /outings → CreateOutingModal
  → title, type, location, budget, start/end, members[]
  → saveOuting → outings
  → activity: outing_created
  → Navigate to /outings/[id]
```

### 10.2 Add outing expense

```
Trip detail → AddOutingExpenseDialog
  → description, amount, category, paid_by, split_type, participants
  → buildExpenseSplits (equal / solo / custom)
  → saveOutingExpense → outing_expenses
  → Optional: also create personal ledger transaction + link ids
  → Member balances recompute
```

### 10.3 Auto-add from bank/mobile + outing rollup sync

```
Background: useOutingTransactionSync (mounted app-wide via AppShell, debounced 1.2s, skipped on /admin)
  → For each transaction not yet synced this session:
       pool = transaction.outingId already set ? all outings : active auto-add outings
       getOutingCandidatesForTransaction:
            active outing + autoAddMode + date in range + not already linked
            (also matches rows the user manually tagged with outingId
             in AddTransactionSlideOver / TransactionsPage edit form)
  → buildOutingExpenseFromTransaction → saveOutingExpense
       source = bank-detected (or manual), linked_transaction_id set
       unique index on (user_id, linked_transaction_id) absorbs races
       with mobile's own SMS auto-add creating the same row concurrently
  → updateTransaction sets outingId on the ledger row so it can be
    hidden from the Transactions list in favor of the rollup line
  → For every outing touched in this pass:
       computeOutingRollupAmount(outingExpenses, ledgerTransactions, outingId)
       findOutingRollupTransaction / buildOutingRollupDraft
       → create / update / delete the single "outing-rollup" ledger
         transaction (merchant = outing name, amount = trip total)
```

Manual, in-trip expense entry (`TripDetailPage.handleAddExpense` → `AddOutingExpenseDialog`) runs the same last step (`syncOutingRollup`) synchronously right after `saveOutingExpense`, rather than waiting for the background hook.

**Why the rollup step matters:** `TransactionsPage` and `DashboardPage` both filter out every individual outing-tagged ledger row (`isIndividualOutingLedgerTransaction`) and render only the rollup line (`isOutingRollupTransaction`). Any code path that creates/updates an `outing_expenses` row without also running the rollup-sync step leaves the trip's total invisible on those pages even though the expense still exists inside the outing — this was a real bug in `useOutingTransactionSync` (fixed by adding the rollup-sync step above) where auto-linked transactions vanished from Transactions with no total standing in for them.

### 10.4 Record settlement

```
User → RecordSettlementDialog (shared by TripDetailPage and FriendDetailPage)
  → from_member, to_member, amount, is_partial, note, date
  → saveOutingSettlement → settlements
  → Also creates a personal "Settlement" transaction
  → activity: settlement_recorded
  → Balances adjust (from +amount, to −amount in engine)
  → May open OutingRollupPromptDialog: "log your remaining share as a
    personal transaction?" → feeds AddTransactionSlideOver if confirmed
```

### 10.5 Complete outing

```
User sets status = completed
  → saveOuting
  → activity: outing_completed
  → Auto-add stops (status not active)
```

### 10.6 Balance algorithm (reference)

```
Initialize balance[member] = 0
For each expense:
  balance[payer] += amount
  For each split: balance[member] -= split.amount
For each settlement:
  balance[from] += amount   # settled their debt
  balance[to]   -= amount
Result: positive = others owe them; negative = they owe others
```

---

## 11. Friends workflow

```
/friends → list friends (is_active)
  → Add/edit: name, phone, email, upi_ids, notes
  → saveFriend
  → Soft delete: is_active=false, deleted_at, deleted_by
/friends/[id] → detail / edit for use in outing members
When creating outing members:
  → member.friendId optional link to friends.id
```

---

## 12. Alerts workflow

### Generation

```
App load / alerts page / hook useSmartAlerts
  → fetch transactions + monthly plan + reflections
  → generateSmartAlerts({...})
  → Produces in-memory alert candidates
  → upsertAlerts → smart_alerts (idempotent ids like burn-rate-YYYY-MM)
```

### Consumption

```
NotificationBell → unread count
  → /alerts list
  → markAlertRead / markAllAlertsRead
  → severity styling (low/medium/high)
```

### Example burn-rate path

```
Mid-month (day ≤ half of month)
  plannedTotal > 0
  spent / planned > 0.5
  → high severity burn-rate alert with projected overshoot
```

---

## 13. Settings & master data workflows

### 13.1 Profile & preferences

```
Settings → Profile
  → saveUserProfile (name, photo, phone)
Settings → Preferences
  → theme → ThemeProvider + users.theme
  → private_mode → setGlobalPrivateMode + users.private_mode
  → default_account_id, notifications, monthly_safe_spending_alert
  → dashboard_kpi_cards order
```

### 13.2 Purposes

```
Create purpose → savePurpose (respect max_purposes_limit)
Archive → is_active false (soft)
Cannot delete default Personal (can_delete false)
```

### 13.3 Categories

```
Load: merge global default_categories + user categories
Create custom → categories row
Mark is_investment for wealth investment total
Soft delete custom categories
Admin changes defaults via admin_add/update/delete_default_category
```

### 13.4 Accounts

```
Create: type bank|cash|wallet|credit, opening balance/date
Set default: only one active default (DB unique index)
Soft delete: is_active false (if can_delete)
Rename needs_rename bank placeholder during onboarding
```

### 13.5 Contributors

```
Me always present (is_default, can_delete false)
Add household names → contributors
Soft delete others
Used on transaction splits and share contributor scope
```

### 13.6 Security

```
Send password reset email for self
  → sendPasswordReset
```

---

## 14. Sharing workflows

### 14.1 Owner invites by email (claimed viewer path)

```
Settings → Sharing
  → Select purpose (+ optional contributor)
  → Enter viewer email, optional expiry
  → createPurposeShare
       inserts purpose_shares (status pending/active)
       getOrCreateShareLink → share_links token
  → sendPurposeShareInviteEmail (/api/send-email)
Viewer receives email with link
  → Signs up / signs in with that email
  → linkPurposeSharesForViewer(viewerUid, email)
       sets viewer_id (claim guard trigger limits columns)
  → Viewer sees only Dashboard/Transactions/Analysis
  → RLS filters transactions via purpose_shares.viewer_id
```

### 14.2 Anonymous magic link path

```
Owner creates share_links token (with or without email)
  → Copies /share/{token}
Guest opens link (no auth)
  → share layout claimShareLink / get_share_link
  → Pages call:
       get_shared_transactions
       get_shared_purposes
       get_shared_monthly_plan(month)
  → log_shared_page_view on navigation
  → share_access_logs row; share_links.total_views++
  → Contributor filter applied if contributor_id set
```

### 14.3 Revoke share

```
Owner → revokePurposeShare
  → purpose_shares.status = revoked
  → Optional delete share_links
  → Partial unique index allows re-invite same email later
```

### 14.4 One-active-share rule

```
Unique (owner_id, purpose_id, viewer_email) WHERE status <> 'revoked'
→ Must revoke before creating a second active invite for same triple
```

---

## 15. Growth & journal workflows

### 15.1 Growth

```
GrowthPage mounts
  → useIncomeStreams + useIncomeTargets + useTransactions
  → If no streams: detectIncomeStreamsFromTransactions → seed streams
  → User edits streams / targets (3/6/12 month horizons)
  → Trend chart from income txs
  → buildGrowthSuggestions for tips
```

### 15.2 Journal reflection

```
User selects week
  → useWeeklyReflection(weekStart)
  → ReflectionForm: mood, wins, unnecessary spend, adherence, next week
  → Standout txs auto-filled from week expenses
  → saveReflection → reflections upsert (unique user+week)
  → Optional Generate AI summary → /api/ai/weekly-summary
  → Store ai_summary on reflection
  → History list from fetchReflections
```

### 15.3 Reflection reminder alert

```
generateSmartAlerts sees isReflectionDue
  → reflection-reminder alert
```

---

## 16. AI coach & insights workflow

### 16.1 Coach chat

```
Dashboard → AiCoachDrawer
  → Load history fetchAiChatHistory / subscribe
  → User sends message
  → saveAiChatMessage(user)
  → POST /api/ai { messages, financialContext }
  → Server builds Gemini system prompt with income/budget/recent txs
  → Gemini 2.5 Flash generateContent
  → Assistant reply returned
  → saveAiChatMessage(assistant)
  → Clear history available via clearAiChatHistory
```

### 16.2 Financial insights

```
Client builds FinancialInsightContext (spend, savings rate, burn, etc.)
  → POST /api/ai/financial-insights
  → Persist via saveAiInsight → ai_insights (unique user+month+type)
  → Show health_score, summary, tips
```

### 16.3 Missing API key

```
If GEMINI_API_KEY unset
  → API returns 500 with configuration message
  → UI surfaces error toast
```

---

## 17. Backup & restore workflow

### 17.1 Manual backup

```
Settings → Data & Backups → Backup
  → gatherAllUserData(userId)
       collects all owned tables into SpentXBackup object
  → buildBackupZipBytes (fflate)
  → Download to device AND/OR uploadBackupToStorage → backups/{userId}/...
  → backup_history row (type manual, status success/failed, manifest, size)
  → activity: backup_created
```

### 17.2 Automatic backup

```
useAutoBackup / runAccountBackup schedule
  → Same gather/zip/upload path
  → type = automatic, frequency daily|weekly|monthly
```

### 17.3 Restore

```
User uploads ZIP
  → parseBackupZipBytes → isValidBackupFile
  → Confirm overwrite semantics
  → restoreBackupData(userId, backup)
  → Writes tables back under user scope
  → Query cache invalidation / reload
```

### 17.4 Admin view of backups

```
/admin/backups lists backup_history (via admin RPCs)
  → Failures last 7d appear on admin overview
```

---

## 18. Admin workflows

### 18.1 Enter admin mode

```
users.role = admin
  → useIsAdmin true
  → AppShell shows admin nav only (admin rail)
  → /admin layout enforces admin
```

### 18.2 Overview

```
admin_get_overview()
  → total users, new users week/month
  → transaction counts/volumes
  → backups last 7d / failures
  → maintenance_mode flag
  → storage bucket usage
```

### 18.3 User management

```
admin_list_users(search)
  → open user → admin_get_user_overview (auto logs view_row)
  → Reset password → /api/admin/users/[id]/reset-password → logs password_reset
  → Delete user → DELETE /api/admin/users/[id] (service-role route)
       1. Verify caller is admin; disallow self-delete
       2. Write a before-image audit log to admin_action_logs FIRST
       3. auth.admin.deleteUser(id) → cascades public data + auth
       (admin_action_logs / admin_impersonation_sessions admin_id and
        target_user_id FKs are ON DELETE SET NULL since migration
        20260729, so deleting the user can't FK-violate the very audit
        row step 2 just wrote)
```

### 18.4 Database viewer

```
admin_table_meta → sidebar
  → admin_list_table / admin_count_table (allow-list only)
  → Filter by user id when table has user column
  → admin_delete_row / admin_update_row
       always writes admin_action_logs with before image
  → Append-only logs not deletable
```

### 18.5 Categories (global)

```
admin_add_default_category / update / delete
  → Mutates global_settings.default_categories jsonb
  → Soft-remove semantics for delete (historical txs keep labels)
```

### 18.6 Action log & API logs

```
/admin/logs → admin_list_action_logs filters
/admin/api-logs → admin_list_api_logs (date, email, role, status, api_type)
cleanup_user_api_logs daily → drop >90 days
```

### 18.7 Global settings

```
/admin/settings
  → saveAppConfig / update global_settings
  → Toggle maintenance_mode
  → Adjust limits (categories, purposes, accounts, contributors)
```

---

## 19. Impersonation workflow

```
Admin opens /admin/users/[id]
  → Start impersonation → admin_start_impersonation(target)
       inserts admin_impersonation_sessions
       logs impersonate_start
  → Navigate /admin/users/[id]/impersonate/*
  → ImpersonationShell banner: acting as target
  → All data calls include impersonation header
  → Proxy:
       1. Validate session (admin owns it, not ended, last_active within 30m)
       2. Touch last_active_at
       3. Rewrite queries with service role scoped to target_user_id
       4. RPC create_transaction_with_splits → impersonation_create_transaction_with_splits
          with p_user_id injected server-side (never client-trusted)
       5. Log user_api_logs with user_id=target, impersonated_by_admin_id=admin
  → End:
       UI button or /api/impersonation/end
       → admin_end_impersonation
       → ended_at set, impersonate_end logged
```

**Security properties:**

- No Auth session switch  
- Admin never “becomes” the user silently  
- Dual attribution always  
- Inactivity auto-stop via proxy  

---

## 20. Maintenance mode workflow

```
Admin sets global_settings.maintenance_mode = true
  → AppShell fetches app config (poll ~5 min)
  → Non-admin authenticated users see maintenance notice (no app)
  → Admins still use full app + admin to turn it off
```

---

## 21. Error & edge-case workflows

| Situation | Behavior |
|-----------|----------|
| Supabase env missing | `SupabaseSetupScreen` |
| Auth load timeout | Auth timed-out UI in shell |
| RLS deny | Empty data / error; no silent cross-user leak |
| Plan allocations > income | DB trigger exception → toast |
| Share token expired | RPCs return empty / null; guest cannot view |
| Duplicate active share invite | Unique index error → revoke first |
| Backup partial failure | backup_history status=failed + error_message |
| Optional bootstrap step fails | Logged warn; sign-in continues |
| Gemini key missing | AI routes 500 with clear message |
| Impersonate self | RPC raises cannot impersonate yourself |
| Soft-deleted entity | Hidden from pickers; historical txs retain labels/ids |
| Opening balance category | Skipped in balance math to avoid double count |
| Viewer hits /plan or /settings | Redirected to `/` |
| Share route guest hits `/` | Share layout is separate; AppShell does not force sign-in loop |

---

## 22. Sequence diagrams (text)

### A. Add expense with two purpose splits

```
User UI                supabase-data           Proxy              Postgres
  |                         |                    |                    |
  |-- fill form ----------->|                    |                    |
  |-- addTransaction ------>|-- REST/RPC ------->|-- log api -------->|
  |                         |                    |-- forward -------->|
  |                         |                    |                    |-- create_transaction_with_splits
  |                         |                    |                    |-- insert transactions
  |                         |                    |                    |-- insert transaction_splits x2
  |                         |<-- uuid -----------|<-- response -------|
  |-- invalidate queries -->|                    |                    |
  |-- toast success         |                    |                    |
```

### B. Anonymous share view

```
Guest browser          Share layout            Anon RPC (security definer)
  |                         |                         |
  |-- GET /share/token ---->|                         |
  |                         |-- get_share_link ------>|
  |                         |-- get_shared_* -------->|
  |                         |-- log_shared_page_view >|
  |<-- render dashboard ----|                         |
```

### C. Impersonated transaction

```
Admin UI               Proxy                         Postgres
  |                      |                              |
  |-- add tx + hdr ----->|-- validate impersonation --->|
  |                      |-- service role ------------->|
  |                      |   impersonation_create_...   |
  |                      |-- user_api_logs dual attr -->|
  |<-- success ----------|                              |
```

---

## Workflow index by user goal

| Goal | Start | Primary flow section |
|------|-------|----------------------|
| Create account | `/auth/sign-up` | §3.1, §4 |
| Log a purchase | Dashboard / Transactions | §5.1 |
| Split one bill across purposes | Add transaction multi-split | §5.4 |
| See if overspending | Dashboard + Alerts + Analysis | §6, §12, §7 |
| Set monthly budget | `/plan` | §8 |
| Track net worth | `/wealth` | §9 |
| Split trip with friends | `/outings` | §10 |
| Share Home finances with spouse | Settings → Sharing | §14 |
| Ask AI for advice | Dashboard AI Coach | §16 |
| Weekly money journal | Journal UI | §15.2 |
| Backup before phone change | Settings → Data & Backups | §17 |
| Support a stuck user | Admin impersonate | §19 |
| Pause product for all users | Admin maintenance | §20 |

---

*Companion docs: [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) · [FEATURES.md](./FEATURES.md) · [FULL_APP_DOCUMENTATION.md](./FULL_APP_DOCUMENTATION.md) (single consolidated reference: routes, schema, lib/hooks, components, flows) · [app/FLUTTER_APP_DOCUMENTATION.md](./app/FLUTTER_APP_DOCUMENTATION.md) (mobile app, same backend)*
