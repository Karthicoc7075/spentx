# SpentX Smart Detection Flow v2 — Architectural Audit & Discovery Report

> **Date:** October 24, 2026  
> **Branch:** `feature/smart-detection-flow-v2`  
> **Status:** Phase 0 Complete — Awaiting Approval  
> **Scope:** Audit, Mapping, Allowed Files List, Risk Analysis, and Open Decisions  

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
| **Native Android Layer** | `Kotlin 2.1.0` • Android SDK Compile `35` • Min SDK `24` • Target SDK `35`<br>• `SmsReceiver.kt`: Intercepts `android.provider.Telephony.SMS_RECEIVED`<br>• `NotificationListenerService.kt`: Intercepts push notifications from user-picked apps (`notif:<package>`)<br>• `SmsPendingQueue.kt` / `DurableQueue.kt`: Native encrypted SQLite/Prefs queue<br>• `SpentXBackgroundWorker.kt` & `SmsWorkScheduler.kt`: WorkManager background queue drainage (`workmanager: ^0.7.0`)<br>• `BootReceiver.kt`: Reschedules listeners & workers upon device reboot |
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

## 3. Mapping Table (Target Flow Boxes ➔ Implementation Status)

| Box ID | Diagram Node | Current Code Equivalent | Action for Flow v2 |
| :--- | :--- | :--- | :--- |
| **IN** | Incoming Bank SMS / App Notification | `SmsReceiver.kt` & `NotificationListenerService.kt` | **Reuse** existing native receivers. |
| **Q** | Save Raw into Encrypted Native Queue | `SmsPendingQueue.kt` & `NativeQueueClient.dart` | **Refine**: Ensure 100% of events write `RawQueueItem` to native queue *before* any Dart parsing. |
| **SRC** | Source? (SMS vs Notification) | `notificationPackageOf(sender) != null` | **Reuse / Formalize**: Clean enum dispatch (`SmsDetectionSource.sms` vs `notification`). |
| **AB** | Admin Block Rule Match? | `sms_block_rules` in Hive & `SmsRuleEngine.isBlocked` | **Refine**: Load cached admin block rules with bundled fallback regex/keyword list. |
| **X1** | Ignore and Log Reason | `SmsDetectionDebugLog.log()` | **Reuse**: Masked audit log, zero raw text. |
| **FF** | Failed or Wait SMS? | `StatusClassifier.classify()` & `SmsRuleEngine.statusOnlyCandidate()` | **Refine**: Add explicit separation of `Failed` vs `Wait/Pending`. |
| **FL** | Save as Failed: Red Badge, ₹0 Impact | `TxStatus.failed`, `Countable.inTotals = false` | **Wire / Formalize**: Saved to ledger with `impactsTotals = false`, red badge in activity. |
| **P1** | Hold and Wait for Final SMS | *Partially in legacy hold queue* | **New**: Dedicated `PendingHold` model with 48h configurable expiry. |
| **B** | Common SMS Parser | `UniversalSmsParser.dart` | **Reuse**: Primary parser for standard bank formats. |
| **B2** | Admin SMS Templates | `SmsTemplateEngine.dart` & `SmsTemplateRule` | **Reuse**: Secondary parser when common parser is incomplete. |
| **MW1**| Money Words Found? (SMS) | `SmsTransactionFilters.statesMoneyMoved()` | **Refine**: Centralize single config list of money words & amount patterns. |
| **X2** | Ignore and Log Reason | `SmsDetectionDebugLog.log()` | **Reuse**: Record reason code (e.g. `no_money_words`). |
| **UP1**| SMS Detection Pending: Unparsed - Tap to Tag | `unparsedCandidate()` & `DetectedSmsScreen` | **Wire**: Display as "Unparsed – Tap to Tag" card in Pending screen. |
| **MK** | Mask Account No., Name, Balance | *Partially in sms_privacy.dart* | **New**: Formalized `SmsMasker` service with strict zero-digit leakage tests. |
| **SA** | Send to Admin: New Template Request | *None (User trained locally)* | **New**: Opt-in background submission to backend `sms_template_requests`. |
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

## 6. Allowed Files List (Grouped by Phase)

