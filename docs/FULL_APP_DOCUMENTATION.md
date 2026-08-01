# SpentX — Full Web App Documentation

> Scope: **web app only** (`spentx-web`). A companion Flutter mobile app exists in this same repo at `Mobile app/SpentX/` and shares the same Supabase backend (some tables/columns are explicitly "mobile parity" additions) — see **[docs/app/](./app/)** for the mobile app's own full documentation: [FLUTTER_APP_DOCUMENTATION.md](./app/FLUTTER_APP_DOCUMENTATION.md) (overview), [DATABASE.md](./app/DATABASE.md) (local Hive storage), [SYNC.md](./app/SYNC.md) (Supabase sync architecture), [FEATURES.md](./app/FEATURES.md) (screen-by-screen features), [WORKFLOWS.md](./app/WORKFLOWS.md) (end-to-end flows incl. the SMS auto-detection algorithm). This document does not cover the mobile client beyond the backend contract it shares with web.
>
> Sources: `supabase/migrations/init.sql` + all dated migrations through `20260729`, `src/app/**`, `src/components/**`, `src/lib/**`, `src/hooks/**`, `src/types/index.ts`.
>
> Related shorter docs already in this repo: `docs/DATABASE_SCHEMA.md`, `docs/FEATURES.md`, `docs/WORKFLOWS.md`. This file is the single consolidated reference — schema + routes + business logic + components + end-to-end flows in one place — and reflects the schema as of migration `20260729`.

---

## Table of contents

