# SpentX Smart Detection Flow v2 — Architectural Audit & Discovery Report

## Storage choice and data safety (Steps 1–4, 2026-10-31)

SpentX is **local-first (works with no internet)**: saved money data is read and edited on the phone.

- **Phone only** (`storage_mode = phoneOnly`) keeps money data on this phone and never uploads it. No account is required. Admin rule downloads, masked template requests and user-initiated **Send to support** remain available when internet is available; Phone only does not mean zero network traffic.
- **Cloud sync** (`storage_mode = cloudSync`) syncs money data with an account. Switching from Phone only asks **Upload my phone data / Start fresh / Cancel**; signing in must not silently upload Phone only data.
- **No internet** describes a Cloud sync user's temporary connection state, including Wi-Fi without working internet. Local edits wait for upload when requests succeed again.
- Session drops, failed validation, missing setup rows and unconfirmed account revocation never wipe unsynced data. Destructive removal of unsynced data requires confirmed account deletion or the user's explicit Reset/Delete action. Manual sign-out checks pending uploads and refuses if they cannot be flushed; after successful checks it clears the local account workspace.
- Reconciliation keeps local rows the server never saw and queues eligible rows for upload. Only confirmed server delete markers (`is_active = false` or `deleted_at`) remove rows during reconciliation, subject to pending-edit/newer-local-edit guards. Missing responses, failed lookups and row age do not authorize deletion. SMS rows awaiting verification retain their upload guard.
- Current names separate storage choice (`storage_mode`, `phone_only_user`) from connectivity (`hasNoInternet`, website `isOnline`). Legacy names are compatibility details, not user-facing modes.

Implementation commits: app `aa31f07`, `82a84c3`, `86cb5b9`, `dc8bc18` (Step 1); `0f6de75`, `ed8d973`, `59839ee` (Step 2); `f85233a` through `7843698` and website `daf8ce5`, `574f61e`, `66294f0` (Step 3). Step 4: app `7aab0f6` (UI/comments), `5b28cd5` (docs/sync comments), and this website documentation commit. All 1,872 Flutter tests passed; analysis has 0 errors, 0 warnings and two existing deprecation infos. Validation is recorded in [FEATURE_STATUS.md](../FEATURE_STATUS.md).

> **Date:** October 24, 2026  
> **Branch:** `feature/smart-detection-flow-v2`  
> **Status:** Phase 0 Complete — Approved with Finalized Decisions & Baseline Test Results. Phase 2 done, pending phone test (2026-10-25, see §14).  
> **Scope:** Audit, Mapping, Allowed Files List, Baseline Test Results, and Final Architectural Decisions  

---

## 1. Tech Map

| Component | Specification / Active Implementation in SpentX |
| :--- | :--- |
| **Flutter SDK** | `Flutter 3.41.7` • Dart `3.11.5` • Channel `stable` (`sdk: ^3.7.0` in `pubspec.yaml`) |
| **State Management** | `flutter_riverpod: any` (Riverpod 2.6.1) with `ChangeNotifierProvider`, `StateNotifierProvider`, and `ConsumerStatefulWidget` |
| **Dependency Injection** | Riverpod Providers (e.g. `transactionProvider`, `categoryProvider`, `pendingAccountProvider`) |
| **Local Database** | Hive 2.2.3 / `hive_flutter: ^1.1.0` wrapped by `SecureHive` |
| **Encryption & Keystore** | `SecureHive` via `HiveAesCipher` using random 256-bit AES keys stored in Android Keystore via `flutter_secure_storage: ^10.0.0` (`HiveKeyManager.dart`) |
| **Real Transaction Model** | **`lib/models/transaction.dart`** is the active model stored by Hive (as serialized JSON in `Hive.box('transactions').get('list')`) and used across `TransactionProvider`, `SyncService`, and UI. Only this file receives additive detection fields (`refKey`, `sources`; `rawMessage` stays local/encrypted). There is **no** `idempotencyKey`. `impactsTotals` is a getter (`Countable.inTotals(this)`), never a stored field.<br>*(Note: `lib/features/transactions/domain/transaction_model.dart` has `@HiveType(typeId: 1)` but its adapter is never registered; it is an unused legacy prototype).* |
| **Active Hive Boxes** | `transactions`, `accounts`, `settings`, `vault`, `merchant_aliases`, `categories`, `outings`, `friend_splits`, `friends`, `friend_reminders`, `pending_detections`, `detected_sms_box`, `pending_accounts`, `ignored_detections`, `budgets`, `monthly_plans`, `investments`, `notification_history`, `pending_verification_history`, `wealth_snapshots`, `source_evidence`, `audit_log`, `sms_template_rules`, `sms_detection_rules`, `sms_block_rules`, `merchant_rules_box`, `merchants_box`, `sync_queue` |
| **Native Android Layer** | `Kotlin 2.1.0` • Android SDK Compile `35` • Min SDK `24` • Target SDK `35`<br>• `SmsReceiver.kt`: Intercepts `android.provider.Telephony.SMS_RECEIVED`<br>• `NotificationListenerService.kt`: Intercepts push notifications from user-picked apps (`notif:<package>`)<br>• `SmsPendingQueue.kt` / `DurableQueue.kt`: Native encrypted SQLite/Prefs queue (reused for raw queueing)<br>• `SpentXBackgroundWorker.kt` & `SmsWorkScheduler.kt`: WorkManager background queue drainage (`workmanager: ^0.7.0`)<br>• `BootReceiver.kt`: Reschedules listeners & workers upon device reboot |
| **Backend & Sync** | `Supabase` (PostgreSQL 15+, Supabase Auth, Row-Level Security, Realtime Sync)<br>• Web/Admin: Next.js 15 (App Router, React 19, TypeScript, TailwindCSS)<br>• Tables for detection: `sms_template_rules`, `sms_detection_rules`, `sms_block_rules`, `global_settings` (`rules_version`), `merchants`, `categories` |
| **Test Setup** | `flutter_test` (88 test files in `Mobile app/SpentX/test/`), custom test harness with `SecureHive.debugConfigure()`, `FakeKeyStore`, regression corpus fixtures |

---

## 2. Current Detection Flow Analysis

SpentX currently possesses a working, multi-layered detection infrastructure, but its parts are scattered across several evolving iterations (v1 legacy regex, v4 template catalog, Phase 2 notifications, and Phase 5 auto-save).

### A. Intake & Native Queueing
1. **`SmsReceiver.kt`**: Android broadcast receiver. Catches inbound bank SMS, writes to `SmsPendingQueue` (native SQLite/prefs), and signals Flutter via `EventChannel('com.spentx.app/sms')`.
2. **`NotificationListenerService.kt` (`SmsNotificationListenerService`)**: Binds to Android status bar notifications. If sender is in `PAYMENT_APP_PACKAGES` (GPay, PhonePe, Paytm, CRED, etc.), prefixes sender as `notif:<package>` and enqueues to `SmsPendingQueue`.
3. **`NativeQueueClient.dart`**: Drains the native queue into Dart and calls `SmsDetectionPipeline.processInbound()`.

### B. Pre-Parse Gating (`SmsDetectionPipeline.dart`)
1. **Session & Global Switch**: Checks `AuthService.isSignedIn` and `settings.auto_detection`.
2. **Deduplication**: 60s memory ring buffer + `SmsSeenStore`.
3. **User Block Rules**: `SmsRuleEngine.isBlocked(body)`.
4. **Status-Only Check**: `SmsRuleEngine.statusOnlyCandidate(body)` intercepts failed, declined, or reversed messages and sends to `_fileForReview()`.
5. **Money Moved Check**: `SmsTransactionFilters.statesMoneyMoved(body)`.
6. **Bank Allowlist & Discovery**: `BankAllowlistService.evaluate()`. If unknown account, delegates to `AccountDiscoveryService.record()`.

### C. Parser Hierarchy (`SmsRuleEngine.dart`)
1. **Payment App Notifications**: `NotificationParseRules.parse()` (rules: `notif_paid_to`, `notif_sent_to`, `notif_cc_bill`, `notif_wallet_topup`, `notif_received_from`).
2. **Universal Banking Parser**: `UniversalSmsParser.parseSms()` (common regex patterns for Indian banks).
3. **Bank Template Rules**: `SmsTemplateEngine.tryMatch()` (matches `SmsTemplateRule` structural templates in Hive).
4. **Bundled v4 Catalog**: `BankSmsV4Parser.parseSync()` (`bank_sms_templates_v4.json`).
5. **Regex Rules**: `_tryRegexRules()` (legacy regex fallback).
6. **Unparsed Candidate**: `SmsRuleEngine.unparsedCandidate()` (catches unparsed money moves for review).