### Phase 1 — Data Models & Storage
* `Mobile app/SpentX/lib/features/sms/models/raw_queue_item.dart` *(New)*
* `Mobile app/SpentX/lib/features/sms/models/pending_hold.dart` *(New)*
* `Mobile app/SpentX/lib/features/sms/models/pending_item.dart` *(New)*
* `Mobile app/SpentX/lib/models/transaction.dart` *(Modify — add idempotencyKey, sources, impactsTotals)*
* `Mobile app/SpentX/lib/features/accounts/domain/account_model.dart` *(Modify — add last4, bankName, isIgnored, accountType enum)*
* `Mobile app/SpentX/lib/features/sms/v4/models/merchant_rule.dart` *(Modify / Extend)*
* `Mobile app/SpentX/lib/data/local/safe_box_migration.dart` *(Modify — add migration test and safe defaults)*
* `Mobile app/SpentX/test/detection_v2/phase1_models_test.dart` *(New)*

### Phase 2 — Intake & Native Queue
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsPendingQueue.kt` *(Modify — ensure raw queuing priority)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/SmsReceiver.kt` *(Modify — write-first before intent broadcast)*
* `Mobile app/SpentX/android/app/src/main/kotlin/com/spentx/app/spentx/NotificationListenerService.kt` *(Modify — queue-first check)*
* `Mobile app/SpentX/lib/features/sms/background/native_queue_client.dart` *(Modify — idempotency and retry limit)*
* `Mobile app/SpentX/lib/features/sms/sms_service.dart` *(Modify — dispatch to new queue worker)*
* `Mobile app/SpentX/test/detection_v2/phase2_queue_test.dart` *(New)*

### Phase 3 — Pre-Parse Filters (Bank SMS)
* `Mobile app/SpentX/lib/features/sms/rules/engine/admin_block_rules_matcher.dart` *(New)*
* `Mobile app/SpentX/lib/features/sms_parser/sms_transaction_filters.dart` *(Modify — centralize block patterns)*
* `Mobile app/SpentX/lib/features/sms/rules/engine/sms_hold_manager.dart` *(New — hold wait/pending SMS)*
* `Mobile app/SpentX/lib/features/sms/detected/sms_detection_pipeline.dart` *(Modify — insert Phase 3 pre-parse gates)*
* `Mobile app/SpentX/test/detection_v2/phase3_preparse_test.dart` *(New)*

### Phase 4 — Parsers & Unparsed Handling
* `Mobile app/SpentX/lib/features/sms_parser/sms_parser.dart` *(Modify — Common SMS Parser refinement)*
* `Mobile app/SpentX/lib/features/sms/rules/engine/sms_template_engine.dart` *(Modify — Admin template lookup)*
* `Mobile app/SpentX/lib/features/sms_parser/notification_parse_rules.dart` *(Modify — Common & Built-in App rules)*
* `Mobile app/SpentX/lib/features/sms/core/sms_masker.dart` *(New — strict masking of account, balance, reference, names)*
* `Mobile app/SpentX/lib/features/sms/core/template_request_service.dart` *(New — opt-in masked template request queue)*
* `Mobile app/SpentX/test/detection_v2/phase4_parsers_test.dart` *(New)*
* `Mobile app/SpentX/test/fixtures/sms_corpus/` *(New test fixtures)*

### Phase 5 — Account Matching & Discovery
* `Mobile app/SpentX/lib/features/sms/autosave/strict_account_matcher.dart` *(Modify — composite bank + last4 + type)*
* `Mobile app/SpentX/lib/core/services/account_discovery_service.dart` *(Modify — group by bank + last4)*
* `Mobile app/SpentX/lib/features/accounts/data/pending_account_provider.dart` *(Modify — Add Account, Not Mine, Later actions)*
* `Mobile app/SpentX/lib/features/accounts/presentation/widgets/pending_account_card.dart` *(Modify — UI card)*
* `Mobile app/SpentX/test/detection_v2/phase5_account_discovery_test.dart` *(New)*

### Phase 6 — Duplicate Check & Merge
* `Mobile app/SpentX/lib/core/finance/tx_ref_key.dart` *(Modify — 10-minute window / UTR duplicate check)*
* `Mobile app/SpentX/lib/features/sms/autosave/sms_dedupe_registry.dart` *(Modify — cross-source evidence merge)*
* `Mobile app/SpentX/test/detection_v2/phase6_duplicate_merge_test.dart` *(New)*

### Phase 7 — Merchant Resolution
* `Mobile app/SpentX/lib/features/sms/v4/merchant_learning_service.dart` *(Modify — normalize key & rule lookup)*
* `Mobile app/SpentX/lib/features/sms/autosave/merchant_category_engine.dart` *(Modify — admin category matching)*
* `Mobile app/SpentX/lib/features/sms/detected/auto_rule_engine.dart` *(Modify — auto-add check & pending routing)*
* `Mobile app/SpentX/test/detection_v2/phase7_merchant_resolution_test.dart` *(New)*

