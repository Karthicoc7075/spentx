# SpentX – Development Handoff (2026-10-22, IST)

Prepared 2026-10-22 ~10:25–11:00 IST (UTC+5:30) by Grok Bot, as documentation and read-only verification only. No app code, no SQL writes, no git commits were made while preparing this package.

**Read first:** `SpentX-detection-change-plan.md` in this folder. It is the master plan (v6), copied unchanged; the sha256 matches the source. Then read this file, then `SPENTX_REMAINING_WORK.md`, `SPENTX_SQL_STATUS.md`, `SPENTX_TEST_STATUS.md`, `SPENTX_FILE_MAP.md` and `SPENTX_NEXT_AI_PROMPT.md`.

## Status legend
- **Complete in code**: implemented, unit tests pass and there is device evidence for the phase.
- **Partially complete**: implemented and unit-tested, but device / release verification is missing, or part of the plan item is left.
- **Not started**: nothing done.

No phase is production-ready: section V of the plan (real-device + release-build verification) has not been run for any phase.

## Summary table

| Phase | Commit(s) (mobile repo unless noted) | Status | Device evidence |
|---|---|---|---|
| S5b – backup & migration safety | Mobile `653d60d`; root `f3a5ea6`, `f0dae45` | Partially complete | Backups run by the user on 2026-10-22 (`~/spentx-backups/…`). Restore-on-staging test NOT TESTED. allowBackup / D2D on device NOT TESTED. |
| S1 – secure session storage | `932041a` | Partially complete | Device: session moved, still signed in, no plain token (Oct 21). NOT TESTED: on-device token refresh after migration, on-device logout, release build. |
| S2 – safe Hive key / upgrade | `94f5268` | Complete in code | Device-tested on AIN065, Oct 21 (from project history). Release build NOT TESTED. |
| S2b – native queues off EncryptedSharedPreferences | `42c2fd7` | Partially complete | Native unit tests pass. Migration on device covered by the S3 cleanup (see note). Release build NOT TESTED. |
| S3 – key loss without deleting data | `bb3597b` | Complete in code | Device-tested on AIN065, Oct 21 (from project history). Release build NOT TESTED. |
| S4 – single writer, refresh gate, durable queue | `3a1fced`, `7ab1893` | Complete in code | Device-tested on AIN065, Oct 21 (from project history). Reboot, 50-SMS burst and kill-mid-save in a release build NOT TESTED. |
| Phase 0 – data foundations | `fbd8a22`, `789ea38` (+ fixes in `816550e`, `9a8e413`) | Partially complete | No device test. SQL applied on live 2026-10-22. |
| Phase 1 – permissions & sources | `b4c4b22` | Partially complete | NOT TESTED on phone (permission flows, per-app notifications, real-inbox import). |
| Phase 2 – parsing, status, transfers | `cb31c6c`, `d8e13a7` (+ `816550e`) | Partially complete | NOT TESTED on phone. Needs SQL `p2_sms_rules_version` for instant rule refresh. |
| Phase 3 – merchant rules & learning | `9dc5845` (+ `816550e`) | Partially complete | NOT TESTED on phone. Needs 3 Phase 3 SQL files before release. |
| Phase 4 – accounts | `3ccbe37`, `816550e`, `9a8e413` | Partially complete | NOT TESTED on phone. |
| Phase 5, Phase 6, S5, S6, S6b, S7, S7b, S8, S10/V, S9 | – | Not started | – |

Commit IDs and dates were checked with `git log` on 2026-10-22. Commit times are IST (+0530).

---

## S5b – Backup and migration safety (MANDATORY in v6)
**Commits:** mobile `653d60d` (2026-10-21 14:08) "crash-safe local box migrations"; root repo `f3a5ea6` (14:08) "Supabase backup, restore and migration safety", `f0dae45` (14:19) "live migration status audit".

**Implemented**
- Local Hive: `SafeBoxMigration` does copy → verify → swap → delete the original LAST, with a per-box marker. A failed step rolls back and retries on the next launch. Data migrations take an encrypted snapshot first and can restore it. Unreadable files are preserved.
- `SecureHive` sniffs the file format before opening, so plain or wrong-key boxes are no longer silently truncated. Only the main isolate migrates; background isolates fail safe.
- Native `SecureQueueStore` commits and reads back before deleting the plaintext legacy queue, and merges legacy items instead of dropping them.
- Supabase (root repo):
  - `supabase/backup/backup.sh` runs pg_dump using `SPENTX_DB_URL` from the environment only.
  - `restore_staging.sh` refuses the live DB and reports PASS/FAIL by fingerprint.
  - `verify.sql` gives row counts, checksums, balances per account and user-rule counts; `RESTORE.md` documents restore.
  - Migration-check template and `capture_rollback.sql`, plus precheck/verify/rollback for older files.
  - `STATUS-2026-10-21.md`: a read-only status of every migration against live.