### D. Merchant Resolution & Learning
1. **`PayeeExtractor.dart`**: Extracts clean payee name.
2. **`SelfAccountMatcher.dart`**: Prevents third-party transfers from being misread as self-transfers.
3. **`MerchantLearningService.dart`**: User overrides saved in `merchant_rules_box`.
4. **`MerchantCategoryEngine.dart`**: Global admin catalog mappings.

### E. Auto-Save & User Review
1. **`AutoRuleEngine.dart`**: Master decision engine. 
   - Foreground: Auto-add known merchants directly; show `DetectionPopup` for unknown.
   - Background: Auto-add known merchants + post system notification with Undo (current window: 10 minutes, `SmsAutoSaveUndo.window`); post verify notification for unknown.
2. **`TxRefKey.dart`**: Cross-source deduplication key (`v1:<accountKey>:<dir>:<paise>:<ref>`).
3. **`Countable.dart`**: Central financial filter ensuring `TxStatus.failed`, `TxStatus.pending`, and unlinked refunds never distort spending totals or balances.

---

## 3. Mapping Table & Component Reuse

| Box ID | Diagram Node | Current Code Equivalent | Action for Flow v2 |
| :--- | :--- | :--- | :--- |
| **IN** | Incoming Bank SMS / App Notification | `SmsReceiver.kt` & `NotificationListenerService.kt` | **Reuse** existing native receivers. |
| **Q** | Save Raw into Encrypted Native Queue | `SmsPendingQueue.kt` | **Directly Reuse & Extend `SmsPendingQueue.kt`** (No second queue created). Raw text queued before parsing. |
| **SRC** | Source? (SMS vs Notification) | `notificationPackageOf(sender) != null` | **Reuse / Formalize**: Clean enum dispatch (`SmsDetectionSource.sms` vs `notification`). |
| **AB** | Admin Block Rule Match? | `sms_block_rules` in Hive & `SmsRuleEngine.isBlocked` | **Refine**: Load cached admin block rules with bundled fallback regex/keyword list. |
| **X1** | Ignore and Log Reason | `SmsDetectionDebugLog.log()` | **Reuse**: Masked audit log, zero raw text. |
| **FF** | Failed or Wait SMS? | `StatusClassifier.classify()` & `SmsRuleEngine.statusOnlyCandidate()` | **Refine**: Explicit separation of `Failed` vs `Wait/Pending`. |
| **FL** | Save as Failed: Red Badge, ₹0 Impact | `TxStatus.failed`, `Countable.inTotals = false` | **Wire / Formalize**: Saved to ledger with `status = failed` (`impactsTotals` getter is then false via `Countable.inTotals`), ₹0 impact, red badge in activity. |
| **P1** | Hold and Wait for Final SMS | *New pending hold logic* | **New**: Dedicated `PendingHold` model with 48h configurable expiry. |
| **B** | Common SMS Parser | `UniversalSmsParser.dart` | **Reuse**: Primary parser for standard bank formats. |
| **B2** | Admin SMS Templates | `SmsTemplateEngine.dart` & `SmsTemplateRule` | **Reuse**: Secondary parser when common parser is incomplete. |
| **MW1**| Money Words Found? (SMS) | `SmsTransactionFilters.statesMoneyMoved()` | **Refine**: Centralize single config list of money words & amount patterns. |
| **X2** | Ignore and Log Reason | `SmsDetectionDebugLog.log()` | **Reuse**: Record reason code (e.g. `no_money_words`). |
| **UP1**| SMS Detection Pending: Unparsed - Tap to Tag | `unparsedCandidate()` & `DetectedSmsScreen` | **Wire**: Display as "Unparsed – Tap to Tag" card in Pending screen. |
| **MK** | Mask Account No., Name, Balance | *Custom masking rules* | **New**: Formalized `SmsMasker` service with strict zero-digit leakage tests. |
| **SA** | Send to Admin: New Template Request | *New backend submission* | **New**: Opt-in background submission to backend `sms_template_requests` (deduped via RPC). |
| **G** | Match Bank, Card or Wallet | `StrictAccountMatcher.dart` & `AccountResolver.dart` | **Refine**: Composite match `(Bank + Last4 + InstrumentType)`. |
| **D** | Common Notification Parser | `NotificationParseRules.dart` | **Reuse / Refine**: Standard notification parsing. |
| **D2** | Built-in App Rules | `NotificationParseRules.dart` | **Refine**: App-specific rules for GPay, PhonePe, Paytm, CRED, PayZapp. |
| **MW2**| Money Words Found? (Notif) | `SmsTransactionFilters.statesMoneyMoved()` | **Reuse**: Check if notification states money moved. |
| **UP2**| SMS Detection Pending: Unparsed Notif | `DetectedSmsScreen` pending queue | **Reuse / Wire**: Card in pending review. |
| **X3** | Ignore and Log Reason | `SmsDetectionDebugLog.log()` | **Reuse**. |
| **H** | Account Known? | `BankAllowlistService.evaluate()` | **Reuse**: Check if composite account exists. |
| **I** | SMS Detection Pending: New Account Found | `AccountDiscoveryService.record()` & `pending_account_provider.dart` | **Reuse / Wire**: Grouped card showing "HDFC •••• 1234 · N transactions waiting". |
| **X4** | Ignore All SMS of This Account Number | `ignored_accounts` list | **Refine**: Ignore specific last-4, not entire bank sender. |
| **AT** | Select Account Type (Savings/CC/Wallet) | `account_auto_create.dart` | **Refine**: Pre-select type from SMS keywords ("credit card", "a/c", "wallet"). |
| **AA** | Create Account from Bank Name + Last 4 | `PendingAccountProvider.createAccount()` | **Reuse / Wire**: Adds account to user's accounts box. |
| **RA** | Re-check All Pending SMS of This Account | `discovery_replay.dart` (`reprocessHeldSms`) | **Reuse / Wire**: Replays queued SMS through pipeline. |
| **J** | Cross-Source Duplicate Check | `TxRefKey.dart` & `SmsDedupeRegistry.dart` | **Refine**: Two-tier dedupe. Tier A: `messageHash` (sender + exact body + original timestamp). Tier B: `refKey`/`TxRefKey` + `SmsDedupeRegistry`; the 10-minute no-ref window merge applies ONLY between different source types (SMS vs notification). Two items of the same source type with different messageHashes never merge. |
| **K** | Same Payment Already Recorded? | `TxRefKey.decide()` | **Reuse / Refine**: Identifies duplicate payment across SMS & notification. |
| **L** | Merge Reliable Evidence | `TxRefKeyConflictAction.merge` & `SourceEvidenceStore` | **Refine**: Merge GPay merchant + Bank SMS UTR into single transaction. |
| **M** | Check User Merchant Learning | `MerchantLearningService.dart` | **Reuse**: Lookup in `merchant_rules_box`. |
| **N** | Saved Merchant Rule Found? | `MerchantLearningService.findRule()` | **Reuse**. |
| **O** | Use Saved Merchant Name, Purpose, Category| `MerchantLearningService.apply()` | **Reuse**. |
| **AM** | Merchant in Admin Category List? | `MerchantCategoryEngine.dart` & `merchants_box` | **Reuse**. |
| **AC** | Apply Mobile Default Purpose + Admin Category| `AutoRuleEngine.dart` | **Reuse**. |
| **NR** | SMS Detection Pending: Verify Merchant | `DetectedSmsScreen` & `DetectionPopup` | **Reuse**. |
| **V** | Auto Add Setting ON? | `settings.auto_add` | **Reuse**. |
| **UC** | User Selects Merchant, Purpose, Category | `DetectionPopup` / bottom sheet | **Reuse**. |
| **LM** | Save Merchant Rule for Next Time | `MerchantLearningService.learn()` | **Reuse**. |
| **S** | Add Transaction | `transactionProvider.addTransaction()` | **Reuse**: Central single-writer entrypoint. |
| **SV** | Save or Update Transaction (deduped) | Tier A `messageHash` + Tier B `refKey` / `TxRefKey` / `SmsDedupeRegistry` | **Refine**: No `idempotencyKey`; duplicates are blocked by the two-tier dedupe before insert/update in Hive. |
| **HV** | Encrypted Local Hive | `SecureHive.openBox('transactions')` | **Reuse**. |
| **DQ** | Remove Raw Item from Queue | `NativeQueueClient.ack()` | **Refine**: Ack/remove item only after Hive write succeeds. |
| **UN** | Notify: Added - Undo / Edit | `SmsAutoSaveUndo.dart` & `AppToast` | **Reuse**: Undo snackbar / notification (current window 10 minutes). |
| **CS** | Cloud Sync if Enabled | `SyncService.dart` | **Reuse**: Push transaction fields only (no raw text). |

