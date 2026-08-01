# SpentX Mobile — Full Flutter App Documentation

> **Source:** `Mobile app/SpentX/` inside this same repo — a real Flutter project (`pubspec.yaml`, `lib/`, `android/`, etc.), not a separate/external app. This document consolidates and reconciles that project's own docs (`hello.md`, `db.md`, `docs/AUTH_SETUP.md`, `docs/SYNC_WIRING.md`, `fullappworkflow.md`, `DEBUG_FIX_REPORT.md`) into one current reference, placed under the web repo's `docs/` tree for parity with `docs/FULL_APP_DOCUMENTATION.md`.
>
> **Important reconciliation note:** `hello.md` (the most detailed page-by-page doc, self-described as "generated from a full read of the source... every screen listed... not inferred") states the app has *"no cloud sync, no backend server"*. That was true when `hello.md` was written, but two docs added **after** it (`docs/AUTH_SETUP.md`, `docs/SYNC_WIRING.md`, both newer by file timestamp) describe Supabase Auth becoming **required** and a full local-first sync layer being wired to the **same Supabase backend the web app uses**. This document treats `hello.md` as authoritative for screens/UI/local-only mechanics, and `AUTH_SETUP.md`/`SYNC_WIRING.md` as authoritative for auth and backend sync — §3 and §8 below carry the corrected, current picture.
>
> **Version:** 1.0.0+1 · **Platform:** Flutter (Android primary; iOS/Windows/Linux scaffolding present but unused) · **Currency:** ₹ (INR) · **Theme:** always dark (the Settings "Dark Mode" row is now an honest static label, not a fake toggle)
>
> **This is the overview file.** Four deeper, source-verified reference files live alongside it and supersede parts of this one where noted: **[DATABASE.md](./DATABASE.md)** (exhaustive local Hive storage reference), **[SYNC.md](./SYNC.md)** (exhaustive Supabase sync architecture), **[FEATURES.md](./FEATURES.md)** (exhaustive, corrected screen-by-screen feature reference — includes fixes to several claims below, e.g. Budgets→Plan, Wealth/Recurring/Export/Calendar no longer being mock), and **[WORKFLOWS.md](./WORKFLOWS.md)** (end-to-end flows, including a much deeper SMS-detection algorithm breakdown than §6 below). Those four files were written from a direct second-pass read of the Dart source and are more current than this file in the specific areas they cover.

---

## Table of contents