**Files – mobile:** `android/app/src/main/kotlin/com/spentx/app/spentx/SecureQueueStore.kt`, `lib/data/local/hive_service.dart`, `lib/data/local/safe_box_migration.dart`, `lib/main.dart`, `test/safe_box_migration_test.dart`.
**Files – root:** `supabase/backup/{RESTORE.md,backup.sh,restore_staging.sh,verify.sql}`; `supabase/migration-checks/{MIGRATION_TEMPLATE.md,README.md,capture_rollback.sql,STATUS-2026-10-21.md}`; checks for 20261011_admin_fixes, 20261011_investments_goals, 20261011_security_audit_fixes, 20261011_user_merchants_trust, 20261021_signup_phone, 20261004000100_protect_user_roles (incl. `post_step_restore_function.sql`) and 20261005000200_high_severity_user_data_fixes (incl. `apply_missing_parts.sql`).

**Tests:** `test/safe_box_migration_test.dart` (14 test declarations): a crash at every step, verify failure, background isolate, wrong key, offline + pending outbox, concurrency, snapshot rollback.

**Known limits / untested**
- The Free plan has no dashboard backup or PITR, so backup.sh is the only backup.
- Restore on a staging copy: NOT TESTED.
- allowBackup=false and data_extraction_rules (cloud + D2D) on Android 12+/16/17: NOT TESTED on device.
- Phase-specific SQL files written after `f3a5ea6` are untracked in the root repo (see the git section of the file map).

## S1 – Secure login session storage
**Commit:** `932041a` (2026-10-21 14:53).

**Implemented**
- The Supabase session and PKCE verifier live in flutter_secure_storage (Keystore-backed), no longer in plain SharedPreferences.
- An existing session is moved crash-safely: copy → read back → delete plain last, main isolate only, and the user stays signed in.
- Sign-out waits until the session and verifier are removed from both stores.
- The second copy of the access token is gone.

**Files:** `lib/core/services/{app_reset_service,auth_service,secure_session_storage}.dart`, `test/secure_session_{auth,storage}_test.dart`. Changed again in S2b, S3 and S4.

**Tests:** 22 new tests at the time: migration, crash, failures, background isolate, expiry, login/signup/PKCE link, logout, no tokens in prefs or logs.

**Device:** the session moved, the user stayed signed in and no plain token was left (Oct 21, plan checklist).

**NOT TESTED:** on-device token refresh after migration; on-device logout; release build; on-device background-worker refresh.

## S2 – Safe Hive encryption key
**Commit:** `94f5268` (2026-10-21 15:42).

**Implemented**
- The key is never overwritten.
- A key check runs before boxes are opened.
- Quarantine recovery, with a key recovery screen.

**Files:** `lib/core/services/secure_session_storage.dart`, `lib/data/local/{hive_key_manager,hive_service,safe_box_migration}.dart`, `lib/features/security/presentation/key_recovery_screen.dart`, `lib/main.dart`, `test/{hive_key_manager,key_recovery_screen,priority_fixes,sms_auto_save_flow}_test.dart`.

**Tests:** `hive_key_manager_test.dart` (31 test declarations), `key_recovery_screen_test.dart` (9).

**Device:** AIN065, Oct 21 (from project history). **NOT TESTED:** release build.

## S2b – Replace deprecated EncryptedSharedPreferences
**Commit:** `42c2fd7` (2026-10-21 15:57).

**Implemented**
- Native queues use a Keystore AES-256-GCM key with their own encrypted store (`QueueStoreCore`).
- Migration is verified before the old store is deleted.
- flutter_secure_storage options are pinned (`secure_storage_options.dart`).

**Files:** `android/app/build.gradle.kts`, `…/MainActivity.kt`, `…/QueueStoreCore.kt`, `…/RetryQueue.kt`, `…/SecureQueueStore.kt`, `android/app/src/test/…/QueueStoreCoreTest.kt`, `lib/core/services/{auth_service,secure_session_storage,secure_storage_options}.dart`, `lib/data/local/hive_key_manager.dart`, `test/secure_storage_options_test.dart`.

