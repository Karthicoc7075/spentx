# SpentX Smart Detection Flow v2 — Architectural Audit & Discovery Report

> **Date:** October 24, 2026  
> **Branch:** `feature/smart-detection-flow-v2`  
> **Status:** Phase 0 Complete — Approved with Finalized Decisions & Baseline Test Results  
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
| **Real Transaction Model** | **`lib/models/transaction.dart`** is the active model stored by Hive (as serialized JSON in `Hive.box('transactions').get('list')`) and used across `TransactionProvider`, `SyncService`, and UI. Only this file receives additive fields (`idempotencyKey`, `sources`, `impactsTotals`).<br>*(Note: `lib/features/transactions/domain/transaction_model.dart` has `@HiveType(typeId: 1)` but its adapter is never registered; it is an unused legacy prototype).* |
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
   - Background: Auto-add known merchants + post system notification with 5s Undo; post verify notification for unknown.
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
| **FL** | Save as Failed: Red Badge, ₹0 Impact | `TxStatus.failed`, `Countable.inTotals = false` | **Wire / Formalize**: Saved to ledger with `impactsTotals = false`, red badge in activity. |
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
| **J** | Cross-Source Duplicate Check | `TxRefKey.dart` & `SmsDedupeRegistry.dart` | **Refine**: Compare reference ID or 10-minute time window. |
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
| **SV** | Save or Update Transaction with Idempotency Key | `idempotencyKey` / `TxRefKey` | **Refine**: Enforce idempotent insert/update in Hive. |
| **HV** | Encrypted Local Hive | `SecureHive.openBox('transactions')` | **Reuse**. |
| **DQ** | Remove Raw Item from Queue | `NativeQueueClient.ack()` | **Refine**: Ack/remove item only after Hive write succeeds. |
| **UN** | Notify: Added - Undo / Edit | `SmsAutoSaveUndo.dart` & `AppToast` | **Reuse**: 5s Undo snackbar / notification. |
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
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsPendingQueue.kt` *(Modify — Direct reuse and extension of existing Android Keystore AES-256-GCM encrypted queue for raw intake)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsReceiver.kt` *(Modify — Write raw item to encrypted native queue first before any processing)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/NotificationListenerService.kt` *(Modify — Enqueue raw notification to encrypted native queue before event channel broadcast)*
* `Mobile app/SpentX/lib/features/sms/background/native_queue_client.dart` *(Modify — Idempotent queue drainage and retry handling)*
* `Mobile app/SpentX/lib/features/sms/sms_service.dart` *(Modify — Inbound dispatch to queue worker)*
* `Mobile app/SpentX/test/detection_v2/phase2_queue_test.dart` *(New)*

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
* `Mobile app/SpentX/lib/features/sms/v4/merchant_learning_service.dart` *(Modify — Normalize key & rule lookup)*
* `Mobile app/SpentX/lib/features/sms/autosave/merchant_category_engine.dart` *(Modify — Admin category matching & Separate Income Categories)*
* `Mobile app/SpentX/lib/features/sms/detected/auto_rule_engine.dart` *(Modify — Separate income path & auto-add check)*
* `Mobile app/SpentX/test/detection_v2/phase7_merchant_resolution_test.dart` *(New)*

#### Phase 8 — Save, Cleanup, Notify, Sync
* `Mobile app/SpentX/lib/features/sms/autosave/sms_auto_save_undo.dart` *(Modify — 5s Undo with financial reversal)*
* `Mobile app/SpentX/test/detection_v2/phase8_save_sync_test.dart` *(New)*

#### Phase 9 — Backend Changes
* `supabase/migrations/20261025000000_detection_v2_schema.sql` *(New — Table `sms_template_requests` with RLS insert-only, version triggers, dedupe RPC `upsert_template_request`. Reuses existing `merchants` and `categories` tables; NO new admin_categories table).*
* `Mobile app/SpentX/test/detection_v2/phase9_backend_rules_test.dart` *(New — Verification test for Supabase rules sync, RLS insert-only template request RPC, and category mappings)*
* `src/app/admin/sms-rules/page.tsx` *(Modify — Web admin portal review UI for pending template requests)*

#### Phase 10 — UI Integration
* `Mobile app/SpentX/lib/features/sms/detected/detected_sms_screen.dart` *(Modify — Pending card hierarchy & badge counts)*
* `Mobile app/SpentX/test/detection_v2/phase10_ui_test.dart` *(New)*

#### Phase 11 & 12 — Cleanup & Final Report
* Dead code removal (approved candidates only).
* `docs/detection_v2/FINAL_REPORT.md` *(New)*

---

### Files OUTSIDE detection directories (with strict 1-line rationale for each):

1. **`Mobile app/SpentX/lib/models/transaction.dart`**  
   *Rationale:* Must hold detection `idempotencyKey`, multi-source event references (`sources`), and `impactsTotals = false` so financial calculations exclude failed transactions.
2. **`Mobile app/SpentX/lib/models/account_model.dart`**  
   *Rationale:* Real stored Account model (Hive settings box); holds `isIgnored` ("Not Mine") flag and account evidence metadata.
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
   *Rationale:* Single-writer ledger entry point that validates idempotencyKey before committing detected transactions to Hive.
9. **`Mobile app/SpentX/lib/core/sync/sync_service.dart`**  
   *Rationale:* Must ensure cloud sync never uploads raw SMS text, unverified pending candidates, or failed transactions as confirmed expenses.
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
   Failed transactions **MUST sync** to Supabase with `status = failed` and `impactsTotals = false`. Only raw SMS text and unverified pending detection candidates are kept strictly local on-device and never sync.
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
- **Allowed Files Enforcement:** ONLY `lib/models/transaction.dart` receives additive fields (`idempotencyKey`, `sources`, `impactsTotals`).

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
- `lib/features/sms/v4/bank_sms_template_catalog.dart` and `assets/sms/bank_sms_templates_v4.json` are **KEPT** permanently as the offline seed when cache is empty (fresh installs, no network). It has been removed from the Phase 11 deletion candidates.

### 7. Backend Direct Integration
- Next.js has NO API routes for block rules, templates, or categories. The Flutter app interacts directly with Supabase tables (`sms_block_rules`, `sms_template_rules`, `merchants`, `categories`) via `SmsRulesRefreshService.dart`.
- Template requests will use Supabase RPC `upsert_template_request` directly with RLS insert-only. No Next.js ingest proxy is built.
- No new `admin_categories` table will be created; existing `categories` and `merchants` tables are reused.
- `Mobile app/SpentX/test/detection_v2/phase9_backend_rules_test.dart` added to Allowed Files List.

### 8. Sync Rules
- Failed transactions (`status = failed`, `impactsTotals = false`) **MUST sync** to Supabase.
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
  - `Transaction` (`lib/models/transaction.dart`): Added `idempotencyKey` (`String?`), `sources` (`List<String>`), and `impactsTotals` (`bool`, default `true`). Updated `toJson()`, `fromJson()`, and `copyWith()`. Note: `impactsTotals` is only emitted in `toJson()` when `false` to maintain byte-for-byte rollback compatibility for existing transactions.
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
  - Verify Supabase `transactions` table schema for `status` and `impactsTotals` columns. Include safe defaults (`status = 'success'`, `impactsTotals = true`) in the migration if missing.
  - Verify older app version behavior for synced failed transactions before enabling sync of failed records.

