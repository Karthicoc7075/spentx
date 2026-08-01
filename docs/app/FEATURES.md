# SpentX Mobile — Full Features Reference

> Source-verified against the actual Dart code as of 2026-07-20, correcting/superseding `Mobile app/SpentX/hello.md` where it has drifted (the router shows `/budgets` now redirects to `/plan`, `/search` now redirects to `/activity`, and several screens hello.md flagged as pure mock are now wired to real data). Every correction below is called out explicitly. See [DATABASE.md](./DATABASE.md) for storage, [SYNC.md](./SYNC.md) for backend sync, [WORKFLOWS.md](./WORKFLOWS.md) for end-to-end flows.

**Version:** 1.0.0+1 · **Theme:** always dark (Settings "Dark Mode" row is now an honest static "Always on" label, not a fake toggle, per the debug-fix pass) · **Auth:** Supabase, required.

---

## Table of contents

1. [Auth & onboarding](#1-auth--onboarding)
2. [Home dashboard](#2-home-dashboard)
3. [Quick Add](#3-quick-add)
4. [Activity / Transactions](#4-activity--transactions)
5. [Transaction Detail](#5-transaction-detail)
6. [Accounts](#6-accounts)
7. [Plan (replaces Budgets)](#7-plan-replaces-budgets)
8. [Analytics](#8-analytics)
9. [Outings / trip splitting](#9-outings--trip-splitting)
10. [Friends](#10-friends)
11. [Investments](#11-investments)
12. [Wealth](#12-wealth)
13. [Notifications history](#13-notifications-history)
14. [Settings ("More")](#14-settings-more)
15. [Merchant Names](#15-merchant-names)
16. [App Guide](#16-app-guide)
17. [Account Configuration (Premium Settings)](#17-account-configuration-premium-settings)
18. [Developer Options](#18-developer-options)
19. [Recurring, Export, Calendar — now real, not mock](#19-recurring-export-calendar--now-real-not-mock)
20. [Loans & Cash Reminder — dead code](#20-loans--cash-reminder--dead-code)
21. [Complete route table (current)](#21-complete-route-table-current)
22. [Implementation maturity summary (revised)](#22-implementation-maturity-summary-revised)

---

## 1. Auth & onboarding

### Auth (required — supersedes flow-diagram-level `docs/AUTH_SETUP.md`)

Five distinct screens/routes, all under `lib/features/auth/presentation/`, using `AuthService` (Supabase):

| Route | Screen | Behavior |
|---|---|---|
| `/auth` | `AuthLandingScreen` | Entry point for signed-out users. Shows a config-missing warning banner if `AuthService.isConfigured` is false (both action buttons disabled in that case). "SIGN UP" → `/auth/signup`. "LOG IN" → `/auth/login`. |
| `/auth/signup` | `AuthSignUpScreen` | Fields: email, password, confirm password. Validation: email regex `^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$`; password length ≥ `SupabaseConfig.minPasswordLength`; password === confirm. Calls `AuthService.signUp()`. If `res.session == null` (email confirmation required), shows an inline message instead of proceeding. On success → `AuthFlow.continueAfterAuth(context)`. |
| `/auth/login` | `AuthLoginScreen` | Fields: email, password (non-empty check only). Calls `AuthService.signIn()` → `AuthFlow.continueAfterAuth(context)`. "Forgot password?" → `/auth/forgot-password`. |
| `/auth/forgot-password` | `AuthForgotPasswordScreen` | Single email field (basic `.contains('@')` check). Calls `AuthService.sendPasswordReset()`; success swaps to a "Check your email" view with "BACK TO LOG IN" (`context.go('/auth/login')`). Reset email deep-links back via `spentx://reset-password`. |
| `/auth/reset-password` | `AuthResetPasswordScreen` | Reached only via the deep link once Supabase's `passwordRecovery` auth event creates an active recovery session (guards with `AuthService.isSignedIn`, errors "Reset session expired" otherwise). Fields: new password + confirm (same validation as signup). Calls `AuthService.updatePassword()`, then `AuthService.signOut()` (ends the recovery session), shows a confirmation, `context.go('/auth/login')`. No back button (`automaticallyImplyLeading: false`) — it's a dead-end deep-link screen. |

**Router-level guard** (`app_router.dart`): every route except `/` and `/auth/*` redirects to `/auth` while signed out — covers deep links, not just cold start.

### Onboarding gate — server-decided, not purely local

Whether the onboarding flow runs is decided by `AuthService.accountHasExistingData()` — count queries on `transactions` (>0), `accounts` (>1), `purposes` (>1), i.e. "anything beyond the `handle_new_user` seed" — **never** by the local `has_seen_onboarding` flag alone:
- **Fresh login/signup:** always asks the server; a cached "false" is never trusted across devices.
- **Session restore (Splash):** a cached `true` (`settings.account_has_data`) short-circuits with no network call; an unresolved flag re-checks the server once.
- **Defensive layer:** `completeOnboarding` merges accounts/purposes by name (never duplicates "Personal"/"Cash"); all deterministic remote ids are `(user, name)`-scoped, so even a double-run upserts rather than duplicating seed rows server-side.

### Marketing carousel (`/onboarding`)

3-slide, collects nothing: Track Every Rupee / Smart Analytics / Private & Secure. Skip or "Get Started" both set `has_seen_onboarding=true`; Skip → `/home`, Get Started → `/pin-setup`.

### First-Time Account Setup Modal (non-dismissible dialog, not a route)

Shown from `HomeScreen.initState()` when `userStateProvider.isFirstTimeUser`. Four steps:
1. **Account Count** — slider 1-8. ("Skip for now" is now wired — completes onboarding with sane defaults: Cash account + Personal purpose.)
2. **Account Details** — one form per account: bank picker (12 banks + Other/Custom), last-4 digits (required), optional opening balance. On finish, auto-prepends a hidden Cash account (opening balance fixed at 0).
3. **Purpose Types** — Personal (locked on) + Family (toggle) + custom purposes via bottom sheet.
4. **Summary** → "ENTER APP" calls `userStateProvider.completeOnboarding()`.

### PIN Setup / Lock Screen

PIN Setup (`/pin-setup`): 4-digit, enter → 300ms pause → confirm → 300ms pause → `PinService.setPin()`. Fingerprint auto-enable is now gated on real device support (`enableFingerprintIfSupported`), not force-enabled.

Lock Screen (`/lock`): biometric mode (auto-triggers OS prompt ~450ms after open, "Use PIN instead" fallback) or PIN mode (shake animation on wrong PIN). **Never re-authenticates against Supabase** — the session refreshes silently in the background; this is purely a local gate.

---

## 2. Home dashboard

**File:** `lib/features/home/presentation/home_screen.dart` (~1050 lines). Renders two entirely different layouts depending on Outing Privacy Mode.

**Top bar:** gradient "S" logo + subtitle (`Privacy · {tripTitle}` when trip privacy is on, else "Good Evening, {profileName}" — hardcoded greeting, not actually time-of-day-aware). Notification bell → `/notifications`, red badge dot when unread.

**Pending SMS verification banner** (conditional): "{N} SMS pending verification — tap to review."

**Normal mode:**
1. Outing banner (create/join a trip nudge)
2. **Net Worth Hero Card** (tap → Accounts) — total balance, Indian-comma-formatted, masked under Private Mode; Monthly Flow row (Income / Spent — Spent excludes transfers and subtracts Repayment credits, adds manual trip-cash expenses)
3. Quick Actions — Outing → `/outings`, Wealth → `/wealth`, Transfer → `/accounts`, **Budgets → `/plan`** (label may still say "Budgets" in some UI copy but the destination is the Plan screen — see §7)
4. "Your Accounts" (single-purpose users) or "Spent by Purpose" (multi-purpose users)
5. Recent Activity — merges standalone transactions + trips with expenses, top 5

**Outing Privacy Mode:** privacy banner, Trip Spend Card (total + your share/pending return/returned), Trip activity section (recent trip-only expenses).

---

## 3. Quick Add

Center "+" FAB bottom sheet, any tab: **Add Expense** / **Add Income**.

- **Expense:** Amount (required), title, optional UPI/ref (feeds merchant learning), Source Account, Purpose, Category (default "Food"). Now shows a SnackBar on invalid amount/missing account instead of silently no-oping.
- **Income:** same + optional Note/Purpose field.

Both save + teach the merchant-recognition engine when a UPI/ref is entered.

---

## 4. Activity / Transactions

**Route:** Tab 1, also `/activity` (accepts an optional `?purpose=` query param to pre-filter — not in the old docs). Search icon (live filter over merchant/category/account, real — not the removed mock Search screen) + calendar icon (date-range filter). Purpose tabs (if >1 purpose), Total Expenses summary card, Category filter chips, date-grouped list. Trip expenses roll up into a single "outing summary" row.

"Load older transactions" footer (new, part of the sync layer — see SYNC.md §3) fetches the next ~30-day slice older than the oldest cached row; offline shows a clear message instead of silence.

---

## 5. Transaction Detail

**Routes:** `/transaction/:id`, `/outing-expense/:outingId/:expenseId`. Hero (category icon, signed amount, title, date/time); Details card (category, purpose, source bank, payment mode, status, source e.g. "Auto-detected via SMS", account/reference/UPI, note, trip activity); collapsible raw SMS/note; Trip Management section (link/unlink/change-outing/edit-split); Edit/Delete actions.

---

## 6. Accounts

**Accounts list** (`/accounts`, not on bottom nav): Total Balance hero (Add Funds / Transfer). Balance formula: `openingBalance + Σ(transactions for that account)`.

**Account Detail** (`/account-detail/:name`): Day/Week/Month/Custom range, Credit vs Debit summary, sub-filter, transaction list. Special rule: on the Cash account, an incoming transfer from a bank account displays as a credit even though the underlying record is flagged as an expense on the source side.

---

## 7. Plan (replaces Budgets)

> **Correction to `hello.md`:** `hello.md` documents a "Budgets Screen" at `/budgets` with simple per-category ₹ limits and no income concept. That screen has been **superseded** by a new `PlanScreen` at `/plan` — `/budgets` is now a pure redirect (router comment: *"Legacy deep link — Budgets is Plan on web/mobile"*). This is a real reimplementation matching the web app's "Monthly Plan" feature, not just a rename.

**File:** `lib/features/plan/presentation/plan_screen.dart`, provider `lib/core/providers/plan_provider.dart`. Storage: `monthly_plans` Hive box (see DATABASE.md §2.1), synced to Supabase `monthly_plans` table (see SYNC.md §1).

**What's new vs. the old Budgets screen:**
- **Expected income** field per plan, defaulting to the month's actual income (`incomeForMonth()`) when a draft is first created.
- **Purpose-scoped:** plans are keyed by `month + purposeName`; a chip row lets the user switch purpose when there's more than one purpose type.
- **Month navigation:** chevron buttons page between months (`shiftPlanMonth`/`currentPlanMonth`/`formatPlanMonth`), auto-creating a draft via `ensureDraft()` for each month visited.
- **One-time data migration:** on first load (and on `ensureDraft()` for a fresh month), the legacy `budgets` box (`category`/`limit` pairs) is read to seed allocations — pre-existing category limits are carried forward, not lost.

**Overview card** ("PLAN OVERVIEW"): Expected income, Total planned, Spent (sum of `spentForCategory` across allocations), Remaining (clamped ≥0), progress bar (turns red at ≥90% of planned), and a warning line "Planned exceeds expected income" when total planned > expected income.

**Category allocations list:** one card per `PlanAllocation` — category icon, "₹X spent" vs "₹Y planned", its own progress bar (red border/icon at ≥90%). Empty state: "Set up plan".

**Actions:** bell icon (AppBar) → `/notifications`; pencil icon and FAB ("Edit plan") both open an edit sheet setting plan title, expected income, and a per-category amount field for every expense category (pre-populated from the categories provider); a separate "Add" sheet lets you add/update one category not yet in the plan.

---

## 8. Analytics

**Route:** Tab 2. Trip privacy banner (replaces filters when active, title becomes "Trip analytics"). Purpose filter chips (hidden in privacy mode). Time Range tabs (Day/Week/Month default/Year). Hero Savings Card (`income − spent` for the window) with a health badge: >₹50,000 "💎 Wealth Builder Mode" (cyan) · >₹10,000 "✓ Healthy Balance" (green) · >₹0 "📈 On Track" (orange) · <₹0 "⚠️ Overspending" (red). Detailed Stats chips. Cash Flow bar chart (bucketed by hour/weekday/week/month per range). Top Categories (top 5, trip expenses roll up under synthetic "Trip" category). Top Spending Items (top 5 biggest single expenses or trips).

"Ensure range cached" logic (new, sync-related) fetches-then-computes rather than silently charting partial data when switching to Month/Year; offline shows a message.

---

## 9. Outings / trip splitting

Data model: `Outing { members, expenses (manual-cash OR linked-to-transaction), settlementPayments, isActive, autoAddMode, privacyMode }` — full field detail in [DATABASE.md](./DATABASE.md) §2.5.

- **Groups list** (`/outings`): active-trip banner (Day N/Total, spend, item count, Add Expense) — **only one active trip at a time**. Completed trips list. FAB: "New Trip" if none active, else an "outing already active" banner with "View Trip".
- **Create/Edit Outing sheet:** title, category (+custom), location, start/end dates, members (chip list, "You" locked, Add opens friend picker).
- **Trip Detail** (`/outing-detail/:id`, ~1400 lines): summary boxes (Total Trip, Your Share, Pending Return, Returned, You Owe, Your Outstanding for multi-member trips), Payment Summary card (cash-manual vs auto-detected), Split & Balances card (per-friend net), Category Breakdown donut, Trip Statement (full audit incl. linked bank/UPI transactions), Activity section ("YOU NEED TO SEND" callouts, expense list grouped by day with VERIFY/✓/SPLIT(N) badges, unlink action), Repayments history. Trip menu: Edit / End Trip & Settle / Delete Trip.
- **Add Outing Expense sheet:** amount, description, category, account (Cash-only from the trip's "+"), who-paid + split (Solo/Equally) for multi-member trips.
- **Auto-linking:** while a trip is active with auto-add on, expenses in the trip's date range auto-tag to it (`OutingTransactionSync`, see SYNC.md §7); incoming credits auto-match to friend repayments by UPI/name.
- **Sync note:** every outing edit re-pushes the **entire** outing document (title, members, all expenses) to Supabase — there's no incremental per-field sync, and the trip total is never stored, only ever computed from the expense list (both locally and remotely). See SYNC.md §1/§7 for the exact field mapping.

---

## 10. Friends

**Friends list** (`/friends`, ~2100 lines, largest screen): Added Friends + All Friends (derived from trip history) + Contacts (device address book, one-tap add), unified search. Add Friend sheet (name required, phone optional — **only name+phone ever syncs**, the contact list itself never leaves the device, see SYNC.md §1).

**Friend Detail:** summary header (You Paid / Their Share / You Get Back), "Mark all paid" bulk-settle, Linked UPI section (auto-clears pending balances from matching SMS credits/debits, "Sync past SMS repayments"), search/sort, expense list grouped by outing with status badges, Record Payment sheet (partial repayments, "Max" quick-fill).

---

## 11. Investments

**Route:** `/investments`, from Wealth. Manual portfolio tracking, no live market data. Total Wealth card (Invest/Withdraw). "SMS Detected Investment Transactions" card (keywords: `groww, zerodha, upstox, sip, mutual, stocks, nse, bse, fd, fixed deposit, ...`), up to 10 matches, Select/Allocate per row. Portfolio Breakdown (% share per type). Holdings list (edit tap, long-press quick-invest). Today's Flow.

Types: Liquid, Mutual Fund, Fixed Deposit, Stocks, Bonds, Crypto, Gold, Real Estate, Other.

---

## 12. Wealth

**Route:** `/wealth`, from Home.

> **Correction to `hello.md`:** it documents this screen as using hardcoded starting offsets (₹1,00,000 cash / ₹4,50,000 bank base) and in-memory-only goals that reset on navigation. **Both are now fixed.**

Cash/Bank/Credit balances are now computed for real via `_realBalances()`: iterates active accounts, calls `getFullAccountBalance(name)` per account, buckets by account type (`cash`, `credit`, else bank/wallet). Total net worth comes from the same shared `netWorthProvider` Home/Accounts use (explicit source comment: "so Home / Wealth / Accounts never drift"). Investment holdings come from `investmentProvider`. Purpose-split net worth via `netWorthByPurposeProvider`.

**Wealth Goals are now persisted** — `_loadGoals()`/`_saveGoals()` read/write `settings.wealth_goals` (see DATABASE.md §3), surviving app restarts. Not yet synced to Supabase though (no schema-map entry — local-only, see SYNC.md §1).

"SMS Wealth Events" card (keywords: `salary, bonus, dividend, interest, refund, sale, maturity`, Allocate assigns 10% to first savings goal). Expanded Wealth Features card still has two informational-only demo placeholders (Diversification Score, Financial Freedom Tracker).

---

## 13. Notifications history

**Route:** `/notifications`. In-app log (not the Android system tray) of `sms_auto`/`sms_pending`/`budget` events. "Mark read" clears all unread styling at once. Entries not individually tappable.

---

## 14. Settings ("More")

**Route:** Tab 4. Profile header (tap to rename). HELP: App Guide. CONFIGURATION: Account Configuration (→ Premium Settings, §17). FEATURES: Manage Outing, Outing Privacy Mode switch (off requires PIN/name verification), Manage Friends, Manage Merchants. DEVELOPER: SMS Rules Storage, Developer Options. PREFERENCES: Private Mode switch (blocked while Outing Privacy live, off requires verification), Notification History, Automatic SMS Detection switch, Dark Mode row (honest static "Always on" label). SECURITY: Set/Change PIN, Lock Screen switch, Fingerprint Authentication switch, Reset PIN (biometric verification required, not old PIN), **Sign Out** (ends Supabase session only — local Hive data stays; calls `SyncService.stop()`, see SYNC.md §9). DANGER ZONE: Reset App Data (confirmation → PIN/biometric → final confirm → wipes all Hive boxes + signs out of Supabase → force-quits so first-time setup + `/auth` run on next open).

---

## 15. Merchant Names

**Route:** `/merchant-names`. The UPI/payee → display-name/category mapping table powering auto-detection accuracy. Search, per-row Edit/Delete (delete warns future SMS from that identifier stops auto-recognizing). Add/Edit sheet: identifier, display name, category, purpose-type chips.

> **Historical bug, now fixed:** this screen previously only wrote the legacy `merchant_rules_box`, while the live v4 detection path matched against `merchants_box` — edits here never reached the actual matcher, and deletions here didn't stop the v4 store from still auto-applying. Fixed with a bidirectional mirror between the two stores (`MerchantNotifier.saveRule/updateRule/deleteRule` now write/delete both).

---

## 16. App Guide

**Route:** `/app-guide`. Fully static in-app manual — Getting Started, Bottom Nav, Auto Spending Tracking, Trips, Friends & Splits, Privacy, Security, Budgets & Investments (still labeled "Budgets" in this static copy even though the live feature is now Plan) — plus Tips & Tricks and a "Future — Must Add" section that's somewhat stale (lists some already-shipped features, like biometric unlock, as future work).

---

## 17. Account Configuration (Premium Settings)

**File:** `premium_settings_screen.dart`, pushed from Settings (not a `go_router` path) — the real account & purpose management screen. Bank Accounts section (8-account cap — now shows an explicit "Account limit reached — maximum 8 accounts…" message instead of silently closing the sheet). Cash and the first bank account can never be deleted; Cash can never be edited. Purpose Types: Personal permanent, Family toggle, custom purposes fully editable.

---

## 18. Developer Options

**Route:** `/developer-options`. Master Debug Logging + Debug Toast Messages + Log Retention dropdown → Master Debug Log. "Run System Health Check" (live diagnostic across Hive/SMS/notifications/merchant rules/pending queue/outings/balances). SMS Detection Tools (Detection Rules, Rules Storage, Detected SMS, Detection Lab, Real-Time SMS Test). Clear Transaction History (7 destructive one-tap actions with per-action confirmation). Quick SMS Test & Rule Creator — **"Create Test Rule from SMS" now actually creates a rule** (parses the pasted SMS via `SmsRuleEngine`, auto-tags segments, saves via `SmsTemplateEngine.saveRule`) — previously a stub that only showed a SnackBar. SMS Detection Debug Log panel. Disable App Rotation switch. **"Sync repair"** button (new — `SyncService.requeueAllLocalDataAndPush()`, see SYNC.md §2). Full App Prompt/Specification — the entire internal app-spec document, copyable, reachable from within the shipped app (note: that embedded spec still describes the app as fully offline/no-cloud-sync — itself stale, same drift category as the old `hello.md`/`db.md`/`SYNC_WIRING.md`).

---

## 19. Recurring, Export, Calendar — now real, not mock

> **Correction to `hello.md`:** it flags all three of these as "100% hardcoded" or "mostly mock." That's now out of date — all three read real transaction data:

- **Recurring** (`/recurring`): watches the live transaction provider to detect recurring patterns, reads accounts/purpose types/expense categories from their real providers, and can create real transactions from a detected recurrence. Manual recurring bills are also now persisted (`settings.recurring_bills`, see DATABASE.md §3) — not yet synced to Supabase.
- **Export** (`/export`): reads the live transaction provider and watches its length for a real live transaction count.
- **Calendar** (`/calendar`): watches the live transaction provider directly to populate the daily transaction grid.

(This audit did not re-verify every claimed UI action on these three screens in full depth — only that they now read real data rather than static arrays, correcting `hello.md`'s blanket "mock" characterization.)

---

## 20. Loans & Cash Reminder — dead code

Two feature directories exist in `lib/` (`features/loans/`, `features/cash_reminder/`) that were **not present at all** in `hello.md`'s route table or screen inventory — they are genuinely unreachable:

- **Loans** (`lib/features/loans/presentation/loans_screen.dart`) — not registered in `app_router.dart`; grep for `LoansScreen`/`'/loans'` across all of `lib/` returns zero references outside the file itself. Content is 100% hardcoded: summary row (literal `'2'` Active Loans, `'₹12,340/mo'` Total EMI, `'₹4,82,000'` Outstanding), three static loan cards (Home/Car/Education), FAB does nothing. No model, no Hive box, no provider.
- **Cash Reminder** (`lib/features/cash_reminder/presentation/cash_reminder_sheet.dart`) — no `showModalBottomSheet` call anywhere triggers it; no timer/scheduler wires it up. A bottom sheet with an amount field and a note field whose "Save"/"No Cash Spent" buttons both just call `Navigator.pop(context)` — **the entered amount is never persisted anywhere.**

Both should be treated as orphaned/vestigial code, not features in progress.

---

## 21. Complete route table (current)

Verified directly against `lib/core/router/app_router.dart`, including redirects the old docs didn't have:

| Route | Screen | Notes |
|---|---|---|
| `/` | Splash | Decides `/auth` vs onboarding vs lock vs home |
| `/auth`, `/auth/signup`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` | Auth screens | See §1 — granular routes, not one combined screen |
| `/onboarding` | Marketing carousel | |
| `/pin-setup` | PIN Setup | |
| `/lock` | Lock Screen | |
| `/home` | Main Wrapper (bottom nav shell) | |
| `/activity` | Activity/Transactions | Accepts `?purpose=` query param |
| `/accounts` | Accounts list | No bottom-nav tab |
| `/account-detail/:name` | Account Detail | |
| `/transaction/:id` | Transaction Detail | |
| `/outing-expense/:outingId/:expenseId` | Transaction Detail (trip variant) | |
| **`/plan`** | Plan | **New — replaces the old Budgets screen** |
| **`/budgets`** | *(redirect → `/plan`)* | **Legacy deep link**, no longer a real screen |
| `/wealth` | Wealth | |
| `/investments` | Investments | |
| `/outings` | Outings list | |
| `/outing-detail/:id` | Trip Detail | |
| `/friends` | Friends | |
| `/notifications` | Notification History | |
| `/merchant-names` | Merchant Mappings | |
| `/app-guide` | App Guide | |
| `/developer-options` | Developer Options | |
| `/sms-rules-storage` | SMS Rules Storage | |
| `/master-debug-log` | Master Debug Log | |
| `/sms-detection-lab` | SMS Detection Lab | |
| `/real-sms-test` | Real-Time SMS Test | |
| `/detected-sms` | Detected SMS | |
| `/sms-activity` | Smart SMS List | Legacy/demo, see WORKFLOWS.md SMS pipeline section |
| `/recurring` | Recurring | Now real, see §19 |
| `/calendar` | Calendar | Now real, see §19 |
| **`/search`** | *(redirect → `/activity`)* | **The old mock Search screen was removed entirely**, not just flagged as mock |
| `/export` | Export | Now real, see §19 |

No route exists for Loans or Cash Reminder (§20).

---

## 22. Implementation maturity summary (revised)

| Feature area | Status |
|---|---|
| SMS auto-detection + verification | ✅ Production-grade |
| Transactions & ledger | ✅ Fully functional |
| Accounts & balances | ✅ Fully functional |
| **Plan (budget planning)** | ✅ Fully functional — **upgraded from the old category-limit-only Budgets screen**, now with income tracking and purpose scoping |
| Outings / trip splitting | ✅ Fully functional |
| Friends & repayments | ✅ Fully functional, including UPI auto-matching |
| Analytics | ✅ Fully functional |
| Investments | ✅ Functional (manual holdings + SMS-assisted allocation) |
| Auth (Supabase, required) / PIN / biometrics | ✅ Fully functional |
| **Supabase sync (push+pull)** | ✅ Wired and detailed in SYNC.md — device-level end-to-end verification still pending per its own checklist |
| **Wealth** | ✅ **Upgraded from ⚠️ Partial** — real balances (shared with Home/Accounts), persisted goals |
| **Recurring** | ✅ **Upgraded from ❌ mock** — reads/creates real transactions |
| **Export** | ⚠️ **Upgraded from ❌ mock, but not fully re-verified** — reads real transaction data; actual CSV/JSON/PDF generation logic not deep-audited in this pass |
| **Calendar** | ✅ **Upgraded from ❌ mock** — reads real transaction data for the daily grid |
| Notifications history | ✅ Functional |
| Merchant learning | ✅ Functional (post split-brain fix) |
| Dark mode toggle | ❌ Non-functional by design, always dark (now honestly labeled) |
| **Loans** | ❌ **Dead code** — unreachable, no data layer |
| **Cash Reminder** | ❌ **Dead code** — unreachable, no persistence even if triggered |
| Account Config screen (old, `AccountConfigScreen`) | ❌ Deleted |
| Standalone Search screen | *(removed entirely — redirects to Activity, where real search lives)* |