**Tests:** `QueueStoreCoreTest.kt` (5 @Test), `secure_storage_options_test.dart` (3).

**S2b legacy-queue note:** S3 (`bb3597b`) removed the old ESP-queue migration code and the `androidx.security:security-crypto` dependency, after the phone was verified as migrated. A device that never ran a build containing the S2b migration and still has items in the old ESP queue would not migrate them. That is acceptable only because the app is not released and the only known device (AIN065) was migrated. Re-check this before any release to other existing installs.

**NOT TESTED:** release build.

## S3 – Key loss handling without deleting data
**Commit:** `bb3597b` (2026-10-21 18:34).

**Implemented**
- An unsynced-change count (count only) is kept next to the boxes. The recovery dialog shows that count, or "unknown", with the unsynced-data warning.
- Restore runs only when the account server answers; nothing changes while offline.
- Key rotation goes through `SafeBoxMigration.reencrypt`: copy, verify, swap, delete the original last. It resumes after a crash and keeps the old key slot.
- When its key comes back, set-aside data can be brought back from Settings. This runs at the next start before boxes open, is resumable and waits for unsynced changes. The current data is set aside, never deleted.
- Set-aside data is deleted only after the user confirms; the Settings row shows only when such data exists.
- Obsolete migrations were removed: plain Hive boxes, plain session/PKCE prefs, the ESP queue store and the security-crypto dependency.

**Files:** 26, including `android/app/{build.gradle.kts,proguard-rules.pro}`, Kotlin `MainActivity`, `QueueStoreCore`, `RetryQueue`, `SecureQueueStore`, `SmsPendingQueue`, `TransactionPendingQueue`, `lib/core/sync/{outbox_status,sync_queue}.dart`, `lib/features/settings/presentation/screens/set_aside_data_screen.dart`, `settings_screen.dart`, and the tests `hive_key_manager`, `key_recovery_screen`, `safe_box_migration`, `secure_session_*` and `set_aside_data_screen`.

**Device:** AIN065, Oct 21 (from project history). **NOT TESTED:** release build.

## S4 – Background single writer, session refresh gate, durable SMS queue
**Commits:** `3a1fced` (2026-10-21 20:23), follow-up `7ab1893` (20:34).

**Implemented**
- `HiveWriterLock`, a cross-process OS file lock in Kotlin and Dart. The worker defers or yields; the app waits.
- The worker never refreshes or removes the Supabase session (expiry-margin gate); it defers and leaves items queued.
- Capture is queue-first: SMS and notification items are acknowledged only after a successful flush.
- `DurableQueue`: encrypted, with overflow segments, retry backoff, parked poison items and legacy failed-list migration. OTP-only texts are not stored.
- `BootReceiver` drains the queue after a reboot. A debug-only `QueueSelfTestReceiver` exists.
- Follow-up: each queued item records its owner. Items are never cleared on sign-out or when detection is turned off, and never processed while off or signed out. Another user's items are held. Settings shows a "Pending SMS" row (only when items exist) with a confirmed Clear for the signed-in user's items only.

**Files:** see `git show --stat 3a1fced 7ab1893`. Key ones:
- Kotlin: `BootReceiver`, `DurableQueue`, `HiveWriterLock`, `QueueChannel`, `SmsReceiver`, `SmsWorkScheduler`, `SpentXBackgroundWorker`, `NotificationListenerService`, `SpentXDetectionPrefs`.
- Dart: `lib/core/sync/{hive_writer_lock,background_data_sync}.dart`, `lib/features/sms/background/{background_sms_processor,native_queue_client}.dart`, `lib/features/settings/presentation/screens/pending_sms_screen.dart`.
- Tests: `test/background_single_writer_test.dart` (19 declarations), `test/pending_sms_owner_test.dart` (6), `DurableQueueTest.kt` (16 @Test), `HiveWriterLockTest.kt` (6).

**Device:** AIN065, Oct 21 (from project history). **NOT TESTED:** release build; reboot with items queued; 50-SMS burst; kill mid-save; app + worker refreshing together on device.

## Phase 0 – Data foundations
**Commits:** `fbd8a22` (2026-10-21 20:55), `789ea38` (21:05, compat). Later fixes in `816550e` and `9a8e413`.