---

## 4. Old Code to Remove Later (Phase 11 Candidates)

The following files and legacy paths are candidates for removal in Phase 11 after the new flow is validated and passing all tests:
*(Note: `lib/features/sms/v4/bank_sms_template_catalog.dart` / `assets/sms/bank_sms_templates_v4.json` will **NOT** be removed. It is kept permanently as the bundled offline seed for admin templates when cache is empty on fresh installs without internet).*

1. `Mobile app/SpentX/lib/features/sms/detected/detection_queue.dart`: Redundant legacy in-memory deduplication queues replaced by `RawQueueItem` + `TxRefKey`.
2. `Mobile app/SpentX/lib/features/sms/rules/engine/sms_rule_engine.dart` (`_tryRegexRules` function): Unsafe regex guessing that misclassifies transactions.
3. `Mobile app/SpentX/lib/features/sms/detected/sms_pipeline_test_runner.dart`: Legacy scratch testing harness replaced by clean unit test suite.
4. `Mobile app/SpentX/lib/features/sms/rules/sms_template_rules_importer.dart`: One-off manual migration script.

---

## 5. Existing UI Components to Reuse

* **Pending Reviews Screen**: `DetectedSmsScreen` (`lib/features/sms/detected/detected_sms_screen.dart`). Already contains tabbed Soft UI architecture:
  - "To verify" tab (Pending items)
  - "Verified" tab (Confirmed linked transactions)
  - "Ignored" tab (Dismissed items)
* **Bottom Sheet Verification**: `DetectionPopup` (`lib/features/sms/detected/detection_popup.dart`) & `PremiumBottomSheet` (`lib/core/widgets/premium_bottom_sheet.dart`).
* **New Account Card**: `PendingAccountCard` (`lib/features/accounts/presentation/widgets/pending_account_card.dart`).
* **Transaction Detail View**: `TransactionDetailScreen` (`lib/features/transactions/presentation/transaction_detail_screen.dart`).
* **Activity List Badges**: Red `[ 🔴 Failed ]` status badge using `SoftBadge` (`lib/core/theme/soft_palette.dart`).
* **Undo & Toasts**: `AppToast` (`lib/core/widgets/app_toast.dart`) & `SmsAutoSaveUndo` (`lib/features/sms/autosave/sms_auto_save_undo.dart`).
* **Settings & Permissions**: `DetectionPermissionsScreen` (`lib/features/settings/presentation/screens/detection_permissions_screen.dart`) & `NotificationPreferencesScreen`.

---

## 6. Final Allowed Files List

### Files strictly inside `lib/features/sms/`, `lib/features/sms_parser/`, native detection code, or Supabase detection tables:

#### Phase 1 — Data Models & Storage
* `Mobile app/SpentX/lib/features/sms/models/raw_queue_item.dart` *(New — In-memory Dart data class representing items read from the native queue via method channel; NOT a Hive box)*
* `Mobile app/SpentX/lib/features/sms/models/pending_hold.dart` *(New — Wait/pending SMS holding model with 48h expiry)*
* `Mobile app/SpentX/lib/features/sms/models/pending_item.dart` *(New — Typed presentation wrapper for detected_sms_box, pending_accounts, and unparsed SMS; zero new Hive boxes)*
* `Mobile app/SpentX/lib/core/models/merchant_rule.dart` *(Modify / Extend — Auto-add disabled flag)*
* `Mobile app/SpentX/test/detection_v2/phase1_models_test.dart` *(New)*

#### Phase 2 — Intake & Native Queue
**Status: done, pending phone test** (app branch @ `2f0d98a`, see §14).

* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsPendingQueue.kt` *(Modify — Direct reuse and extension of existing Android Keystore AES-256-GCM encrypted queue for raw intake)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsReceiver.kt` *(Modify — Write raw item to encrypted native queue first before any processing)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/NotificationListenerService.kt` *(Modify — Enqueue raw notification to encrypted native queue before event channel broadcast)*
* `Mobile app/SpentX/lib/features/sms/background/native_queue_client.dart` *(Modify — Idempotent queue drainage and retry handling)*
* `Mobile app/SpentX/lib/features/sms/sms_service.dart` *(Modify — Inbound dispatch to queue worker)*
* `Mobile app/SpentX/test/detection_v2/phase2_queue_test.dart` *(New)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/MainActivity.kt` *(Modify, additive — `getInboxSms` keeps `date`, adds `dateSent`)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/BootReceiver.kt` *(Modify — catch-up on BOOT_COMPLETED / USER_UNLOCKED)*
* `Mobile app/SpentX/lib/features/sms/detected/sms_seen_store.dart` *(Modify — `sms_seen_hashes` SecureHive box, bodyKey fallback, pruning)*
* `Mobile app/SpentX/lib/features/sms/models/raw_queue_item.dart` *(Modify — messageHash / bodyKey inputs)*
* `Mobile app/SpentX/lib/features/sms/detected/sms_detection_pipeline.dart` *(Modify — mark hash processed only after save + ack)*
* `Mobile app/SpentX/test/background_single_writer_test.dart` *(Harness fix only)*
* Ask first: `AndroidManifest.xml`, `SmsWorkScheduler.kt`, `lib/features/sms/detected/sms_inbox_catch_up.dart`.

#### Phase 3 — Pre-Parse Filters (Bank SMS)
* `Mobile app/SpentX/lib/features/sms/rules/engine/admin_block_rules_matcher.dart` *(New — Match cached admin block rules + fallback list)*
* `Mobile app/SpentX/lib/features/sms_parser/sms_transaction_filters.dart` *(Modify — Centralized money words & block patterns)*
* `Mobile app/SpentX/lib/features/sms/rules/engine/sms_hold_manager.dart` *(New — Manages 48h pending hold lifecycle)*
* `Mobile app/SpentX/lib/features/sms/detected/sms_detection_pipeline.dart` *(Modify — Pre-parse filter integration)*
* `Mobile app/SpentX/test/detection_v2/phase3_preparse_test.dart` *(New)*

#### Phase 4 — Parsers & Unparsed Handling
* `Mobile app/SpentX/lib/features/sms_parser/sms_parser.dart` *(Modify — Refine Common SMS Parser)*
* `Mobile app/SpentX/lib/features/sms/rules/engine/sms_template_engine.dart` *(Modify — Admin template lookup precedence)*
* `Mobile app/SpentX/lib/features/sms_parser/notification_parse_rules.dart` *(Modify — Common & Built-in App rules)*
* `Mobile app/SpentX/lib/features/sms/core/sms_masker.dart` *(New — Strict masking of account, balance, reference, names)*
* `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` *(New — Opt-in masked template request calling Supabase RPC)*
* `Mobile app/SpentX/test/detection_v2/phase4_parsers_test.dart` *(New)*
* `Mobile app/SpentX/assets/sms/sms_regression_corpus.json` *(Extend — Reuse existing regression corpus)*

#### Phase 5 — Account Matching & Discovery
* `Mobile app/SpentX/lib/features/sms/autosave/strict_account_matcher.dart` *(Modify — Composite bank + last4 + type)*
* `Mobile app/SpentX/test/detection_v2/phase5_account_discovery_test.dart` *(New)*

#### Phase 6 — Duplicate Check & Merge
* `Mobile app/SpentX/lib/features/sms/autosave/sms_dedupe_registry.dart` *(Modify — Cross-source evidence merge)*
* `Mobile app/SpentX/test/detection_v2/phase6_duplicate_merge_test.dart` *(New)*

#### Phase 7 — Merchant Resolution
> **Carry-forward note:** `auto_rule_engine.dart:762` still passes the SMS body to the debug log (it is redacted there). Remove it in Phase 7.

* `Mobile app/SpentX/lib/features/sms/v4/merchant_learning_service.dart` *(Modify — Normalize key & rule lookup)*
* `Mobile app/SpentX/lib/features/sms/autosave/merchant_category_engine.dart` *(Modify — Admin category matching & Separate Income Categories)*
* `Mobile app/SpentX/lib/features/sms/detected/auto_rule_engine.dart` *(Modify — Separate income path & auto-add check)*
* `Mobile app/SpentX/test/detection_v2/phase7_merchant_resolution_test.dart` *(New)*

#### Phase 8 — Save, Cleanup, Notify, Sync
> **Carry-forward from Phase 2: batch flush/ack speed fix (deferred).**
> - Measured (500-SMS burst): S4 `3a1fced` 6.25 s, Phase 1 8.0 s, `0439ab1` 7.96 s, Phase 2 HEAD 7.4–9 s. Each 100-message chunk is slower than the last.
> - Cause, per SMS: a full `transactions['list']` scan, a detected-box (`_findExistingPending`) scan, an encrypted whole-list rewrite, and `SecureHive.flushOpenBoxes` (~19 boxes) plus a native ack. The seen-store itself is small (~50 ms per 500).
> - Why deferred: batching the flush risks a duplicate after a crash (transaction flushed, hash not). The fix needs a design where the transaction itself records its `messageHash`, so a replay finds it in the ledger.

* `Mobile app/SpentX/lib/features/sms/autosave/sms_auto_save_undo.dart` *(Modify — Undo (10-minute window) with financial reversal)*
* `Mobile app/SpentX/test/detection_v2/phase8_save_sync_test.dart` *(New)*

#### Phase 9 — Backend Changes
* `supabase/migrations/20261025000000_detection_v2_schema.sql` *(New — Table `sms_template_requests` with RLS insert-only, version triggers, dedupe RPC `upsert_template_request`. Reuses existing `merchants` and `categories` tables; NO new admin_categories table).*
* `Mobile app/SpentX/test/detection_v2/phase9_backend_rules_test.dart` *(New — Verification test for Supabase rules sync, RLS insert-only template request RPC, and category mappings)*
* `src/app/admin/sms-rules/page.tsx` *(Modify — Web admin portal review UI for pending template requests)*

#### Phase 10 — UI Integration
> **Carry-forward note:** fix the pre-existing failure `test/detected_sms_tabs_test.dart: Ignored ignored item whose SMS was already saved under another id is refused` (see `baseline_failures.txt`).

* `Mobile app/SpentX/lib/features/sms/detected/detected_sms_screen.dart` *(Modify — Pending card hierarchy & badge counts)*
* `Mobile app/SpentX/test/detection_v2/phase10_ui_test.dart` *(New)*

#### Phase 11 & 12 — Cleanup & Final Report
* Dead code removal (approved candidates only).
* `docs/detection_v2/FINAL_REPORT.md` *(New)*

---

### Files OUTSIDE detection directories (with strict 1-line rationale for each):

1. **`Mobile app/SpentX/lib/models/transaction.dart`**  
   *Rationale:* Holds `refKey`, multi-source references (`sources`) and local-only `rawMessage` (encrypted, never synced; read by "View original SMS"). `impactsTotals` is a getter from `Countable.inTotals(this)` and is never written in `toJson()`; failed transactions are excluded via `status = failed`.
2. **`Mobile app/SpentX/lib/models/account_model.dart`**  
   *Rationale:* Real stored Account model (Hive settings box); holds `type`, `last4Digits`, `bankKey`, the `isIgnored` ("Not Mine") flag and a `bankName` getter.
3. **`Mobile app/SpentX/lib/data/local/safe_box_migration.dart`**  
   *Rationale:* Must provide safe Hive migration defaults for existing stored transactions and accounts so no historical user data is corrupted.
4. **`Mobile app/SpentX/lib/core/finance/tx_ref_key.dart`**  
   *Rationale:* Core financial deduplication key used by cross-source duplicate detection to merge GPay notifications with Bank SMS.
5. **`Mobile app/SpentX/lib/core/services/account_discovery_service.dart`**  
   *Rationale:* Manages unknown account discovery requests grouped by bank and last-4 when an SMS arrives from an unmapped account.
6. **`Mobile app/SpentX/lib/features/accounts/data/pending_account_provider.dart`**  
   *Rationale:* Riverpod provider that handles user actions on New Account cards: "Add Account", "Not Mine", and replaying pending SMS.
7. **`Mobile app/SpentX/lib/features/accounts/presentation/widgets/pending_account_card.dart`**  
   *Rationale:* Soft UI card widget for "New Account Found: HDFC •••• 1234 · N transactions waiting" shown on the Pending screen.
8. **`Mobile app/SpentX/lib/core/providers/transaction_provider.dart`**  
   *Rationale:* Single-writer ledger entry point; detected transactions pass the two-tier dedupe (messageHash, then refKey/TxRefKey + SmsDedupeRegistry) before being committed to Hive.
9. **`Mobile app/SpentX/lib/core/sync/sync_service.dart`**  
   *Rationale:* Sync uses a whitelist (`TransactionMap.toRemote` / `AccountMap.toRemote`): never uploads raw SMS text or pending candidates; failed transactions sync with `status = failed`.
10. **`Mobile app/SpentX/lib/features/transactions/presentation/transaction_detail_screen.dart`**  
    *Rationale:* Displays the collapsible "View original SMS / Notification source" section on the transaction details screen.
11. **`Mobile app/SpentX/lib/features/settings/presentation/screens/notification_preferences_screen.dart`**  
    *Rationale:* Settings UI toggles for Auto Add (admin-category merchants) and opt-in consent for masked template requests.

---

## 7. Risks & Mitigations

1. **Google Play SMS & Notification Policy Compliance**:
   - *Risk:* Background SMS or Notification access flagged by Google Play Console during review.
   - *Mitigation:* SpentX already implements `docs/GOOGLE_PLAY_DATA_SAFETY.md` and `docs/GOOGLE_PLAY_SMS_PERMISSION_DECLARATION.md`. All raw SMS/notifications remain encrypted strictly on-device; template requests sent to backend are strictly masked with zero real digits.
2. **Dual-SIM & Last-4 Collisions**:
   - *Risk:* Two different banks or cards having the same last 4 digits (e.g. HDFC 1234 and SBI 1234).
   - *Mitigation:* Composite key `(Bank/Provider + Last4 + InstrumentType)` enforced throughout matching.
3. **Hive Encryption Key Availability on Boot**:
   - *Risk:* Phone boots while locked (Direct Boot / Keystore locked before initial PIN).
   - *Mitigation:* Android native queue (`SmsPendingQueue`) stages raw items in app-private SQLite. Dart processing awaits user unlock when `flutter_secure_storage` key is available.
4. **Data Loss During Crash or App Kill**:
   - *Risk:* App terminated by OS during parser execution.
   - *Mitigation:* Raw item is saved to native queue *before* parsing; item is removed from queue *only after* local Hive transaction save succeeds.

---

## 8. Final Architectural Decisions (Locked)

1. **Notification Failed Status:**  
   **YES.** Save as `TxStatus.failed`, ₹0 impact on totals, budget, and account balance, tagged with a red `[ 🔴 Failed ]` badge in the Activity feed. Treated identically to failed Bank SMS.
2. **Credits / Income (Separate Path):**  
   - Credits follow the same pipeline until Duplicate Check (Queue ➔ Filters ➔ Parsers ➔ Account Match ➔ Duplicate Check).
   - In the merchant step, credits use **Income categories only** (`Salary`, `Refund`, `Cashback`, `Interest`, `Transfer In`, `Other Income`). Never expense categories.
   - Saved rule for the same payer ➔ auto-add. Unknown payer ➔ Verify pending card.
   - Refund / Reversal: If the original debit can be matched (same account, amount, merchant, within 30 days), link it to the original; do not count it as income.
3. **Notification Unparsed ➔ Admin Request:**  
   **NO.** Only Bank SMS sends masked template requests. Notifications rely strictly on built-in app rules and common notification patterns.
4. **Backend Architecture & Supabase Direct Integration:**  
   **YES.** App syncs rules directly from Supabase tables with RLS.
   - Enable RLS on every new table.
   - Table `sms_template_requests`: App users can `INSERT` only (no read, update, or delete). Deduplicated by `format_hash` with an incremental counter via PostgreSQL RPC function `upsert_template_request` called directly by mobile. No Next.js ingest proxy route needed.
   - Tables `sms_block_rules`, `sms_template_rules`: App users can `SELECT` only. Admin role only can write.
   - Categories and Merchants: Reuse existing `categories` and `merchants` tables. No new `admin_categories` table is created.
   - Never store raw SMS text in any database table.
   - Add migrations strictly as new timestamped `.sql` files in `supabase/migrations/`.
5. **Pending Hold Expiry:**  
   **48 Hours** configured default timeout for pending/wait SMS holds.
6. **Sync Rules for Failed & Raw Data:**  
   Failed transactions **MUST sync** to Supabase with `status = failed` (`impactsTotals` is a derived getter, not a stored or synced column). Only raw SMS text and unverified pending detection candidates are kept strictly local on-device and never sync.
7. **Additive-Only Modifications:**  
   All changes to `lib/models/transaction.dart`, `account_model.dart`, `transaction_provider.dart`, `sync_service.dart`, `tx_ref_key.dart`, and `transaction_detail_screen.dart` must be strictly ADDITIVE ONLY.

---

## 9. Baseline Test Results (Post-Phase 0.5 Test Harness Fixes)

* **Command Run:** `flutter test` across all 88 test files in `Mobile app/SpentX/test/`.
* **Total Tests Executed:** 1,030 tests
* **Total Passed:** 1,022 tests (**99.2% pass rate**, up from 954 — net **+68 tests fixed**)
* **Total Remaining Failures:** Exactly 8 failures across 5 files (cataloged in [`docs/detection_v2/baseline_failures.txt`](file:///Users/karthi/Documents/SpentX%20Web/spentx-web%20copy%203/docs/detection_v2/baseline_failures.txt))

### Exact List of Pre-Existing Failures (Baseline Guard):

1. `test/sms_detection_fixes_test.dart: UPI debits Axis UPI is Axis`  
   *Failure:* Expected `'Axis'`, Actual `'PaytmPaymentsBank'`.  
   *Root Cause:* Pre-existing app parser bug on `main` where Paytm Payments Bank keyword in `UPI/P2M/.../PAYTM` matches before `Axis`.
2. `test/mobile_ui_consistency_test.dart: dark: Add Template page follows theme`  
   *Failure:* Widget finder assertion on template creation page.  
   *Root Cause:* Outside detection scope; UI layout assertion.
3. `test/mobile_ui_consistency_test.dart: light: Add Template page follows theme`  
   *Failure:* Widget finder assertion on template creation page.  
   *Root Cause:* Outside detection scope; UI layout assertion.
4. `test/mobile_ui_consistency_test.dart: secondary pages retain the same navigation destinations on narrow screens`  
   *Failure:* Navigation bar item assertion.  
   *Root Cause:* Outside detection scope; UI layout assertion.
5. `test/phase2_parsing_test.dart: regression: HDFC old, modified, unknown; SBI, ICICI, Axis SBI, ICICI and Axis parse with no review reason`  
   *Failure:* Expected `'Axis'`, Actual `'PaytmPaymentsBank'`.  
   *Root Cause:* Same pre-existing app parser bug on `main` as #1.
6. `test/sms_regression_corpus_test.dart: mustDetect — every real message matches a NAMED template`  
   *Failure:* Expected all 30 real bank messages to match a named template.  
   *Root Cause:* 14 real bank messages match `UniversalSmsParser` before `BankSmsV4Parser` due to rule engine precedence on `main`. Real message detection passes 30/30, and mustNotDetect passes 20/20.
7. `test/background_single_writer_test.dart: 500-SMS burst through native batches: every one saved once`  
   *Failure:* `TimeoutException after 0:00:30.000000` (timed out after 30s processing 500 AES-encrypted records in single-thread test runner).  
   *Root Cause:* Test execution timeout in CLI test harness.
8. `test/background_single_writer_test.dart: worker yields to the app: stops after the current item`  
   *Failure:* Expected `<2>`, Actual `<4>`.  
   *Root Cause:* Asynchronous task scheduling race in test environment.

> **Strict Baseline Guard Rule:** Any failing test NOT in `docs/detection_v2/baseline_failures.txt` is considered a NEW failure and must be fixed immediately.

---

## 10. Itemized Phase 0 Review Clarifications

### 1. Transaction Model Confirmation
- **Stored Model:** **`lib/models/transaction.dart`** is the active model stored by Hive (serialized as JSON maps in `Hive.box('transactions').get('list')`). It is imported and used by `TransactionProvider`, `TransactionRepository`, `SyncService`, `AutoRuleEngine`, `DetectedSmsScreen`, and the rest of the application.
- **Unused Prototype:** `lib/features/transactions/domain/transaction_model.dart` declares `@HiveType(typeId: 1)` but its adapter is never registered. It is an unused legacy prototype.
- **Allowed Files Enforcement:** ONLY `lib/models/transaction.dart` receives additive fields (`refKey`, `sources`). No `idempotencyKey`; `impactsTotals` is a getter, never stored.

### 2. Native Queue Encryption & Direct Boot
- **Storage & Encryption:** In `SmsPendingQueue.kt` and `SecureQueueStore.kt`, queue records are stored in `SharedPreferences` (`spentx_secure_sms_queue_v1`) **encrypted at rest with AES-256-GCM** under Android Keystore alias `"spentx_queue_aes_v1"`. It is NOT stored in plain text.
- **Direct Boot (Before First Unlock):** In `AndroidManifest.xml`, neither `SmsReceiver` nor `SpentXNotificationListener` declare `android:directBootAware="true"`. Under Android OS security architecture, broadcasts are queued by the OS Telephony provider and delivered *after* first user unlock (`BOOT_COMPLETED`), when Android Keystore credential storage is available. No unencrypted or failing reads occur before first unlock.

### 3. Phase 0.5 Test Harness Fixes
- **Strict Scope:** TEST FILES ONLY were modified (`test/*`). Zero changes to `lib/`.
- **Harness Fixes Applied:**
  - Mocked `plugins.flutter.io/path_provider` channel so `MasterDebugLog` and `SecureHive` resolve temp directories in tests.
  - Initialized `TestWidgetsFlutterBinding.ensureInitialized()` where missing.
  - Configured `SecureHive.debugConfigure()` with a test cipher and isolated temp directory in `setUpAll` and reset in `tearDownAll`.
  - Cleared `merchant_rules_box` between tests in `sms_auto_save_test.dart`.
- **Result:** Passing test count jumped from 954 to **1,022 passed** (+68 tests fixed). All real app parsing/behavioral bugs were left untouched and cataloged.

### 4. Baseline Guard by Test Name
- Exact list of 8 pre-existing failing tests saved to `docs/detection_v2/baseline_failures.txt`.

### 5. RawQueueItem Confirmation
- `RawQueueItem` is strictly an in-memory Dart data class representing items read from the native queue via `MethodChannel('com.spentx.app/detection')`. It is **NOT** a second Hive box or persistent queue.

### 6. Bundled v4 Catalog Retention
- `lib/features/sms/v4/bank_sms_template_catalog.dart` and `assets/sms/bank_sms_templates_v4.json` (both paths verified present at `ce003bd`) are **KEPT** permanently as the offline seed when cache is empty (fresh installs, no network). It has been removed from the Phase 11 deletion candidates.

### 7. Backend Direct Integration
- Next.js has NO API routes for block rules, templates, or categories. The Flutter app interacts directly with Supabase tables (`sms_block_rules`, `sms_template_rules`, `merchants`, `categories`) via `SmsRulesRefreshService.dart`.
- Template requests will use Supabase RPC `upsert_template_request` directly with RLS insert-only. No Next.js ingest proxy is built.
- No new `admin_categories` table will be created; existing `categories` and `merchants` tables are reused.
- `Mobile app/SpentX/test/detection_v2/phase9_backend_rules_test.dart` added to Allowed Files List.

### 8. Sync Rules
- Failed transactions (`status = failed`) **MUST sync** to Supabase via the `toRemote` whitelist.
- Only raw SMS text and unverified pending detection candidates are kept strictly local on-device and never sync.

### 9. Existing Detection Gates
- If `settings.auto_detection == false` or `AuthService.isSignedIn == false`:
  - `SmsPendingQueue.peek()` returns an empty list, keeping raw items safely buffered in the native queue.
  - `NativeQueueClient` checks `SmsDetectionSettings.detectEnabled` and session user. If either gate is closed, pending items are neither processed nor acknowledged, preventing silent drops.

### 10. Additive-Only Changes
- All edits to `lib/models/transaction.dart`, `account_model.dart`, `transaction_provider.dart`, `sync_service.dart`, `tx_ref_key.dart`, and `transaction_detail_screen.dart` will be strictly ADDITIVE ONLY.

### 11. Fixtures Reuse
- Reusing and extending existing regression corpus at `Mobile app/SpentX/assets/sms/sms_regression_corpus.json` (and `assets/Mobile App Account Creation Corpus.json`). No redundant fixture folders created.

---

## 11. Phase 1 Execution & Master Prompt Additions

### 1. Phase 1 Execution Summary
- **Item A — Stored Account Model Check:** Confirmed that `lib/models/account_model.dart` (`AccountModel`) is the real stored account model (persisted as JSON in `Hive.box('settings').get('onboardingAccounts')`). `lib/features/accounts/domain/account_model.dart` is an unused legacy prototype with no registered Hive adapter.
- **Item B — Zero New Hive Boxes for Pending Items:** Implemented `lib/features/sms/models/pending_item.dart` as a pure domain/presentation wrapper around existing `detected_sms_box` records (`PendingTransaction`), `pending_accounts` (`PendingAccount`), and unparsed template request candidates. Zero new Hive boxes created.
- **Model Additions Implemented (Strictly Additive):**
  - `Transaction` (`lib/models/transaction.dart`): Added `sources` (`List<String>`) alongside `refKey`. **Superseded:** the earlier `idempotencyKey` field was removed, and `impactsTotals` is now a getter (`Countable.inTotals(this)`) that is never written in `toJson()`.
  - `AccountModel` (`lib/models/account_model.dart`): Added `isIgnored` (`bool`, default `false`). Updated constructor, `toJson()`, `fromJson()`, and `copyWith()`.
  - `MerchantRule` (`lib/core/models/merchant_rule.dart`): Added `autoAddDisabled` (`bool`, default `false`). Updated constructor, `toMap()`, `fromMap()`, and `copyWith()`.
  - `RawQueueItem` (`lib/features/sms/models/raw_queue_item.dart`): In-memory Dart data class representing native queue items with `userId`, `attempts`, `lastAttemptAt`, and auto-derived `isNotification`.
  - `PendingHold` (`lib/features/sms/models/pending_hold.dart`): Wait/pending message model with 48h expiration (`isExpired` calculation).
- **Test Suite Verification:**
  - `test/detection_v2/phase1_models_test.dart`: 18 tests created and passing (100% pass).
  - Foundation and regression tests (`phase0_data_foundations_test`, `phase0_legacy_compat_test`, `phase0_legacy_totals_test`, `pending_account_test`, `pending_sms_owner_test`): all passing.

### 2. Additions Confirmed for Phase 2 (Intake & Native Queue)
- **Item C — Direct Boot Catch-up Scan & Permission Verification:**
  - Non-directBootAware receivers do not receive broadcasts before first unlock, and broadcasts are missed when force-stopped.
  - Add native catch-up scan on `BOOT_COMPLETED` / `USER_UNLOCKED` and on app open, querying telephony inbox SMS newer than the native last-processed timestamp.
  - Cross-source deduplication prevents duplicate adds.
  - On notification listener connect, inspect `getActiveNotifications()` for user-selected financial apps.
  - *Permission confirmation:* Verified that `<uses-permission android:name="android.permission.READ_SMS"/>` is already declared in `Mobile app/SpentX/android/app/src/main/AndroidManifest.xml` (line 5) and documented in `docs/GOOGLE_PLAY_SMS_PERMISSION_DECLARATION.md` and `docs/PRIVACY_POLICY.md`.
- **Item D — Queue Gates and User Safety:**
  - Detection OFF gate: Receiver does not enqueue new items; existing items are purged.
  - Signed-out buffer: Max 7 days or 500 items ring buffer, oldest dropped first.
  - Per-item User Scoping: Every queue item stores the `userId` it was captured for. On sign-out, purge the queue. Never process items into a different user's account.
- **Item E — Benchmark & Harness Fix:**
  - Fix `background_single_writer_test.dart` harness (fake async / proper timeout) before modifying queue code.
  - Measure 500-SMS processing time on device/emulator and report metrics.

### 3. Additions Confirmed for Phase 4 (Parsers & Unparsed Handling)
- **Item F — Axis vs PaytmPaymentsBank Parser Bug:**
  - Fix Axis Bank parser regex precedence conflict where Paytm keywords preempt Axis.
  - Remove both related tests from `baseline_failures.txt` once verified passing.
- **Item G — Proposed Replacement Assertion for `sms_regression_corpus_test`:**
  - Replacement proposal: Verify that every `mustDetect` message resolves the correct `amount`, `type`, `accountLast4`, and `bank` without hardcoding specific legacy template names. Proposal will be submitted for user review and approval before touching the test.

### 4. Additions Confirmed for Phase 8 / 9 (Backend & Sync)
- **Item H — Supabase Schema & Legacy Compatibility Check:**
  - Verify Supabase `transactions` table schema for the `status` column (safe default `status = 'success'` in a new migration if missing). There is no `impactsTotals` column: it is derived on-device from `status`.
  - Verify older app version behavior for synced failed transactions before enabling sync of failed records.

---

## 12. Locked Decisions Alignment (handover Section 4)

- **Real models:** `lib/models/transaction.dart` and `lib/models/account_model.dart`. The `lib/features/*/domain` copies are unused prototypes.
- **No `idempotencyKey`.** It was removed. Any earlier text in this file that mentions it is superseded.
- **Two-tier dedupe:**
  - Tier A: `messageHash` = hash(sender + exact body + original timestamp). Stops the same message being processed twice.
  - Tier B: `refKey` / `TxRefKey` + `SmsDedupeRegistry`. The 10-minute no-ref window merge applies ONLY between different source types. Two SMS (or two notifications) with different messageHashes never merge.
- **`impactsTotals`** is a getter from `Countable.inTotals(this)` and is never written in `toJson()` or synced.
- **`AccountModel`:** `type`, `last4Digits`, `bankKey`, `isIgnored`, and a `bankName` getter.
- **`MerchantRule.autoAddDisabled`.**
- **`PendingHold`** is stored in the settings key `pending_sms_holds` (48h expiry).
- **`PendingItem` and `RawQueueItem`** are in-memory only. No new Hive box for them.
- **"View original SMS"** reads `Transaction.rawMessage` (local, encrypted, never synced).
- **Sync** uses a whitelist: `TransactionMap.toRemote` / `AccountMap.toRemote`.
- **Product decisions:**
  1. A failed notification is treated like a failed SMS (₹0 impact, red badge).
  2. Credits use income categories only. A refund is linked to the original debit within 30 days.
  3. Only bank SMS send masked template requests.
  4. RPC `upsert_template_request`, insert-only RLS, dedupe by `format_hash`. No Next.js route. Reuse the existing `merchants` and `categories` tables. New migrations go in new `.sql` files.
  5. 48h hold.
  6. Failed transactions sync. Raw and pending items don't.
  7. The v4 catalog is kept as the offline seed.
- **Phase 2 queue rules:**
  - Store `userId` on every item, plus `lastSignedInUserId`.
  - Purge on sign-out. Unowned items: max 7 days / 500.
  - Detection OFF: purge, and don't enqueue.
  - Catch-up starts from the time detection was re-enabled.
  - Parked items (5 attempts) become an Unparsed card; purge after 30 days.
  - Stuck-processing recovery uses a lease/heartbeat.
  - Ack only after a successful save (`SecureHive.flushOpenBoxes`).
  - Catch-up runs on BOOT_COMPLETED / USER_UNLOCKED, and `getActiveNotifications()` runs when the listener connects.
- **Different user signs in (decided 2026-10-25):**
  - Clear the native queue (`claimSignedOut` on a user change) and the Dart pending holds (`pending_sms_holds`, they hold the old user's payment data).
  - Keep the seen hashes, so SMS already processed for the old user are not re-imported into the new account.
  - Catch-up for the new user starts at their sign-in time.
  - Same user signing in again keeps everything. Implemented in `SmsService.applySessionOwner` (owner kept in the `sms_seen_hashes` box, which survives the sign-out wipe).

## 13. Branch History (2026-10-24)

- **What happened (≈21:22 IST):** the local app branch `feature/smart-detection-flow-v2` was accidentally renamed to `main`. It was then pushed as the first push to the newly created `spentx-app` GitHub repo. Nothing was overwritten.
- **Restored, with Karthi's approval:**
  - `main` → `00a2f1e` (the previous local main, from the reflog). Pushed with force-with-lease; local `main` tracks `origin/main`.
  - `feature/smart-detection-flow-v2` → `ce003bd` (the last Detection v2 commit). Pushed with force-with-lease.
  - `wip/mixed-fc0efd1` preserves `fc0efd1` ("feat: implement fluid motion system and encrypted backup features": 66 files). It mixes:
    - motion work
    - encrypted backup (`file_picker`)
    - `sync_service` / `supabase_schema_map` changes
    - unapproved detection changes, including `sms_rule_engine` dropping the v4 bundled step

    Karthi will sort this out separately. Nothing from it is on the feature branch.
- **Feature branch base:** `ce003bd` sits on top of `sms-template` (`f672ffd`) and the motion commits. Merge `sms-template` into `main` BEFORE this branch.
- **Known issue at `ce003bd`:** it does not compile. `f672ffd` references `TemplateFieldType.dateTime`, but that constant was only added later in `fc0efd1` (`sms_template_rule.dart`). 52 test files fail to load. It needs a small additive fix (approval pending).
- **Docs repo:** `feature/smart-detection-flow-v2` was branched from `main` `7737853`. Docs main was not changed.

## 14. Phase 2 Status (2026-10-25)

- **Status:** done, pending phone test. Phase 3 not started.
- **App branch** `feature/smart-detection-flow-v2` commits after the Phase 2 base: `4408a10`, `73b3927`, `e5b06f1`, `4df0f61`, `5f69abd` (test date relative to now), `432ff54` (different-user sign-in), `2f0d98a` (logs: error type only, no payee/merchant names).
- **Tests:** 1052 total, 1051 pass, 1 pre-existing failure (`detected_sms_tabs_test`, Phase 10).
- **Known gap:** after a sign-out wipe, the same user signing in again can get an older start date back from `DeviceUserState`. The 3-day catch-up lookback and the kept seen hashes limit the effect.

## 15. Phase 3 Status (2026-10-25)

- **Status:** done, pending phone test. Phase 4 not started.
- **App commits:** `29e6166` (SmsHoldConfig 48h + SmsHoldManager), `9695d29` (user vs admin block rules, appliesToNotifications), `2ced94a` (Transaction.isFailed + red Failed badge), `0972ec4` (pipeline order), `4be2304` (notification paths skip unflagged admin rows), `fad98e9` (phase3_preparse_test).
- **Order now:** user block rules → admin block rules (SMS only, unless `applies_to_notifications`) → pending hold / close / expire → existing money-words check and parsers (unchanged).
- **Pending holds:** hidden for 48h (`SmsHoldConfig`). They close on a matching final message (same ref, or amount + window + account/bank). Expired holds go to Needs Review when the next message arrives.
- **SQL (not run, Karthi runs it):** `supabase/migrations/20261025120000_p3_block_rules_notifications.sql` adds `sms_block_rules.applies_to_notifications boolean not null default false`.
- **Offline check:** a test proves OTP and promo SMS are still blocked by the built-in list when the admin cache is empty.
- **Tests:** 1086 total, 1084 pass, 1 skipped, 1 pre-existing failure (`detected_sms_tabs_test`, Phase 10).
- **Superseded:** §8.6 / §10.8 ("failed transactions must sync") is superseded by Karthi's Phase 3 answer: failed transactions stay on the phone only, until Phase 9.
- **Blockers (need approval of files outside Phase 3):**
  1. `lib/core/sync/sync_service.dart`: needed to keep failed rows local. Change: skip `status == 'failed'` in `queueTransactionUpsert` and in the `requeueAllLocalDataAndPush` loop, and keep local failed rows during the reconcile merge. Until then, failed SMS stay on the Phase 2 Needs Review path, with no ledger save and no auto-save.
  2. `lib/features/sms_parser/sms_non_transaction_rules.dart`: the existing money-words check still applies admin regex rows to notifications. It needs an `isNotification` flag that skips admin rows without `applies_to_notifications`. One test is skipped for this.
- **Phase 9 note:** fix the website `src/lib/transaction-summary.ts` to exclude failed/pending, then enable sync of failed transactions.

## 16. Phase 3 Pending-Confirmation Design (2026-10-25)

Approved by Karthi (steps 1-8, all answers "A"). Supersedes the 48h hidden hold in §15.

- **App commits:** `f648331` (48h hold removed; a pending SMS is a quiet To-verify card; leftover `pending_sms_holds` drained once), `628536e` (sync: failed rows stay local unless already synced or queued), `05d15d6` (non-transaction rules: admin rows apply to notifications only when `applies_to_notifications`; test un-skipped), `3253310` (`PendingConfirmationMatcher`), `08d3b62` (`saveFailedLocal`, `setSmsTxStatus`; failed rows never block a retry), `2ae7707` (pipeline routes the bank's final SMS to its pending item), `76e2f83` (Detected SMS amber chip + confirm line).
- **Deleted:** `sms_hold_manager.dart`. **Reverted:** `pending_hold.dart`.
- **Pending card:** a pending SMS becomes ONE card in Detected SMS → To verify, with an amber "Waiting for bank confirmation" chip. No popup, no notification. Verify shows "Saved as Pending · ₹0 until the bank confirms".
- **Matching (1-A):** reference number first (within 7 days); otherwise same account (last4/card), exact amount, same direction, within 72h (the final SMS may be up to 10 min earlier). No account (notifications show "Unknown") or more than one match: never guess, the normal card path runs.
- **Final success (2-A):** a verified pending row is set to Success. An unverified card is replaced through the normal rules (known merchant auto-adds; otherwise it stays one card).
- **Final failed (3-A):** a verified row is set to Failed on the phone AND in the cloud (exception to "failed stays local"). A failed row is pushed only if it already has a remoteId or is queued; a new failed row stays on the phone. Failed SMS are saved as ₹0 rows with a red Failed badge even with auto-save OFF, with no popup and no "Added" notification.
- **Ignored pending (5-A):** a later success SMS creates a NEW quiet card; the ignored record's status is updated so a second final message does not open another card.
- **Phase 9 note:** the website (`src/lib/transaction-summary.ts`) still counts failed/pending rows in totals until Phase 9.
- **SQL:** unchanged; `20261025120000_p3_block_rules_notifications.sql` is still not run (Karthi runs it).
- **Tests:** 1118 total, 1117 pass, 0 skipped, 1 pre-existing failure (`detected_sms_tabs_test`, Phase 10).
- **Risks:**
  1. A bank SMS changes an already saved transaction's status (pending → success/failed).
  2. A pending SMS with no account and no reference never matches; notifications carry no account, so they rely on the reference.
  3. History import counts a Failed save as "added"; the Detection Lab labels it "Auto-added".
  4. A replaced unverified card loses the title/category typed on it.
  5. A reference matching two booked rows is treated as a duplicate (nothing changes).
  6. Callers outside the approved files (e.g. `detection_queue.dart`) do not show the new chip/badges.

## 17. Phase 4 Status (2026-10-25)

- **Status:** done, pending phone test. Phase 5 not started.
- **Choices (Karthi, t485u):** parser order and the named corpus test kept, plus a new field-level test (Item G, option B); template-request sending OFF until the Phase 9 SQL; the notification fall-through is kept; the money-words check still applies to fallback/universal results and to account discovery; template requests are internal and masked only (no settings UI); a tagged Unparsed card is read again through the pipeline; app rules were written conservatively from public formats.
- **App commits:**
  - `5c7f3e3`: `SmsMasker`. It masks account, balance, amount, ref, UPI, URL, name, date and time, and turns any digit left over into `#`. It also gives a `formatHash`.
  - `e995924`: `TemplateRequestService`. It keeps a local masked outbox (settings key `template_request_outbox`, max 50, deduped by hash, owner uid stored). `sendingEnabled = false`.
  - `b1d05f7`: built-in app notification rules for GPay, PhonePe, Paytm, CRED and PayZapp. Each app's rules apply only to that app, and only after the common rules.
  - `db26431`: pipeline changes:
    - After the parse, the money-words check applies to discovery and to non-strict layers. Strict layers are `v4_template`, `template`, `regex_rule` and `notification_rule`.
    - A bank SMS with money words that nothing could read, or that only the fallback read, asks for a template (local outbox only).
    - Notifications never ask for a template.
  - `d0cbd32`: the engine fills the payee from `UPI/P2M|P2A/<ref>/<name>`, only when the name is empty or Unknown. Corpus `fieldCases` were added, with a field-level test.
  - `4323173`: Detected SMS gets an "Unparsed · tap to tag" chip:
    - Tapping a bank SMS card opens the template creator. After the template is saved, the SMS is read again through the pipeline.
    - The old card is removed only when the pipeline took the SMS (auto-added, filed again, account discovery, or already recorded). Otherwise it is put back unchanged.
    - Cards with no bank or no text open the normal review.