### Phase 8 — Save, Cleanup, Notify, Sync
* `Mobile app/SpentX/lib/core/providers/transaction_provider.dart` *(Modify — single entry point with idempotencyKey)*
* `Mobile app/SpentX/lib/features/sms/autosave/sms_auto_save_undo.dart` *(Modify — 5s Undo with financial reversal)*
* `Mobile app/SpentX/lib/core/sync/sync_service.dart` *(Modify — strip raw text from sync payload)*
* `Mobile app/SpentX/test/detection_v2/phase8_save_sync_test.dart` *(New)*

### Phase 9 — Backend Changes
* `supabase/migrations/20261025000000_detection_v2_schema.sql` *(New — template requests table, version triggers)*
* `src/app/api/detection/block-rules/route.ts` *(New / Modify)*
* `src/app/api/detection/templates/route.ts` *(New / Modify)*
* `src/app/api/detection/categories/route.ts` *(New / Modify)*
* `src/app/api/detection/template-requests/route.ts` *(New — masked payload ingestion)*
* `src/app/admin/sms-rules/page.tsx` *(Modify — view template requests)*

### Phase 10 — UI Integration
* `Mobile app/SpentX/lib/features/sms/detected/detected_sms_screen.dart` *(Modify — pending card hierarchy & badge counts)*
* `Mobile app/SpentX/lib/features/transactions/presentation/transaction_detail_screen.dart` *(Modify — "View original SMS" collapsed section)*
* `Mobile app/SpentX/lib/features/settings/presentation/screens/notification_preferences_screen.dart` *(Modify — auto-add & consent toggles)*
* `Mobile app/SpentX/test/detection_v2/phase10_ui_test.dart` *(New)*

### Phase 11 — Remove Old Detection Code
* Deletions of dead code approved in Section 4.

### Phase 12 — Full Testing & Final Report
* `docs/detection_v2/FINAL_REPORT.md` *(New)*

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

## 8. Questions & Open Decisions (Section 6)

### Decision 1: Notifications and Failed Status
* **Question:** If a notification parser detects "failed" (e.g., *"Payment of ₹250 to Amazon failed"*), should it also be saved as Failed with ₹0 impact?
* **Recommendation:** **YES.** Consistent with the core rule: users want visibility that a payment attempt was recognized, but [countable.dart](file:///Users/karthi/Documents/SpentX%20Web/spentx-web%20copy%203/Mobile%20app/SpentX/lib/core/finance/countable.dart#L41) guarantees it has ₹0 impact on budget, spending totals, and account balance.

### Decision 2: Credits / Income (Salary, Refunds, Cashback)
* **Question:** Should credits/income go through the same merchant steps, or use a separate income category path?
* **Recommendation:** **Separate Income Path.** Credits must never be categorized under expense categories (e.g., "Food", "Shopping"). Salary/Interest/Income should map to user-defined Income sources (`contributorSource` or Income Category), and Refunds must link to prior expenses (Rule 7: never treat refunds as income).

### Decision 3: Notification Unparsed ➔ Admin Request
* **Question:** Should unknown notification formats also be masked and sent to admin?
* **Recommendation:** **NO.** As established in the master architectural rule: app notifications change frequently and should rely strictly on built-in app rules and common notification patterns. We should only collect masked template requests for Bank SMS formats.

### Decision 4: Old Backend Endpoints Compatibility
* **Question:** Are older app versions still in use that need the old detection endpoints?
* **Recommendation:** **YES, preserve backward compatibility.** Existing endpoints `/api/admin/sms-rules` and Supabase tables `sms_template_rules` should be retained or aliased so existing installs continue to receive rule updates without disruption.

### Decision 5: Pending Hold Expiry Window
* **Question:** Confirm 48 hours as the default timeout for pending/wait SMS holds.
* **Recommendation:** **Confirmed (48 Hours).** Indian banking NEFT/UPI pending status typically settles within 2 to 48 hours. If unresolved after 48 hours, it automatically surfaces in *SMS Detection Pending ➔ Verify Merchant*.

---

## Confirmation
* **Git Branch:** `feature/smart-detection-flow-v2` is active and clean.
* **Source Code State:** Zero application source code has been altered during Phase 0.