**Implemented**
- Transaction status, review flags (needsCategory / needsAccount / needsClassification), channel, rule id + version, source event ids, linked original + link kind, and refunded amount. An empty account means Unassigned.
- `core/finance/countable.dart` holds the one shared totals rule, used by spending, budgets, analytics, net worth, Home and Accounts.
- Account evidence fields: aliases, linked cards, evidence state/count, created by, bank key, verified identity.
- `SourceEvidenceStore`: one hash-only record per SMS or notification, wrapping the dedupe registry.
- `AuditLog`: local, encrypted, append-only.
- Sync mapping for the new columns, with a legacy fallback for a server that hasn't run the migration.
- The compat commit proves that pre-Phase-0 Hive data round-trips with identical totals.
- `9a8e413` added `Transaction.refKey`, a server duplicate key, plus `balance_applied` on sync and handling of the unique-violation error 23505 (merge or keep both, never drop).

**Files (fbd8a22):**
- `lib/core/audit/audit_log.dart`, `lib/core/finance/countable.dart`
- `lib/core/services/{app_reset_service,plan_alert_service}.dart`
- `lib/core/sync/{supabase_schema_map,sync_service}.dart`
- `lib/core/utils/{budget_spend,ledger_month_index}.dart`
- `lib/features/accounts/data/pending_account_provider.dart`, `lib/features/analytics/presentation/analytics_screen.dart`
- `lib/features/sms/autosave/{sms_auto_save_undo,sms_dedupe_registry}.dart`, `lib/features/sms/detected/{auto_rule_engine,detection_queue,sms_background_init}.dart`
- `lib/features/sms/evidence/source_evidence_store.dart`, `lib/features/sms/v4/merchant_learning_service.dart`
- `lib/features/transactions/data/transaction_provider.dart`, `lib/features/transactions/presentation/transactions_screen.dart`
- `lib/features/wealth/{data/wealth_provider,presentation/wealth_screen}.dart`, `lib/main.dart`, `lib/models/{account_model,transaction}.dart`
- `test/phase0_data_foundations_test.dart`

**Files (789ea38):** `test/fixtures/pre_phase0/{account_model,transaction}.dart`, `test/phase0_legacy_{compat,totals}_test.dart`.

**Tests:** `phase0_data_foundations_test.dart` (18 declarations), `phase0_legacy_compat_test.dart` (4), `phase0_legacy_totals_test.dart` (1).

**SQL:** `20261021120000_p0_tx_status_flags.sql` and `20261021120100_p0_account_evidence.sql` were APPLIED on live by the user on 2026-10-22 (~08:20–08:35 IST). A backup was taken first, and the BEFORE and AFTER snapshots are identical (31 rows).

**Known limits**
- Safety 5 "atomic local write" (transaction + balance + evidence + audit in one write) is not a single Hive transaction; the writes are sequential.
- The "Sync conflict" review UI for real conflicting financial edits is not built.
- Optional `audit_events` server table: not created (the plan marks it optional).

**NOT TESTED:** on phone, that totals and account balances are unchanged after the install.

## Phase 1 – Permissions & sources
**Commit:** `b4c4b22` (2026-10-21 21:44).

**Implemented**
- A new Detection & Permissions screen:
  - SMS and notification-access status.
  - A payment-app notifications switch, off by default.
  - A per-app picker.
  - Allow / Check again / Open Settings / App info buttons.
  - Android 13+ restricted-settings help and the Safety 4 note.
- Permission prompts ask once per install and never again after "Don't ask".
- The notification listener reads only the apps the user picked. SMS apps were removed, and it never replies or dismisses.
- Past-SMS import with consent, a 1/3/6/12-month range, progress, cancel and a summary.

**Files:**
- Kotlin: `MainActivity`, `NotificationListenerService`, `SpentXDetectionPrefs`, test `NotificationSourceTest.kt`.
- Dart: `lib/core/services/{auto_detection_native_sync,notification_permission_service}.dart`, `lib/features/auth/presentation/onboarding_screen.dart`, `lib/features/home/presentation/main_wrapper.dart`.
- Settings: `lib/features/settings/presentation/screens/{detection_permissions_screen,history_import_screen}.dart`, `settings_screen.dart`.
- SMS: `lib/features/sms/detected/{sms_history_import,sms_inbox_catch_up}.dart`, `lib/features/sms/sms_service.dart`, `lib/features/transactions/data/sms_receiver_service.dart`.
- Test: `test/phase1_permissions_sources_test.dart`.