- **Real samples needed:** the app notification rules (GPay, PhonePe, Paytm, CRED, PayZapp) come from public formats, not real notifications. Collect real samples on the phone before trusting them.
- **Phase 9 SQL needed (not written, not run):** table `sms_template_requests` (format_hash unique, masked_text, bank, sender, count, first/last seen, RLS insert-only for the owner), plus RPC `upsert_template_request(p_format_hash, p_masked_text, p_bank, p_sender, p_count)`. Sending stays OFF until Karthi runs it.
- **Tests:** 1151 total, 1150 pass, 0 skipped, 1 pre-existing failure (`detected_sms_tabs_test`, Phase 10). There are 33 new tests: masker 5, template request 5, parsers + pipeline 14, field cases 1, Unparsed UI 8. `test/detection_v2/phase4_template_request_test.dart` is an extra test-only file that was not on the approved list.
- **Risks:**
  1. SMS read by a strict layer are now trusted without money words. Before, the money-words check ran before every parse.
  2. Template requests stay on the phone until Phase 9; the outbox drops the oldest entries past 50.
  3. The app notification rules are unverified against real notifications.
  4. The payee fill is narrow (Axis-style `UPI/P2M|P2A/` only).
  5. The read-again path uses the `accountReplay` source, so it skips the seen-store dedupe. It relies on the ledger/card dedupe instead, and it carries no sender (the card does not store one).
  6. An Unparsed card is judged a bank SMS by its bank name. A notification card with a bank name would open the template creator.

