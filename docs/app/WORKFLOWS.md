# SpentX Mobile — End-to-End Workflows

> Source-verified against the actual Dart code as of 2026-07-20. See [FEATURES.md](./FEATURES.md) for what each screen does, [DATABASE.md](./DATABASE.md) for local storage, [SYNC.md](./SYNC.md) for the Supabase sync mechanics referenced throughout.

---

## Table of contents

1. [App startup workflow](#1-app-startup-workflow)
2. [Auth workflow](#2-auth-workflow)
3. [Onboarding workflow](#3-onboarding-workflow)
4. [SMS/notification auto-detection pipeline (deep algorithmic reference)](#4-smsnotification-auto-detection-pipeline-deep-algorithmic-reference)
5. [Add transaction workflow](#5-add-transaction-workflow)
6. [Outing / trip splitting workflow](#6-outing--trip-splitting-workflow)
7. [Plan (budget) workflow](#7-plan-budget-workflow)
8. [Sync workflow (summary — full detail in SYNC.md)](#8-sync-workflow-summary--full-detail-in-syncmd)
9. [Privacy mode workflows](#9-privacy-mode-workflows)
10. [Reset / sign-out workflow](#10-reset--sign-out-workflow)
11. [Sequence diagrams (text)](#11-sequence-diagrams-text)

---

## 1. App startup workflow

```
App Launch
  → WidgetsFlutterBinding.ensureInitialized()
  → Hive.initFlutter() → open all boxes (see DATABASE.md §6 for exact order)
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
  → AuthService.init() → SyncQueue.ensureOpen() → MerchantLearningService.ensureOpen()
  → runApp(ProviderScope → SpentXApp)
  → SpentXApp.initState(): register lifecycle observer, SMS listener,
    notification click handler
  → After 800ms: request SMS permissions, start SmsReceiverService,
    PendingVerificationBootstrap.processStartupAndShowIfNeeded()
  → Route to Splash Screen ("/")
```

**On app resume from background:**
1. PIN lock screen shown if PIN + lock enabled (4-second debounce prevents double-prompt loops) — **never** a Supabase re-login.
2. Flush pending SMS queue and pending notification payloads.
3. Reload transactions from Hive.
4. Run pending-SMS-verification popups if any accumulated while backgrounded.
5. `SyncService.onForeground()` fires — see §8.

**Key file:** `lib/main.dart`

---

## 2. Auth workflow

```
Splash
  → no Supabase session → /auth  (Sign Up / Log In / Forgot password)
  → valid session       → has_seen_onboarding?
                            false → /onboarding → /pin-setup → /home
                            true  → /lock (if PIN) → /home
```

- Router-level guard (`app_router.dart`): every route except `/` and `/auth/*` redirects to `/auth` while signed out — covers deep links too.
- Signup → `AuthSignUpScreen` validates → `AuthService.signUp()` → if session is immediately present (no email confirmation required), `AuthFlow.continueAfterAuth()` routes onward through the onboarding gate (§3); if `res.session == null`, an inline message is shown instead.
- Login → `AuthLoginScreen` → `AuthService.signIn()` → `AuthFlow.continueAfterAuth()` → for a device that's already onboarded, this skips straight to PIN/lock/home.
- Password reset: `/auth/forgot-password` → `AuthService.sendPasswordReset()` → email link → `spentx://reset-password` deep link → `/auth/reset-password` (guarded by an active Supabase recovery session) → `AuthService.updatePassword()` → `AuthService.signOut()` (ends the recovery session so it can't be reused) → back to `/auth/login`.
- Sign Out (Settings → Security): `SyncService.stop()` then Supabase sign-out — local Hive data is untouched.
- **Different account signs in over existing local data:** an explicit dialog offers **Keep local data** (now belongs to the new account) or **Erase & start fresh** (local wipe, preserves the new session) — never a silent merge or silent wipe.
- Reset App Data: wipes all Hive boxes **and** signs out of Supabase (`SyncService.pushPending()` given a 10s best-effort flush window first) → next open is `/auth`.

**Login success on a device that already onboarded** never re-runs the marketing carousel or account setup modal — it goes straight through to PIN/lock/home, with `SyncService.start()` kicking off a `fullSync()` in the background to repopulate Hive.

---

## 3. Onboarding workflow

```
AuthFlow.continueAfterAuth()
  → AuthService.accountHasExistingData()?
      (counts: transactions>0 OR accounts>1 OR purposes>1 — i.e. anything
       beyond the handle_new_user seed row)
      │
      ├─ true  → settings.account_has_data cached true
      │          → skip onboarding, go straight to PIN/lock/home
      │          → SyncService.fullSync() pulls the real data into Hive
      │
      └─ false → /onboarding (marketing carousel)
                   → Get Started → /pin-setup
                     → First-Time Account Setup Modal (4 steps, on Home)
                       → completeOnboarding()
                          - MERGES accounts/purposes by name (idempotent —
                            double-run cannot duplicate "Personal"/"Cash")
                          - queues everything for push via SyncQueue
                       → isFirstTimeUser = false
```

**Session-restore path (Splash, not fresh login):** a cached `settings.account_has_data == true` short-circuits with **no network call**; an unresolved/false cached flag re-checks the server once via `accountHasExistingData()`.

**Zero-display gotcha** (documented in the mobile project's own `SYNC_WIRING.md`, still valid): if transactions show zero for an existing account *after* confirming onboarding was correctly skipped, that's a distinct sync-pull bug, not an onboarding bug — check `_pullTransactionsWindow` / the schema-map column names (SYNC.md §1/§3). Also remember the pull window is 35 days — an account whose newest transaction is older than that legitimately shows an empty recent view until "Load older" is used.

---

## 4. SMS/notification auto-detection pipeline (deep algorithmic reference)

This is the app's core differentiator. The high-level shape:

```
INBOUND SOURCES: Native SMS Broadcast · Telephony Receiver ·
                  Notification Listener · WorkManager Flush
                              │
     SmsDetectionPipeline.processInbound() / processNotificationPayload()
                              │
        auto_detection enabled in Settings? ──No──→ dropped
                              │ Yes
              Dedupe check (in-memory hash + persistent referenceId)
                              │
        SmsRuleEngine.parse() + block rules + BankSmsV4Parser
                              │
              AutoRuleEngine (foreground or background)
                    ┌─────────┴─────────┐
                    ▼                   ▼
          KNOWN MERCHANT          UNKNOWN MERCHANT
                    │                   │
                    ▼                   ▼
        Auto-add to ledger    Store in detected_sms_box + queue
                                        │
                                        ▼
                         PendingVerificationPresenter
                         → sequential Detection Popup
```

### 4.1 Rule priority order — `SmsRuleEngine.parse()` (`lib/features/sms/rules/engine/sms_rule_engine.dart:108-218`)

Fresh Hive reads on every call (no caching layer), evaluated in this exact order:

1. **Hard filters** — `SmsTransactionFilters.isFailedTransaction`/`isAdvertisement` → immediate `null` result + `ignoreMessage()`.
2. **Block rules** — `SmsRuleEngine.isBlocked()`: regex `pattern` checked first, then keyword `.contains`, then `BlockRule.matchScore()` (fraction of the rule's keywords present in the message) checked against `similarityThreshold` (default `0.6`).
3. **Bundled v4 bank templates** — `BankSmsV4Parser.parseSync()` against `assets/sms/bank_sms_templates_v4.json`, loaded via `BankSmsTemplateCatalog.loadRules()` and cached in-memory.
4. **User-trained template rules** — `SmsTemplateEngine.tryMatch()` against the Hive `templateRules` box (`SmsTemplateRule` model) — **the same matcher class as step 3**, just pointed at a different rule source.
5. **Regex/keyword rules** — `SmsRuleEngine._tryRegexRules()` against the Hive `regexRules` box (`SmsRule` model): `matchPattern` regex + `containsKeywords`/`excludeKeywords` + `_bankNameMatches` (substring or ≥3-char token match).
6. **Fallback** — the `sms_parser` package's `UniversalSmsParser.parseSms()` + `BankTitleExtractor.enrich()`.

Every branch funnels through `_finalizeParsed()`, which reapplies direction via `SmsDirectionHelper.resolveDirection` and records `SmsParseDebugInfo` (`lastParseDebug`, surfaced in the Developer Options debug log) with `source`/`matchedTemplate`/`matchedRule`.

### 4.2 Template matching & fuzzy similarity — `SmsTemplateEngine._computeSimilarity()` (`sms_template_engine.dart:186`)

A weighted two-part score, used identically for both the v4 bundled templates and user-trained templates:

- **Keyword score** (40% weight) = `keywordHits / rule.keywords.length` (substring contains, case-insensitive).
- **Structural-parts score** (60% weight) = fraction of `rule.structuralParts` (static text fragments left over after replacing tagged tokens in the training sample) found as substrings in the normalized live message.
- `score = keywordScore*0.4 + structScore*0.6`

**Acceptance** (`tryMatchAgainstRules()`, lines 68-98) — a rule is considered a match if **any** of:
- `structureMatched`: `score >= rule.similarityThreshold` (typically `0.65`)
- `bankWithStructure`: bank name matches (`_bankMatches` — exact, substring, or token) **and** `score >= 0.35`
- `keywordOnlyMatch`: every one of `rule.keywords` is present **and** `score >= 0.25`

Among all matching rules, the winner is chosen by `rank = score + (bankNameMatched ? 0.15 : 0)` — highest rank wins, not just the first rule that matches.

**Extraction uses positional anchoring, not pure regex:** `_extractByPosition()` (line 364) finds the ±15 characters around a tagged value *in the original training sample*, strips numeric/dynamic fragments (`_cleanAnchor`), and builds a regex `escapedBefore\s*(.+?)\s*escapedAfter` to locate the analogous value in the live message. Falls back to generic regex extractors (`_extractAmount`, `_extractAccountLast4`, `_extractUpi`, `_extractRefId`, `_extractDate`/`_extractTime`) if the positional match fails.

Merchant/title extraction **always prefers `PayeeExtractor.extract(message)`** over any positional/contextual result — training-sample text is never reused as an actual output value, only as a structural pattern.

Date/time resolution priority (`_resolveDateTime`, line 443): parsed date + parsed time > parsed date + SMS-received clock time > SMS-received time entirely > `DateTime.now()`.

### 4.3 v4 bank template system (`lib/features/sms/v4/`)

`BankSmsTemplateCatalog.loadRules()` parses `assets/sms/bank_sms_templates_v4.json` (shape: `{banks:[{bank, bankNameExact, templates:[{id, transactionType, sampleMessage, templatePattern, extractionMap, exactTaggedValues, keywords, similarityThreshold}]}]}`). Skips `advertisement`/`failed_transaction` types. `transactionType` maps to `credit`/`transfer` (atm_withdraw, bank_to_cash, cash_to_bank) / `debit` (default). v4 field names (`payee`, `merchant`, `merchantName`) normalize to `TemplateFieldType.title` so the shared template engine treats them uniformly. Structural parts are derived by splitting the raw template string on `[Amount|Payee|Title|...]` bracket tokens.

`BankSmsV4Parser.parseSync()`/`.parse()` just delegate matching to `SmsTemplateEngine.tryMatchAgainstRules(rules, ...)` — it's the same matcher, a different rule set — then wraps the result in `ParsedSmsTransaction`, always re-extracting payee live via `PayeeExtractor.extract(rawMessage)` rather than trusting the matched sample text.

### 4.4 Auto-add vs. pending verification — the actual decision logic

Centralized in `TransactionDetectionValidator.evaluateMerchant()` (`transaction_detection_validator.dart:35`), called from `AutoRuleEngine.handleForeground`/`.handleBackgroundSms`/`._commitUnknownMerchantPending`:

1. Resolve a lookup identifier: `SmsAtmHelper.ruleIdentifier` for ATM/transfer types, else `MerchantMatchResolver.resolve()`.
2. **ATM/transfer:** `MerchantRuleService.findAtmRule(bank, accountLast4)` — key = `atm_<bank_snake>_<last4>` (see §4.6).
3. **Non-transfer:** `MerchantMatchResolver.resolve()` → `MerchantLearningService.findByPayee()` first (normalized-payee lookup in `merchants_box`, requires `isAutoApply`), falling back to `MerchantRuleService.findRule()` against `merchant_rules_box` using `buildLookupCandidates` (UPI/phone/rawIdentifier — **never** display name). UPI/phone rules carry `transactionType='any'`, matching both credit and debit.

- **Rule found → auto-add:** builds the `Transaction`/tx-map, appends directly to Hive `transactions.list` (foreground path via the Riverpod `transactionProvider`; background path via `_appendTransactionToHive` + `SyncService.queueTransactionUpsert`), marks `processed_sms_box[referenceId]`, fires an "Added" notification (`_notifyAutoAdded`).
- **No rule → pending:** `_storeForVerification()` builds a `PendingTransaction`, saved via `SmsPendingService.save()` into `detected_sms_box`, id pushed onto `pending_detections['queue']`, a "Verify" system notification fires (`_notifyPendingVerification`), and it's logged to `PendingVerificationHistoryService`.
- **Background deferral:** a *known* merchant detected while the app is backgrounded is still stored as pending-with-`savedTitle` rather than committed immediately, and only materialized into a real transaction when the app foregrounds via `AutoRuleEngine.flushDeferredAutoAdds()`.

**Merchant learning only happens at verification time:** `DetectionQueueNotifier.confirmTransaction()` calls `MerchantRuleService.learnAtmRule()` (if `isTransfer`) and always `merchantProvider.saveRule()` — this is the exact moment an unknown ATM/merchant becomes a known one for future SMS.

### 4.5 Dedupe — two independent layers

- **Pipeline-level (in-memory, transient):** `SmsDetectionPipeline._recentHashes` — key = `'${body.hashCode}_${sender}_${receivedAt.minute}'`, capped at 80 entries. Minute-granularity, hashCode-based — collisions theoretically possible but low-risk in practice.
- **Persistent** (`AutoRuleEngine._isDuplicate`): checks `processed_sms_box` by `referenceId` first; then the `transactions` Hive list for the same `referenceId` OR (same amount AND same day+month), excluding pending items; then checks `detected_sms_box` — if a *pending* item with the same refId/amount+date already exists, it's explicitly **not** treated as a duplicate (returns `false`) so the verify flow stays reachable rather than silently swallowing the second detection. `_findExistingPendingId()` runs the same refId/amount+day/month match to reuse pending IDs and avoid duplicate notifications when native/background/foreground paths race each other for the same SMS.

### 4.6 ATM withdrawal pattern learning

Rule key is **bank + last-4 digits only** (`SmsAtmHelper.ruleIdentifier`): `atm_<bank_normalized>_<last4>` (falling back to `atm_<bank>` / `atm_card_<digits>` / `atm_unknown`). No amount is involved in the key. The first ATM withdrawal per bank+card combination always goes to pending verification (background path explicitly sets `allowAutoAddIfKnown:false` for this case). On user confirm with `isTransfer=true`, `MerchantRuleService.learnAtmRule()` upserts a rule with `transactionType='transfer'`; subsequent withdrawals from the same bank/card auto-add via `findAtmRule()`.

### 4.7 Background processing

WorkManager sweeps every **15 minutes** to catch SMS/notifications that arrived while the app was fully closed (task `spentx.processSmsQueue`, registered by `BackgroundSmsScheduler`; distinct from the separate `spentx.syncDataQueue` sync task in SYNC.md §4). `BackgroundSmsProcessor.processAllQueued()` drains both native queues via the `com.spentx.app/permissions` MethodChannel when the Flutter engine is alive, else reads SharedPreferences directly (`flutter.native_sms_queue`/`flutter.native_tx_queue`), then calls `AutoRuleEngine.handleNativePayload()` / `SmsDetectionPipeline.processInbound(source: pendingFlush)`.

> **Historical bug, now fixed:** this 15-minute sweep was a **silent no-op** for a period — the MethodChannel it used is registered only in `MainActivity`, and calls throw `MissingPluginException` inside the headless WorkManager isolate, which were being swallowed by empty catch blocks, so the background sweep never actually processed anything while the app was closed. Fixed by having the native Kotlin queue storage go through `SharedPreferences` (`SmsPendingQueue.kt`/`TransactionPendingQueue.kt` now write `flutter.native_sms_queue`/`flutter.native_tx_queue`) so the background isolate can drain the queues directly via the `shared_preferences` plugin instead of the MethodChannel, which doesn't exist in that isolate.

### 4.8 Native ↔ Dart bridge (Android)

Channels registered in `MainActivity.kt` (`configureFlutterEngine`, lines 101-205):

| Channel | Type | Purpose |
|---|---|---|
| `com.spentx.app/permissions` | MethodChannel | `isNotificationListenerEnabled`, `openNotificationListenerSettings`, `getInboxSms` (raw content-resolver SMS dump), `getPendingSms` → `SmsPendingQueue.drain()`, `getPendingTransactionPayloads` → `TransactionPendingQueue.drain()` |
| `com.spentx.app/sms_lab` | MethodChannel | Lab-only scheduled-test triggers |
| `com.spentx/notifications` | MethodChannel | `getInitialPayload`, `shouldOpenPendingQueue`, `openListenerSettings` |
| `com.spentx.app/sms` | EventChannel | Live SMS broadcast stream, fed by `SmsReceiver` |
| `com.spentx/transaction_events` | EventChannel | Live notification-listener JSON stream, fed by `SmsNotificationListenerService` via `LocalBroadcastManager` action `NEW_TRANSACTION_DETECTED` |

`SmsReceiver.kt` listens for `android.provider.Telephony.SMS_RECEIVED`; if `MainActivity.eventSink` is live it pushes `{sender, body}` directly, else queues via `SmsPendingQueue` (SharedPreferences, max 50, readable from the WorkManager isolate).

`SmsNotificationListenerService.kt` filters by package (`com.google.android.apps.messaging`, `com.android.mms`, or any package name containing "bank"/hdfc/icici/sbi/axis), does its own lightweight amount/merchant/bank/type/mode extraction on the native side (regex, credit-before-debit precedence), and either broadcasts locally (foreground) or queues to `TransactionPendingQueue` (max 30) plus posts a system notification with title suffix "- Verify" or "- Added" — that suffix decision is looked up via `SpentXDetectionPrefs.findSavedMerchantName`, a Kotlin-side mirror of the Dart merchant DB used **purely for notification copy**, not for the actual add/pending decision (which happens Dart-side per §4.4).

### 4.9 Structural notes on adjacent code

- `lib/features/sms/background/` (WorkManager drain path) and `lib/features/background_detection/` are **not duplicates**: the latter is a thin, largely legacy `NotificationService`/`DetectionParser` wrapper around the same event/method channels that ultimately calls into `SmsDetectionPipeline`/`AutoRuleEngine` — effectively UI-facing glue — while `sms/background/` is the headless WorkManager drain logic proper.
- `lib/features/sms/smart/` (`SmartSmsParser`, backing the `/sms-activity` route) is a standalone legacy/demo parser (hardcoded date `"19/04/26"`, an independent regex set) that is **not wired into `SmsRuleEngine`/`SmsDetectionPipeline`** at all — appears superseded by the v4/template system and effectively vestigial, similar in spirit to the Loans/Cash Reminder dead code in FEATURES.md §20.
- `PendingVerificationPresenter` is a debounced singleton gate (`_isShowing`, 600ms debounce) ensuring only one verify bottom sheet shows at a time, pulling sequentially from the pending-detection queue sorted oldest-first.

---

## 5. Add transaction workflow

```
User opens Quick Add (+ FAB) OR SMS auto-detect verify popup
  → fills Amount, title/merchant, account, purpose, category
    (manual) OR fields pre-filled from SMS parse (auto-detect)
  → Save
  → Hive-write-first: append to `transactions` box list (transaction_provider.dart)
  → SyncQueue.enqueue({entity: transaction, op: upsert, localId, payload})
  → _kickPush() fires a fire-and-forget SyncService.pushPending()
  → If UPI/ref entered → merchant-learning engine taught
    (saveRule → mirrors both merchant_rules_box AND merchants_box)
  → Budget alert check: does this expense's category have an active
    Plan allocation? If spend crosses 80%/100% of planned → notification
    history entry + system notification
  → If outingId is set (manual link or active-trip auto-tag) →
    OutingTransactionSync builds/updates the matching OutingExpense
    (see §6, and SYNC.md §7 for why this is NOT the same as web's
    per-transaction rollup mechanism)
```

Push to Supabase happens asynchronously per SYNC.md §2 — the UI never blocks on network for a transaction save; Hive is written synchronously, everything after that is best-effort/eventually-consistent.

---

## 6. Outing / trip splitting workflow

### 6.1 Create outing

```
/outings → "New Trip" (only if none active)
  → title, category (+custom), location, start/end dates, members
  → Outing saved to Hive `outings` box (keyed by id)
  → SyncService.queueOutingUpsert → full document push (SYNC.md §1/§2)
  → Navigate to /outing-detail/:id
```

### 6.2 Add outing expense

```
Trip Detail → "+" (Activity section) → Add Outing Expense sheet
  → amount, description, category, account (Cash-only if opened from
    the trip's own "+"), who-paid + split (Solo/Equally) for multi-member
  → OutingProvider mutation → Hive `outings` box updated
  → _putAndSync → SyncService.queueOutingUpsert (full document, again)
  → Member balances recompute locally (no separate balance table —
    always derived from the expense list)
```

### 6.3 Auto-link from SMS/bank detection

```
Active trip with autoAddMode=true
  → New transaction with a date inside the trip's date range gets
    outingId auto-set (during add or during SMS verify confirm)
  → OutingProvider.syncTransactionExpense (outing_provider.dart:704)
    → OutingTransactionSync helper (lib/core/services/outing_transaction_sync.dart)
       builds/updates the OutingExpense: default split is 'solo' if the
       trip has no other members, else 'equally' across all members;
       preserves an already-set paidByMemberId/split on update
  → _putAndSync pushes the whole outing document again
```

Incoming credits are separately auto-matched to friend repayments by UPI/name recognition (Friend Detail's linked-UPI mechanism), independent of the outing-expense auto-link above.

### 6.4 Settle / record repayment

```
Friend Detail (or Trip Detail's "YOU NEED TO SEND" callout)
  → Record Payment sheet: amount (pre-filled to remaining balance,
    "Max" quick-fill), payment type, destination account
  → settlementPayments map updated on the relevant OutingExpense
  → _putAndSync → SyncService.queueOutingUpsert
       → on push, settlement rows go to Supabase `settlements` with
         note='exp:<remoteExpenseId>' so they round-trip correctly
         against web's outing-level settlement model (SYNC.md §1)
```

### 6.5 End trip

```
Trip menu → "End Trip & Settle"
  → isActive = false
  → _putAndSync pushes status='completed' to Supabase
  → autoAddMode effectively stops mattering (no longer "active")
  → outingProvider.expireEndedOutings() also auto-closes trips whose
    endDate has passed, checked on every app-shell first-frame
```

---

## 7. Plan (budget) workflow

```
/plan → month/purpose selector
  → PlanNotifier.ensureDraft(month, purpose)
       - if monthly_plans box is empty entirely → migrate from legacy
         `budgets` box (category/limit pairs) into a starter plan
       - else if no plan exists for this exact month+purpose → seed
         allocations from legacy budgets too (per-month migration touch)
  → Overview card computes: expectedIncome, totalPlanned (sum of
    allocations), spent (sum of spentForCategory per allocation,
    derived live from the transaction ledger — not stored), remaining
  → User edits via pencil/FAB → _EditPlanSheet
       - sets title, expectedIncome, per-category planned amount
         (pre-populated from the categories provider)
  → Save → PlanNotifier writes to Hive `monthly_plans` box
  → SyncService.queuePlanUpsert → pushed to Supabase `monthly_plans`
    (SYNC.md §1: month/title/purposeId/expectedIncome/allocations)
```

Every category allocation card independently shows its own spent-vs-planned progress bar and turns red at ≥90% — this feeds the Home/Notifications budget-alert mechanism the same way the old Budgets screen did (see `budget_alert_service.dart` logic, unchanged by the Plan migration).

---

## 8. Sync workflow (summary — full detail in SYNC.md)

```
Local write (any entity) ──► Hive (synchronous, always succeeds offline)
                          ──► SyncQueue.enqueue() (upserts coalesce per
                               record; deletes supersede queued upserts)
                          ──► _kickPush() (fire-and-forget)

Trigger points (see SYNC.md §9 for exact file:line list):
  - App start / every resume / login / connectivity regained
  - In-app 30-min timer (Timer.periodic)
  - WorkManager 15-min headless task (separate from the SMS 15-min sweep)
  - App pause (one-off background push)
  - Dev Options "repair" button (force re-push everything)

pushPending(): priority-ordered drain (accounts → contributors/categories
  → friends/merchants/settings → outings → transactions → plans), retries
  indefinitely on failure (no backoff/max-retry), stamps remoteId back
  onto pushed rows.

pullAll(): accounts/purposes → categories → contributors → plans →
  merchants → transactions (35-day rolling window) → outings → friends
  → user settings. Never overwrites a row that SyncQueue still has
  pending for (the sole conflict-resolution mechanism — no timestamps).
```

See [SYNC.md](./SYNC.md) for the exact Hive-field ↔ Supabase-column mapping per table, and for corrections to the mobile project's own (partially inaccurate) `docs/SYNC_WIRING.md`.

---

## 9. Privacy mode workflows

### Private Mode

```
Settings → Private Mode toggle ON
  → All monetary amounts on Home/Accounts render as '*****'
  → Individual purpose types (e.g. "Family") can be independently masked
  → Automatically forced OFF if Outing Privacy Mode is active
    (the two are mutually exclusive at the UI level)
```

### Outing Privacy Mode

```
Trip active → Settings (or trip's own settings) → Outing Privacy toggle ON
  (instant — no confirmation needed to turn ON)
  → Home replaces entire dashboard with trip-only view
  → Activity filters to trip-only transactions
  → Analytics scopes to the trip only, title becomes "Trip analytics"
  → Turning OFF requires PIN or profile-name confirmation dialog
    (prevents a trip companion using your phone from casually seeing
     your real net worth/balances)
```

---

## 10. Reset / sign-out workflow

```
Settings → Sign Out
  → SyncService.stop()
  → Supabase signOut() — local Hive data untouched
  → next launch: Splash sees no session → /auth

Settings → Danger Zone → Reset App Data
  → Confirmation dialog
  → PIN or biometric verification required
  → Final "last chance" confirmation
  → SyncService.pushPending() — 10s best-effort flush of any unsynced
    local edits BEFORE wiping (so nothing is silently lost that hadn't
    reached Supabase yet)
  → AppResetService.resetAll():
       - clears every Hive box (DATABASE.md §1)
       - clears SharedPreferences (DATABASE.md §4)
       - clears pin_hash/pin_salt/has_pin
       - re-seeds settings: has_seen_onboarding=false, isFirstTimeUser=true,
         auto_detection=true, lock_screen_enabled=true
       - signs out of Supabase (current-flow addition — not just a local
         wipe, since auth is now required)
  → force-quits the app after a few seconds
  → next open: /auth (fresh-install experience, matches "different
    account signs in" semantics from §2)
```

---

## 11. Sequence diagrams (text)

### A. SMS auto-detect → auto-add (known merchant, foreground)

```
Android SMS          SmsReceiver.kt        EventChannel          Dart
   |                       |                      |                 |
   |-- SMS_RECEIVED ------>|                      |                 |
   |                       |-- push {sender,body}------------------>|
   |                       |         (com.spentx.app/sms)            |
   |                                                        SmsDetectionPipeline
   |                                                        .processInbound()
   |                                                             |
   |                                              dedupe (hash + referenceId)
   |                                                             |
   |                                    SmsRuleEngine.parse() (block→v4→
   |                                    trained→regex→fallback, §4.1-4.3)
   |                                                             |
   |                                    TransactionDetectionValidator
   |                                    .evaluateMerchant() → rule found
   |                                                             |
   |                                    append to Hive transactions.list
   |                                    SyncService.queueTransactionUpsert
   |                                    "Added" notification fires
```

### B. SMS auto-detect → pending verification (unknown merchant)

```
... same as A up to evaluateMerchant() ...
                                                             |
                                            no rule found → PendingTransaction
                                            saved to detected_sms_box,
                                            id pushed to pending_detections queue
                                                             |
                                            "Verify" system notification
                                                             |
                          App foreground/opened
                                                             |
                          PendingVerificationBootstrap.processStartupAndShowIfNeeded()
                                                             |
                          PendingVerificationPresenter (debounced singleton)
                          → sequential Detection Popup (Confirm/Edit/Ignore)
                                                             |
                          Confirm → DetectionQueueNotifier.confirmTransaction()
                                    → merchantProvider.saveRule() (learns it)
                                    → real Transaction created, queued for push
```

### C. Transaction sync push (offline → online)

```
User (offline)         Hive                SyncQueue           Supabase
     |                   |                    |                   |
     |-- add expense --->|                    |                   |
     |                   |-- enqueue -------->|                   |
     |                                        |  (queued, no network)
     |                                                             
     ... connectivity regained ...
                                        ConnectivitySyncListener
                                        (20s debounce) → fullSync()
                                                        |
                                        pushPending() drains queue,
                                        priority-ordered
                                                             |-- upsert tx ----->|
                                                             |<-- remoteId ------|
                                        stamp remoteId onto Hive row,
                                        SyncQueue.remove(id)
```

### D. Outing expense settlement round-trip

```
Mobile: Record Payment (Friend Detail)
  → settlementPayments map updated on OutingExpense
  → _putAndSync → queueOutingUpsert (full outing doc)
       → settlement pushed with note='exp:<remoteExpenseId>'
  → Supabase `settlements` row created (from/to member, amount, is_partial=true)

Later, web app creates its OWN settlement for the same outing
  (no 'exp:' note — it's an outing-level settlement, not tied to one expense)

Mobile pulls again:
  → _pullOutings sees the settlement, no 'exp:<id>' match found
  → applies it FIFO against the member's outstanding share across
    that outing's expenses (SYNC.md §3)
```