**Tests:** `phase1_permissions_sources_test.dart` (11), `NotificationSourceTest.kt` (6).

**NOT TESTED on AIN065:** permission deny / Don't ask / Settings / restricted settings; granted → revoked → granted; per-app notifications; import on the real inbox; logcat check.

## Phase 2 – Parsing, status, transfers
**Commits:** `cb31c6c` (2026-10-22 07:27), `d8e13a7` (07:35). Audit fixes in `816550e`.

**Implemented**
- Parser:
  - Card last-4 kept separate from account last-4.
  - Balance, channel, status, UTR/RRN and the UPI ID taken from "To x@y On".
  - A beneficiary number is never used as the user's account.
- Account type comes only from explicit words.
- `status_classifier.dart`: pending, failed and cancelled rows are saved and visible but not counted; refunds link by reference only; reversals cancel the original's effect.
- `transfer_classifier.dart`: CC bill payment, wallet top-up, ATM → Cash, cash deposit, own ↔ own and own UPI are all transfers (spending +0).
- Notification-only transactions from payment apps go through `notification_parse_rules.dart`.
- The admin SMS rules (`sms_template_rules` / `sms_detection_rules` / `sms_block_rules`) sync into an offline cache through `sms_rules_refresh_service.dart`.
  - A row fingerprint applies add / update / disable / delete at the next sync.
  - The cache is reconciled in place and never wiped on a failed or empty read.
- An unparseable financial message goes to Needs review (`sms_parse_confidence.dart`) and is never silently dropped.
- Audit fixes: a refund links once and is capped at what is still refundable; an own transfer with no target is never sent as a transfer into Cash.

**Files (cb31c6c):** 27 files. See `git show --stat cb31c6c`, plus `d8e13a7`: `lib/core/sync/sms_rules_refresh_service.dart`, `test/phase2_parsing_test.dart`, `test/phase2_rule_sync_test.dart`.

**Tests:** `phase2_parsing_test.dart` (32 declarations; includes old, modified and unknown HDFC formats), `phase2_admin_rules_dedupe_test.dart` (7), `phase2_rule_sync_test.dart` (8), plus the existing `sms_regression_corpus_test.dart` / `sms_regression_test.dart`.

**Pending SQL:** `20261022120000_p2_sms_rules_version.sql` bumps rules_version on the SMS tables. Without it, the app falls back to `max(updated_at)` plus a daily full refresh, which can miss deletes.

**Known limits:** the plan checklist recorded a 33% category hit rate on the 63 real HDFC SMS dry-run before Phases 2–3. It was not re-measured on a phone afterwards.

**NOT TESTED:** on phone; a new admin template reaching the phone without an app update.

## Phase 3 – Person, category, purpose, learning
**Commit:** `9dc5845` (2026-10-22 08:02). Audit fix for the synced default purpose in `816550e`.

**Implemented**
- Admin global rules (`merchant_brands`, `merchant_brand_keys`, `merchant_keyword_rules`, `category_catalog`) sync to an encrypted offline cache through `global_merchant_rules_sync.dart`. A failed or empty download keeps the cache. The bundled `assets/rules/merchant_rules.json` is the first-run fallback (+ EKART, Amazon Bill Pay, mandi).
- Category order: user rule → global rule → Needs category, and the row is still added.
- Person payments without a rule get Needs classification and are not counted until resolved.
- Purpose order: user rule → Family contact → synced default (`purposes.is_default`, fixed in 816550e) → Personal. Never empty.
- User rules gain isFamily, kind (merchant/person) and revision. They sync with a two-step legacy fallback, and a pull keeps the device values until the migration runs.
- Learning happens on Quick Verify and on edits (category-only / purpose-only / title), and clears the Needs tags.
- Admin updates never touch user rules or saved transactions.
- My UPI IDs: `SelfUpiService` and a Soft UI screen. An own UPI counts as an own-money transfer.

**Files:** 28 files. See `git show --stat 9dc5845`. Key ones:
- `lib/core/sync/global_merchant_rules_sync.dart`
- `lib/features/sms/autosave/{merchant_category_engine,merchant_category_suggester,sms_auto_save_gate}.dart`
- `lib/features/sms/self_upi/{self_upi_service,my_upi_ids_screen}.dart`
- `lib/features/sms/v4/{edit_learning,merchant_learning_service}.dart`
- `lib/models/merchant.dart`, `assets/rules/merchant_rules.json`