## 18. Phase 5: Accounts (kinds, Not Mine, new-account notification)
- **Status:** done. Emulator: launch only (sign-in needs a phone OTP).
- **Outer:** `de554d3`, migration `20261025150000_p5_account_bank_subtype.sql`. It is additive and has not been run.
- **App:**
  - `1fe0aee`: Savings, Current, Credit card and Wallet account kinds, stored in `bank_subtype`. An old Bank account reads as Savings.
  - `790794b`: Not Mine hides account cards (restorable). Add re-checks that account's pending SMS.
  - `6a27696`: the "New <Bank> account ••1234 found" notification (Add / Not Mine). The cross-source merge fills only empty evidence.

## 19. Phase 6: Save, refund link, notifications
- **Status:** done.
- **App:**
  - `b011468`: a refund links to its purchase within 30 days (reference first, else one unique same-merchant match). Credit SMS get income categories.
  - `c68d11f`: the Added notification "Added ₹X Merchant" with Edit and Undo, and a per-item Verify "Detected ₹X on Merchant".
  - `290e057`: ledger dedupe by messageHash (release rows keep only the hash), Added headline wiring, and the Phase 6 tests.

## 20. Phase 7: Web, template requests, badges, cleanup, and the final check
- **Outer:**
  - `ceda50e`: the web summary counts only confirmed transactions.
  - `241ad31`: migration `20261025170000_p7_sms_template_requests.sql` (not run).
  - `e7cbded`: the admin Template Requests page, plus an "also block notifications" toggle on block rules.