1. [Tech stack & architecture summary](#1-tech-stack--architecture-summary)
2. [Routes & pages](#2-routes--pages)
3. [Database schema](#3-database-schema)
4. [Core library layer (`src/lib`)](#4-core-library-layer-srclib)
5. [Hooks (`src/hooks`)](#5-hooks-srchooks)
6. [Component architecture (`src/components`)](#6-component-architecture-srccomponents)
7. [End-to-end app flows](#7-end-to-end-app-flows)
8. [Known drift / legacy notes](#8-known-drift--legacy-notes)

---

## 1. Tech stack & architecture summary

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), React, TypeScript |
| Backend | Supabase (Postgres + Auth + Storage + Realtime), accessed via `@supabase/supabase-js` |
| Data fetching | `@tanstack/react-query`, keyed by `src/lib/query-keys.ts`, with a localStorage-backed 24h cache (`src/lib/query-cache.ts`) used as `placeholderData` for instant-feeling navigation |
| Styling | Tailwind CSS + shadcn-style primitives in `src/components/ui/` |
| Charts | Recharts |
| PDF export | jsPDF + autoTable |
| Email | Resend API |
| AI | Google Gemini (`gemini-2.5-flash` / `gemini-2.0-flash`), with rule-based fallback when no `GEMINI_API_KEY` |
| Backups | Client-built zip (via `fflate`) uploaded to Supabase Storage bucket `backups` |

### Request path

There is **no `src/middleware.ts`** in this project. All auth/role gating happens at three layers:

1. **Server-side route-group layouts** — `(app)/layout.tsx` redirects admins to `/admin`; `admin/layout.tsx` requires a signed-in admin and redirects everyone else away.
2. **Client-side `AppShell`** (`src/components/shared/AppShell.tsx`, mounted in the root layout) — owns the "no session → redirect to `/auth/sign-in`" flow, the admin/user nav split, the read-only-viewer route allowlist, and a global maintenance-mode screen.
3. **`AuthGate`** — used by `/auth/layout.tsx` in `guest-only` mode to bounce already-signed-in users away from auth screens.

All browser Supabase calls (REST/RPC/auth/storage) are routed through **`/api/proxy/[...path]`** rather than hitting Supabase directly (see `src/lib/supabase/client.ts`). This is a transparent pass-through (the caller's own `apikey`/`Authorization` headers are preserved, so RLS applies exactly as normal) whose purpose is centralized API logging (`user_api_logs`) and, for admin impersonation sessions, header-based request rewriting executed with the service-role key. Realtime websockets bypass this proxy entirely (can't proxy a websocket in a Route Handler); each subscription's *start* is logged separately via `POST /api/realtime-log`.

---

## 2. Routes & pages

### 2.1 Main app routes — `(app)/*`

`(app)/layout.tsx` is a server-side guard: it fetches the current user and `redirect("/admin")`s any admin account away from this route group (it deliberately does **not** redirect signed-out visitors server-side — that's left to `AppShell`'s client-side, timeout-based redirect).

| Route | File | Renders |
|---|---|---|
| `/` | `(app)/page.tsx` | `DashboardPage` |
| `/alerts` | `(app)/alerts/page.tsx` | Inline page using `useSmartAlerts()` — alert list + mark-all-read |
| `/analytics` | `(app)/analytics/page.tsx` | `AnalysisPage` |
| `/friends` | `(app)/friends/page.tsx` | `FriendsPage` |
| `/friends/[id]` | `(app)/friends/[id]/page.tsx` | `FriendDetailPage` (client, resolves friend from `useFriends()`) |
| `/outings` | `(app)/outings/page.tsx` | `OutingsPage` |
| `/outings/[id]` | `(app)/outings/[id]/page.tsx` | `TripDetailPage` (resolves outing via `useOutings()`) |
| `/plan` | `(app)/plan/page.tsx` | `PlanPage` |
| `/settings` | `(app)/settings/page.tsx` | `SettingsPage` |
| `/transactions` | `(app)/transactions/page.tsx` | `TransactionsPage` |
| `/wealth` | `(app)/wealth/page.tsx` | `WealthPage` |

**Access control:** server layout blocks admins → `/admin`. `AppShell` blocks unauthenticated users client-side → `/auth/sign-in`, and additionally restricts **read-only viewer** sessions to `/`, `/transactions`, `/analytics` only (any other `(app)` path bounces to `/`). A global maintenance-mode flag (polled every 5 min from `global_settings`) replaces the whole app with a maintenance screen for non-admins.

> Note: `/growth` and `/journal` route files were not present in the `src/app` route inventory scanned for this doc, even though `GrowthPage`/`JournalPage` components exist under `src/components/growth/` and `src/components/journal/` — verify whether these are mounted under a different path or pending route wiring before relying on a `/growth` or `/journal` URL.

### 2.2 Auth routes — `/auth/*`

`auth/layout.tsx` wraps every `/auth/*` page in `<AuthGate mode="guest-only">`: signed-in users are redirected to `/`, **except** on `/auth/reset-password` (reachable while authenticated, since Supabase's password-recovery flow lands the user in an authenticated-but-must-reset state).

| Route | File | Renders / does |
|---|---|---|
| `/auth/sign-in` | `sign-in/page.tsx` | `SignInForm` (Suspense-wrapped) |
| `/auth/sign-up` | `sign-up/page.tsx` | `SignUpForm` |
| `/auth/forgot-password` | `forgot-password/page.tsx` | `ForgotPasswordForm` |
| `/auth/reset-password` | `reset-password/page.tsx` | `ResetPasswordForm` |
| `/auth/confirm` | `confirm/page.tsx` | `AuthConfirmForm` (Suspense-wrapped) |
| `/auth/callback` (GET) | `callback/route.ts` | Supabase OAuth/OTP callback: exchanges `?code=` for a session or verifies `?token_hash=`+`type=`. Success → sanitized `next` (recovery → `/auth/reset-password`, signup confirm → `/?verified=1`); failure → `/auth/sign-in?error=auth_callback_error`. |

### 2.3 Admin routes — `/admin/*`

`admin/layout.tsx` is the server-side gate for **every** `/admin/*` page: requires a signed-in user (else `redirect("/auth/sign-in")`) and requires `users.role === "admin"` (else `redirect("/")`), then wraps children in `AdminSectionShell`.

| Route | File | Renders |
|---|---|---|
| `/admin` | `admin/page.tsx` | `AdminOverviewPage` |
| `/admin/users` | `admin/users/page.tsx` | `AdminUsersPage` |
| `/admin/users/[id]` | `admin/users/[id]/page.tsx` | `AdminUserDetailPage` |
| `/admin/categories` | `admin/categories/page.tsx` | `AdminCategoriesPage` |
| `/admin/sms-rules` | `admin/sms-rules/page.tsx` | `AdminSmsRulesPage` |
| `/admin/database` | `admin/database/page.tsx` | `AdminDatabasePage` |
| `/admin/backups` | `admin/backups/page.tsx` | `AdminBackupsPage` |
| `/admin/logs` | `admin/logs/page.tsx` | `AdminLogsPage` |
| `/admin/api-logs` | `admin/api-logs/page.tsx` | `AdminApiLogsPage` |
| `/admin/settings` | `admin/settings/page.tsx` | `AdminSettingsPage` (kept as its own real page — not a redirect to `/settings` — specifically to avoid a redirect loop under the hard admin/user split) |

#### Impersonation — `/admin/users/[id]/impersonate/*`

Admins can view/act **as** a target user, with every action logged and attributed to both admin and target. `impersonate/layout.tsx` renders `ImpersonationShell`, which:

- Calls `adminStartImpersonation(targetUserId)` on mount, storing a `sessionId`.
- Calls `setImpersonationSession(sessionId)`, attaching an `x-impersonation-session` header to subsequent proxied Supabase calls.
- Shows a persistent, non-dismissible banner ("Acting as {name} — every action is logged...") with an **Exit impersonation** button (`adminEndImpersonation`), plus a tab-close backstop via `navigator.sendBeacon` to `/api/impersonation/end`.
- Re-provides identity/scope to children via `ImpersonatedAuthProvider` + `ViewerProvider`, so children render the **exact same components** the real user would see.

| Route | Renders |
|---|---|
| `.../impersonate/dashboard` | `DashboardPage` |
| `.../impersonate/transactions` | `TransactionsPage` |
| `.../impersonate/analysis` | `AnalysisPage` |
| `.../impersonate/plan` | `PlanPage` |
| `.../impersonate/outings` | `OutingsPage` |
| `.../impersonate/friends` | `FriendsPage` |
| `.../impersonate/alerts` | Re-renders the `(app)/alerts` page directly |
| `.../impersonate/settings` | `SettingsPage` |

Data scoping for impersonation is enforced **server-side in `/api/proxy/[...path]`**, not by these page components — they're identical to the normal user-facing pages.

### 2.4 Share routes — `/share/[token]/*`

Public, no-login, read-only views scoped to one purpose owned by another user.

`share/[token]/layout.tsx` unwraps the token, calls `claimShareLink(token)` (→ RPC `get_share_link`), which resolves `{ ownerId, purposeId, purposeName, viewerEmail }` — **possession of a valid, unexpired token is the entire access-scoping mechanism**. On success, wraps children in `ShareSessionProvider` + a standalone `ShareAppShell` (distinct from the main `AppShell`, which special-cases `pathname.startsWith("/share")` to render these routes without its own chrome). On error, shows "This link is no longer valid."

| Route | Renders |
|---|---|
| `/share/[token]` | No UI — immediately client-redirects to `/share/[token]/dashboard` |
| `/share/[token]/dashboard` | `DashboardPage` + `useShareViewLogger("dashboard")` |
| `/share/[token]/transactions` | `TransactionsPage` + `useShareViewLogger("transactions")` |
| `/share/[token]/analysis` | `AnalysisPage` + `useShareViewLogger("analysis")` |

The same `DashboardPage`/`TransactionsPage`/`AnalysisPage` components used in the authenticated app are reused here — they read scope internally from `ShareSessionProvider`/viewer context.

### 2.5 API routes — `/api/*`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/users/[id]/reset-password` | Admin-triggered password reset for a target user (sends the standard Supabase reset email — admin never sets/sees the password). Verifies caller is admin, logs an `admin_action_logs` row. |
| `DELETE` | `/api/admin/users/[id]` | Admin-only user deletion. Disallows self-delete, writes a before-image audit log **before** deleting, then deletes via `admin.auth.admin.deleteUser(id)` (service role) — cascades to `public.users` and owned data. |
| `POST` | `/api/ai/financial-insights` | Calls `generateFinancialInsights(context)` (requires `context.month`), returns `{ insight }`. |
| `POST` | `/api/ai` | "AI Coach" chat endpoint — builds a system prompt from the user's income/budget/recent transactions, calls Gemini `gemini-2.5-flash:generateContent`, returns `{ reply }`. |
| `POST` | `/api/ai/weekly-summary` | Calls `generateWeeklySummary(context)`, returns the summary JSON. |
| `POST` | `/api/auth/forgot-password` | Calls `auth.resetPasswordForEmail`; deliberately returns `{ ok: true }` even when the user doesn't exist, to avoid leaking account existence. |
| `POST` | `/api/auth/resend-verification` | Calls `auth.resend({ type: "signup" })`; returns 404 if no such account (does reveal existence, unlike forgot-password). |
| `POST` | `/api/auth/sign-up` | Validates name/email/password, calls `auth.signUp`, detects the "already registered but zero identities" case, then calls `bootstrapUserWorkspace` (service role) to provision the new user's default workspace. |
| `POST` | `/api/impersonation/end` | Backstop for ending an impersonation session on tab-close (via `sendBeacon`). Verifies the caller is a signed-in admin, marks the session `ended_at`, logs `impersonate_end`. |
| `GET/POST/PATCH/PUT/DELETE/HEAD` | `/api/proxy/[...path]` | **Transparent Supabase proxy.** Forwards PostgREST/auth/storage requests with the caller's own auth headers (RLS applies normally) plus centralized per-call logging. **Impersonation branch:** if `x-impersonation-session` is present, verifies the caller is admin, validates the session, rewrites owner-column filters/body fields to the target user's id, blocks disallowed tables/RPCs (only `create_transaction_with_splits` is rewritten to `impersonation_create_transaction_with_splits`), enforces read-only tables, and executes with the **service-role key** — the one deliberate, narrow privilege-escalation point, since RLS can't apply to a different user's data. Realtime websockets bypass this proxy entirely. |
| `POST` | `/api/realtime-log` | Logs the **start** of a Realtime subscription (once per subscribe, not per pushed change). |
| `POST` | `/api/send-email` | Generic transactional email sender via Resend, returns `{ ok, id }`. |

Most routes are wrapped in `withRouteLogging(name, category, handler)` for centralized logging (feeding `/admin/api-logs`); the proxy and realtime-log routes log inline.

### 2.6 Root layout

`src/app/layout.tsx` applies to every route: Inter font, `<ThemeScript />` (pre-hydration dark/light theme to avoid FOUC), and a provider stack `AppProviders → GlobalFiltersProvider → AnalyticsFiltersProvider → AppShell`.

`AppShell` (`src/components/shared/AppShell.tsx`) is the real cross-cutting gate given there's no middleware:
- Renders `SupabaseSetupScreen` if Supabase env isn't configured.
- Renders `/auth/*` and `/share/*` standalone (no sidebar chrome).
- Shows a "Checking your session…" spinner (2s timeout) then redirects unauthenticated users to `/auth/sign-in`.
- Force-navigates admins to `/admin` if they land elsewhere (client-side mirror of the server guard).
- Restricts read-only-viewer sessions to `/`, `/transactions`, `/analytics`.
- Shows a global maintenance-mode banner for non-admins when `appConfig.maintenanceMode` is on.
- Renders the sidebar nav (different item sets for admin / read-only-viewer / normal users).
- Mounts `OutingTransactionSyncGate` (the outing↔ledger auto-sync effect), gated off on `/admin` routes.

---

## 3. Database schema

### 3.1 Infra summary

| Aspect | Detail |
|---|---|
| Database | Supabase Postgres (`public` schema + Supabase-managed `auth`/`storage`) |
| Extension | `pgcrypto` (`gen_random_uuid()`) |
| Schema source | `supabase/migrations/init.sql` (consolidated base) + 14 dated migrations, `20260716` → `20260729` |
| RLS | Enabled on **every** `public` table. Default: `user_id = auth.uid()` for full CRUD, or split select/insert/update/delete policies where reads need to be broader than writes (transactions, purposes — shared-viewer read access). |
| Admin bypass | **None** at the RLS level for user tables. Admin access is funneled exclusively through `SECURITY DEFINER` RPCs (`admin_*`) that each start with `require_admin()`. Two tables (`global_settings`, `mail_templates`) have a direct `is_admin()`-gated write policy for their own admin-managed content. |
| Client setup | `src/lib/supabase/client.ts` (browser, proxied through `/api/proxy`), `server.ts` (SSR, cookie-based), `proxy.ts` (`updateSession` — refreshes auth cookie), `admin.ts` (service-role client, server-only). |
| Universal API logging | The browser client's `fetch` routes through `/api/proxy/[...path]`, which forwards to Supabase with the caller's own headers intact (RLS still applies) and logs one row per call into `user_api_logs` using the service role. |
| Impersonation | Header-driven (`x-impersonation-session`), validated server-side, executed with the service role while forcing the target user's scope; writes are attributed to both `user_id` (target) and `impersonated_by_admin_id` (real admin). No Supabase Auth session is ever created for the impersonated user. |
| Storage buckets | `receipts` (private), `backups` (private) — both owner-only via `storage.foldername(name)[1] = auth.uid()::text`. |

### 3.2 Postgres functions / RPCs

| Function | Purpose | Security |
|---|---|---|
| `handle_new_user()` | Trigger on `auth.users` insert: bootstraps `public.users` + default Personal/Family purposes, Cash/"Account 1" accounts, "Me" contributor, default budget template. | `security definer`, trigger |
| `get_share_link(p_token)` | Resolves a `share_links` token → row (validates expiry). | `security definer stable` |
| `get_shared_transactions(p_token)` | Transactions for a no-login shared purpose. | `security definer stable` |
| `get_shared_purposes(p_token)` | Single-purpose lookup for a shared token. | `security definer stable` |
| `get_shared_monthly_plan(p_token, p_month)` | Monthly plan for the shared purpose/month. | `security definer stable` |
| `log_shared_page_view(p_token, p_page)` | Records an anonymous page view, bumps `share_links.total_views`/`last_viewed_at`. | `security definer` |
| `create_transaction_with_splits(p_transaction, p_splits)` | **Primary transaction-write RPC** — inserts one `transactions` row + N `transaction_splits` atomically, scoped to `auth.uid()`. | `security invoker` |
| `impersonation_create_transaction_with_splits(p_user_id, p_transaction, p_splits)` | Impersonation-only variant (explicit `p_user_id` since `auth.uid()` is null for the service role). Called only by the proxy. | `security definer`, revoked from client roles |
| `validate_plan_allocations()` | Trigger: rejects if `monthly_plans.allocations` total exceeds `expected_income`. | trigger |
| `touch_updated_at()` | Generic `updated_at = now()` trigger (on `users`, `accounts`, `transactions`, `smart_views`). | trigger |
| `is_admin()` / `require_admin()` | Boolean check / raising check that `auth.uid()` is an admin. | `security definer stable` |
| `enforce_purpose_share_claim_only()` | Trigger on `purpose_shares`: an anonymous viewer "claiming" a pending row (setting `viewer_id`) may not change any other column in the same update. | `security definer` trigger |
| `admin_*` family (`admin_table_meta`, `admin_list_table`, `admin_count_table`, `admin_delete_row`, `admin_update_row`, `admin_log_action`, `admin_list_action_logs`, `admin_get_overview`, `admin_list_users`, `admin_get_user_overview`, `admin_add/update/delete_default_category`, `admin_allowed_tables`, `admin_deletable_tables`, `admin_updatable_tables`, `admin_table_pk`, `admin_table_user_col`) | Generic + specific admin CRUD/reporting over an explicit table allow-list, dynamic SQL, always quoted. | `security definer`, granted to `authenticated` only |
| `admin_start_impersonation(p_target_user_id)` / `admin_end_impersonation(p_session_id)` | Impersonation session lifecycle; logs `impersonate_start`/`impersonate_end`. | `security definer` |
| `admin_list_api_logs(...)` / `admin_count_api_logs(...)` | Filtered reader over `user_api_logs`. | `security definer` |
| `cleanup_user_api_logs()` | Deletes `user_api_logs` rows older than 90 days; scheduled via `pg_cron` (`30 21 * * *` UTC = 03:00 IST) if available. | `security definer`, revoked from client roles |

### 3.3 Triggers

| Trigger | Table | Fires | Function |
|---|---|---|---|
| `on_auth_user_created` | `auth.users` | after insert | `handle_new_user()` |
| `monthly_plans_validate_allocations` | `monthly_plans` | before insert/update | `validate_plan_allocations()` |
| `users_touch_updated_at` | `users` | before update | `touch_updated_at()` |
| `accounts_touch_updated_at` | `accounts` | before update | `touch_updated_at()` |
| `transactions_touch_updated_at` | `transactions` | before update | `touch_updated_at()` |
| `smart_views_touch_updated_at` | `smart_views` | before update | `touch_updated_at()` |
| `purpose_shares_claim_guard` | `purpose_shares` | before update | `enforce_purpose_share_claim_only()` |

### 3.4 Tables

Unless noted, RLS = owner-only (`user_id = auth.uid()`), `for all using(...) with check(...)`.

**Core config**

- **`global_settings`** — single row (`id='app'`): `app_name`, `logo_url`, `app_version`, `default_safe_spending_percentage`, `max_category_limit`/`max_purposes_limit`/`max_accounts_limit`/`max_contributors_limit`, `maintenance_mode`, `default_monthly_budget`, `default_categories` (jsonb — 8 income + 15 expense defaults incl. a shared "Investment" category `cat-exp-15` with `isInvestment:true`). Select: any authenticated role. Write: `is_admin()` only, via `admin_add/update/delete_default_category` RPCs.
- **`mail_templates`** — `id, name, subject, html, variables[], is_active, updated_at`. Select authenticated, write admin-only.

**Core user-owned entities**

- **`users`** — 1:1 with `auth.users` (cascade delete). `role` (`user`/`admin`), `theme`, `private_mode`, `notifications`, `monthly_safe_spending_alert`, `default_account_id` (FK → accounts), `dashboard_kpi_cards[]`, `currency`/`timezone`/`language` (added `20260718`, default `INR`/`Asia/Kolkata`/`en`), `show_bank_onboarding` (default true), `app_pin_reset_at` (added `20260725` — mobile PIN reset marker; **the PIN itself is never stored server-side**).
- **`accounts`** — bank/cash/wallet/credit. `name`, `type`, `last4`, `opening_balance`, `opening_balance_date`, `purpose_ids[]`, `is_default`/`can_delete`/`is_active`/`needs_rename`, soft-delete (`deleted_at`/`deleted_by`). Unique index: one `is_default and is_active` row per user.
- **`purposes`** — budget "buckets" (Personal, Family, ...). `name`, `color`, `is_default`, `can_delete`, `is_active`, soft-delete. Select = owner OR active `purpose_shares` viewer; write = owner only. `20260724` made "Family" a mandatory (toggleable, non-deletable) purpose for every user alongside Personal, backfilling existing workspaces.
- **`categories`** — per-user custom categories (in addition to `global_settings.default_categories`). `name`, `type` (`income`/`expense`), `color`, `icon` (default `tag`), `is_investment`, soft-delete. Investments are **not** a separate entity — an expense whose split resolves to an `is_investment=true` category counts via the `investment_totals` view.
- **`contributors`** — who paid/contributed (e.g. "Me", "Spouse"). `name`, `color`, `is_default`, `can_delete`, `is_active`, soft-delete.

**Transactions**

- **`transactions`** — parent record: identity + total amount only; per-purpose breakdown lives in `transaction_splits`. `account_id` (FK, **restrict** on delete), `merchant` (GIN full-text index), `total_amount`, `type` (`income`/`expense`), `payment_method` (default `UPI`), `source` (`manual`/`mobile`/`bank-sync`/`import`), `entry_source` (`manual`/`mobile-manual`/`sms-auto-detected`), `transaction_date`, `month_key` (denormalized `YYYY-MM`), `status` (default `completed`), `has_splits`, `tags[]`, `outing_id` (FK → outings, set null). Indexes: `(user_id, transaction_date desc)`, `(user_id, month_key)`, `(user_id, account_id)`, `(user_id, type)`, merchant GIN. Select = owner OR (via a `transaction_splits` row whose `purpose_id` has an active shared-viewer grant); write = owner only.
- **`transaction_splits`** — per-purpose/category/contributor breakdown; **source of truth for multi-category expenses**. `purpose_id` (FK, restrict), `category_id` (**text** — stores the category **name**, not an id/FK), `contributor_id` (FK, set null), `outing_id` (FK, set null), `amount`, `note`. Select = owner OR shared-purpose viewer; write = owner only.

**Planning**

- **`monthly_plans`** — per-month (optionally per-purpose) budget. `month`, `title`, `purpose_id` (FK, cascade), `expected_income`, `allocations` (jsonb array `{category, plannedAmount, color, notes?, rollover?}`), `daily_safe_limit`, `savings_target`, `budget_set_at`, `is_budget_locked`, `change_history` (jsonb), `last_modified_by`. Unique `(user_id, month, purpose_id)`. DB-level guard via `monthly_plans_validate_allocations` trigger. Select = owner OR shared-purpose viewer; write = owner only.
- **`budget_templates`** — reusable named templates. `template_name`, `expected_income`, `allocations` (jsonb), `is_default`.
- **`smart_views`** — saved, month-agnostic filter presets (Account + Purpose + Category + Contributor — deliberately no date column). `name`, `account_id`, `purpose_id`, `category_ids[]`, `contributor_id`.

**Social — friends, outings, splits, settlements**

- **`friends`** — `name`, `phone`, `email`, `upi`, `upi_ids[]`, `notes`, soft-delete.
- **`outings`** — group trips. `created_by` (FK), `title`, `type`, `location`, `budget`, `start_date`/`end_date`, `members` (jsonb array of `TripMember`-shaped objects), `participants` (uuid[] — the subset who are actual app users), `status` (`active`/`completed`/`cancelled`), `auto_add_mode`, `total_spent`, soft-delete. Index `(user_id, status)`. Select = `created_by = auth.uid()` OR `auth.uid() = any(participants)`; write = creator only.
- **`outing_expenses`** — expense line items. `outing_id` (FK, cascade), `description`, `amount`, `category_id`, `expense_date`, `paid_by_member_id` (text — a member id, **not** an FK, since members can be friends without accounts), `split_type` (`equally`/`solo`/`custom`/`percentage`/`shares`), `splits` (jsonb), `source` (`manual`/`bank-detected`), `linked_transaction_id` (FK → transactions, set null). Unique partial index (`20260728`): `(user_id, linked_transaction_id) where linked_transaction_id is not null` — prevents web's outing-sync and mobile's SMS auto-add from double-inserting an expense for the same transaction (that migration also de-duplicated existing rows, keeping the earliest per pair).
- **`settlements`** — who-paid-whom-back. `outing_id` (FK, cascade), `from_member_id`/`to_member_id` (text), `amount`, `is_partial`, `settled_date`, `note`.

**Sharing**

- **`purpose_shares`** — "claimed"/email-invite viewer grants on a purpose. `owner_id`, `viewer_email`, `viewer_id` (nullable until claimed), `purpose_id` (FK, cascade), `role` (fixed to `viewer`), `link_token`, `expires_at`, `status` (`pending`/`active`/`revoked`), `last_viewed_at`, `total_views`, `contributor_id` (added `20260717` — optional scoping to one contributor). Unique `(purpose_id, viewer_id)`; partial unique `(owner_id, purpose_id, viewer_email) where status <> 'revoked'`. RLS: select if owner/viewer/JWT-email match; insert by owner or by a viewer claiming via a matching `share_links` token; the claim-update path is column-restricted (only `viewer_id`) by the `purpose_shares_claim_guard` trigger; delete owner-only.
- **`share_links`** — the no-login shareable token. `token` (PK), `owner_id`, `purpose_id` (FK, cascade), `purpose_name`, `viewer_email`, `expires_at`, `last_viewed_at`/`total_views` (added `20260716`), `contributor_id` (added `20260717`). RLS: owner-only for list/insert/delete — no update policy (anonymous visitors never touch this table directly, only via `SECURITY DEFINER` RPCs).
- **`share_access_logs`** — page-view log. `share_id` (FK, cascade, **nullable** since `20260716` for pure anonymous token visits), `owner_id`, `purpose_id`, `token`, `viewed_at`, `page`, `device`/`browser`/`os`/`country`. Select owner-only; insert unconditional (writes actually happen via the `security definer` `log_shared_page_view` RPC).

**Logs**

- **`audit_logs`** — generic before/after change log (`table_name`, `record_id`, `action`, `before`/`after` jsonb). Append-only (select/insert only).
- **`activity_logs`** — human-readable activity feed. Append-only.
- **`backup_history`** — `type` (`automatic`/`manual`), `frequency`, `storage_path`, `size_bytes`, `manifest[]`, `status` (`success`/`failed`), `error_message`.
- **`account_balance_history`** — daily per-account balance snapshots. Unique `(account_id, snapshot_date)`. Select/insert/update own only (no delete).
- **`admin_action_logs`** (added `20260720`) — append-only admin audit trail. `admin_id` (FK → `auth.users`, nullable, `on delete set null` — fixed `20260729` so deleting a user doesn't FK-violate its own audit row), `action` (vocabulary evolved: `view_table/view_row/delete/export/impersonate_view` → `create/update/delete/export/password_reset` → adds `impersonate_start/impersonate_end`), `table_name`, `record_id` (text — PKs vary across tables), `before` (jsonb), `target_user_id` (FK, nullable, set null), `impersonation_session_id` (added `20260723`, links related mutations into one timeline). Select/insert = `is_admin()`; **no update/delete policy at all**.
- **`user_api_logs`** (added `20260722`) — raw universal API-call traffic log (every REST/RPC/auth/storage/realtime call). `user_id` (**no FK** — logs must outlive deleted accounts), `user_email`/`user_name` (denormalized), `actor_role` (`user`/`admin`/`anonymous`), `api_type` (`rest_select`/`rest_insert`/`rest_update`/`rest_delete`/`rpc`/`route_handler`/`auth`/`storage`/`realtime`), `status`/`status_code`/`error_message`, `duration_ms`, `ip_address`, `device`/`browser`/`os`, `impersonated_by_admin_id` (added `20260723`). Select = admin-only (**even a user cannot read their own rows** — request metadata deemed more sensitive than the user-facing activity feed); insert is `with check (false)` (real inserts happen via the service-role proxy, bypassing RLS). Retention: `cleanup_user_api_logs()` deletes rows > 90 days, daily via `pg_cron`.
- **`admin_impersonation_sessions`** (added `20260723`) — `admin_id`/`target_user_id` (FK, nullable, set null), `started_at`/`ended_at`/`last_active_at`. 30-min inactivity expiry enforced by the proxy (app-layer, not a DB constraint).

**Reflections, alerts, income planning, savings, AI**

- **`reflections`** — weekly self-reflection. `week_start`, `mood`, `wins`, `unnecessary_spend`, `plan_adherence`, `plan_adherence_note`, `different_next_week`, `standout_transactions`, `ai_summary`. Unique `(user_id, week_start)`.
- **`smart_alerts`** — `type`, `title`, `message`, `severity` (`low`/`medium`/`high`), `read`.
- **`income_streams`** — `source`, `amount`, `frequency` (`monthly`/`one-time`), `last_received`.
- **`income_targets`** — 1:1 per user, **`user_id` is the PK**. `target_3_months`/`6`/`12`, `active_horizon`.
- **`savings_goals`** — `name`, `target_amount`, `saved_amount`, `monthly_contribution`.
- **`projector_settings`** — 1:1 per user, `user_id` PK, `settings` (jsonb).
- **`ai_chat_messages`** — `role` (`user`/`assistant`), `content`, `timestamp`.
- **`ai_insights`** — `month`, `type`, `health_score`, `summary`, `tips[]`, `generated_at`. Unique `(user_id, month, type)`.

**SMS parsing rules (admin-managed, shared across all users)**

- **`sms_template_rules`** — `bank_name`, `type`, `mode`, `template_pattern`, `extraction_map` (jsonb), `keywords[]`, `is_active`, plus (`20260726`, mobile parity) `sample_message`, `similarity_threshold`.
- **`sms_detection_rules`** — `match_pattern`, `contains_keywords[]`/`exclude_keywords[]`, `amount_pattern`, `type`, `mode`, `bank_name`, plus (`20260726`) `sample_message`, `name_pattern`, `date_pattern`, `ref_pattern`, `account_pattern`, `upi_pattern`.
- **`sms_block_rules`** — `name`, `keywords[]`, `pattern`, `similarity_threshold` (default 0.8), plus (`20260726`) `sample_message`.
All three: select authenticated, write admin-only.

**Other user-scoped tables (added `20260718`)**

- **`account_purposes`** — junction table, accounts ↔ purposes (many-to-many). Unique `(account_id, purpose_id)`. *(Overlaps with `accounts.purpose_ids uuid[]` — see §8.)*
- **`net_worth_history`** — daily net-worth snapshot (`cash_balance`, `bank_balance`, `investment_value`, `net_worth`). Unique `(user_id, snapshot_date)`.
- **`user_devices`** — known devices/browsers. `device_label`, `user_agent`, `platform`, `last_seen_at`.
- **`login_history`** — login event audit trail.

**SMS merchant learning (`20260727`)**

- **`user_merchants`** — per-user (not global) verified SMS-payee → merchant mapping: first SMS from a payee needs manual verification, subsequent SMS from the same normalized payee auto-adds. `payee`, `normalized_payee`, `title`, `purpose` (default `Personal`), `category` (default `Other`), `is_auto_apply` (default true), `verified_at`. Unique `(user_id, normalized_payee)`.

### 3.5 Views

| View | Purpose |
|---|---|
| `monthly_plan_actuals` | Joins `monthly_plans` against `transaction_splits`/`transactions` to compute `actual_expense`, `actual_income`, `total_planned` (from `allocations` jsonb), `remaining_budget`, `variance` per plan. |
| `investment_totals` | Per-user total invested amount: sums `transaction_splits.amount` for expense transactions whose resolved category (custom `categories` row **or** a `global_settings.default_categories` entry) has `is_investment = true`. Joins on **category name** (`categories.name = transaction_splits.category_id`), not id — matches the real (non-FK) write path. |

### 3.6 Key relationships — narrative

**Transactions ↔ Accounts / Purposes / Categories / Contributors / Splits / Outings.** A `transactions` row is the parent (identity, `account_id`, `total_amount`, `type`, dates) — it does **not** carry purpose/category/contributor directly. Each transaction has ≥1 `transaction_splits` row (`has_splits=true` when more than one) — the source of truth for per-purpose amount/category/contributor breakdown. Both `create_transaction_with_splits()` and the impersonation variant insert the transaction + all splits atomically. "Investments" are not a separate table — they're expense transactions whose split resolves to an `is_investment=true` category, aggregated by the `investment_totals` view.

**Outings ↔ Outing Expenses / Members / Settlements.** `outings.members` (jsonb) holds `TripMember`-shaped roster objects (some with `friendId`, one flagged `isCurrentUser`); `outings.participants` (uuid[]) holds the subset who are actual app users (used for RLS). `outing_expenses` rows record `paid_by_member_id` + a `splits` jsonb array, both keyed by *member id*, not a foreign key, since members can be non-users. An `outing_expenses` row can optionally link back to a real wallet transaction via `linked_transaction_id` — this is how "auto-add SMS/bank spend to an active outing" works (web's `useOutingTransactionSync`, mobile's SMS auto-add); the `20260728` unique partial index guarantees at most one `outing_expenses` row per `(user_id, linked_transaction_id)`, fixing a real double-counting bug from racing clients. `transactions.outing_id`/`transaction_splits.outing_id` are separate, optional FKs — a normal wallet transaction can also be tagged to an outing directly.

**Sharing.** Two parallel mechanisms, both scoped to one `purpose_id`: (1) **`purpose_shares`** — the "claimed viewer" flow: owner invites a `viewer_email`; when that person signs in and their JWT email matches, they can claim the pending row (column-restricted by the claim-guard trigger), after which they get RLS-level read access to the owner's `purposes`/`transactions`/`transaction_splits`/`monthly_plans` for that purpose. (2) **`share_links`** — the anonymous, no-login flow: a bare token tied to one owner+purpose; since an anonymous visitor has no `auth.uid()` and can't pass any RLS policy, a family of `SECURITY DEFINER` RPCs re-validate the token/expiry themselves and return data scoped strictly to that token's owner/purpose (and optional `contributor_id` scope).

**Admin / Impersonation / Logging.** `admin_action_logs` is an append-only audit of admin actions, standing in for RLS since admin tables have no admin-bypass RLS policy — each admin RPC's own `require_admin()` call is the enforcement point. `user_api_logs` is the raw traffic log of every proxied API call from any actor, written via the service role; admin-read-only, 90-day retention via `pg_cron`. `admin_impersonation_sessions` tracks session lifecycle; the proxy enforces a 30-minute inactivity timeout at the app layer. Both `admin_action_logs.admin_id`/`target_user_id` and `admin_impersonation_sessions.admin_id`/`target_user_id` were relaxed to `on delete set null` (`20260729`) so deleting a user doesn't FK-violate the audit row the delete flow itself just wrote.

**App-config / SMS rules.** `global_settings` (single row) is the sole source for app name/version/maintenance-mode/per-user resource limits and the shared default-categories list — CRUD only via `admin_add/update/delete_default_category` RPCs. `sms_template_rules`/`sms_detection_rules`/`sms_block_rules` are admin-managed, shared (not per-user) SMS-parsing rules read by both web and mobile for bank-SMS auto-detection. `user_merchants` (per-user, unlike the rules tables) is the *learned* SMS payee→merchant mapping.

---

## 4. Core library layer (`src/lib`)

### 4.1 `supabase-data.ts` — central data-access layer

The single Supabase query/mutation layer (~2,900 lines). Every hook and lib module calls into it rather than touching `supabase-js` directly. Internal row-mapping helpers (`toTransaction`, `toAccount`, `toPurpose`, `toPlan`, `toOuting`, etc.) convert snake_case DB rows to camelCase app types, plus `*Payload` builders that reverse the mapping for writes.

| Domain | Exports |
|---|---|
| Auth | `isSupabaseConfigured`, `signInWithEmail`, `signOutUser`, `signUpWithEmail`, `sendPasswordReset`, `resendVerificationEmail`, `updatePassword`, `completeAuthSession`, `setProfileSavedListener` |
| Transactions | `fetchTransactions`/`fetchTransaction`/`fetchTransactionsPage`, `subscribeToTransactions`/`subscribeToFilteredTransactions`, `fetchFilteredTransactions`, `addTransaction`/`updateTransaction`/`deleteTransaction` (writes via RPC `create_transaction_with_splits`) |
| Accounts/Categories/Purposes | `fetchAccounts`/`saveAccount`/`deleteAccount`/`archiveAccount`; `fetchDefaultCategories`/`fetchCustomCategories`/`fetchCategories`/`saveCustomCategory`/`deleteCustomCategory`; `fetchPurposes`/`savePurpose`/`archivePurpose`/`deletePurpose` |
| Purpose sharing | `fetchPurposeShares`/`createPurposeShare`/`revokePurposeShare`; `getOrCreateShareLink`/`claimShareLink`/`logSharedPageView`; `fetchSharedTransactions`/`fetchSharedPurposes`/`fetchSharedMonthlyPlan`; `linkPurposeSharesForViewer`; `sendEmail`/`sendPurposeShareInviteEmail` |
| User / workspace | `fetchUserProfile`/`saveUserProfile`/`fetchUserDocument`; `ensureUserWorkspace`/`ensureUserProfile`/`clearUserWorkspaceSessionCache`; `dismissBankOnboarding`/`fetchBankOnboardingState`; `fetchUserSettings`/`saveUserSettings`/`requestMobileAppPinReset`; `fetchAppConfig`/`saveAppConfig`/`fetchPreferences`/`savePreferences` |
| Monthly plans | `fetchMonthlyPlan`/`fetchAllMonthlyPlans`/`fetchAllMonthlyPlanActuals`; `fetchPlanTemplates`/`savePlanTemplate`/`deletePlanTemplate`; `saveMonthlyPlan`/`deleteMonthlyPlan` (retries without `title` if schema hasn't migrated) |
| Reflections / Alerts / Income / Wealth | `fetchReflections`/`fetchReflection`/`saveReflection`; `fetchAlerts`/`upsertAlerts`/`markAlertRead`/`markAllAlertsRead`/`subscribeToAlerts`; `fetchIncomeStreams`/`saveIncomeStream`/`deleteIncomeStream`; `fetchIncomeTargets`/`saveIncomeTargets`; `fetchInvestmentTotal`; `fetchSavingsGoals`/`saveSavingsGoal`/`deleteSavingsGoal`; `fetchProjectorSettings`/`saveProjectorSettings`; `fetchBalanceSnapshots`/`saveBalanceSnapshot`/`deleteBalanceSnapshot` |
| Outings | `fetchOutings`/`subscribeToOutings`/`saveOuting`/`deleteOuting`; `fetchOutingExpenses`/`saveOutingExpense`/`deleteOutingExpense`; `fetchOutingSettlements`/`saveOutingSettlement`; `fetchFriends`/`saveFriend`/`deleteFriend`; `fetchContributors`/`saveContributor`/`deleteContributor`/`defaultContributorDocId` |
| Smart Views / AI | `fetchSmartViews`/`saveSmartView`/`deleteSmartView`; `fetchAiChatHistory`/`subscribeToAiChatHistory`/`saveAiChatMessage`/`clearAiChatHistory`; `fetchAiInsight`/`saveAiInsight` |
| SMS rules (admin-owned) | `fetchSmsTemplateRules`/`saveSmsTemplateRule`/`deleteSmsTemplateRule`; `fetchSmsDetectionRules`/`saveSmsDetectionRule`/`deleteSmsDetectionRule`; `fetchSmsBlockRules`/`saveSmsBlockRule`/`deleteSmsBlockRule` |
| Backup / Global settings | `BACKUP_VERSION`/`BACKUP_SCHEMA_VERSION`; `isValidBackupFile`/`gatherAllUserData`/`buildBackupZipBytes`/`parseBackupZipBytes` (via `fflate`); `uploadBackupToStorage`/`restoreBackupData`; `fetchGlobalSettings`/`subscribeToGlobalSettings`/`updateDefaultCategories`/`bootstrapGlobalSettingsIfMissing` |

### 4.2 `src/lib/supabase/` — client wiring

| File | Purpose |
|---|---|
| `env.ts` | `getSupabaseUrl`/`getSupabasePublishableKey`/`hasSupabaseConfig` |
| `client.ts` | Browser client factory. Routes all REST/RPC/auth/storage calls through `/api/proxy/[...path]` for logging + impersonation header injection; realtime WS stays direct. |
| `server.ts` | Server Component client factory (cookie-based) |
| `proxy.ts` | `updateSession` — refreshes the auth cookie on every request |
| `admin.ts` | `createAdminClient`/`getServiceRoleKey` — service-role client, server-only |

### 4.3 `src/lib/server/` — server-only request/logging helpers

| File | Key exports | Purpose |
|---|---|---|
| `api-log.ts` | `logApiCall`, `extractClientIp`, `resolveCallerIdentity`, `resolveCallerIdentityFromCookie`, `lookupUserBrief` | Writes `user_api_logs` rows (fire-and-forget) via the service-role client |
| `impersonation.ts` | `validateImpersonationSession`, `classifyImpersonatedTable`, `logImpersonatedMutation`, `invalidateSessionCache` | Validates/touches sessions (30-min inactivity limit), classifies tables as blocked/global-read-only/scoped for the proxy, audits impersonated writes |
| `ua-parse.ts` | `parseUserAgent` | Heuristic device/browser/OS parser for log enrichment |
| `with-route-logging.ts` | `withRouteLogging` | Route Handler wrapper logging every invocation non-blockingly via `after()` |

### 4.4 `src/lib/ai/` — AI content generators (rule-based + Gemini fallback)

| File | Key exports | Purpose |
|---|---|---|
| `financial-insights.ts` | `buildFinancialInsightContext`, `buildRuleBasedFinancialInsights`, `generateFinancialInsights`, `aiInsightDocId` | Monthly financial-insight context (top categories, burn rate, weekend ratio, safe-limit days); rule-based tips or Gemini `gemini-2.5-flash` (blends AI score with rule-based base score) |
| `generateSummary.ts` | `buildRuleBasedWeeklySummary`, `buildMonthlyReflectionSummary`, `generateWeeklySummary` | Weekly reflection AI narrative + monthly reflection roll-up |
| `growthSuggestions.ts` | `buildGrowthSuggestions` | Income-growth coaching tips |
| `personalizedSuggestions.ts` | `buildPersonalizedSuggestions`, `getTransactionTip` | Behavioral coaching tips + per-transaction quick tip |
| `wealthSuggestions.ts` | `buildWealthInsight` | Compares "current" vs "+₹2000/month savings" net-worth-at-40 projection |

### 4.5 `src/lib/alerts/` — smart alerts engine

`generateAlerts.ts` — `generateSmartAlerts`/`mergeAlerts`: pure rule engine producing burn-rate, plan-deviation, budget-threshold, daily-limit, reflection-reminder, and income alerts from transactions/plan/reflections; `mergeAlerts` reconciles fresh alerts with stored read/createdAt state.

### 4.6 `src/lib/calculators/` — pure financial math

| File | Key exports | Purpose |
|---|---|---|
| `dailyLimit.ts` | `calculateDailySafeSpending`, `getDaysLeftInMonth`, `sumMonthExpenses`, `sumTodayExpenses`, `getDailyLimitInsight`, `isTransactionInMonth`/`isTransactionOnDate` | Core daily-safe-spending algorithm: remaining budget ÷ days left, overspend recovery-days suggestion, month-end projection |
| `projections.ts` | `projectNetWorthAtAge`, `buildScenarioChartData`, `buildProjectionScenarios`, `getScenarioConfigs` | Compound-interest net-worth projection under 3 scenarios (Current/Disciplined/Aggressive) |

### 4.7 Outings domain logic

| File | Key exports | Description |
|---|---|---|
| `outings.ts` | `buildEqualSplits`/`buildSoloSplit`/`buildExpenseSplits`, `computeMemberBalances`, `computeTripSummary`, `computeSpendingByCategory`/`computeSpendingByMember`, `simplifyDebts`, `computeNetBalancesByMember`, `getPendingSettlements`, `isOutingRollupTransaction`/`findOutingRollupTransaction`/`computeOutingRollupAmount`/`buildOutingRollupDraft`/`isIndividualOutingLedgerTransaction`, `latestOutingExpenseDate` | Split-the-bill math (equal/solo/custom), per-member balance ledger, greedy debt-simplification, and the "outing rollup" concept — one ledger line (tagged `outing-rollup`) summarizing a trip's total |
| `outing-sync.ts` | `getActiveAutoOuting`, `getOutingCandidatesForTransaction`, `buildOutingExpenseFromTransaction`, `hasOutingUnlinkedOptOut`, `withOutingUnlinkedTag`/`withoutOutingUnlinkedTag`, `isWithinOutingDates`, `hasOtherActiveOuting` | Decides which active/auto-add outing a new expense should attach to, builds the resulting `outing_expenses` payload |
| `outing-transactions.ts` | `isOutingExpenseTransaction`, `outingExpenseToTransaction`, `mergeLedgerWithOutingExpenses` | Converts unlinked (cash) outing expenses into synthetic display transactions merged with the real ledger |
| `outing-display.ts` | `getCategoryColor`, `formatOutingDates`, `isOutingPlanned`, `getOutingStatusLabel`, `filterOutings`/`sortOutings`, `getOutingCardStats`, `formatBalancePill` | UI-facing formatting/filtering for outing cards/lists |
| `outing-reports.ts` | `outingExpensesToCsv`, `buildOutingReport` | CSV export + reshapes one outing into `FinancialReportData` for PDF reuse |

### 4.8 Plan/budget domain logic

| File | Key exports | Description |
|---|---|---|
| `plan.ts` | `formatPlanMonth`/`getCurrentPlanMonth`/`getPlanMonthOptions`/`shiftPlanMonth`, `getDefaultPlanAllocations`, `createEmptyPlan`, `sumPlanned`, `computeCategorySpentActuals`, `computeEffectiveBudget` (rollover), `getPlanBudgetStatus`/`getPlanDelta`/`getUtilization`, `suggestExpectedIncome`, `buildPlanSuggestions`/`applyPlanSuggestions`, `getPieChartData`, `applyActualsToBudget`, `autoBalanceAllocations`, `getBudgetVsActualSummary`, `buildIncomeIdeas`, `getPlanCategoryKind`/`isWealthCategory`/`getPieChartColor` | Monthly-budget engine: allocation math, rollover carryover, over-budget shortfall suggestions, "apply last 30 days actuals as budget", proportional auto-balancing |
| `financial-health.ts` | `buildFinancialHealth`, `buildHealthScoreMetrics`, `calculateBaseHealthScore`, `resolveFinalHealthScore`, `countDaysOverSafeLimit` | 0–100 health score (savings rate + budget utilization + safe-spending discipline) plus India-specific metrics (salary date, UPI spend %, bills paid) |
| `kpi-delta.ts` | `formatAmountDelta`, `formatPercentDelta` | Formats a KPI delta (amount/percent vs prior period) |
| `balance-carryover.ts` | `computeRunningBalance`, `computeClosingBalance`, `getTransactionsThroughDate`, `getBalanceBreakdownAsOfDate`, `computeBalanceAsOfDate` | Running/"as of date" account balance reconstruction |

### 4.9 Analytics & dashboard

| File | Key exports | Description |
|---|---|---|
| `analytics.ts` | `defaultAnalyticsFilters`, `getDateRangeForPreset`, `filterAnalyticsTransactions`, `computeHeroStats`, `computeTrendData`, `computeMonthlyComparisonTimeline`, `computeCategoryBreakdown`, `computeTopMerchants`, `computePlanVsActual`/`computePlanComparisonSummary`/`computePlanAdherenceOverTime`, `computeDetailedStats` (velocity/behaviour/incomeDependency/accountPayment/financialEvents/anomalies/forecast/healthScore), `applyDrillDownFilter`, `formatAnalyticsPeriodLabel`, `getPlanMonthFromFilters`, `computeContributorBreakdown` | Analysis page's main computation engine (largest lib file besides `supabase-data.ts`) |
| `analytics-filters.ts` | `applyAnalyticsFilters`, `sortAnalyticsTransactions`, `buildTransactionOutingIndex`, `inferOutingType`/`inferWithWhom`, `getTopMerchants`, `extractTransactionTags`, `filtersForCategoryBreakdown`/`filtersForTopMerchants`, `countAdvancedFilters`/`countActiveFilters`, `buildActiveFilterChips`, `computeAnalyticsFilterSummary`, `clearFilterChip` | Filter-predicate implementation + active-filter-chip UI derivation |
| `analytics-filter-config.ts` | `analyticsSources`, `transactionStatusOptions`, `amountQuickChips`, `categoryGroups`, `outingTypeOptions`/`outingWithWhomOptions`/`outingStatusOptions`, `compareModeOptions`/`compareModeLabels`, `sortByOptions` | Static filter dropdown option lists |
| `dashboard.ts` | `buildDashboardData`, `getDashboardDateRange`/`getDashboardPeriodLabel`, `buildMultiPurposeTrend`, `buildDashboardChartSnapshot`, `getMonthDateRange`, `filterLastNDays`, re-exports `computeNetWorthByPurpose` | Dashboard-page KPI/trend computation |
| `dashboard-kpi-meta.ts` | `kpiIcons`, `kpiAccent` | Icon + color-tone map for configurable dashboard KPI cards |
| `category-totals.ts` | `buildCategoryTotals` | Shared category spend rollup used by both Dashboard and Analysis |
| `date-filters.ts` | `getDateRangeForDashboardPreset`, `toCalendarDate`, `getTodayCalendarDate`, `isOnOrBeforeCalendarDate`, `getDaysInRange` | Calendar-date range/preset helpers |
| `filter-defaults.ts` | `createDefaultGlobalFilters` | Builds the initial `GlobalFilters` object (current month range) |
| `transactions-query.ts` | `canUseServerTransactionQuery`, `resolveMonthKeyFilter`, `buildTransactionQueryConstraints`, `applyClientTransactionFilters`, `toServerTransactionFilters`/`applyServerTransactionFilters` | Splits filtering between what Supabase can do server-side (month_key/date/type/account) vs. client-side fallback |
| `reports.ts` | `buildReportFilters`, `buildFinancialReport` | Builds `FinancialReportData` (monthly / custom / plan-vs-actual) feeding `pdf.ts` |
| `pdf.ts` | `generateReportPdf`, `downloadReportPdf` | jsPDF + autoTable report rendering/download |
| `smart-views.ts` | `resolveSmartViewFilters`, `isSmartViewActive`, `describeSmartView` | Resolves a saved Smart View's stored ids to live filter values |
| `transaction-summary.ts` | `findLikelyDuplicate`, `sumVisibleSpending`, `summarizeTransactions` | Transactions-page summary strip totals — special-cases outing rollups so totals match what's visibly listed |
| `transaction-ui.ts` | `transactionTypeMeta`, `getCategoryIcon`, `getTransactionAmountClass`, `getTransactionTypeMeta` | Icon/color/copy metadata for transaction display |

### 4.10 Auth & user bootstrap

| File | Key exports | Description |
|---|---|---|
| `auth.ts` | `isValidEmail`, `validateSignInForm`/`validateSignUpForm`/`validateForgotPasswordForm`, `getAuthErrorMessage` | Client-side form validation + friendly error mapping |
| `auth-email.ts` | `sendVerificationEmail`, `sendPasswordResetEmail` | Branded HTML email via Resend |
| `auth-redirect.ts` | `getSiteOrigin`/`getServerSiteOrigin`, `getAuthCallbackUrl`/`getServerAuthCallbackUrl`, `buildAuthConfirmUrl`, `verificationLinkFromGenerateLink` | Auth callback/confirm URL construction |
| `user-bootstrap.ts` | `bootstrapUserWorkspace`, `clearBootstrapSessionCache`, `readBootstrapClientContext` | Idempotent, session-cached new-user seeding: `users` row, Personal + Family purposes, Cash account, "Me" contributor, default budget template, balance/net-worth snapshots, device + login-history tracking |
| `resend.ts` | `sendResendEmail`, `getResendFromEmail` | Low-level Resend API wrapper |

### 4.11 Admin

| File | Key exports | Description |
|---|---|---|
| `admin.ts` | `isAdminEmail`, `isAdminUser` | Client-side admin check (UI-only; real enforcement is server-side RLS/RPCs) |
| `admin-api.ts` | `fetchAdminTableMeta`, `adminListTable`/`adminCountTable`/`adminDeleteRow`/`adminUpdateRow`, `adminLogAction`/`adminListActionLogs`, `fetchAdminOverview`, `adminListUsers`/`fetchAdminUserOverview`, `adminAddDefaultCategory`/`adminUpdateDefaultCategory`/`adminDeleteDefaultCategory`, `adminListApiLogs`/`adminCountApiLogs`, `adminStartImpersonation`/`adminEndImpersonation`, `adminResetPassword`, `adminDeleteUser` | Thin RPC wrappers for the entire admin portal |
| `admin-format.ts` | `formatIST`, `formatISTDate`, `formatKb` | IST-pinned timestamp formatters + byte-size formatter |

### 4.12 Query infra

| File | Key exports | Description |
|---|---|---|
| `query-keys.ts` | `queryKeys` | Central react-query key factory, all scoped by `userId` |
| `query-cache.ts` | `readQueryCache`/`writeQueryCache`/`removeQueryCache`, `readQueryCacheSavedAt`, `cacheKeys`, `hydrateQueryCaches` | localStorage-backed 24h cache used as `placeholderData` |
| `settings-data.ts` | `mergeCategories`, `resolveStoredPurposes`, `resolveStoredAccounts`, `syncSettingsCache` | Settings-page normalization + cache sync |
| `realtime-log.ts` | `logRealtimeSubscribe` | Fire-and-forget POST to `/api/realtime-log` |

### 4.13 Shared domain primitives

| File | Key exports | Description |
|---|---|---|
| `purposes.ts` | `PERSONAL_PURPOSE_ID`/`FAMILY_PURPOSE_ID`/`HOME_PURPOSE_ID`, `openingBalanceForPurpose`, `isFamilyPurposeName`/`isFamilyPurposeRef`, `getDefaultFamilyPurpose`, `normalizePurpose`/`normalizePurposes`, `getActivePurposes`, `getPurposeById`, `getDefaultPersonalPurpose`, `isPersonalPurposeRef`, `transactionMatchesPurpose`, `getPurposeLabel`, `resolvePurposeId`, `getPurposeDisplayName` | Central purpose-resolution logic incl. legacy name/id aliasing (`Home`→Family, `purpose-1`→Family) |
| `purpose-shares.ts` | `normalizeShareEmail`, `emailToShareSlug`, doc-id builders, `isActiveViewerShare`, `getViewerShares`/`getOwnedShares`, `shareExpiryOptions`, `computeShareExpiresAt`, `findActiveShareForInvite` | Share-link id conventions and expiry-preset math |
| `investments.ts` | `isInvestmentCategory`/`isInvestmentTransaction`, `isTransferTransaction`, `isOutingRollupLike`, `isSpendingExpense`, `sumInvestments`, `sumSpendingExpenses` | Canonical predicates distinguishing real spend vs. investment vs. internal transfer vs. outing-rollup — used pervasively to avoid double-counting |
| `wealth.ts` | `OPENING_BALANCE_CATEGORY`, `transactionAmount`, `isOpeningBalanceTransaction`/`isBalanceExcludedTransaction`, `buildOpeningBalanceTransaction`, `transactionsForBalance`, `transactionMatchesAccount`, `unlinkedOutingCashImpact`, `getAccountBalance`, `getMonthlySavingsRate`, `getAccountsByType`, `computeNetWorthBreakdown`/`computeNetWorthByPurpose`, `getWealthFilterLabel`, `filterWealthTransactions`, `getTransactionBalanceAfter`, `getNetWorthHistory`, `getEmergencyFundHealth`, `getGoalProgress`/`getProjectedCompletionDate`, `defaultFutureSelfInputs` | The canonical net-worth/account-balance formula (`openingBalance + income − expense`, excluding Opening Balance and outing-rollup rows) |
| `accounts.ts` | `getAccountOpeningDate`, `isAccountActiveOnDate`, `getEffectiveOpeningBalance`, `formatAccountOpeningDate` | Determines when an account "started" for as-of-date balance calculations |
| `growth.ts` | `defaultIncomeTargets`, `detectIncomeStreamsFromTransactions`, `getMonthlyIncomeTrend`, `getCurrentMonthlyIncome`, `getActiveTarget`, `getTargetProgress` | Income-growth tracking helpers |
| `journal.ts` | `getWeekStart`/`getWeekEnd`/`formatWeekLabel`/`getWeekOptions`, `isReflectionDue`, `getReflectionStatus`, `filterTransactionsForWeek`, `calculateWeeklyPlanAdherence`, `getStandoutTransactions`, `getMonthReflections` | Weekly Reflection domain logic (Sunday-anchored weeks) |
| `backup-actions.ts` | `runAccountBackup`, `getLastBackupAt` | Client-side "download zip + best-effort cloud upload" orchestration |

### 4.14 Misc utils / infra

| File | Key exports | Description |
|---|---|---|
| `utils.ts` | `transactionDateKey`, `compareTransactionsNewestFirst`, `cn`, `setActiveCurrency`/`getActiveCurrency` (INR-locked), `setGlobalPrivateMode`/`getGlobalPrivateMode`, `formatCurrency`, `formatDate`/`formatDateTime`, `toCsv`/`downloadCsv`, `hasActiveTransactionFilters`, `filterTransactions` |
| `data-schema.ts` | `deriveMonthKey` — derives `YYYY-MM` for the `month_key` column |
| `data-rebuild.ts` | `withAudit` (pass-through), `listAuditLogs`/`listShareAccessLogs`/`listBackupHistory` (stub/empty), `deriveSplitsFromTransaction`, re-exports global-settings functions — mostly legacy shims from the Firestore→Supabase rebuild |
| `migrate-phase1.ts` | Empty (`export {}`) — emptied legacy file |
| `mock-data.ts` | Static seed/demo data + defaults (`mockTransactions`, `defaultSignupAccounts`, `defaultCategories`, `defaultPurposes`, `defaultUserSettings`, `defaultAppConfig`, `mockFriends`/`mockOutings`/etc.) consumed by bootstrap and Settings fallbacks |
| `greeting.ts` | `getFirstName`, `getTimeAwareGreeting` — Dashboard "Good morning, X" |
| `theme.ts` | `Theme` type, `getSystemTheme`/`resolveTheme`/`applyTheme`, `readStoredTheme`/`storeTheme` |

---

## 5. Hooks (`src/hooks`)

All `"use client"`. Most wrap a `supabase-data.ts` function with react-query, keyed via `queryKeys`, gated on `useAuthReady()`. A smaller set are pure Context providers or non-query side-effect hooks.

| Hook | What it does |
|---|---|
| `useAccounts` | react-query wrapper around `fetchAccounts`, viewer-aware |
| `useAiChatHistory` | Manual state + `subscribeToAiChatHistory` realtime (not react-query); `appendMessage`/`clearHistory` |
| `useAiFinancialInsights` | Loads cached `AiInsight`; auto-regenerates via `/api/ai/financial-insights` when missing/stale (>24h)/health score drifted >20; persists via `saveAiInsight` |
| `useAllOutingExpenses` | react-query wrapper around `fetchOutingExpenses(userId)` (all outings) |
| `useAnalyticsData` | Combines transactions/categories/purposes/plan + `analytics.ts` into the full Analysis dataset |
| `useAnalyticsFilters` | Context provider for Analysis draft/applied filter state (two-stage apply, chip removal, date-preset shortcuts) |
| `useAnalyticsOutingContext` | Supplies `{ outings, outingExpenses }` to `analytics-filters.ts` for outing-based filtering |
| `useApplyUserPreferences` | Side-effect only: reads settings, calls `setGlobalPrivateMode` app-wide; mounted once |
| `useAuthReady` | Thin wrapper exposing `{ user, isConfigured, isReady, authLoading }` — the gate every other hook depends on |
| `useAutoBackup` | Side-effect only: weekly overdue silent cloud backup + debounced backup on financial-data cache-success events, de-duped via content hash; mounted once app-wide |
| `useBalanceSnapshots` | react-query + `add/removeSnapshot` mutations |
| `useCategories` | Two react-query queries (global defaults + custom) merged client-side |
| `useContributors` | react-query wrapper + `add/removeContributor`; protects the default "Me" contributor from removal |
| `useDailySafeSpending` | Pure computed hook: filters by purpose, calls `calculateDailySafeSpending` |
| `useDashboardData` | Combines transactions/outing-expenses/accounts/categories/purposes/global-filters via `buildDashboardData` — Dashboard's main data hook |
| `useDashboardKpiConfig` | localStorage-persisted set of shown KPI cards |
| `useFilteredTransactions` | Realtime subscription hook (not react-query); prefers server-side filtered subscription, falls back to client-side `filterTransactions` on error |
| `useFriends` | react-query wrapper + `add/update/removeFriend` |
| `useGlobalFilters` | Context provider for app-wide Dashboard/Transactions filter state |
| `useIncomeStreams` | react-query wrapper + `add/update/removeStream` |
| `useIncomeTargets` | react-query wrapper + `updateTargets`, default fallback from `growth.ts` |
| `useInvestmentTotal` | react-query wrapper around `fetchInvestmentTotal` |
| `useIsAdmin` | Client-side admin-UI check; UI affordance only |
| `useMonthlyPlan` | Large stateful hook: hydrates draft state from `useMonthlyPlanQuery`, computes totals/status/utilization/suggestions via `plan.ts`, supports rollover breakdowns, "apply actuals as budget", auto-balance, persists via `saveMonthlyPlan`/`deleteMonthlyPlan` |
| `useMonthlyPlanQuery` | react-query for a single plan (share-session-aware), plus `usePlanTemplatesQuery`/`useAllMonthlyPlansQuery`/`useAllMonthlyPlanActualsQuery` |
| `useOutingExpenses` | react-query wrapper (scoped to one outing) + `add/update/removeExpense` |
| `useOutings` | Wraps a higher-level `useAppData()` provider with query-cache sync |
| `useOutingSettlements` | react-query wrapper (scoped to one outing) + `addSettlement` |
| `useOutingTransactionSync` | **Side-effect hook, no data returned.** Debounced (1.2s) background sync: auto-links matching expense transactions to active auto-add outings, creates `outing_expenses` rows (handling races from other clients/mobile), and keeps the single "outing rollup" ledger transaction in sync — create/update/delete — so the Transactions page shows one line per trip. Skipped on `/admin` routes. |
| `useProjectorSettings` | react-query wrapper + `updateSettings` |
| `usePurposes` | react-query wrapper, share-session-aware and read-only-viewer-scoped |
| `usePurposeShares` | react-query wrapper that also calls `linkPurposeSharesForViewer` on load; `inviteViewer`/`removeShare` |
| `useRebuildData` | `useTransactionSplits`/`useAuditLog`/`useShareAccessLogs`/`useBackupHistory` — mostly no-op given the stubbed `data-rebuild.ts` upstream |
| `useReflections` | react-query wrapper around `fetchReflections` |
| `useShareViewLogger` | Side-effect only: fires `logSharedPageView` once per mount, only inside an active share session |
| `useSmartAlerts` | Subscribes via `subscribeToAlerts`, computes fresh alerts via `generateSmartAlerts`, merges with stored read-state via `mergeAlerts`, persists via `upsertAlerts` on signature change; `readAlert`/`readAllAlerts` |
| `useSmartViews` | react-query wrapper + `add/update/removeSmartView` |
| `useSyncStatus` | Combines app-data error/lastSyncedAt with `navigator.onLine`; relative "X ago" sync label |
| `useTransactions` | Merges live-subscription transactions with a react-query fetch (share-session-aware), de-duped and sorted newest-first — the central transaction-read hook used almost everywhere |
| `useUserSettings` | react-query wrapper around `fetchUserSettings`, shares the `preferences` cache key with `useApplyUserPreferences` |
| `useWeeklyReflection` | react-query wrapper for a given week + `planAdherence` via `journal.ts`; `persistReflection` |

---

## 6. Component architecture (`src/components`)

Each feature domain follows the same pattern: a `*Page.tsx` component mounted directly by a route in `src/app/`, composed of sub-panels/dialogs/tables that consume the hooks in §5. `ui/` (generic shadcn-style primitives) is intentionally excluded below.

### 6.1 `admin/`

Mounted under `/admin/*`, single-sidebar layout via `AdminSectionShell`. All data access goes through `admin-api.ts` (RPC-backed, action-logged).

| Component | One-liner |
|---|---|
| `AdminOverviewPage.tsx` | `/admin` — KPI cards (users, backups, storage) + quick links, via `fetchAdminOverview` |
| `AdminUsersPage.tsx` | `/admin/users` — paginated/searchable user list |
| `AdminUserDetailPage.tsx` | `/admin/users/[id]` — user's KPIs, delete/reset-password actions, impersonation entry point |
| `ImpersonationShell.tsx` | Starts a server-recorded session, re-provides `ImpersonatedAuthProvider`/`ViewerProvider` scoped to the target user, renders the exit banner |
| `AdminApiLogsPage.tsx` | `/admin/api-logs` — paginated API call log |
| `AdminBackupsPage.tsx` | `/admin/backups` — oversight over user backup rows |
| `AdminCategoriesPage.tsx` | `/admin/categories` — CRUD for global default categories |
| `AdminDatabasePage.tsx` | `/admin/database` — generic raw table browser |
| `AdminLogsPage.tsx` | `/admin/logs` — admin action audit log, filterable by action type |
| `AdminSectionShell.tsx` | Layout wrapper — header + "real user data" warning banner |
| `AdminSettingsPage.tsx` | `/admin/settings` — global app settings editor against `global_settings` |
| `AdminSmsRulesPage.tsx` | `/admin/sms-rules` — wraps `SmsRulesAdminPanel` |
| `SmsTemplateTagger.tsx` | Paste-an-SMS trainer that tags words (Amount/Bank/Date/etc.) to build an `sms_template_rules` pattern |

### 6.2 `analytics/`

**Top-level: `AnalysisPage.tsx`** — mounted at `/analytics`, `/share/[token]/analysis`, impersonated analysis route.

| Component | One-liner |
|---|---|
| `AnalysisPage.tsx` | Composes date filter, purpose chips, and all sub-panels; drives `useAnalyticsData`/`useAnalyticsFilters`, exports CSV/PDF |
| `AnalysisDateFilter.tsx` | Preset selector (this month / last month / last 3 months / this year) |
| `CategoryBreakdown.tsx` | Bar/sparkline of top spend categories with trend deltas, drill-into-category |
| `ContributorBreakdown.tsx` | Spend-by-source breakdown (self vs. contributors) |
| `MonthlyComparisonTimeline.tsx` | Recharts bar chart, income vs. expense across recent months |
| `PlanVsActualTable.tsx` | Per-category planned vs. actual with under/over status |
| `SmartViewsPanel.tsx` | Saved filter presets CRUD |
| `TopMerchantsTable.tsx` | Ranked top merchants by spend |

### 6.3 `auth/`

Each form is mounted 1:1 by an `/auth/*` route; `AuthLayout` is the shared shell, `AuthGate` guards access.

| Component | One-liner |
|---|---|
| `AuthGate.tsx` | Route guard for `guest-only`/`require-auth` pages |
| `AuthLayout.tsx` | Shared card/branding shell |
| `SignInForm.tsx` | Email/password sign-in, resend-verification |
| `SignUpForm.tsx` | Account creation + `ensureUserWorkspace` |
| `ForgotPasswordForm.tsx` | Requests reset email |
| `ResetPasswordForm.tsx` | New-password entry after reset link |
| `AuthConfirmForm.tsx` | Handles email OTP confirmation links |

### 6.4 `dashboard/`

**Top-level: `DashboardPage.tsx`** — mounted at `/`, `/share/[token]/dashboard`, impersonated dashboard route.

| Component | One-liner |
|---|---|
| `DashboardPage.tsx` | Orchestrates the home screen: header/greeting, date filter, KPI row, trend chart, category chart, recent transactions, quick actions, AI coach drawer, first-run setup modal |
| `DashboardKpiRow.tsx` | Customizable KPI card grid (Net Worth, Inflow, Outflow, Savings, Cash, Bank, Investments) with delta pills |
| `TrendChart.tsx` | Income vs. expense area/line chart ("Cash Flow Trend" card) |
| `DashboardRecentTransactions.tsx` | Latest ~10 transactions (outing rollups collapsed to one line) |
| `CategoryChart.tsx` | Compact animated top-categories bar-wave (sidebar panel) |
| `DashboardDateFilter.tsx` | Period selector (7d / this month / last month / specific month) |
| `QuickActionsMenu.tsx` | "Add expense / Add income / Start outing / Monthly plan" shortcuts |
| `InitialAccountSetupModal.tsx` | First-run onboarding: seed a cash/bank account + opening balance transaction |
| `KpiConfigModal.tsx` | Choose which/how many KPI cards appear |
| `AiCoachDrawer.tsx` | Slide-out AI chat seeded with plan + transactions, quick prompts |

### 6.5 `fintech/`

Small shared visual-primitive kit for the "premium" look — not generic enough for `ui/`.

| Component | One-liner |
|---|---|
| `PremiumTabs.tsx` | Custom tabs primitive — used by `TripDetailPage`'s tabs |
| `FilterChips.tsx` | Generic single-select pill/chip group |
| `StatCard.tsx` | Reusable metric card (title/value/icon/variant) |

### 6.6 `friends/`

**Top-level: `FriendsPage.tsx`** (`/friends`) + `FriendDetailPage.tsx` (`/friends/[id]`).

| Component | One-liner |
|---|---|
| `FriendsPage.tsx` | Friend roster CRUD; each row shows net balance across all outings via `computeNetBalancesByMember` |
| `FriendDetailPage.tsx` | Per-friend cross-outing balance summary + outing list; reuses `RecordSettlementDialog` from `outings/` |

### 6.7 `growth/`

**Top-level: `GrowthPage.tsx`** — income growth tracking, separate from expense Plan. *(See §2.1 note: no confirmed `/growth` route in the scanned inventory.)*

| Component | One-liner |
|---|---|
| `GrowthPage.tsx` | Composes income streams, targets, trend chart; derives income from `useTransactions` via `detectIncomeStreamsFromTransactions`, plus AI suggestions |
| `IncomeStreamTable.tsx` | CRUD table of manually tracked income streams |
| `IncomeTargetCard.tsx` | Set/track an income target over 3/6/12 months |
| `IncomeTrendChart.tsx` | Monthly income line chart with a target reference line |

### 6.8 `journal/`

**Top-level: `JournalPage.tsx`** — weekly financial reflection. *(See §2.1 note: no confirmed `/journal` route in the scanned inventory.)*

| Component | One-liner |
|---|---|
| `JournalPage.tsx` | Week selector + reflection form/history; drives `useReflections`/`useWeeklyReflection` + AI summary |
| `JournalHistory.tsx` | Past weekly reflections with mood emoji |
| `ReflectionForm.tsx` | Structured form (mood, wins, unnecessary spend, plan-adherence note) |
| `AIWeeklySummary.tsx` | Displays/regenerates an AI-written weekly summary |

### 6.9 `outings/` — expense-splitting / settlement flow

**Top-level: `OutingsPage.tsx`** (`/outings`) lists trips; each links to **`TripDetailPage.tsx`** (`/outings/[id]`), the real hub.

**Flow summary:** `TripDetailPage` owns the Activity/Members/Analysis tabs and all mutation handlers. Adding/editing/deleting an `OutingExpense` always calls its local `syncOutingRollup()` helper afterward, which recomputes one merged personal-ledger transaction per outing (via `computeOutingRollupAmount`/`buildOutingRollupDraft`/`findOutingRollupTransaction`) and creates/updates/deletes that single "rollup" transaction. **This is the mechanism behind a real bug that was recently fixed**: `useOutingTransactionSync` (the background auto-tag hook — see §5) was tagging ledger transactions with an `outingId` and creating `outing_expenses` rows, but never called the rollup-sync logic, so auto-linked spends (bank/SMS/mobile, or manually assigning an outing in the transaction form) simply disappeared from the Transactions/Dashboard views with no total standing in for them. The fix (see §7.5) taught `useOutingTransactionSync` to run the same rollup sync after tagging. Any *new* code path that mutates outing expenses/settlements must also call rollup-sync, or `TransactionsPage`/`DashboardPage` (which both filter out individual outing rows and show only the rollup line, via `isIndividualOutingLedgerTransaction`/`isOutingRollupTransaction` in `outings.ts`) will show a stale total for that trip.

| Component | One-liner |
|---|---|
| `OutingsPage.tsx` | List of all trips (Active/Completed/All tabs), enforces one active outing at a time, opens `CreateOutingModal` |
| `TripDetailPage.tsx` | Trip hub — header/metrics/budget progress + 3 tabs; owns `syncOutingRollup`, expense/settlement CRUD, bank-detected-transaction linking, CSV/PDF export |
| `AddOutingExpenseDialog.tsx` | Add/edit form for one `OutingExpense` (description, amount, category, paid-by member, split type) |
| `OutingExpenseList.tsx` | Row list of an outing's expenses; tapping opens `OutingExpenseDetailSheet` |
| `OutingExpenseDetailSheet.tsx` | Slide-over detail for one expense — `ExpenseSplitFlowDiagram`, edit/delete/unlink |
| `ExpenseSplitFlowDiagram.tsx` | Payer → members fan-out visualization (pure display) |
| `OutingMembersPanel.tsx` | Members tab — member chips + per-member paid/share/balance cards, tap-to-filter |
| `OutingAnalysisPanel.tsx` | Analysis tab — spending-vs-share summary, category pie chart, paid/share/remaining/return bar chart |
| `RecordSettlementDialog.tsx` | Shared "Return"/"Settle" flow (used from `TripDetailPage` and `FriendDetailPage`) — writes an `OutingSettlement` row **and** a personal Settlement transaction, then may open `OutingRollupPromptDialog` |
| `OutingRollupPromptDialog.tsx` | Post-settlement confirmation: "log your share as a personal transaction?" → feeds `AddTransactionSlideOver` |
| `SettlementHistoryPanel.tsx` | Chronological list of recorded settlements ("You paid/received X") |
| `CreateOutingModal.tsx` | Create/edit-outing form (name, category, dates, budget, auto-add mode, friend roster); membership locked once created |

### 6.10 `plan/` — budget/plan flow

**Top-level: `PlanPage.tsx`** — mounted at `/plan`, impersonated plan route.

| Component | One-liner |
|---|---|
| `PlanPage.tsx` | Month/purpose selector; "no plan yet" empty state → `PlanAllocationSheet`, else `FitsIncomeBanner` + `PlanOverviewPanel` + `SavedPlansList` |
| `PlanAllocationSheet.tsx` | Sheet for setting expected income + per-category planned amounts (with rollover toggle) |
| `PlanOverviewPanel.tsx` | Composes `PlanPieChart` + `UtilizationGauge` + planned-vs-actual-vs-variance table |
| `UtilizationGauge.tsx` | Circular % utilized gauge (green ≤100%, amber ≤115%, red beyond) |
| `PlanMonthSelector.tsx` | Prev/next month stepper |
| `PlanPieChart.tsx` | Pie of planned allocation by category, clickable slices |
| `SavedPlansList.tsx` | Previously saved plans (across months/purposes) with actuals |
| `FitsIncomeBanner.tsx` | "Plan fits income" (green) vs. "over by ₹X" (red) |
| `AddCategoryModal.tsx` | Add a new custom spending category to the plan |

### 6.11 `reports/`

Standalone PDF/report generation (no dedicated route).

| Component | One-liner |
|---|---|
| `PDFReportGenerator.tsx` | Configure a report (date range, type) and download PDF via `buildFinancialReport`/`downloadReportPdf` |
| `ReportPreview.tsx` | Read-only preview before download |

### 6.12 `settings/`

**Top-level: `SettingsPage.tsx`** — mounted at `/settings`, impersonated settings route.

| Component | One-liner |
|---|---|
| `SettingsPage.tsx` | Tabbed settings: profile, accounts, categories, purposes, appearance (theme), notifications, backup/restore, contributors, sharing, SMS rules link |
| `ContributorsTab.tsx` | CRUD for household "contributors" |
| `SharingTab.tsx` | Manage shareable read-only links per purpose (create/copy/revoke) |
| `SmsRulesAdminPanel.tsx` | Bank SMS parsing-template + block-rule editor, shared verbatim with `admin/AdminSmsRulesPage.tsx` |

### 6.13 `shared/` — cross-feature reusable components

| Component | One-liner |
|---|---|
| `AddTransactionSlideOver.tsx` | The single shared add/edit-transaction form (income or expense) — used by Dashboard, Transactions, Wealth, and the Outing rollup-prompt flow |
| `TransactionSummaryStrip.tsx` | Income/expense/net summary bar above the ledger table |
| `TransactionDetailPanel.tsx` | Read-only/actionable slide-over for one transaction (edit/delete/unlink-from-outing) |
| `AppShell.tsx` | Main authenticated app chrome — sidebar nav, header, admin-nav gating, outing auto-sync effect, Supabase-not-configured fallback |
| `ShareAppShell.tsx` | Parallel cut-down shell for `/share/[token]/*` |
| `EmptyState.tsx` | Generic icon + title + description + CTA block |
| `GlobalFilters.tsx` | Filter bar (date range, categories, source) bound to `useGlobalFilters` |
| `GlobalSearch.tsx` | ⌘K-styled search input |
| `NotificationBell.tsx` | Header dropdown of recent smart alerts |
| `PersonalizedSuggestion.tsx` | Tip/suggestion banner (success/warning/info tone) |
| `ProfileAvatar.tsx` | Header user menu — avatar, initials fallback, sign-out |
| `PurposeFilterChips.tsx` | Purpose selector chips (Dashboard, Plan, Analysis) |
| `QuickActionButton.tsx` | Tone-styled (expense/income/neutral) action button primitive |
| `CategoryFilterDropdown.tsx` | Multi-select category filter dropdown |
| `ExportButton.tsx` | One-click "export financial report as PDF" |
| `AnimatedCurrency.tsx` | Count-up animation wrapper around `formatCurrency` |
| `AlertItem.tsx` | Single alert row inside `NotificationBell` |
| `KpiCard.tsx` | Generic KPI card (title/value/delta/sparkline/icon) — Admin overview |
| `MiniSparkline.tsx` | Tiny inline SVG sparkline for `KpiCard` |
| `TransactionTable.tsx` | Older/alternate generic transaction table (separate from `TransactionsLedgerTable`) |
| `AuthQueryEffects.tsx` | Invisible effect toasting one-time auth-redirect query params (`?verified=1`) |
| `SupabaseSetupScreen.tsx` | Fallback screen when Supabase env isn't configured |
| `DarkAmbientRays.tsx` | Decorative dark-mode background gradient |
| `ThemeScript.tsx` | Inline pre-hydration theme applier |

### 6.14 `transactions/` — ledger flow

**Top-level: `TransactionsPage.tsx`** — mounted at `/transactions`, `/share/[token]/transactions`, impersonated transactions route.

| Component | One-liner |
|---|---|
| `TransactionsPage.tsx` | Composes `TransactionFilters` + `TransactionSummaryStrip` + `TransactionsLedgerTable` + `TransactionsPagination`, plus `AddTransactionSlideOver`/`TransactionDetailPanel` for CRUD. Filters out individual outing-expense rows (shows only the rollup line), implements 5-second undo-toast soft-delete, and handles unlink-from-outing. |
| `TransactionsLedgerTable.tsx` | The ledger table — date/merchant/category/purpose/amount columns; clicking an outing-rollup row routes to `/outings/[id]` instead of opening the edit sheet |
| `TransactionFilters.tsx` | Filter toolbar (search, date preset, category multi-select, account, contributor, type) |
| `TransactionsPagination.tsx` | Page-size (30/50/100/200) + page-number controls |

### 6.15 `wealth/`

**Top-level: `WealthPage.tsx`** — mounted at `/wealth`.

| Component | One-liner |
|---|---|
| `WealthPage.tsx` | Composes net-worth indicator, segment cards, snapshot/investment panels, quick transfer, filtered transaction list; driven by `computeNetWorthBreakdown`/`computeNetWorthByPurpose` |
| `WealthNetWorthIndicator.tsx` | Net-worth figure with combined vs. by-purpose toggle and MoM trend |
| `WealthSegmentCards.tsx` | Clickable Bank/Cash/etc. segment cards setting the active `WealthFilter` |
| `BalanceSnapshotPanel.tsx` | Historical balance snapshot log/calendar, opens `LogSnapshotModal` |
| `LogSnapshotModal.tsx` | Form to log a manual balance snapshot |
| `InvestmentHistoryPanel.tsx` | List of investment-flagged transactions over time |
| `TotalInvestmentCard.tsx` | Sum-of-investment-category-spend card, excluded from net worth |
| `NetWorthHistoryChart.tsx` | Net worth over time area chart |
| `QuickAccountTransfer.tsx` | Modal to record a transfer between two accounts |
| `WealthFilteredTransactions.tsx` | Transaction table scoped to the selected `WealthFilter`, with running balance-after column |

---

## 7. End-to-end app flows

### 7.1 Sign-up → first login

1. `SignUpForm` (`/auth/sign-up`) validates via `validateSignUpForm`, `POST /api/auth/sign-up`.
2. Route validates input, calls Supabase `auth.signUp`, detects the "already registered, zero identities" edge case.
3. On success, calls `bootstrapUserWorkspace` (service role) → `handle_new_user()` trigger has already created the base `users`/purposes/accounts/contributor rows on `auth.users` insert; `bootstrapUserWorkspace` layers on top: default budget template, balance/net-worth snapshots, device + login-history tracking. Idempotent + session-cached.
4. User is redirected into the app; `AppShell` picks up the new session and renders the sidebar/dashboard.

### 7.2 Sign-in and session gating

`SignInForm` → `signInWithEmail` → Supabase session cookie set. Every subsequent page load: `AppShell` shows a "Checking your session…" spinner (2s timeout), then either renders the app or redirects to `/auth/sign-in`. Server-side `(app)/layout.tsx` additionally redirects admin accounts straight to `/admin` before the client ever renders the user UI.

### 7.3 Adding a transaction

1. User opens `AddTransactionSlideOver` (from Dashboard, Transactions, Wealth, or the outing rollup-prompt).
2. Form (react-hook-form + zod) reads `useAccounts`/`useCategories`/`useContributors`/`useOutings`/`usePurposes`, may show a `PersonalizedSuggestion` tip.
3. Submit → `addTransaction` (in `supabase-data.ts`) resolves account/purpose/contributor references, then calls RPC `create_transaction_with_splits`, which atomically inserts one `transactions` row + N `transaction_splits` rows.
4. React-query cache invalidates → `useTransactions` (merged live-subscription + query) reflects the new row everywhere it's consumed (Dashboard KPIs, ledger, analytics).
5. If the transaction is tagged with an `outingId` (either picked directly in the form, or matched later by the auto-sync hook), the outing-rollup flow (§7.5) kicks in to keep the trip total in sync.

### 7.4 Monthly plan lifecycle

1. `PlanPage` loads the active plan for the selected month/purpose via `useMonthlyPlan` (→ `useMonthlyPlanQuery`), share-session-aware.
2. No plan yet → `PlanAllocationSheet` collects expected income + per-category planned amounts (optionally seeded via `suggestExpectedIncome`/`buildPlanSuggestions`/`applyActualsToBudget`).
3. Save → `saveMonthlyPlan`; the `monthly_plans_validate_allocations` DB trigger rejects the write if `sum(allocations.plannedAmount) > expected_income`.
4. `PlanOverviewPanel` renders live planned-vs-actual using `computeCategorySpentActuals`/`computeEffectiveBudget` (rollover-aware) against `monthly_plan_actuals` / live transaction data, plus `UtilizationGauge` and `FitsIncomeBanner`.

### 7.5 Outing expense → rollup total (the recently-fixed flow)

**Two entry points create an `outing_expenses` row:**

- **Manual, inside a trip:** `TripDetailPage.handleAddExpense` → `useOutingExpenses().addExpense` → immediately calls the local `syncOutingRollup()` helper.
- **Automatic, from the ledger:** `useOutingTransactionSync` (mounted app-wide via `AppShell`, debounced 1.2s) scans transactions for ones matching an active auto-add outing (or already tagged with `outingId` from a manual edit in `AddTransactionSlideOver`/`TransactionsPage`), builds an `outing_expenses` payload via `buildOutingExpenseFromTransaction`, saves it (racing other clients — the `20260728` unique index on `(user_id, linked_transaction_id)` prevents duplicates), and tags the ledger row with `outingId`.

**In both cases,** `computeOutingRollupAmount` (sum of `outing_expenses` for that outing + any directly-tagged ledger expenses not already linked) feeds `buildOutingRollupDraft`, and `findOutingRollupTransaction`/`isOutingRollupTransaction` locate any existing rollup row — the result is create/update/delete of a single ledger `Transaction` tagged `outing-rollup`, merchant = outing name, amount = trip total.

**Why this mattered:** `TransactionsPage` and `DashboardPage` both hide every individual outing-tagged ledger row (`isIndividualOutingLedgerTransaction`) and show *only* the rollup line. Before the fix, `useOutingTransactionSync` tagged transactions and created `outing_expenses` rows but never ran the rollup-sync step — so auto-linked or manually-outing-tagged spends vanished from the Transactions page with nothing standing in for their total (e.g. a "Goa" outing's ₹1,200 total simply not appearing). The fix taught `useOutingTransactionSync` to run the same `computeOutingRollupAmount`/`findOutingRollupTransaction`/`buildOutingRollupDraft` sequence after tagging, for every outing touched in that sync pass.

### 7.6 Outing settlement

`RecordSettlementDialog` (shared between `TripDetailPage` and `FriendDetailPage`) writes an `OutingSettlement` row **and** a personal "Settlement" transaction in the same action, then may open `OutingRollupPromptDialog` to offer logging the user's remaining share as a transaction (→ `AddTransactionSlideOver`). Balances driving this dialog come from `computeMemberBalances`/`simplifyDebts` in `outings.ts`.

### 7.7 Purpose sharing (no-login viewer link)

1. Owner opens `SharingTab` (Settings) → `getOrCreateShareLink(purposeId, ...)` creates a `share_links` row (token PK).
2. Owner shares the `/share/[token]` URL.
3. Visitor loads `/share/[token]/layout.tsx` → `claimShareLink(token)` → RPC `get_share_link` validates the token/expiry and returns `{ ownerId, purposeId, purposeName, viewerEmail }` — this is the entire access grant, no login required.
4. `ShareSessionProvider` + `ShareAppShell` wrap the reused `DashboardPage`/`TransactionsPage`/`AnalysisPage`, which read all data through the `security definer` RPCs (`get_shared_transactions`, `get_shared_purposes`, `get_shared_monthly_plan`) rather than normal RLS-gated queries.
5. Each page view fires `useShareViewLogger` → `logSharedPageView` RPC, bumping `share_links.total_views`/writing a `share_access_logs` row.
6. Separately, if the visitor later signs in with a matching email, `linkPurposeSharesForViewer` (called from `usePurposeShares`) claims any pending `purpose_shares` row for them, upgrading them to persistent RLS-level read access instead of relying on the token alone.

### 7.8 Admin impersonation

1. Admin opens `AdminUserDetailPage` → navigates into `/admin/users/[id]/impersonate/*`.
2. `ImpersonationShell` calls `adminStartImpersonation(targetUserId)` (RPC, logs `impersonate_start` to `admin_action_logs`, creates an `admin_impersonation_sessions` row), stores `sessionId`, and calls `setImpersonationSession(sessionId)` — every subsequent browser Supabase call carries an `x-impersonation-session` header.
3. `/api/proxy/[...path]` sees the header, validates the session server-side (`validateImpersonationSession`, 30-min inactivity limit), classifies the target table (blocked / global-read-only / scoped), rewrites owner-column filters/body fields to the target user's id, and executes with the service-role key — the one deliberate privilege-escalation point.
4. The exact same feature page components (`DashboardPage`, `TransactionsPage`, etc.) render, now scoped to the target user's data, with a persistent "Acting as {name}" banner.
5. Impersonated writes are captured with before-images and logged to `admin_action_logs` (attributed to both `admin_id` and `target_user_id`); ending the session (button click, route change, or tab-close via `sendBeacon` → `/api/impersonation/end`) logs `impersonate_end`.

### 7.9 AI features

- **AI Coach chat** (`AiCoachDrawer`, Dashboard): `POST /api/ai` builds a system prompt from the user's monthly income/budget/recent transactions, converts message history to Gemini's `contents` format, calls `gemini-2.5-flash:generateContent`, persists the exchange via `saveAiChatMessage`.
- **Financial health insight** (`useAiFinancialInsights`): reads a cached `ai_insights` row; if missing, >24h stale, or the rule-based health score has drifted >20 points, calls `POST /api/ai/financial-insights` → `generateFinancialInsights` (Gemini, blended with the rule-based base score from `financial-health.ts`) and persists via `saveAiInsight`.
- **Weekly reflection summary** (`AIWeeklySummary`, Journal): `POST /api/ai/weekly-summary` → `generateWeeklySummary`, rule-based fallback if no `GEMINI_API_KEY`.
- All three degrade gracefully to pure rule-based generation (`buildRuleBasedFinancialInsights`, `buildRuleBasedWeeklySummary`) when Gemini isn't configured or errors.

### 7.10 Backups

- **Manual:** Settings → "Backup now" → `runAccountBackup` → `gatherAllUserData` (reads every user-owned table) → `buildBackupZipBytes` (via `fflate`) → `uploadBackupToStorage` (Storage bucket `backups`, owner-scoped path) + a `backup_history` row.
- **Automatic:** `useAutoBackup` (mounted once app-wide) triggers a silent backup weekly (Sunday/overdue check) and additionally on a debounced basis whenever react-query reports a successful write to a financial-data query key, de-duped via a content hash so identical states don't re-upload.
- **Restore:** `restoreBackupData` upserts every table from a parsed backup zip (`parseBackupZipBytes`), validated first via `isValidBackupFile`.

### 7.11 Alerts

`useSmartAlerts` runs `generateSmartAlerts` (pure rule engine in `lib/alerts/generateAlerts.ts`) against live transactions/plan/reflections to produce burn-rate, plan-deviation, budget-threshold, daily-limit, reflection-reminder, and income alerts; `mergeAlerts` reconciles these against previously-stored read/createdAt state (`smart_alerts` table via `subscribeToAlerts`/`upsertAlerts`), so alerts don't reset to "unread" every recompute. Surfaced via `NotificationBell` (header dropdown) and the full `/alerts` page.

---

## 8. Known drift / legacy notes

| Item | Status | Note |
|---|---|---|
| `investments` table | Removed entirely, never in current schema | Investments are now just expense transactions whose category is flagged `is_investment = true` (see `investment_totals` view). |
| `transactions.is_investment` / `investment_type` / `investment_details` / `linked_investment_id` | Removed | Not present on the current `transactions` table. |
| `admin_action_logs.action = 'impersonate_view'` | Removed value | `20260721` dropped it (comment: "impersonation was deliberately not built") — but impersonation *was* built two migrations later (`20260723`), adding `impersonate_start`/`impersonate_end` instead. |
| `Category.isDefault` (TS type) | `@deprecated` in TS layer | "defaults now live in `globalSettings.defaultCategories`" |
| `MonthlyPlan.templateName` / `isTemplate` (TS type) | `@deprecated` | "Templates live in `planTemplates`" (the `budget_templates` table) |
| `Preferences` TS type | `@deprecated` | "Use `UserSettings` — kept for backward-compatible reads" |
| `Friendship` TS type | Not backed by any table | Aspirational/unused — "Future social graph" |
| `accounts.purpose_ids` (uuid[]) vs `account_purposes` junction table | Overlapping/duplicate modeling | Both a denormalized array column on `accounts` and a normalized many-to-many table exist simultaneously for the same relationship — unresolved duplication, not a clean migration. |
| `purpose_shares.role` check | Effectively fixed to `'viewer'` only | The `PurposeShareRole` TS type is likewise a single-value union — no owner/editor roles exist yet. |
| `outing_expenses.split_type` DB check vs TS `SplitType` | Drift | DB allows `equally/solo/custom/percentage/shares`; TS `SplitType` only defines `equally/solo/custom` — `percentage`/`shares` valid at the DB layer but unmodeled in the shared web TS type (possibly mobile-only or newer). |
| `user_merchants` table | No corresponding TS type | Table exists (`20260727`) but isn't represented in `src/types/index.ts` — likely typed locally or mobile-only. |
| `account_purposes`, `net_worth_history`, `user_devices`, `login_history`, `admin_action_logs`, `admin_impersonation_sessions`, `user_api_logs` | No corresponding TS types | Infra/admin/mobile-parity tables not modeled in the shared domain-type file. |
| `data-rebuild.ts` (`listAuditLogs`/`listShareAccessLogs`/`listBackupHistory`) | Stub/empty | Legacy shims kept for API compatibility after the Firestore→Supabase rebuild; only `deriveSplitsFromTransaction` and the global-settings re-exports are live. |
| `migrate-phase1.ts` | Emptied (`export {}`) | Former legacy migration helpers removed but the file kept because it can't be deleted in the current sandbox. |
| `/growth`, `/journal` routes | Unconfirmed | `GrowthPage`/`JournalPage` components exist under `src/components/growth/`/`journal/`, but no matching route file was found under `src/app` in this scan — verify actual mount path before linking to these features by URL. |

---

*Generated from a full-repository scan (routes, migrations, `src/lib`, `src/hooks`, `src/components`) as of migration `20260729`. For narrower, narratively-written docs see `docs/DATABASE_SCHEMA.md`, `docs/FEATURES.md`, and `docs/WORKFLOWS.md` in this same folder.*