**Tests:** `phase3_merchant_rules_test.dart` (16), plus updates to `detected_sms_tabs_test.dart` and `sms_auto_save_test.dart`.

**Pending SQL before release:** `p3_user_rules_v2`, `p3_user_self_upi`, `p3_global_rules_additions`. Until the first two run, learning is kept on the device. Locked rule 5 (learning survives a reinstall) depends on them.

**NOT TESTED:** on phone; reinstall / app-update survival of learning.

## Phase 4 – Accounts
**Commits:** `3ccbe37` (2026-10-22 09:10); audit fixes `816550e` (09:43); gap fixes `9a8e413` (10:10).

**Implemented**
- `AccountResolver` matches bank + last-4 + type + aliases + linked cards, decides credit vs debit only from explicit words, and asks once when the same bank shows a new number. `StrictAccountMatcher` delegates to it.
- Auto-create (only when Auto-add is on) needs 2 separate SMS, or 1 SMS with a balance. It never creates for the same bank (it asks instead), never reuses a number, starts the opening balance at 0, writes an audit entry and replays the kept SMS.
- Review card: "Is this your existing <bank> account or debit card?", and "Unassigned – link later".
- Unassigned:
  - Counts in spending but moves no balance.
  - `linkAccount` applies it once.
  - `unassignAccount` reverses it.
  - Transaction details shows Unassigned with a Link account button.
- Account sync always sends the evidence columns and verified_identity.
- Investments count only confirmed rows (matches the pending SQL `p4_investment_totals_status`).
- Audit fixes (816550e): a pulled row with no account and the needsAccount flag stays Unassigned (it used to become Cash); the account money in/out summary uses the totals rule; the Link account sheet follows dark mode.
- Gap fixes (9a8e413):
  - An **Unlink account** button with confirm + Undo.
  - **Safety 1 bank-balance mismatch warning** (`bank_balance_check.dart`, `bank_balance_warning.dart`):
    - Stores only the bank-quoted balance and its time.
    - Timing- and pending-aware, with a 1-rupee tolerance.
    - A warning card on the account detail screen; it never changes data.
  - **ref_key** server duplicate key (`tx_ref_key.dart`).

**Files:**
- `3ccbe37`: 21 files, including `lib/features/accounts/data/{account_auto_create,account_number_link,pending_account_provider}.dart`, `lib/features/sms/autosave/{account_resolver,strict_account_matcher}.dart`, `lib/features/transactions/presentation/widgets/link_account_sheet.dart`, `test/phase4_accounts_test.dart`.
- `816550e`: 7 files incl. `test/audit_phase0_4_fixes_test.dart`.
- `9a8e413`: 15 files incl. `lib/core/finance/tx_ref_key.dart`, `lib/features/accounts/data/bank_balance_check.dart`, `lib/features/accounts/presentation/widgets/bank_balance_warning.dart`, `test/phase4_gaps_test.dart`.

**Tests:** `phase4_accounts_test.dart` (21), `audit_phase0_4_fixes_test.dart` (12), `phase4_gaps_test.dart` (14).

**Known limits**
- Safety 1 is incomplete:
  - No "Use bank balance" adjustment entry.
  - No warning chip on the Account card / Accounts page; the warning shows on account detail only.
  - Bank accounts only (credit, cash and wallet are skipped).
  - Rows from another device that haven't been pulled yet can cause a false mismatch.
- The 23505 merge/keep-both path is unit-tested at the decision level only; no live Supabase test.
- "Move to another account in one atomic step" is done as unlink then link.

**Pending SQL:** `20261022140000_p4_investment_totals_status.sql` (before release); `20261022150000_p0_ref_key_live_index.sql` (recommended, optional now).

**NOT TESTED:** on phone, including dark/light screenshots of the new Unlink button and warning card.

---

## Open UI issues (reported, not fixed; outside the approved scopes)
- A grey "TOTAL OUT" badge in dark mode.
- Home shows "13 new" while Activity shows "18 new" (count mismatch).
- The Detected SMS account picker is white in dark mode.

## Incomplete work carried forward
See `SPENTX_REMAINING_WORK.md`: Phase 5, Phase 6, S5, S6, S6b, S7, S7b, S8, S10/V, optional S9; the release signing key; one test file per locked rule; device/release verification of everything above.