- **App:**
  - `5fad2a3`: masked template requests are sent through the RPC on sign-in. Sending stops at the first failure and retries on the next start.
  - `6698a85`: Verify refuses to save an SMS that is already in the ledger, even after the 14-day registry forgets it. This fixes the baseline `detected_sms_tabs` failure.
  - `df4b9e5`: amber Pending and red Failed badges (tile, account detail, home, transactions, detail, SMS Activity, Lab), plus popup state pills.
  - `0b2e143`: removed 13 unreferenced legacy files. Nothing imported or routed to them, and no test used them. `/sms-activity` routes to DetectedSmsScreen.
  - `0be74ad`: the Phase 7 tests, including a guard that fails if any log line includes the raw SMS.
  - `0b77b09` (final check):
    - Editing an account keeps its own type. Before, it was forced to Bank.
    - The fallback parser no longer takes "with Rs…" as the payee.
- **Tests:** 1178 total, 1178 pass, 0 fail.
- **Analyze:** 21 info-level issues, all pre-existing. No warnings, no errors.
- **Web:** `npm test` and tsc both pass.
- **Parser check:** 202 of 272 agree with the Python reference.
- **Emulator (emulator-5554):**
  - 11 SMS injected (success, refund, pending→success, pending→failed, failed, OTP, promo, unknown account, duplicate). No raw text appears in logcat.
  - The app is signed out, so it does not process SMS (by design). The in-app scenarios still need the real phone.
  - Launch, Log in and Create account screens render. FLAG_SECURE is on.
  - A debug cold start takes about 90s on the emulator. Taps during the splash cause an "Input dispatching timed out (no focused window)" ANR.

