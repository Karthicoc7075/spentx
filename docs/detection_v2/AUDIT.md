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
| **Hive Type IDs in Use** | • `typeId: 0` ➔ `Account` (`lib/features/accounts/domain/account_model.dart`)<br>• `typeId: 1` ➔ `TransactionModel` (`lib/features/transactions/domain/transaction_model.dart`)<br>*(All other boxes store typed Map or JSON primitives via SecureHive)* |
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
1. `Mobile app/SpentX/lib/features/sms/v4/bank_sms_template_catalog.dart`: Deprecated hardcoded static JSON catalog (replaced by dynamic `sms_template_rules`).
2. `Mobile app/SpentX/lib/features/sms/detected/detection_queue.dart`: Redundant legacy in-memory deduplication queues replaced by `RawQueueItem` + `TxRefKey`.
3. `Mobile app/SpentX/lib/features/sms/rules/engine/sms_rule_engine.dart` (`_tryRegexRules` function): Unsafe regex guessing that misclassifies transactions.
4. `Mobile app/SpentX/lib/features/sms/detected/sms_pipeline_test_runner.dart`: Legacy scratch testing harness replaced by clean unit test suite.
5. `Mobile app/SpentX/lib/features/sms/rules/sms_template_rules_importer.dart`: One-off manual migration script.

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
* `Mobile app/SpentX/lib/features/sms/models/raw_queue_item.dart` *(New — Encrypted native queue data model)*
* `Mobile app/SpentX/lib/features/sms/models/pending_hold.dart` *(New — Wait/pending SMS holding model with 48h expiry)*
* `Mobile app/SpentX/lib/features/sms/models/pending_item.dart` *(New — Typed pending card item for review screen)*
* `Mobile app/SpentX/lib/features/sms/v4/models/merchant_rule.dart` *(Modify / Extend — Auto-add disabled flag)*
* `Mobile app/SpentX/test/detection_v2/phase1_models_test.dart` *(New)*

#### Phase 2 — Intake & Native Queue
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsPendingQueue.kt` *(Modify — Direct reuse and extension of existing SQLite/Prefs queue for raw intake)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsReceiver.kt` *(Modify — Write raw item to queue first before any processing)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/NotificationListenerService.kt` *(Modify — Enqueue raw notification before event channel broadcast)*
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
* `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` *(New — Opt-in masked template request queue)*
* `Mobile app/SpentX/test/detection_v2/phase4_parsers_test.dart` *(New)*
* `Mobile app/SpentX/test/fixtures/sms_corpus/` *(New test fixtures)*

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
* `supabase/migrations/20261025000000_detection_v2_schema.sql` *(New — Table `sms_template_requests` with RLS, version triggers, dedupe RPC)*
* `src/app/api/detection/block-rules/route.ts` *(New / Modify — Versioned block rules endpoint)*
* `src/app/api/detection/templates/route.ts` *(New / Modify — Versioned templates endpoint)*
* `src/app/api/detection/categories/route.ts` *(New / Modify — Versioned category list endpoint)*
* `src/app/api/detection/template-requests/route.ts` *(New — Ingest masked template request)*
* `src/app/admin/sms-rules/page.tsx` *(Modify — Admin panel template request review)*

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
2. **`Mobile app/SpentX/lib/features/accounts/domain/account_model.dart`**  
   *Rationale:* Must hold `accountType` (savingsCurrent, creditCard, wallet), `last4`, `bankName`, and `isIgnored` ("Not Mine") flags set during New Account discovery.
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
4. **Backend Compatibility & Supabase Rules:**  
   **YES.** Keep old endpoints and tables working.
   - Enable RLS on every new table.
   - Table `sms_template_requests`: App users can `INSERT` only (no read, update, or delete). Deduplicated by `format_hash` with an incremental counter via a PostgreSQL RPC function (`upsert_template_request`), not client read.
   - Tables `sms_block_rules`, `sms_template_rules`, `admin_categories`: App users can `SELECT` only. Admin role only can write.
   - Never store raw SMS text in any database table.
   - Add migrations strictly as new timestamped `.sql` files in `supabase/migrations/`. Never edit historical migrations.
5. **Pending Hold Expiry:**  
   **48 Hours** configured default timeout for pending/wait SMS holds.

---

## 9. Baseline Test Results (Run on `main` before Phase 1)

* **Command Run:** `flutter test` across the entire test suite (88 test files in `Mobile app/SpentX/test/`).
* **Total Tests Executed:** 1,030 tests
* **Total Passed:** 954 tests (92.6% pass rate)
* **Total Failed on `main`:** 76 tests across 12 test files

### Detailed Breakdown of Pre-Existing Failures on `main`:

| # | Test File | Failures | Root Cause on `main` |
|---|---|:---:|---|
| 1 | `test/sms_regression_test.dart` | 30 | `MissingPluginException` for `path_provider` in `MasterDebugLog` and uninitialized `SecureHive` test cipher in standalone unit test harness. |
| 2 | `test/sms_regression_corpus_test.dart` | 12 | `MissingPluginException` for `path_provider` during SMS corpus batch parsing. |
| 3 | `test/phase2_parsing_test.dart` | 10 | `MasterDebugLog.ruleEngine` invoking unmocked `path_provider` method channel. |
| 4 | `test/phase0_data_foundations_test.dart` | 7 | Missing `TestWidgetsFlutterBinding` initialization before calling platform channels. |
| 5 | `test/phase4_accounts_test.dart` | 5 | Unmocked `SecureHiveKeyStore` in standalone account matcher unit tests. |
| 6 | `test/sms_flow_bugfix_test.dart` | 4 | In-memory pending dedupe hash timing mismatch without mock clock. |
| 7 | `test/sms_detection_fixes_test.dart` | 2 | Header bank override test asserting legacy `@okaxis` parser behavior. |
| 8 | `test/sms_auto_save_test.dart` | 2 | In-memory `merchant_rules_box` state leakage between test cases. |
| 9 | `test/mobile_ui_consistency_test.dart` | 2 | UI consistency assertion failing because intermediate "Choose Method" page was removed from template creation flow. |
| 10| `test/background_single_writer_test.dart` | 1 | Background worker lock timeout in headless CLI test environment. |
| 11| `test/detected_sms_tabs_test.dart` | 1 | Tab bar badge controller expecting legacy pending queue box name. |
| 12| `test/phase1_permissions_sources_test.dart` | 1 | Unmocked permission handler channel during headless run. |

> **Strict Baseline Guard:** Later phases must maintain $\ge 954$ passing tests and **MUST NOT add any new test failures** beyond these 12 known pre-existing test files.