1. [Tech stack & dependencies](#1-tech-stack--dependencies)
2. [App startup sequence](#2-app-startup-sequence)
3. [Auth flow (Supabase, required)](#3-auth-flow-supabase-required)
4. [Navigation shell & route table](#4-navigation-shell--route-table)
5. [Screens — page by page](#5-screens--page-by-page)
6. [SMS auto-detection pipeline](#6-sms-auto-detection-pipeline)
7. [Local database — Hive storage](#7-local-database--hive-storage)
8. [Supabase sync architecture](#8-supabase-sync-architecture)
9. [Privacy modes](#9-privacy-modes)
10. [Data models](#10-data-models)
11. [Riverpod providers reference](#11-riverpod-providers-reference)
12. [Mock / non-functional screens & known issues](#12-mock--non-functional-screens--known-issues)
13. [Implementation maturity summary](#13-implementation-maturity-summary)
14. [How this relates to the web app](#14-how-this-relates-to-the-web-app)

---

## 1. Tech stack & dependencies

From `Mobile app/SpentX/pubspec.yaml` (verified against the actual file, not inferred):

| Layer | Package | Notes |
|---|---|---|
| UI framework | Flutter, Dart SDK `^3.7.0` | |
| State management | `flutter_riverpod` | |
| Navigation | `go_router: ^17.0.0` | |
| Local storage | `hive: ^2.2.3`, `hive_flutter: ^1.1.0` | The only read layer the UI renders from |
| Secure storage | `flutter_secure_storage: ^10.0.0` | PIN hash/salt, Hive encryption key |
| Biometrics | `local_auth: ^2.3.0` | Requires `MainActivity` extend `FlutterFragmentActivity` on Android |
| SMS reading | `telephony: ^0.2.0` | Plus a native Android broadcast receiver |
| Background jobs | `workmanager: ^0.7.0` | 15-min periodic SMS/notification sweep |
| Notifications | `flutter_local_notifications: ^19.5.0` | Plus a native notification-listener (reads bank app alerts, no SMS permission needed) |
| Charts | `fl_chart: ^1.2.0` | |
| Contacts | `flutter_contacts: ^2.1.0` | Friend import |
| Permissions | `permission_handler: ^12.0.1` | |
| Connectivity | `connectivity_plus: ^7.1.1` | Gates sync/online-only features |
| Sharing/export | `share_plus: ^12.0.2`, `csv: ^6.0.0` | |
| Misc | `uuid`, `intl`, `path_provider`, `shimmer`, `shared_preferences`, `url_launcher` | |
| Fonts/icons | `google_fonts: ^6.3.2`, `lucide_icons: ^0.257.0` | |
| **Backend auth + sync** | **`supabase_flutter: ^2.8.0`** | Required sign-in; also handles the password-reset deep link via its bundled `app_links` integration |
| Dev | `flutter_lints`, `build_runner`, `hive_generator` | Two `@HiveType` models exist but their adapters are **not registered** in `main.dart` — runtime uses plain `Map`s for everything except the unused `vault` box |

Bundled assets (SMS parsing seed data, not Hive): `assets/sms/default_template_rules.json`, `assets/sms/bank_sms_templates_v4.json`, `assets/sms/bank_sms_templates_v4_report.json`.

---

## 2. App startup sequence

```
App Launch
  → WidgetsFlutterBinding.ensureInitialized()
  → Hive.initFlutter() → open all Hive boxes (§7)
  → Migrate legacy SMS Hive boxes → current schema
  → SmsRuleEngine.init() — load SMS parsing rules
  → SmsTemplateRulesImporter.seedBundledDefaultsIfEmpty()
      (loads default_template_rules.json + bank_sms_templates_v4.json)
  → BankSmsV4Parser.ensureLoaded()
  → migrateLegacyPendingTransactions()
  → Initialize defaults: auto_detection=true, profile_name='', debug settings
  → AutoDetectionNativeSync.syncToNative() — push SMS toggle to Android side
  → Apply portrait lock if disable_rotation setting is ON
  → SmsNotificationService.init() + SmsService.init() (native event channel)
  → BackgroundSmsScheduler.initialize() — WorkManager 15-min periodic task
  → runApp(ProviderScope → SpentXApp)
  → SpentXApp.initState(): register lifecycle observer, SMS listener,
    notification click handler
  → After 800ms: request SMS permissions, start SmsReceiverService,
    PendingVerificationBootstrap.processStartupAndShowIfNeeded()
  → Route to Splash Screen ("/")
```

**On app resume from background:**
1. PIN lock screen shown if PIN + lock enabled (4-second debounce prevents double-prompt loops) — **never** a Supabase re-login; the session refreshes silently.
2. Flush pending SMS queue and pending notification payloads.
3. Reload transactions from Hive.
4. Run pending-SMS-verification popups if any accumulated while backgrounded.

**Key file:** `lib/main.dart`

---

## 3. Auth flow (Supabase, required)

Superseding `hello.md`'s "no cloud sync" framing — per `docs/AUTH_SETUP.md`, **signup/login is mandatory**: the app cannot be used until the user has a Supabase account and is signed in. PIN remains a *second, local* lock layered behind the Supabase session, not a replacement for it.

### Current flow

```
Splash
  → no Supabase session → /auth  (Sign Up / Log In / Forgot password)
  → valid session       → has_seen_onboarding?
                            false → /onboarding → /pin-setup → /home
                            true  → /lock (if PIN) → /home
```

- **Router-level guard:** every route except `/` and `/auth/*` redirects to `/auth` while signed out — this covers deep links, not just cold start.
- Signup success → onboarding carousel (welcome moment) → PIN setup.
- Login success on a device that already onboarded → skips the carousel, straight to PIN/lock/home.
- Password reset: email link → `spentx://reset-password` deep link (Android intent filter already in the manifest) → in-app "Set new password" screen → back to `/auth/login`. Reuses the **same reset-email template as web** — nothing mobile-specific needed.
- Sign Out (Settings → Security): ends the Supabase session only; local Hive data stays on-device.
- Reset App Data: wipes everything **and** signs out → next open is `/auth` (fresh-install experience).
- **Different account signs in over existing local data:** an explicit dialog offers **Keep local data** (now belongs to the new account) or **Erase & start fresh** (local wipe, preserves the new session) — never a silent merge or silent wipe.

### One-time project setup (for anyone building this app)

1. `lib/core/config/supabase_config.dart` — set `url`/`anonKey` to the **same Supabase project the web app uses** (shared project, shared `handle_new_user` trigger). Until set, the app boots to `/auth` with a configuration notice and cannot proceed.
2. `flutter pub get`.
3. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs: add `spentx://reset-password`.
4. No mobile-specific email template needed — reuse the web reset-email template as-is.

### Onboarding gate is server-decided, not purely local

Fixed for a re-run/zero-show bug: whether onboarding runs is decided by `AuthService.accountHasExistingData()` — count queries on `transactions` (>0), `accounts` (>1), `purposes` (>1), i.e. "anything beyond the `handle_new_user` seed" — **never** by the local `has_seen_onboarding` flag alone:

- **Fresh login/signup:** always asks the server; a cached "false" is never trusted across devices. Existing account → local flag set, onboarding skipped, sync pull populates Hive.
- **Session restore (Splash):** a cached `true` (`settings.account_has_data`) short-circuits with no network call; an unresolved flag re-checks the server once.
- **Defensive layer:** `completeOnboarding` MERGES accounts/purposes by name (never duplicates "Personal"/"Cash"); all deterministic remote ids are `(user, name)`-scoped, so even a double-run upserts rather than duplicating seed rows server-side.

---

## 4. Navigation shell & route table

**File:** `lib/features/home/presentation/main_wrapper.dart`

`MainWrapper` hosts the 5 primary screens in an `IndexedStack` (state preserved across tab switches):

| Index | Screen | Tab visible? |
|---|---|---|
| 0 | `HomeScreen` | Yes — "Home" |
| 1 | `TransactionsScreen` | Yes — "Activity" |
| 2 | `AnalyticsScreen` | Yes — "Analytics" |
| 3 | `AccountsScreen` | **No tab** — reachable only via Home's Net Worth card or "Transfer" quick action |
| 4 | `SettingsScreen` | Yes — "More" |

Bottom nav: Home / Activity / Analytics / More, plus a center floating **"+"** button (not a tab — opens the Quick Add sheet, §5.2).

**On first frame:** `outingProvider.expireEndedOutings()` auto-closes any trip past its end date; a one-time (per install) notification-listener permission prompt if not yet granted; `PendingVerificationBootstrap` shows queued SMS verification popups. **On every resume:** reloads transactions from Hive, re-drains the pending SMS verification queue. A `settlementFeedbackProvider` listener pops a green snackbar app-wide whenever a friend's repayment auto-matches from an incoming SMS/credit.

### Complete route table

> **Corrected against the actual current router** (`lib/core/router/app_router.dart`) — see [FEATURES.md §21](./FEATURES.md#21-complete-route-table-current) for the fully verified version with more context. Key differences from what an earlier pass of this doc had: **`/budgets` is now a redirect to `/plan`** (a real Plan screen replaced the old Budgets screen), **`/search` is now a redirect to `/activity`** (the old mock Search screen was removed entirely, not just left as mock), and auth is five granular routes, not one combined screen.

| Route | Screen | Notes |
|---|---|---|
| `/` | Splash | App launch; decides `/auth` vs onboarding vs lock vs home |
| `/auth`, `/auth/signup`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` | Auth screens (5 distinct files) | Required — router-level guard redirects here for every other route while signed out. See FEATURES.md §1. |
| `/onboarding` | Marketing carousel | First launch only, post-auth |
| `/pin-setup` | PIN Setup | Onboarding / Settings / Reset PIN flow |
| `/lock` | Lock Screen | Cold start / resume, PIN-only (never re-auth) |
| `/home` | Main Wrapper (bottom nav shell) | Post-auth |
| `/activity` | Activity/Transactions | Tab 1; accepts `?purpose=` query param |
| `/accounts` | Accounts list | No nav tab — contextual only |
| `/account-detail/:name` | Account Detail | From Accounts |
| `/transaction/:id` | Transaction Detail | From anywhere |
| `/outing-expense/:outingId/:expenseId` | Transaction Detail (trip variant) | From trip activity |
| **`/plan`** | **Plan** | **Replaces the old Budgets screen — real income tracking + purpose-scoped allocations, see FEATURES.md §7** |
| **`/budgets`** | *(redirect → `/plan`)* | **Legacy deep link only**, no longer a real screen |
| `/wealth` | Wealth | Home quick action — now real balances/goals, see FEATURES.md §12 |
| `/investments` | Investments | From Wealth |
| `/outings` | Outings list | Home / Settings |
| `/outing-detail/:id` | Trip Detail | From Outings list |
| `/friends` | Friends | Settings |
| `/notifications` | Notification History | Bell icon / Settings / Plan |
| `/merchant-names` | Merchant Mappings | Settings |
| `/app-guide` | App Guide | Settings |
| `/developer-options` | Developer Options | Settings |
| `/sms-rules-storage` | SMS Rules Storage | Settings / Dev |
| `/master-debug-log` | Master Debug Log | Dev Options |
| `/sms-detection-lab` | SMS Detection Lab | Dev Options |
| `/real-sms-test` | Real-Time SMS Test | Dev Options |
| `/detected-sms` | Detected SMS | Dev Options |
| `/sms-activity` | Smart SMS List | Legacy/demo parser, not wired into the live detection pipeline (WORKFLOWS.md §4.9) |
| `/recurring` | Recurring | **Now reads real transaction data**, not mock — see FEATURES.md §19 |
| `/calendar` | Calendar | **Now reads real transaction data**, not mock — see FEATURES.md §19 |
| **`/search`** | *(redirect → `/activity`)* | **The old mock Search screen was removed**; real search lives in Activity |
| `/export` | Export | **Now reads real transaction data**, not mock — see FEATURES.md §19 |

No route exists for **Loans** or **Cash Reminder** — both are unreachable dead code with zero persistence; see FEATURES.md §20.

(Premium Settings / Account Configuration is pushed programmatically from Settings, not a `go_router` path.)

---

## 5. Screens — page by page

### 5.1 Auth & onboarding

Two unrelated "onboarding" concepts exist:
- `/onboarding` — a 3-slide **marketing carousel** (Track Every Rupee / Smart Analytics / Private & Secure), collects no data, skippable straight to Home. Skip or "Get Started" both set `has_seen_onboarding=true`; Skip goes to `/home`, Get Started goes to `/pin-setup`.
- **First-Time Account Setup Modal** — a non-dismissible 4-step dialog (`barrierDismissible: false`) shown from `HomeScreen.initState()` when `userStateProvider.isFirstTimeUser`. Cannot be closed except by completing it:
  1. **Account Count** — slider 1-8. ("Skip for now" label exists but is now wired per `DEBUG_FIX_REPORT.md` to complete onboarding with sane defaults — Cash account + Personal purpose.)
  2. **Account Details** — one form per account: bank picker (12 banks + Other/Custom), last-4 digits (required), optional opening balance. On finish, automatically prepends a hidden **Cash** account (opening balance fixed at 0) ahead of the bank accounts entered.
  3. **Purpose Types** — Personal (pre-selected, cannot be fully deselected) + Family (toggle) + custom purposes via a bottom sheet.
  4. **Summary** → "ENTER APP" calls `userStateProvider.completeOnboarding()`, persists everything, flips `isFirstTimeUser` off.

**PIN Setup** (`/pin-setup`): 4-digit PIN, enter → 300ms pause → confirm → 300ms pause → `PinService.setPin()` stores hash+salt in secure storage. Per the debug-fix pass, fingerprint auto-enable is now gated on actual device support (`enableFingerprintIfSupported`) rather than unconditionally forced.

**Lock Screen** (`/lock`): biometric mode (auto-triggers OS prompt ~450ms after open, "Use PIN instead" fallback) or PIN mode (4-digit, shake animation on wrong PIN, fingerprint icon to jump back to biometric). On unlock: sets `PinService.lastUnlockedAt`, drains the pending SMS verification queue.

### 5.2 Quick Add (+ FAB)

Bottom sheet from any tab: **Add Expense** / **Add Income** cards.

- **Add Expense:** Amount (required), title ("Where did you spend?"), optional UPI ID/reference (feeds merchant-learning for future auto-detection), Source Account (chip selector), Purpose (chip selector), Category (visual picker, defaults "Food"). Now shows a SnackBar on invalid amount/missing account instead of silently no-oping (fixed).
- **Add Income:** same layout + optional "Note/Purpose" field.

Both save + teach the merchant-recognition engine if a UPI/ref was entered.

### 5.3 Home Screen

**File:** `lib/features/home/presentation/home_screen.dart` (~1050 lines) — the most complex screen; renders two entirely different layouts depending on whether **Outing Privacy Mode** is active.

**Top app bar:** gradient "S" logo + app name + subtitle (`Privacy · {tripTitle}` when trip privacy is on, else "Good Evening, {profileName}" — hardcoded greeting text, not actually time-of-day-aware). Notification bell → `/notifications`, red badge dot when unread.

**Pending SMS verification banner** (conditional): "{N} SMS pending verification — tap to review" → opens the sequential verification popup flow.

**Normal mode cards:**
1. Outing banner (create/join a trip nudge)
2. **Net Worth Hero Card** (tap → Accounts) — total balance, Indian-comma-formatted, masked under Private Mode; a Monthly Flow row (Income / Spent, both purpose- and trip-cash-expense-aware, Repayment-credit-adjusted)
3. Quick Actions row — Outing → `/outings`, Wealth → `/wealth`, Transfer → `/accounts`, Budgets → `/budgets`
4. "Your Accounts" (single-purpose users) or "Spent by Purpose" (multi-purpose users) card
5. Recent Activity card — merges standalone transactions + trips with expenses, top 5, empty state "No recent activity"

**Outing Privacy Mode cards** (replace everything above): privacy banner, Trip Spend Card (total + your share/pending return/returned for multi-member trips), Trip activity section (recent trip-only expenses).

### 5.4 Activity / Transactions

**Route:** Tab 1, also `/activity`. Full chronological ledger. Search icon (live filter over merchant/category/account) + calendar icon (date-range filter). Purpose tabs (if >1 purpose), Total Expenses summary card, Category filter chips, date-grouped list ("Today"/"Yesterday"/date headers) — trip expenses roll up into a single "outing summary" row rather than showing every line item.

### 5.5 Transaction Detail

**Routes:** `/transaction/:id`, `/outing-expense/:outingId/:expenseId`. Hero (category icon, signed amount, title, date/time); Details card (category, purpose, source bank, payment mode, status, source e.g. "Auto-detected via SMS", account/reference/UPI, note, trip activity); collapsible raw SMS/note; Trip Management section (link/unlink/change-outing/edit-split depending on state); Edit/Delete actions.

### 5.6 Accounts

**Accounts list** (`/accounts`, not on bottom nav): Total Balance hero (Add Funds / Transfer buttons) + one card per account (Cash always first). Balance formula: `openingBalance + Σ(transactions for that account)`.

**Account Detail** (`/account-detail/:name`): Day/Week/Month/Custom time-range selector, Credit vs Debit summary, sub-filter, per-account transaction list. Special rule: on the Cash account, an incoming transfer *from* a bank account displays as a credit even though the underlying record is flagged as an expense on the source side.

### 5.7 Plan (formerly Budgets)

> **OUTDATED — `/budgets` is now a redirect, not a real screen.** This subsection described the app's *old* Budgets screen (simple per-category ₹ limits, no income concept). The router now redirects `/budgets` → `/plan`, and a real **Plan** screen has replaced it with income tracking and purpose-scoped allocations, migrating old budget limits forward automatically. **See [FEATURES.md §7](./FEATURES.md#7-plan-replaces-budgets) for the current, correct documentation** — kept here only as a historical note of what changed.

The background alert logic described below is unchanged by the migration: `lib/core/services/budget_alert_service.dart` still checks on every new expense whether its category has an active Plan allocation, and writes to notification history at 80%/100% thresholds, once per threshold per month.

### 5.8 Analytics

**Route:** Tab 2. Trip privacy banner (replaces filters when active). Purpose filter chips. Time range tabs (Day/Week/Month/Year). Hero Savings Card with a health badge (Wealth Builder Mode >₹50k, Healthy Balance >₹10k, On Track >₹0, Overspending <₹0). Detailed stats (income/spent/savings rate/avg-per-day, top 3 accounts). Cash Flow bar chart. Top Categories (top 5, trip expenses roll up under synthetic "Trip" category). Top Spending Items (top 5 biggest single expenses or trips).

### 5.9 Outings / Trips (group expense splitting)

Data model: `Outing { members, expenses (manual-cash OR linked-to-transaction), settlementPayments, isActive, autoAddMode, privacyMode }`.

- **Groups list** (`/outings`): active-trip banner (Day N/Total, spend, item count, Add Expense) — **only one active trip at a time**; completed trips list; empty state.
- **Create/Edit Outing sheet:** title, category (+custom), location, start/end dates, members (chip list, "You" cannot be removed, Add opens friend picker).
- **Trip Detail** (`/outing-detail/:id`, ~1400 lines, most complex secondary screen): summary boxes (Total Trip, Your Share, Pending Return, Returned, You Owe, Your Outstanding), Payment Summary card (cash-manual vs auto-detected), Split & Balances card (per-friend net), Category Breakdown donut chart, Trip Statement (full audit incl. linked bank/UPI transactions), Activity section ("YOU NEED TO SEND" callouts, expense list grouped by day with VERIFY/✓/SPLIT(N) badges, unlink action), Repayments history. Trip menu: Edit / End Trip & Settle / Delete Trip.
- **Add Outing Expense sheet:** amount, description, category, account (Cash-only from the trip's "+"), who-paid + split (Solo/Equally) for multi-member trips.
- **Auto-linking:** while a trip is active with auto-add on, expenses in the trip's date range auto-tag to it; incoming credits auto-match to friend repayments by UPI/name.

### 5.10 Friends

**Friends list** (`/friends`, ~2100 lines, largest screen): Added Friends + All Friends (derived from trip history) + Contacts (device address book, one-tap add), unified search. Add Friend sheet (name required, phone optional).

**Friend Detail:** summary header (You Paid / Their Share / You Get Back), "Mark all paid" bulk-settle, Linked UPI section (auto-clears pending balances from matching SMS credits/debits, "Sync past SMS repayments" button), search/sort, expense list grouped by outing with status badges (Settled/Partial/Pending), Record Payment sheet (partial repayments supported, "Max" quick-fill).

### 5.11 Investments

**Route:** `/investments`, from Wealth. Manual portfolio tracking, no live market data. Total Wealth card (Invest/Withdraw). "SMS Detected Investment Transactions" card — scans history for keywords (`groww, zerodha, upstox, sip, mutual, stocks, nse, bse, fd, ...`), up to 10 matches, Select/Allocate per row, quick-link chips to broker apps. Portfolio Breakdown (% share per type). Holdings list (edit tap, long-press quick-invest). Today's Flow (income vs expense).

Investment types: Liquid, Mutual Fund, Fixed Deposit, Stocks, Bonds, Crypto, Gold, Real Estate, Other.

### 5.12 Wealth

**Route:** `/wealth`, from Home. Net Worth Overview (Cash + Bank + Invested). "SMS Wealth Events" card (keywords `salary, bonus, dividend, interest, refund, sale, maturity`, Allocate button assigns 10% to first savings goal). Wealth Goals card (progress bars, +10k/+50k quick buttons). Expanded Wealth Features (Diversification Score, Financial Freedom Tracker — explicitly demo placeholders).

> **This caveat is now OUTDATED — corrected in [FEATURES.md §12](./FEATURES.md#12-wealth):** `hello.md` described Cash/Bank balances here as hardcoded starting offsets (₹1,00,000 cash / ₹4,50,000 bank base) and Wealth Goals as in-memory-only. Both have since been fixed in code: balances now come from the same `netWorthProvider` Home/Accounts use (so they can't drift), and goals are persisted to `settings.wealth_goals` in Hive, surviving app restarts.

### 5.13 Notifications History

**Route:** `/notifications`. In-app log (not the Android system tray) of `sms_auto` / `sms_pending` / `budget` events. "Mark read" clears all unread styling. Entries not individually tappable.

### 5.14 Settings ("More")

**Route:** Tab 4. Profile header (tap to rename). HELP: App Guide. CONFIGURATION: Account Configuration (→ Premium Settings, §5.15). FEATURES: Manage Outing, Outing Privacy Mode switch (turning off requires PIN/name verification), Manage Friends, Manage Merchants. DEVELOPER: SMS Rules Storage, Developer Options. PREFERENCES: Private Mode switch (blocked while Outing Privacy is live, turning off requires verification), Notification History, Automatic SMS Detection switch, Dark Mode switch (hardcoded always-on — now shown as an honest static "Always on" row per the debug-fix pass rather than a fake toggle). SECURITY: Set/Change PIN, Lock Screen switch, Fingerprint Authentication switch, Reset PIN (requires biometric verification, not old PIN), **Sign Out** (ends Supabase session only, local data stays). DANGER ZONE: Reset App Data (confirmation → PIN/biometric → final confirm → wipes all Hive data + signs out → force-quits so first-time setup runs next open).

### 5.15 Account Configuration (Premium Settings)

**File:** `premium_settings_screen.dart`, pushed from Settings (not a `go_router` path) — the real account & purpose management screen. Bank Accounts section (8-account cap, now shows an explicit "limit reached" message instead of silently closing the sheet — fixed); Cash and the first bank account can never be deleted, Cash can never be edited. Purpose Types: Personal permanent, Family toggle, custom purposes fully editable.

### 5.16 Merchant Names

**Route:** `/merchant-names`. The UPI/payee → display-name/category mapping table powering auto-detection accuracy. Search, empty states, per-row Edit/Delete (delete warns future SMS from that identifier stops auto-recognizing). Add/Edit sheet: identifier, display name, category, purpose-type chips.

> Per `DEBUG_FIX_REPORT.md`, this screen previously only wrote the legacy `merchant_rules_box` while the v4 detection path matched against `merchants_box` — a real split-brain bug where edits here didn't reach the actual matcher. Fixed with a bidirectional mirror between the two stores.

### 5.17 App Guide

**Route:** `/app-guide`. Fully static in-app manual (Getting Started, Bottom Nav, Auto Spending Tracking, Trips, Friends & Splits, Privacy, Security, Budgets & Investments) + Tips & Tricks + a "Future — Must Add" section (somewhat stale — lists some already-shipped features as future).

### 5.18 Developer Options

**Route:** `/developer-options`. Master Debug Logging + Debug Toast Messages + Log Retention dropdown → Master Debug Log. "Run System Health Check" (live diagnostic across Hive/SMS/notifications/merchant rules/pending queue/outings/balances). SMS Detection Tools (Detection Rules, Rules Storage, Detected SMS, Detection Lab, Real-Time SMS Test). Clear Transaction History (7 destructive one-tap actions with per-action confirmation). Quick SMS Test & Rule Creator ("Create Test Rule from SMS" now actually creates a rule via `SmsRuleEngine` + `TemplateBuilder`, per the debug-fix pass — previously a stub). SMS Detection Debug Log panel (live, last ~40 events). Disable App Rotation switch. Full App Prompt/Specification — the entire internal app-spec document, rendered as copyable text, reachable from within the shipped app.

---

## 6. SMS auto-detection pipeline

> **See [WORKFLOWS.md §4](./WORKFLOWS.md#4-smsnotification-auto-detection-pipeline-deep-algorithmic-reference) for the full algorithmic reference** — exact rule-priority order with file:line references, the fuzzy-matching similarity formula and acceptance thresholds, positional-anchoring extraction, the native↔Dart MethodChannel/EventChannel bridge, and the exact auto-add-vs-pending decision logic. This section stays as the high-level conceptual overview.

The core engine that makes SpentX "automatic" — reads bank/UPI SMS and notification alerts, parses them, and either auto-adds or queues for confirmation.

```
INBOUND SOURCES: Native SMS Broadcast · Telephony Receiver ·
                  Notification Listener · WorkManager Flush
                              │
     SmsDetectionPipeline.processInbound() / processNotificationPayload()
                              │
        auto_detection enabled in Settings? ──No──→ dropped
                              │ Yes
              Dedupe check (recent hashes, referenceId)
                              │
        SmsRuleEngine.parse() + block rules + BankSmsV4Parser
                              │
              AutoRuleEngine (foreground or background)
                    ┌─────────┴─────────┐
                    ▼                   ▼
          KNOWN MERCHANT          UNKNOWN MERCHANT
        (rule match or ATM        (no rule match)
             pattern)
                    │                   │
                    ▼                   ▼
        Auto-add to ledger    Store in detected_sms_box
        + notification log    + queue for verification
        (type: sms_auto)      + system notification
                               (type: sms_pending)
                                        │
                                        ▼
                         PendingVerificationPresenter
                         → sequential Detection Popup
                           (Confirm / Edit / Ignore)
```

**Detection sources:** native SMS broadcast · `telephony` inbox read · notification listener (bank app push notifications, **no SMS permission needed** for this path) · pending-queue flush on resume · SMS Detection Lab (manual paste-and-test, dev tool).

**Auto-add vs. pending verification:** auto-added with no user action when the UPI ID/merchant matches a saved merchant rule, matches a learned ATM-withdrawal pattern, or is a duplicate (same reference ID or same amount+date). Everything else queues as "pending," surfacing via the Home banner + Detection Popup, where amount/merchant/category/purpose/account can be edited, optionally linked to an active trip or friend repayment, and optionally saved as a new merchant rule.

**Background processing:** WorkManager sweeps every **15 minutes** to catch SMS/notifications that arrived while the app was fully closed. Per `DEBUG_FIX_REPORT.md`, this sweep was previously a **silent no-op** — the MethodChannel it used is registered only in `MainActivity` and throws `MissingPluginException` inside the WorkManager headless isolate, swallowed by an empty catch block. Fixed by having native Kotlin queue storage go through `SharedPreferences` (`flutter.native_sms_queue`/`flutter.native_tx_queue`) so the background isolate can drain it directly via the `shared_preferences` plugin instead of the MethodChannel.

**Other fixed correctness bugs relevant to this pipeline** (per `DEBUG_FIX_REPORT.md`, worth knowing since they affect what "auto-detected" data actually looks like historically): auto-added transactions previously wrote the merchant rule's *purpose type* into the transaction's `account` field and left `purpose` null, so SMS-auto-added spends never hit any real account balance or net worth — fixed via `AutoRuleEngine.resolveAccountName` (last-4 match → bank-name match → first bank account), applied across all four auto-add code paths.

---

## 7. Local database — Hive storage

> **See [DATABASE.md](./DATABASE.md) for the exhaustive, source-verified version** — it adds two boxes missing below (`monthly_plans` for the Plan feature, `sync_queue` for the sync layer), three `Transaction` fields (`transferTo`, `remoteId`, `contributorSource`), an `isActive` field on `AccountModel`, several newer `settings`-box keys (Wealth goals, Recurring bills, Contributors, etc.), and confirms the encrypted `vault` box is genuinely dead code.

Everything lives on-device in Hive boxes (`hive_flutter`) — this is the app's **only read layer**; the UI never reads Supabase directly (see §8). Two typed `@HiveType` models exist in the codebase but their adapters are **not registered** in `main.dart`, so runtime uses plain `Map`s everywhere except the unused encrypted `vault` box.

### Box index (24 active + 3 legacy, migrated on startup)

| Box | Purpose |
|---|---|
| `settings` | App prefs, PIN, onboarding, profile, debug flags |
| `transactions` | Financial transaction ledger (`list` key, newest first) |
| `outings` | Trips/group expenses (keyed by outingId, legacy `list` array merged on load) |
| `friends` | Manual friends, recent picks, UPI links |
| `categories` | Custom expense/income category lists |
| `budgets` | Monthly category budgets |
| `investments` | Investment holdings |
| `merchant_rules_box` | Legacy merchant auto-map rules (UPI/phone/account id) |
| `merchants_box` | V4 payee-based verified merchants (the one the live auto-detect matcher actually uses) |
| `merchant_aliases` | Raw name → display alias map |
| `pending_detections` | Queue of pending SMS verification IDs |
| `detected_sms_box` | Full pending SMS detection records |
| `ignored_detections` | Ignored/deleted detection history |
| `pending_verification_history` | Pending/verified/ignored audit log |
| `notification_history` | In-app notification feed (max 200 entries) |
| `sms_template_rules_box` | User-trained SMS template rules |
| `block_rules_box` | SMS block/ignore rules |
| `detection_rules_box` | Regex/keyword SMS detection rules |
| `ignored_sms_box` | Auto-ignored SMS log (OTP, ads, blocked) |
| `processed_sms_box` | Dedupe by referenceId + parse audit log |
| `master_debug_log_box` | Developer debug log (lazy-open) |
| `vault` (**encrypted**) | AES-encrypted, reserved for future use — currently unused by providers |
| `sms_block_rules_box`, `sms_rules_box`, `sms_template_box` | **Legacy** — migrated to `block_rules_box`/`detection_rules_box`/`sms_template_rules_box` on startup |

Also: `hive_encryption_key` in `FlutterSecureStorage` (AES key for `vault`), plus SharedPreferences mirrors for native-side lookups (`auto_detection`, `known_merchants_json`, `has_prompted_notification_permission`, `background_detection_enabled`) and now `flutter.native_sms_queue`/`flutter.native_tx_queue` for the background-isolate queue drain (see §6).

### Key models

**`Transaction`** (`lib/models/transaction.dart`) — the primary ledger model: `id`, `merchant`, `category`, `account`, `amount`, `isExpense`, `isAutoDetected`, `isGroup`/`groupCount`, `paymentType`, `date`, `isTransfer` (+ `transferTo` field added by the debug-fix pass to correctly scope which leg credits Cash), `outingId`, `isAutoLinked`, `rawIdentifier`, `purpose`, `bankName`, `accountLast4`, `referenceId`, `upiId`, `rawMessage`, `note`, `isPendingVerification`, `isMerchantMapped`.

**`Outing`** — `id`, `title`, `category`, `location`, `startDate`/`endDate`, `members: List<OutingMember>` (`id`, `name`), `expenses: List<OutingExpense>` (`amount`, `category`, `date`, `paymentMode`, `memberIds`, `splitType` 0=solo/1=equally, `transactionId`, `purpose`, `paidByMemberId`, `settlementPayments: Map<memberId, List<SettlementPayment>>`), `isActive`, `isAutoMode`.

**`AccountModel`** — `id`, `name`, `type` (Bank/Cash), `last4Digits`, `openingBalance`.

**`MerchantRule`** (legacy store) / **`Merchant`** (v4 store, the one actually consulted by the live matcher) — identifier/payee, normalized key, display name/title, purpose, category, transaction type, verified/last-used timestamp, `isAutoApply`.

**`PendingTransaction`** — the intermediate record for a detected-but-unverified SMS transaction: amount, receiver, bank, date, rawMessage, isExpense/isTransfer, accountLast4, referenceId (dedupe key), upiId, outingId, isAutoLinked, notification/popup flags, `deferAutoAdd`.

**SMS rule models:** `SmsTemplateRule` (structural template, extraction map, similarity threshold), `BlockRule` (keywords/pattern to ignore OTP/promo SMS), `SmsRule`/detection rule (regex/keyword-based, matches the web `sms_detection_rules` shape closely — see §14).

### Reset behavior

`AppResetService.resetAll()` clears every box above + SharedPreferences + PIN, re-seeds `settings` (`has_seen_onboarding=false`, `isFirstTimeUser=true`, `auto_detection=true`, `lock_screen_enabled=true`), and (per the current auth-required flow) also signs out of Supabase.

---

## 8. Supabase sync architecture

> **See [SYNC.md](./SYNC.md) for the exhaustive, source-verified version, including exact field mappings and corrections to `docs/SYNC_WIRING.md` itself** — the in-app periodic sync timer is actually **30 minutes**, not 15 (15 minutes only applies to the *separate* WorkManager background task), the resume throttle is a 5-minute pull-skip plus a 45-second global throttle rather than "2 minutes," and the sync layer also covers `categories`, `contributors`, and `monthly_plans` (the Plan feature), none of which are mentioned below.

Superseding `hello.md`'s "no cloud sync, no backend server" claim — per `docs/SYNC_WIRING.md`, the app now wires Home, Transactions, Analysis, Outings, Friends, and Settings to the **same Supabase project the web app uses**. This is explicitly **local-first**: Hive remains the only layer the UI renders from; Supabase is the durable store every local write eventually reaches, not a live source of truth the UI queries directly.

### Architecture

```
UI  ──reads──►  Hive (always, offline-capable)
User write ──► Hive first ──► SyncQueue (Hive box 'sync_queue')
                                   │  pushPending() — drains when online
                                   ▼
                               Supabase  ──pullAll()──►  merged into Hive
```

- **`lib/core/sync/supabase_schema_map.dart`** — built directly against the real web schema (the web repo's `docs/DATABASE_SCHEMA.md` + `supabase/migrations/init.sql`), not guesses. Key facts honored: `transactions` use `total_amount`/`type`/`payment_method`/`account_id` (uuid FK) with purpose+category living on `transaction_splits` (name-keyed categories, matching the web quirk documented in `docs/DATABASE_SCHEMA.md` §5.2); `accounts` use lowercase `type`/`last4` with soft-delete; `purposes` are uuid rows resolved by name via a `RemoteIdCache`; `outings` use `status`/`auto_add_mode` with jsonb member objects; expense `split_type` is text with a `splits` jsonb; settlements are outing-level from/to member rows (mobile's per-expense payments carry `note: "exp:<id>"` to round-trip; web-created settlements apply FIFO on pull); `users` share `private_mode` + `default_account_id`. SMS metadata (bank/last4/upi/transfer flags) rides in `transactions.tags`; **raw SMS text is intentionally never uploaded**. Account/friend deletes are **soft deletes** (`is_active=false`), matching web semantics and the FK shape.
- **`sync_queue.dart`** — a persisted queue; upserts coalesce per record, deletes supersede queued upserts, failed pushes stay queued for retry.
- **`sync_service.dart`** — push + pull orchestration:
  - Transactions pull: a rolling window of `transaction_date >= now - 35 days` (30 + buffer). Nothing already cached is pruned — the window governs what's actively *pulled*, not what may exist locally.
  - Accounts / outings (+expenses +settlements) / friends / users shared fields: full pull, no windowing (small datasets).
  - Pull merge **never** overwrites a record that has queued local edits.
  - `fetchTransactionRange(from, to)` — on-demand older-history fetch that progressively extends the offline cache (drives the Activity screen's "Load older transactions" footer).
  - Sync triggers: after login, on app start (if already signed in), on every resume (self-throttled to 2 minutes), a periodic 15-minute timer, and a fire-and-forget push after every enqueue.
- **`sms_rules_refresh_service.dart`** — **pull-only** admin data path. `sms_template_rules`/`sms_detection_rules`/`sms_block_rules` are fetched from Supabase (**never written** by mobile — these three tables remain admin-managed via the web admin portal, see `docs/DATABASE_SCHEMA.md` §11) and overwrite the local rule boxes only after a successful non-empty fetch, then `SmsRuleEngine.init()` + `BankSmsV4Parser.ensureLoaded()` re-run so an admin's rule edit applies mid-session with **no app restart**. Auto-refreshes daily + a manual "Refresh Detection Rules" button in Developer Options. Merchant rules (`user_merchants` on the web side) remain user-owned and are untouched by this refresh.

### What actually syncs (write-path hooks: Hive-write-then-enqueue)

| Domain | What enqueues |
|---|---|
| Transactions | add / update / delete / outing-link / bulk clear (provider) + the background SMS auto-add path (`AutoRuleEngine`) |
| Outings | every mutation funnels through `_putAndSync` (create, edit, end, expire, expenses, settlements); delete removes children remotely too; upserts prune remote children removed locally |
| Friends | `addFriend` enqueues **name+phone only** — device contacts never leave the device beyond the explicitly-saved fields |
| Accounts | add / update / delete / onboarding completion |
| Users (shared subset) | `private_mode` (via `PrivateModeService`) and `default_account` (pull-applied to settings) |

**Explicitly local-only, never synced (no schema-map entry, cannot enter the queue):** PIN, biometrics, SMS-detection toggle, debug flags.

### Screen behavior under this architecture

- **Home / Detail / Analysis:** render from Hive exactly as before — no spinners; sync keeps the boxes current underneath.
- **Activity:** "Load older transactions" footer fetches the next ~30-day slice older than the oldest cached row (offline → shows a clear message instead of silence). Search results carry a note that search covers only the cached window.
- **Analysis:** switching to Month/Year triggers `_ensureRangeCached` — fetch-then-compute rather than silently charting partial data; offline shows a message.
- **Friends:** contact rows open a pre-filled confirm form (no silent import); phone-number dedup runs before the form and again at save; only the explicitly-saved name+phone syncs.

### Why this matters for the web/mobile relationship

This confirms the "mobile app" referenced throughout the web repo's docs (`docs/DATABASE_SCHEMA.md`, `docs/FULL_APP_DOCUMENTATION.md` — "mobile parity" migrations, `entry_source = 'mobile'`/`'mobile-manual'`, `source = 'mobile'`, the SMS rule tables, `user_merchants`) is this exact Flutter app, reading and writing the same Postgres tables under the same RLS (`user_id = auth.uid()`), sharing the same `handle_new_user()` bootstrap trigger, and consuming (read-only) the same admin-managed SMS rule tables. See §14 for the concrete cross-references.

---

## 9. Privacy modes

Two independent layers:

- **Private Mode** (Settings toggle): masks all monetary amounts on Home and Accounts with `*****`. Individual purpose types (e.g. "Family") can be selectively masked. Automatically disabled while Outing Privacy is active — the two are mutually exclusive at the UI level.
- **Outing Privacy Mode** (only togglable while a trip is active): Home replaces its entire dashboard with a trip-only view (no net worth, no other balances/transactions), Activity filters to trip-only transactions, Analytics scopes to the trip only. Turning it **off** requires PIN or profile-name confirmation — designed so a shared/borrowed phone, or a trip companion using your phone, can't casually reveal your real balances with one switch tap.

---

## 10. Data models

See §7 for the full field-level breakdown of `Transaction`, `Outing`/`OutingMember`/`OutingExpense`/`SettlementPayment`, `AccountModel`, `MerchantRule`/`Merchant`, and `PendingTransaction`. Additional supporting models:

- **`BudgetItem`** — `id`, `category`, `limit`, `notifyAt80`, `notifyAt100` (both default true).
- **`InvestmentHolding`** — `id`, `name`, `type` (liquid/mutualFund/fixedDeposit/stocks/bonds/crypto/gold/realEstate/other), `amount`, `growthPercent`, `updatedAt`.
- **`SmsTemplateRule`** — `bankName`, `type` (debit/credit/transfer), `mode` (upi/atm/card/unknown), `sampleMessage`, `templatePattern`, `extractionMap`, `keywords`, `similarityThreshold` (default 0.65). Field types: `amount`, `debitType`, `creditType`, `transferType`, `bankName`, `accountNumber`, `accountLast4`, `balance`, `upiId`, `referenceId`, `merchantName`, `title`, `date`, `time`, `atmWithdraw`, `cardPayment`, `ignoreText`.
- **`BlockRule`** — `keywords`, `pattern`, `sampleMessage`, `similarityThreshold` (default 0.6).
- **`SmsRule`** (detection) — `matchPattern`, `containsKeywords`/`excludeKeywords`, `amountPattern`, `namePattern`, `datePattern`, `refPattern`, `accountPattern`, `upiPattern`, `type`, `mode`, `bankName`, `sampleMessage`, `isManual`.

---

## 11. Riverpod providers reference

| Provider | Responsibility |
|---|---|
| `transactionProvider` | Ledger CRUD, net worth calc, outing sync, budget alerts, friend settlement |
| `userStateProvider` | Profile, accounts, purposes, first-time flag |
| `outingProvider` / `activeOutingProvider` | Trips, expenses, settlements, auto-expire |
| `budgetProvider` / `budgetSpendInfosProvider` | Budgets + spend-vs-limit calc |
| `merchantProvider` | Merchant rule CRUD (mirrors both legacy + v4 stores, see §5.16) |
| `investmentProvider` | Investment holdings |
| `friendsProvider` / `manualFriendsProvider` / `friendUpiProvider` | Friend directory + UPI mappings |
| `categoryProvider` | Custom categories |
| `privateModeProvider` / `outingPrivacyModeProvider` / `effectivePrivateModeProvider` | Privacy state |
| `detectionQueueProvider` | Pending SMS ID queue |
| `settlementFeedbackProvider` | Friend-settlement snackbar trigger |
| `contactsProvider` | Device contacts for friend import |
| `netWorthProvider` | Derived total balance |
| `hasUnreadNotificationsProvider` | Bell badge state |
| `isOutingPrivacyActiveProvider` | Whether trip privacy is currently live |

---

## 12. Mock / non-functional screens & known issues

> **This section is now OUTDATED for Recurring/Calendar/Export/Search/Wealth — corrected in [FEATURES.md §19-20](./FEATURES.md#19-recurring-export-calendar--now-real-not-mock).** A second, source-verified pass found that Recurring, Calendar, and Export now all read from the live transaction provider (not hardcoded arrays), the standalone Search route was **removed entirely** (now a redirect to `/activity`, not a mock screen), and Wealth's balances/goals are no longer hardcoded/in-memory. That same pass also found **two genuinely dead, never-documented features — Loans and Cash Reminder** — with zero persistence even when triggered; see FEATURES.md §20. The corrected/current picture:

| Route/feature | Current state |
|---|---|
| `/recurring` | Reads real transaction data to detect patterns; can create real transactions. Manual bills persisted to `settings.recurring_bills`. |
| `/calendar` | Reads real transaction data for its daily grid. |
| `/search` | *(redirect only, screen removed)* — real search lives in Activity (§5.4/FEATURES.md §4) |
| `/export` | Reads real transaction data and live counts; underlying CSV/JSON/PDF generation logic itself not re-audited in depth |
| Wealth (`/wealth`) | Balances now shared with Home/Accounts (`netWorthProvider`); goals persisted to Hive |
| **Loans** (no route) | **Dead code** — unreachable, 100% hardcoded UI, FAB does nothing, no model/box/provider |
| **Cash Reminder** (no route) | **Dead code** — unreachable, and even its Save button never persists anything |

### Other known issues (post debug-fix pass; some already remediated, listed for completeness)

- Dark Mode switch is honestly labeled "Always on" now (was a fake toggle).
- `AccountConfigScreen` (dead, unregistered) was deleted; `PremiumSettingsScreen` (§5.15) is the live equivalent.
- PIN setup no longer force-enables fingerprint on unsupported devices.
- Onboarding Modal's "Skip for now" is now wired.
- Several dead Settings helper widgets were removed.
- "Create Test Rule from SMS" (Developer Options) now actually creates a rule instead of just showing a SnackBar.
- The full internal app-specification document is embedded and copyable directly from Developer Options — one tap away for anyone with the installed app, and that embedded spec is itself stale (still claims no cloud sync).

> **Verification caveat:** the debug-fix pass (`DEBUG_FIX_REPORT.md`, 2026-07-19) was done in a sandbox without a working Flutter toolchain — every fix was made by reading/tracing real code and passing a static brace/string-balance scan across all 208 Dart files, but `flutter analyze`, `flutter test`, and an on-device pass have **not** been run to confirm these fixes at runtime. Treat the fixes above as "correct by construction, not yet device-verified."

---

## 13. Implementation maturity summary

> Superseded by the fuller table in [FEATURES.md §22](./FEATURES.md#22-implementation-maturity-summary-revised); kept here in corrected form for a quick overview.

| Feature area | Status |
|---|---|
| SMS auto-detection + verification | ✅ Production-grade — full pipeline, background + notification + foreground paths |
| Transactions & ledger | ✅ Fully functional |
| Accounts & balances | ✅ Fully functional |
| **Plan** (budget planning, replaces old Budgets) | ✅ Fully functional — income tracking + purpose-scoped allocations |
| Outings / trip splitting | ✅ Fully functional |
| Friends & repayments | ✅ Fully functional, including UPI auto-matching |
| Analytics | ✅ Fully functional |
| Investments | ✅ Functional (manual holdings + SMS-assisted allocation) |
| Auth (Supabase, required) / PIN / biometrics | ✅ Fully functional |
| Supabase sync (local-first, push+pull) | ✅ Wired — see [SYNC.md](./SYNC.md); device-level end-to-end verification still pending per its own checklist |
| **Wealth** | ✅ Real balances (shared with Home/Accounts) + persisted goals |
| **Recurring** | ✅ Reads/creates real transactions |
| **Calendar** | ✅ Reads real transaction data |
| **Export** | ⚠️ Reads real data; export/backup generation logic itself not deep-audited |
| Notifications history | ✅ Functional |
| Merchant learning | ✅ Functional (post split-brain fix) |
| Standalone Search screen | *(removed — redirects to Activity, where real search lives)* |
| Dark mode toggle | ❌ Non-functional by design, always dark (now honestly labeled) |
| Account Config screen | ❌ Deleted (dead code) |
| **Loans** | ❌ **Dead code** — unreachable, no data layer |
| **Cash Reminder** | ❌ **Dead code** — unreachable, no persistence even if triggered |

---

## 14. How this relates to the web app

This mobile app and `spentx-web` (documented in `docs/FULL_APP_DOCUMENTATION.md`, `docs/DATABASE_SCHEMA.md`, `docs/FEATURES.md`, `docs/WORKFLOWS.md`) share **one Supabase project**. Concrete touchpoints:

| Concern | Web side | Mobile side |
|---|---|---|
| Auth | Supabase Auth, SSR client | Supabase Auth via `supabase_flutter`, now **required** to use the app (§3) |
| New-user bootstrap | `handle_new_user()` trigger + `bootstrapUserWorkspace()` | Same trigger fires for mobile-originated signups; mobile's onboarding gate checks server data (§3) rather than assuming a fresh account |
| Transactions | `transactions` + `transaction_splits`, written via RPC `create_transaction_with_splits` | Synced via the schema map in §8 — mobile respects the same `total_amount`/`account_id`/split-on-purpose shape |
| Categories | `category_id` on splits is name-keyed, not a real FK (documented as a deliberate quirk in `docs/DATABASE_SCHEMA.md` §5.2) | Mobile's schema map explicitly honors this same name-keyed convention |
| Accounts | Soft-delete (`is_active=false`), lowercase `type`, `last4` | Mobile mirrors soft-delete semantics; never hard-deletes remotely |
| Outings | `outings.status`/`auto_add_mode`, `outing_expenses.split_type`+`splits` jsonb, `settlements` from/to member rows | Mobile's per-expense payments use `note: "exp:<id>"` to round-trip through the outing-level settlement rows; web-created settlements apply FIFO on pull |
| SMS parsing rules | `sms_template_rules`/`sms_detection_rules`/`sms_block_rules` — admin-managed via the web admin portal (`docs/DATABASE_SCHEMA.md` §11, `docs/FEATURES.md` §17) | Mobile **pulls only**, never writes; refreshes daily + on-demand, applies with no restart (§8) |
| Merchant learning | `user_merchants` table (per-user, migration `20260727`) | Mobile's `merchants_box`/`merchant_rules_box` are the local mirror of the same concept — the merchant-learning UX described in `hello.md`/`fullappworkflow.md` is the mobile-side implementation of what the web `user_merchants` table stores |
| PIN reset marker | `users.app_pin_reset_at` (migration `20260725`) — set from web Settings, **PIN itself never stored server-side** | Mobile's local `pin_hash`/`pin_salt` (secure storage) is exactly the PIN data this marker never touches |
| Purposes | Personal + Family mandatory since migration `20260724` | Mobile's onboarding Step 3 (Personal pre-selected/locked, Family toggle) matches this exactly — the migration's stated intent was aligning with what mobile already did |
| Split types | `outing_expenses.split_type` allows `equally`/`solo`/`custom`/`percentage`/`shares` at the DB layer, but the web TS `SplitType` only models `equally`/`solo`/`custom` (flagged as drift in `docs/DATABASE_SCHEMA.md` §19) | Mobile's `OutingExpense.splitType` is an int (`0`=solo, `1`=equally) — mobile doesn't yet use `percentage`/`shares` either; the DB's wider enum is provisioned ahead of both clients |

**Not shared:** raw SMS text (mobile never uploads it — stays local, only structured/parsed transaction data syncs), PIN/biometric state, SMS-detection toggle, debug flags, device contacts (only explicitly-saved friend name+phone leaves the device).

---

*Originally consolidated from the mobile project's own docs (`Mobile app/SpentX/hello.md`, `db.md`, `docs/AUTH_SETUP.md`, `docs/SYNC_WIRING.md`, `fullappworkflow.md`, `DEBUG_FIX_REPORT.md`) as of 2026-07-19. Subsequently corrected and deepened by a direct second-pass read of the Dart source (2026-07-20) — see [DATABASE.md](./DATABASE.md), [SYNC.md](./SYNC.md), [FEATURES.md](./FEATURES.md), and [WORKFLOWS.md](./WORKFLOWS.md) for the exhaustive, current versions; sections above marked "OUTDATED" or with a pointer note have been superseded by those files. This file remains the entry-point overview, kept alongside the web app's own docs for cross-referencing (see §14).*