## 21. Oct-30 decisions (committed in `03bdb61` on `onboarding-flow`)
- **Unmatched SMS:** the non-transaction, statement and money filters run first. After that, a fallback read with an amount and a saved account gets a "please confirm" card (`fallback_confirm`). Anything else that states money gets an Unparsed card. Nothing that states money is dropped silently.
- **Template requests:** opt-in, default OFF. There is a one-time Share/No ask on Unparsed and please-confirm cards, plus a Settings toggle ("Help improve SMS reading"). Nothing is queued or sent while it is OFF.
- **Dedupe:**
  - Ref and message-hash duplicates are still caught.
  - Two events from the same source (SMS+SMS or notification+notification) are never merged by the time window, so two ₹10 SMS 2 min apart give 2 transactions.
  - The window applies only to SMS + notification.
- **Auto-add:**
  - A saved merchant auto-adds even when Auto Add is OFF.
  - An admin category auto-adds only when the setting is ON.
  - An unknown merchant goes to Verify.
  - A Swiggy detection that is complete (account last-4 matched) auto-adds.
- **Category order:** saved choice → description words → admin brand → Needs category.
- **Toast:** "Added · Undo · Edit".
- **Lock screen:** the new-account notification uses private visibility. The public (lock-screen) title is "New account detected — Tap to verify", with no bank, digits, or amount.
- **Wallet top-up:**
  - An explicit top-up bank debit becomes a bank→wallet transfer. An unsaved wallet gets a Verify card on Transfer.
  - "At PAYZAPPW" keeps the Yes/No ask.
  - A wallet credit with added/loaded/top-up words is never income on its own:
    - with a matching bank debit, it merges;
    - otherwise it gets a pending card: "₹X added to WALLET. From which account?" with account buttons plus "Someone sent it to me (income)";
    - a bank debit that arrives later auto-merges with that card.
  - "Received from" is income. Cashback is income with category Cashback. The wallet is never the FROM account of a credit.
- **Tests:** `test/detection_decisions_oct30_test.dart`. Two older expectations were updated to these rules: a non-money parked SMS is ignored (`parseFailed`, no card), and "added to your Paytm Wallet" with no bank SMS is the "From which account?" card, not account discovery.
- **Suite:** `flutter analyze` clean. Full `flutter test` on this commit: 1605 passed, 2 failed. Both failures are the 500-SMS burst timing out at 30s during a parallel run; `test/background_single_writer_test.dart` passes on its own (22). `detected_sms_tabs_test` passes. See `baseline_failures.txt`.

## Phase 9 (planned): template category
- Admin templates carry an optional category. Order of precedence: the user's saved choice, then description words, then the template category, then the admin brand.

## Future features
- **Crowd category learning:**
  - Opt-in. Shares only the business merchant name and the chosen category, never the SMS, amount or account.
  - When 20+ users agree at 80%+, the pair appears on an admin "Category suggestions" page. Admin approval adds it to the brand list.
  - The user's own saved choice always wins.
