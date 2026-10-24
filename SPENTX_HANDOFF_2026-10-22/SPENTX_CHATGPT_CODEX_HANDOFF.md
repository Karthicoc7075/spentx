# SpentX – Handoff to ChatGPT Codex (2026-10-22, IST)

Written 2026-10-22 ~15:00 IST by Claude Code, from the live repositories (git log / git status checked when this was written), the master plan and the earlier handoff files. No code, website, database or git history was changed while writing it. **If this file and the master plan ever disagree, the master plan wins.**

> **STOP RULE FOR THE NEXT AGENT.** Read this file and the master plan, verify the git state yourself, report what you found, and **STOP**. **Phase 6 is NOT approved.** Do not start any phase until Karthi (the owner) explicitly approves it.

---

## 1. Repositories

| | Path | Branch | HEAD | Remote | Working tree |
|---|---|---|---|---|---|
| **Flutter mobile app** (own git repo; ignored by the web repo) | `/Users/karthi/Documents/SpentX Web/spentx-web copy 3/Mobile app/SpentX` | `main` | `1ff48e8` | none (never add one) | clean |
| **Next.js website + Admin Panel + Supabase SQL** | `/Users/karthi/Documents/SpentX Web/spentx-web copy 3` | `main` | `65d0f15` | `origin` (GitHub) – **never push without approval** | see §10 (pre-existing uncommitted files) |

Shorthands used below: **APP** = mobile repo path, **ROOT** = website repo path, **KT** = `APP/android/app/src/main/kotlin/com/spentx/app/spentx`.

### Mobile commits (all on `main`, IST)
| Commit | Time | What |
|---|---|---|
| `d96669b` | 10-21 13:43 | Baseline before the work |
| `653d60d` | 10-21 14:08 | S5b crash-safe local box migrations |
| `932041a` | 10-21 14:53 | S1 secure login session storage |
| `94f5268` | 10-21 15:42 | S2 safe Hive encryption key |
| `42c2fd7` | 10-21 15:57 | S2b native queues off EncryptedSharedPreferences |
| `bb3597b` | 10-21 18:34 | S3 key loss handling without deleting data |
| `3a1fced` | 10-21 20:23 | S4 background single writer, refresh gate, durable SMS queue |
| `7ab1893` | 10-21 20:34 | S4 follow-up: keep pending SMS across sign-out / detection off |
| `fbd8a22` | 10-21 20:55 | Phase 0 data foundations |
| `789ea38` | 10-21 21:05 | Phase 0 compat (legacy round-trip, identical totals) |
| `b4c4b22` | 10-21 21:44 | Phase 1 permissions & sources |
| `cb31c6c` | 10-22 07:27 | Phase 2 parsing / status / transfers / admin rule sync |
| `d8e13a7` | 10-22 07:35 | Phase 2 rule-sync reconcile |
| `9dc5845` | 10-22 08:02 | Phase 3 merchant rules & permanent learning |
| `3ccbe37` | 10-22 09:10 | Phase 4 safe account detection |
| `816550e` | 10-22 09:43 | Audit fixes (pre-Phase 5) |
| `9a8e413` | 10-22 10:10 | Phase 4 gaps (Unlink UI, bank-balance warning, ref_key) |
| `ad603ba` | 10-22 13:36 | **Phase 5** auto-add formats, safe Undo, Unassigned / Needs category, plan-order dedupe |
| `ac2622f` | 10-22 14:08 | Outing auto-link: activation-time window, permanent unlink, confirmed spends only |
| `c35be78` | 10-22 14:19 | Outing totals: trip-total refresh self-dependency fix; total row never counted |
| `1ff48e8` | 10-22 14:36 | Outing: old total-row expenses left out of trip figures; trip times read as wall clock |

### Website commits relevant to this work
| Commit | Time | What |
|---|---|---|
| `f3a5ea6` | 10-21 14:08 | S5b Supabase backup / restore / migration safety |
| `f0dae45` | 10-21 14:19 | S5b live migration status audit |
| `65d0f15` | 10-22 14:36 | Outing auto-link (web): real trip window, confirmed payments only – **only `src/lib/outing-sync.ts`** |

---

## 2. Completed work (verify with `git log`)

Status legend: *Complete in code* = implemented + unit-tested (+ device evidence where noted). *Partial* = implemented and unit-tested, but device / release verification or part of the requirement is missing. **No phase is production-ready**: plan section "V – Real production verification" has not been run.

| Phase | Commits | Status | Notes |
|---|---|---|---|
| **S5b** backup & migration safety | APP `653d60d`; ROOT `f3a5ea6`, `f0dae45` | Partial | `SafeBoxMigration` copy → verify → swap → delete original last. `ROOT/supabase/backup/{backup.sh,restore_staging.sh,verify.sql,RESTORE.md}`. Restore on a staging copy **never rehearsed**; allowBackup / D2D on device NOT TESTED. |
| **S1** secure session | `932041a` | Partial | Session + PKCE verifier in Keystore-backed storage (`lib/core/services/secure_session_storage.dart`). Device: session moved, no plain token (Oct 21). Refresh / logout on device NOT TESTED. |
| **S2** safe Hive key | `94f5268` | Complete in code | Key never overwritten, key check before open, quarantine + `key_recovery_screen.dart`. Device-tested on AIN065 Oct 21. |
| **S2b** EncryptedSharedPreferences replaced | `42c2fd7` | Partial | `KT/QueueStoreCore.kt` (Keystore AES-GCM). The legacy-ESP migration code was **removed in S3** (`bb3597b`); an install that never ran an S2b build would not migrate old queue items. Re-check before shipping to other existing installs. |
| **S3** key loss without deletion | `bb3597b` | Complete in code | Unsynced-count warning, restore only when server answers, set-aside data (`set_aside_data_screen.dart`), rotation via `SafeBoxMigration.reencrypt`. Device-tested Oct 21. |
| **S4** single writer | `3a1fced`, `7ab1893` | Complete in code | `HiveWriterLock` (OS file lock, Kotlin + Dart), refresh gate, `DurableQueue`, `BootReceiver`, owner-tagged queue items kept on sign-out / detection off. Device-tested Oct 21; reboot / 50-SMS burst / kill mid-save NOT TESTED. |
| **Phase 0** data foundations | `fbd8a22`, `789ea38` (+ `816550e`, `9a8e413`) | Partial | Status, review flags, channel, rule id/version, source event ids, linked original, refunded amount, Unassigned, `countable.dart`, account evidence, `SourceEvidenceStore`, `AuditLog`. SQL applied + verified. Atomic local write is sequential (not one Hive transaction); no "Sync conflict" UI. |
| **Phase 1** permissions & sources | `b4c4b22` | Partial | Detection & Permissions screen, per-app notification picker (off by default), ask once, past-SMS import. Phone NOT TESTED. |
| **Phase 2** parsing / status / transfers | `cb31c6c`, `d8e13a7` | Partial | Card vs account last-4, balance, UTR, UPI; status + transfer classifiers; notification rules; admin SMS rule sync; Needs review. SQL p2 pending; 63-HDFC hit rate not re-measured. |
| **Phase 3** merchant rules & learning | `9dc5845` | Partial | Category user → global → Needs category; purpose order; isFamily / kind / revision; learning on verify/edits; My UPI IDs. 3 Phase 3 SQL files pending → learning stays on device; locked rule 5 reinstall survival NOT met until applied. |
| **Phase 4** accounts | `3ccbe37`, `816550e`, `9a8e413` | Partial | `AccountResolver`, `account_auto_create.dart` (2 SMS or 1 balance SMS), "existing account or debit card?" prompt, Unassigned link/unlink + Undo, bank-balance mismatch warning, `ref_key`. |
| **Phase 5** auto-add, dedupe, notifications | `ad603ba` | Partial (unit only) | See §6.4. Phone NOT TESTED. |
| **Outing auto-link fixes** (separate approved enhancement, not a phase) | APP `ac2622f`, `c35be78`, `1ff48e8`; ROOT `65d0f15` | Partial (unit / script only) | See §6.6. Phone and browser NOT TESTED. |

---

## 3. Remaining work – approved order (plan: "Suggested build order after approval" + "v6 – Production Release Finalization")

v6 scope: **all** of S1–S10 (incl. S2b, S5b, S6b, S7b) and Phases 0–6 are required; only S9 is optional. Nothing is "production-ready" until plan section **V** passes.

| # | Phase | Requirement source in the master plan |
|---|---|---|
| 1 | **Phase 6 – Privacy** (**NOT approved yet**) | "Phase 6 – Privacy (S–M)", item 21; overlaps S5 |
| 2 | **S5 – SMS privacy (MANDATORY)** | "v6 → S5 – SMS privacy (MANDATORY)" (+ Phase S "S5 Less SMS text") |
| 3 | **S6 – Screenshot block** | "Phase S → Changes → S6" |
| 4 | **S6b – Sessions + PIN** | "v5 corrections → S6b (new)" |
| 5 | **S8 – Supabase audit + fixes** (SQL files only; Karthi runs them) | "Phase S → S8" + "v5 corrections → S8 (expanded)" + "v6 → Security – all required" |
| 6 | **S7 – Release hardening** | "Phase S → S7" (Karthi creates the upload key + `android/key.properties`; never create or commit them) |
| 7 | **S7b – Google Play compliance** | "v5 corrections → S7b (new)" + "Google Play" section (web deletion page touches ROOT → needs permission) |
| 8 | **S10 / V – Real production verification** | "v5 corrections → S10 (expanded)" + "v6 → V – Real production verification" |
| 9 | **S9 – Certificate pinning** (optional, after launch) | "Phase S → S9" |
| – | Google Play submission | separate step, Karthi's approval; never submit/upload yourself |

Key details already known:
- **Phase 6 / S5:** no raw SMS text on transactions in release (hash only); remove SMS text from release logs and crash reports; export/delete for detection data; daily retention job; one redacting logger; Supabase payload whitelist; OTP dropped before storage.
  - Debug stores to clean: `APP/lib/features/sms/detected/sms_detection_debug_log.dart` and `APP/lib/core/debug/master_debug_log.dart`.
  - Notification history also stores amounts and merchants.
  - **`spentx_session_uid` is still in plain prefs**: `APP/lib/features/sms/autosave/sms_session_user.dart` and `KT/SpentXDetectionPrefs.kt`.
- **S6b:** PIN today is PBKDF2 20k rounds, no lockout (`APP/lib/core/services/pin_service.dart`); target 100k+ with an encrypted attempt counter and lockout.
- **S8:** current advisor findings (read-only, 2026-10-22) are listed in `SPENTX_REMAINING_WORK.md` → S8 and in `SPENTX_SQL_STATUS.md`:
  - 17 SECURITY DEFINER functions callable by `anon`;
  - 58 executable by `authenticated`;
  - view `monthly_plan_actuals` without `security_invoker`;
  - 30 functions with a mutable `search_path`;
  - `pg_trgm` in `public`;
  - leaked-password protection off;
  - `share_invite_deliveries` has RLS but no policies.

Carry-over items (close along the way, do not drop):
- **Locked-rule tests:** one test file per locked rule (`APP/test/locked_rule_1…8_*_test.dart`) does not exist yet. Coverage is spread across phase tests; Phase 5 rule-8 coverage is in `APP/test/phase5_autoadd_dedupe_test.dart`.
- **63-HDFC set:** the masked 63-sample HDFC regression set, and re-measuring its category hit rate.
- **Safety 1 leftovers:** "Use bank balance" adjustment entry, warning chip on the Account card / Accounts page, Review action.
- **Safety 5 leftovers:** single atomic local write; "Sync conflict" review UI.
- **S2b:** legacy-queue re-check (see §2).
- **Open UI issues:**
  - grey "TOTAL OUT" badge in dark mode;
  - Home "13 new" vs Activity "18 new";
  - Detected SMS account picker white in dark mode.

---

## 4. The eight locked financial rules (verbatim from the plan, "Locked rules – regression tests")

1. Purpose priority: user rule → Family → default purpose → Personal; never empty; purpose edit never changes category.
2. Account safety: exact match first; auto-create only with 2 events or balance SMS; beneficiary number never used; same-bank new last-4 asked once; Unassigned changes no balance.
3. Category priority: user rule → global list → Needs category (still added); global update never overwrites user rule.
4. UPI / people: display handle only, full UPI kept for matching; own UPI = transfer; Family contact = Family purpose; unsure person = Needs classification.
5. Permanent learning: Quick Verify, edits, Needs-category fix, Family mark all save rules; survive sync, reinstall, app update.
6. Missing merchant: genuine transaction always added and counted, never dropped.
7. Transfers: CC bill, wallet top-up, ATM → cash, own transfers = spending +0, one logical transfer.
8. Auto-add + notifications: 3 formats, no repeat alert on duplicate; safe Undo (only that action, account removed only if unused, audit kept).

Plus: duplicate protection (SMS + PhonePe = 1; two same-amount payments = 2; restart / re-import = no duplicates), status (pending/failed not counted, refund and reversal adjust the original), history import dedupe, permission denied/revoked paths.

"Decisions (settled)" in the plan also hold: no fuzzy matching; Needs category and Unassigned confirmed expenses count in spending; Unassigned changes no balance until linked; OTPs never processed; pending / failed / cancelled rows visible but never counted.

**These rules may not be changed, relaxed or simplified without Karthi's explicit permission.**

---

## 5. Architecture (as implemented)

- **Mobile:** Flutter 3.41.7 / Dart, Riverpod (2.6.1) state, Hive local DB encrypted with AES-256 (key in Android Keystore via flutter_secure_storage), offline-first outbox synced to Supabase.
- **Native Android (Kotlin, KT):** used only for capture and queues.
  - `SmsReceiver.kt`, `NotificationListenerService.kt`: capture only.
  - `DurableQueue.kt` / `SecureQueueStore.kt` / `QueueStoreCore.kt`: encrypted queue (Keystore AES-256-GCM).
  - `HiveWriterLock.kt`: OS file lock.
  - `SpentXBackgroundWorker.kt` + `SmsWorkScheduler.kt`: unique WorkManager job.
  - `BootReceiver.kt`; `SpentXDetectionPrefs.kt`; `MainActivity.kt` (method channels).
- **Backend:** Supabase Postgres with RLS. The live DB has **no `schema_migrations` table**: Karthi applies SQL files by hand in the SQL editor. The project ref is in the existing `SPENTX_SQL_STATUS.md`; no URLs or keys are written anywhere.
- **Website (ROOT):** Next.js 16.2.10 + TypeScript.
  - Admin pages `ROOT/src/app/admin`, admin API `ROOT/src/app/api/admin`, admin components `ROOT/src/components/admin`.
  - Website tests are plain `node:assert` scripts under `ROOT/scripts/test-*.ts`, run with `npx tsx` (`npm test`).
- **Toolchain on the Mac:**
  - Flutter `$HOME/development/flutter/bin`; JDK 17 `/opt/homebrew/Cellar/openjdk@17/17.0.14/libexec/openjdk.jdk/Contents/Home`.
  - adb `/Users/karthi/Library/Android/sdk/platform-tools/adb`; test phone **AIN065 (Android 16)** over wireless adb. The port changes every time: `adb mdns services`, `adb connect`, and always pass `-s <serial>`. The phone holds real data: back up before `install -r`, never uninstall or clear data.
- **Test runner note:** the first `flutter test` after a `pub get` can stall for minutes while the `objective_c` native-assets hook rebuilds. Wait; don't delete lock files.

### SMS / notification pipeline (do not rebuild it)
1. **Capture.**
   - `KT/SmsReceiver.kt` captures SMS.
   - `KT/NotificationListenerService.kt` reads only the apps the user picked (off by default; SMS apps excluded).
   - OTP-only text is dropped before storage.
2. **Queue first.** Each item goes into `KT/DurableQueue.kt`.
   - It is acknowledged only after a successful save.
   - Items are owner-tagged and never cleared on sign-out or when detection is turned off.
3. **One writer.** `KT/HiveWriterLock.kt` + `APP/lib/core/sync/hive_writer_lock.dart`.
   - App open: the main isolate saves.
   - App closed: the WorkManager job saves through `APP/lib/features/sms/background/background_sms_processor.dart`.
   - The worker never refreshes or removes the Supabase session; it defers instead.
4. **Entry point.** `APP/lib/features/sms/detected/sms_detection_pipeline.dart` → `SmsDetectionPipeline.processInbound`.
   - Applies the "money moved" gate and the bank allowlist (allowed / blocked / **discovery**).
   - Parses the message and routes it to `AutoRuleEngine.handleForeground` (app open, with UI context) or `AutoRuleEngine.handleBackgroundSms`.
5. **Parse.**
   - Admin templates first: `lib/features/sms/rules/engine/sms_rule_engine.dart`.
   - Then the fallback parser `lib/features/sms/v4/bank_sms_v4_parser.dart`.
   - Then facts and confidence via `lib/features/sms_parser/{status_classifier,transfer_classifier,sms_parse_confidence}.dart`.
   - Notification text uses `notification_parse_rules.dart`.
6. **Engine.** `APP/lib/features/sms/detected/auto_rule_engine.dart`:
   - `_checkDuplicate` (Phase 5 dedupe, §6.4) → `SmsAutoSaveGate.evaluate` → either `_autoSaveTrusted` (the only auto-save path) or `_commitUnknownMerchantPending` (Detected SMS review queue).
   - `handleReviewOnly` files status-only and unreadable messages to review.
7. **Save + side effects.**
   - Ledger via `TransactionNotifier.addTransaction` (`lib/features/transactions/data/transaction_provider.dart`), or a direct Hive append in the background.
   - Evidence: `SourceEvidenceStore`; dedupe registry; `AuditLog`; bank-quoted balance (`BankBalanceStore`).
   - Notification via `SmsNotificationService.showAutoSaved` with the Phase 5 copy; then the outbox sync (`lib/core/sync/sync_service.dart`, mapping in `supabase_schema_map.dart`).
8. **Review.**
   - `lib/features/sms/detected/detection_queue.dart`: `DetectionQueueNotifier.confirmTransaction`, quick verify, `verifyBlockReason`.
   - `lib/features/sms/detected/detection_popup.dart`: the review card.
   - Notification taps / Undo: `lib/core/services/notification_click_handler.dart`.

### Rules synced from the Admin Panel (reuse; never build a parallel rule system)
- **SMS rules:** `sms_template_rules` / `sms_block_rules` / `sms_detection_rules` → `APP/lib/core/sync/sms_rules_refresh_service.dart`. Uses a row fingerprint, reconciles the offline cache in place, and never wipes it on a failed or empty read.
- **Global merchant rules:** `merchant_brands`, `merchant_brand_keys`, `merchant_keyword_rules`, `mcc_category_map`, `category_catalog` → `APP/lib/core/sync/global_merchant_rules_sync.dart`. Encrypted cache; `APP/assets/rules/merchant_rules.json` is only the first-run fallback.
- **Precedence:** user rules (`user_merchants`, `user_merchant_category`) always beat global rules. Admin updates never overwrite user choices or change saved transactions.

### Soft UI (finalized – do not redesign)
- **Tokens:** `APP/lib/core/theme/spentx_tokens.dart` (`SpentXColors` light/dark, `AppRadius`, `AppShadows`, `AppSpacing`, `AppType`, `context.tokens`).
- **Palette:** `APP/lib/core/theme/soft_palette.dart`.
- **Shared widgets:** `APP/lib/core/widgets/soft_page_kit.dart` (`SoftKitCard`, `SoftKitButton`, …).
- Each feature has its own kit. Every screen must work in light and dark mode; no hard-coded colours.

---

## 6. Important files and how existing features work

### 6.1 Storage, security, sync
| Area | File | Key points |
|---|---|---|
| Encrypted Hive | `lib/data/local/hive_service.dart` (`SecureHive`) | Sniffs the file format before opening; only the main isolate migrates. |
| Hive key | `lib/data/local/hive_key_manager.dart` | Never overwrites the key; quarantine on mismatch. |
| Safe migrations | `lib/data/local/safe_box_migration.dart` | Copy → verify → swap → delete the original last. |
| Session | `lib/core/services/secure_session_storage.dart`, `auth_service.dart` | Keystore-backed session. |
| Writer lock | `lib/core/sync/hive_writer_lock.dart` | Paired with `KT/HiveWriterLock.kt`. |
| Sync | `lib/core/sync/sync_service.dart`, `supabase_schema_map.dart` | Outbox upsert by id. Delete = soft delete (`is_active=false`, `deleted_at`). Transactions push `ref_key`, `balance_applied`, `review_flags`, `tags` (see §6.6). Unassigned rows push `account_id = null`. |
| Totals rule | `lib/core/finance/countable.dart` | `Countable.inTotals`, `affectsBalance`, `spendingView`: the single totals rule. |
| Server duplicate key | `lib/core/finance/tx_ref_key.dart` | `v1:<account>:<d/c/t>:<paise>:<ref>`. A 23505 error → merge or keep both, never drop. |
| Audit | `lib/core/audit/audit_log.dart` | Local, encrypted, append-only. Actions: autoAdd, undo, ruleChange, accountCreate, accountLink, duplicateMerge, accountUndo. |

### 6.2 Phase 0–3 building blocks
- **`lib/models/transaction.dart`**
  - Fields: status (`TxStatus`), `reviewFlags` (`needsCategory` / `needsAccount` / `needsClassification`), channel, ruleId/ruleVersion, `sourceEventIds`, `linkedOriginalId` + `linkKind`, `refundedAmount`, `refKey`, `balanceApplied`.
  - **`tags`** (kept since `ac2622f`; `outingUnlinked` = `outing-unlinked` tag).
  - `isUnassigned` = `needsAccount`.
- **`lib/models/pending_transaction.dart`:** a review item; `reviewReason`, `outingUnlinked`.
- **`lib/features/sms/evidence/source_evidence_store.dart`:** one hash-only record per SMS/notification (uid + text + minute). It is permanent, unlike the 14-day registry.
- **Purpose and category:** `lib/features/sms/autosave/merchant_category_suggester.dart` (category user → global → Needs category; purpose user → Family → default → Personal).
- **Learning:** `lib/features/sms/v4/merchant_learning_service.dart`, `edit_learning.dart`.
- **Own UPI:** `lib/features/sms/self_upi/self_upi_service.dart`.

### 6.3 Phase 4 accounts
- **Matching:** `lib/features/sms/autosave/account_resolver.dart` returns `matched` / `ambiguous` / `sameBankNew` / `unknown`; `strict_account_matcher.dart` delegates to it.
- **Auto-create rule:** `lib/features/accounts/data/account_auto_create.dart`. Runs from `lib/features/accounts/data/pending_account_provider.dart` (`autoCreateReady`, UI isolate only), then books the kept SMS through `lib/features/sms/detected/discovery_replay.dart`.
- **Unknown banks:** SMS from a bank the user has not added become account suggestions (`lib/core/services/account_discovery_service.dart`). They are **not** added as Unassigned (see §9).
- **Ledger operations:** `TransactionNotifier.linkAccount` / `unassignAccount` change a balance exactly once, because balances are computed from the ledger.
- **Bank balance:** `lib/features/accounts/data/bank_balance_check.dart` stores only the bank-quoted balance and warns on mismatch; it never changes data.

### 6.4 Phase 5 (`ad603ba`) – auto-add, dedupe, notifications
- **Policy:** `sms_auto_save_policy.dart` (`AutoSaveInput.unassignedAllowed`, `needsCategoryAllowed`) and `sms_auto_save_gate.dart` (`SmsAutoSaveGate.evaluate`, `confirmedExpense`, `dedupeKeyFor`, `statedTime`).
  - Karthi's approved rule (Safety 4): with Auto-add ON, a confirmed expense whose account is unknown or ambiguous is saved as **Unassigned** (no balance change).
  - In "auto-save all" mode, an expense no rule can categorize is saved as **Needs category**.
  - Still sent to review:
    - same bank + new number (asked once);
    - status-only messages (pending / failed / cancelled), refunds, reversals and transfers;
    - an unclear direction;
    - credits;
    - person payments (Needs classification);
    - a trusted rule whose category was deleted.
- **Dedupe:** `sms_dedupe_registry.dart`, using `SmsDedupeRegistry.compare` → `DedupeMatch.same | unsure | different`, in plan order:
  1. reference + account + amount;
  2. source event id;
  3. account + amount + direction + merchant + time.
  - A shared reference alone never merges two payments (Flipkart regression).
  - Never amount only. "Unsure" means keep both: the new item goes silently to review with `reviewReason = possible_duplicate`.
  - Delayed SMS use a time only when the text itself states it (`statedTime`).
  - The SMS / notification source is part of the key (`DedupeSource`).
  - Processed references keep account, amount and direction (`markProcessedRef` / `processedRefMatch`).
  - `AutoRuleEngine._checkDuplicate` compares against the evidence store, registry, processed refs, the ledger (`ledgerKey`) and pending items (`pendingKey`).
- **Notifications:** `sms_notification_copy.dart` (`SmsNotificationCopy.autoAdded` → `AutoAddNotice`) and `sms_notification.dart` (`showAutoSaved`). Formats:
  1. "₹250 added • HDFC • Food" (Review + Undo);
  2. "New account HDFC ••0987 added. ₹500 debit recorded." (Undo);
  3. "₹350 added • Needs category" (Review + Undo);
  4. the Unassigned variant.
  - Formats 2–4 are posted even while the app is open, unless the in-app snackbar already showed the same text, and are never folded into the "N transactions saved" summary.
- **Undo:** `sms_auto_save_undo.dart` + `sms_auto_save_actions.dart` (`undo` / `undoWith`, `decideAccountUndo`, `undoAutoCreatedAccount`).
  - Undo removes only that transaction (server soft delete), marks its evidence "undone", and keeps the audit entry.
  - On a new-account notification, the auto-created account is removed only if it is unused, not a user account and not the last account.
  - That suggestion is never auto-created again (`autoCreateDeclined`).

### 6.5 Outing / trip model (pre-existing)
- **Model + provider:** `lib/features/groups/data/outing_provider.dart` (`Outing`, `OutingExpense`, `OutingNotifier`).
  - One open trip at a time; lifecycle in `expireEndedOutings`.
  - `reconcileTransactionExpenses` backfills trip expenses for linked rows; `syncTransactionExpense` handles auto-split.
- **Other trip files:**
  - linking rules: `lib/core/utils/outing_link_rules.dart`;
  - totals: `lib/core/utils/outing_totals.dart` (`computeOutingTotalSpend`, `isOutingRollupTransaction`);
  - total row + `total_spent`: `lib/core/utils/outing_total_refresh.dart`;
  - SMS-side trip lookup: `lib/features/sms/detected/active_outing_helper.dart`.
- Friend repayments for a trip net against its cost (existing, tested).

### 6.6 Outing fixes after Phase 5 (APP `ac2622f`, `c35be78`, `1ff48e8`; ROOT `65d0f15`)
- **One linking rule** (`outingAdoptsAt`, `outingForAutoLink`, `transactionAutoLinkable` in `outing_link_rules.dart`):
  - the trip must be active now;
  - the payment's own time must fall between the trip's **activation time** and the end of its last day;
  - confirmed expenses only;
  - never income (except a friend repaying the trip), transfers, pending / failed / cancelled / reversed rows, unsure person payments, total rows, or a row carrying `outing-unlinked`.
- **Activation time:** `OutingNotifier.withActivationTime` stamps a trip started today with the current time.
- **Payment time:** `AutoRuleEngine.tripEventTime` uses the time the SMS states, otherwise arrival time.
- **Unlink is permanent:** `TransactionNotifier.outingTagsAfterChange` adds the website's existing `outing-unlinked` tag; linking again by hand removes it.
  - `Transaction.tags` now round-trips.
  - `TransactionMap.toRemote` rebuilds derived tags (`friend_split`, `transfer`, `bank:`, `last4:`, `upi:`, …) and carries the others through.
- **Review card:** `PendingTransaction.outingUnlinked` + `confirmTransaction(outingUnlinked:)`. The popup links only when the item's own time is inside the trip window.
- **Background saves:** catch-up runs on resume (`APP/lib/main.dart`) and after a background-path save while the app is open (pipeline).
- **Trip-total refresh root cause:** `refreshOutingTotalSpent(Ref)` was called with each notifier's own `ref`, a self-dependency Riverpod rejects in debug builds.
  - Fix: the new `applyOutingTotalSpent(...)` takes its inputs explicitly.
  - Queued refreshes skip a disposed notifier.
- **Total rows:** the trip's own "Outing total" row is never backfilled or counted.
  - Old backfilled ones are **set aside in memory** (`OutingNotifier._setAsideSummaryExpenses`; ids remembered in the settings key `outing_summary_expense_ids`) and written back unchanged on save. Stored data is not modified.
- **Trip times are wall-clock values:** the app sends local time without an offset, the website sends a bare date, and the server keeps both as if UTC.
  - `outingWallClock` reads them back as the same local time.
- **Website (`ROOT/src/lib/outing-sync.ts`):**
  - `isWithinOutingWindow(outing, at, timeZone?)`: real start moment to the end of the last day; a date-only start (bare date or exact midnight) covers the whole day; the time zone is the viewer's by default or passed explicitly.
  - `isOutingSpendStatus`: non-confirmed payments are never candidates, also for rows already tagged with a trip.
  - `getOutingCandidatesForTransaction(..., timeZone?)` uses both. `outing-unlinked` behaviour is unchanged.
  - `isWithinOutingDates` is kept for "is the trip open today" checks.
  - The website hook that calls it is `ROOT/src/hooks/useOutingTransactionSync.ts` (unchanged).

---

## 7. Supabase SQL status (files only; Karthi runs them; never execute SQL that writes)

Status was checked read-only on 2026-10-22 by the previous agent (details: `SPENTX_HANDOFF_2026-10-22/SPENTX_SQL_STATUS.md`, `ROOT/supabase/migration-checks/STATUS-2026-10-21.md`). The live DB has no `schema_migrations` table, so status is inferred from catalog objects. **Re-check read-only before claiming anything is applied.**

**Applied and verified (never rerun):**
- `ROOT/supabase/migrations/20261021120000_p0_tx_status_flags.sql` and `ROOT/supabase/migrations/20261021120100_p0_account_evidence.sql`.
  - Karthi applied them on 2026-10-22, ~08:20–08:35 IST, after the backup `~/spentx-backups/20261022T024741Z`.
  - The BEFORE/AFTER snapshots `ROOT/supabase/migration-checks/p0_snapshot_{BEFORE,AFTER}_2026-10-22.txt` are identical.
- Everything earlier is applied per `STATUS-2026-10-21.md` (incl. `ROOT/supabase/migrations/20261012_goal_investment_sync.sql`, recorded there as Applied), except the pending items below.

**Pending – 8 files, none run on live:**

| # | File | Check folder (`ROOT/supabase/migration-checks/…`) | Needed | Depends on |
|---|---|---|---|---|
| 1 | `ROOT/supabase/migration-checks/20261004000100_protect_user_roles/post_step_restore_function.sql` | same folder | **Before release** (live `protect_user_role()` has the older body) | trigger already live |
| 2 | `ROOT/supabase/migrations/20261021_signup_phone.sql` | `20261021_signup_phone/` | Before release | run with #1 |
| 3 | `ROOT/supabase/migrations/20261022120000_p2_sms_rules_version.sql` | `20261022120000_p2_sms_rules_version/` | Before release (without it: max(updated_at) + daily refresh, misses deletes) | existing `mcr_bump_rules_version` |
| 4 | `ROOT/supabase/migrations/20261022130000_p3_user_rules_v2.sql` | `20261022130000_p3_user_rules_v2/` | **Before release** (locked rule 5) | – |
| 5 | `ROOT/supabase/migrations/20261022130100_p3_user_self_upi.sql` | `20261022130100_p3_user_self_upi/` | **Before release** (My UPI IDs sync) | – |
| 6 | `ROOT/supabase/migrations/20261022130200_p3_global_rules_additions.sql` | `20261022130200_p3_global_rules_additions/` | Before release | – |
| 7 | `ROOT/supabase/migrations/20261022140000_p4_investment_totals_status.sql` | `20261022140000_p4_investment_totals_status/` | Before release | Phase 0 (applied) |
| 8 | `ROOT/supabase/migrations/20261022150000_p0_ref_key_live_index.sql` | `20261022150000_p0_ref_key_live_index/` | Optional now, recommended before release | Phase 0 (applied) |

No new SQL was written for Phase 5 or the Outing fixes.

**Suggested order:** backup → 1 → 2 → 4 → 5 → 6 → 3 → 7 → 8.

**Process for each file:**
1. Backup with `ROOT/supabase/backup/backup.sh`. The DB URL is pasted at a hidden prompt; never write it anywhere.
2. Snapshot with `p0_snapshot.sql`.
3. `precheck.sql` (every row ok).
4. Run the migration once.
5. `verify.sql`.
6. Keep `rollback.sql` ready.

Guides: `ROOT/supabase/migration-checks/P0_RUN_GUIDE.md`, `MIGRATION_TEMPLATE.md`, `ROOT/supabase/backup/RESTORE.md`. The restore rehearsal on a staging copy (`restore_staging.sh`) has **never been run**.

**Read-only checks Karthi still has to run (SQL Editor):**
1. **Schema check.** Expected: `tags` = ARRAY, `outing_id` = uuid, `start_date` / `end_date` = timestamp with time zone.
   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE table_schema = 'public'
   AND (
     (table_name = 'transactions' AND column_name IN ('tags', 'outing_id'))
     OR (table_name = 'outings' AND column_name IN ('start_date', 'end_date'))
   )
   ORDER BY table_name, column_name;
   ```
2. **Wall-clock storage check.** A trip started at 2:07 pm on the phone should show `14:07…+00:00`.
   ```sql
   SELECT title, start_date, end_date FROM public.outings ORDER BY created_at DESC LIMIT 5;
   ```
3. **Total-row cleanup investigation** (see §9):
   ```sql
   SELECT oe.id, oe.outing_id, oe.amount, t.note
   FROM public.outing_expenses oe
   JOIN public.transactions t ON t.id = oe.linked_transaction_id
   WHERE oe.deleted_at IS NULL
     AND (t.tags @> ARRAY['outing-rollup'] OR t.note ILIKE 'Outing total%' OR t.note ILIKE 'Your share of %')
   ORDER BY oe.outing_id;
   ```

---

## 8. Last verified test results (run 2026-10-22, IST, by Claude Code)

| Check | Result | When / tree |
|---|---|---|
| `flutter test` (all of `APP/test`) | **700 / 700 passed**, 0 failed, 0 trip-total refresh errors | ~14:35, the tree committed as `1ff48e8` |
| `flutter analyze` | 0 errors, 0 warnings, 22 infos (pre-existing) | same |
| `cd android && ./gradlew :app:testDebugUnitTest --rerun-tasks` (JDK 17) | **33 passed**, 0 failed | 09:05 UTC (14:35 IST) |
| `flutter build apk --debug` | Built | same |
| Website `npx tsc --noEmit -p .` | 0 errors | ~14:30, before commit `65d0f15` |
| Website `npx eslint src/lib/outing-sync.ts` | clean | same |
| Website `npm test` (existing suites) | all passed | same |
| Website `npm run build` (next build) | succeeded | same |
| Website outing window / status / unlink check (scratch script, not in the repo) | passed under **TZ=Asia/Kolkata** and **TZ=UTC** (incl. New York DST) | same |

**Release build: BLOCKED.** `APP/android/key.properties` does not exist; release signing fails closed by design. R8, obfuscation and any release-build test are therefore unverified. Karthi creates the key; never create or commit it.

**NOT TESTED** (on phone AIN065 / in a browser):
- **Phases 0–5 on the phone:**
  - permission flows (deny / Don't ask / Settings / restricted settings; revoked mid-use);
  - per-app notifications;
  - past-SMS import on the real inbox;
  - background SMS with the app closed or killed; reboot with items queued; 50-SMS burst; kill mid-save;
  - totals and balances unchanged against the pre-install backup;
  - auto-create, the "existing account or debit card?" prompt, link / unlink / Undo, the bank-balance warning;
  - the 3 notification formats with Undo from a notification while the app is closed;
  - possible-duplicate items;
  - new screens in light and dark mode.
- **S1:** token refresh, logout, worker refresh on the device.
- **S5b:** allowBackup / data-extraction rules; restore on staging.
- **Outing on the phone:**
  - start a trip mid-day: an earlier spend stays out, later SMS and notification spends link;
  - unlink, restart and open the website: it stays unlinked;
  - popup unlink, then confirm: it stays unlinked;
  - with the app closed, a new SMS appears in the trip after reopening;
  - after the trip ends, nothing new links;
  - link / unlink / reversal / amount edit update the banner, trip detail and Outing total row;
  - after a restart the total doesn't double; "Your paid" drops on affected trips;
  - the trip start time survives a sync.
- **Outing in the browser:** with the website open, an earlier same-day SMS spend, a reversed payment and an unlinked transaction must not attach.
- **Wider:** a second device brand, Android 17 (an emulator is OK if labelled), two devices on one account, offline → sync, upgrade from the installed version with real data.

---

## 9. Remaining bugs and limitations

1. **Outing total rows on the website (needs Karthi's approval to clean):** older app builds could turn a trip's own "Outing total" row into a trip expense, and the website's rollup rows carry `outing_id`. The phone now ignores these rows, but the server still holds such `outing_expenses` rows, so **website trip totals may still include them**.
   - Investigation: read-only query #3 in §7.
   - Proposed fix, only if rows exist and Karthi approves: a migration file with precheck / verify / rollback, after a backup, that **soft-deletes** (`deleted_at`) only those rows. Karthi runs it.
   - Never delete or rewrite financial records without approval.
2. **Website trip creation:** trips created on the website have no start time (the form saves a date), so they start at the beginning of their start day. Changing `ROOT/src/components/outings/CreateOutingModal.tsx` needs permission.
3. **Date-only transactions** on the day of a timed trip start are not auto-linked on the website; their time can't be proven to be after the start.
4. **The `outing-unlinked` tag is global, not per trip.** Kept deliberately: trips never overlap, a payment's time is fixed, and manual linking always works and clears the tag.
5. **No auto-link after a trip ends,** not even for a delayed SMS about a spend made during the trip; the user links it by hand. Backdated trips do not sweep in existing ledger rows.
6. **Payment-app notifications usually lack account and reference,** so the matching bank SMS goes to review as a possible duplicate instead of merging. That's safe, but adds review items when notification capture is on. A merge when only the account is missing on the notification side is a possible change, not approved.
7. **The possible-duplicate reason** is stored on review items, but the Detected SMS screen does not show it; adding a label is a UI change and needs approval.
8. **The burst summary** "N transactions saved" offers Review but no per-item Undo (existing behaviour).
9. **Unknown-bank SMS** are held as account suggestions (Phase 4 discovery) and booked when the account is added. They are not added as Unassigned; this needs a decision.
10. **Safety 1 / Safety 5 leftovers, the S2b legacy-queue note, the locked-rule test files and the open UI issues:** see the carry-over list in §3.
11. **Supabase advisor findings for S8:** see §3.
12. **Privacy (Phase 6 / S5):** the SMS debug log, master debug log and notification history store amounts, merchants and previews; `spentx_session_uid` is in plain prefs.

---

## 10. Website files with existing uncommitted changes – DO NOT TOUCH

These pre-date this work. Do not stage, commit, revert, reformat or edit them:
- `ROOT/src/components/dashboard/DashboardPage.tsx`
- `ROOT/src/components/shared/AddTransactionSlideOver.tsx`
- `ROOT/src/components/transactions/TransactionsPage.tsx`
- `ROOT/src/components/wealth/NewSavingsGoalModal.tsx`
- `ROOT/src/components/wealth/QuickDepositModal.tsx`
- `ROOT/src/lib/invalidate-financial-data.ts`
- `ROOT/src/lib/investments.ts`
- `ROOT/src/lib/mock-data.ts`

Also uncommitted in ROOT; leave as is unless Karthi asks:
- **Modified:** `ROOT/supabase/migration-checks/STATUS-2026-10-21.md`.
- **Untracked:**
  - this handoff folder `ROOT/SPENTX_HANDOFF_2026-10-22/`;
  - the SQL migrations `ROOT/supabase/migrations/{20261012_goal_investment_sync,20261021120000_p0_tx_status_flags,20261021120100_p0_account_evidence,20261021_signup_phone,20261022120000_p2_sms_rules_version,20261022130000_p3_user_rules_v2,20261022130100_p3_user_self_upi,20261022130200_p3_global_rules_additions,20261022140000_p4_investment_totals_status,20261022150000_p0_ref_key_live_index}.sql`;
  - their 8 check folders under `ROOT/supabase/migration-checks/`;
  - `P0_RUN_GUIDE.md`, `p0_snapshot.sql` and the two snapshot `.txt` files.

Do not modify the website, Admin Panel or Supabase tables / policies without explicit permission. The only approved website edit so far was `src/lib/outing-sync.ts` (done in `65d0f15`).

---

## 11. Plan and earlier handoff documents

| Document | Path |
|---|---|
| **Master plan v6 (source of truth)** | `/Users/karthi/SpentX-detection-change-plan.md` |
| Unchanged copy (sha256 starts `de8c1e34a6e20cc3`, same as the source) | `ROOT/SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md` |
| Earlier handoff (Phase S – Phase 4 detail) | `ROOT/SPENTX_HANDOFF_2026-10-22/SPENTX_HANDOFF.md` |
| Remaining work (detail per phase) | `ROOT/SPENTX_HANDOFF_2026-10-22/SPENTX_REMAINING_WORK.md` |
| SQL status | `ROOT/SPENTX_HANDOFF_2026-10-22/SPENTX_SQL_STATUS.md` |
| Test status (as of `9a8e413`) | `ROOT/SPENTX_HANDOFF_2026-10-22/SPENTX_TEST_STATUS.md` |
| File map | `ROOT/SPENTX_HANDOFF_2026-10-22/SPENTX_FILE_MAP.md` |
| Earlier continuation prompts (superseded by this file for current state) | `ROOT/SPENTX_HANDOFF_2026-10-22/SPENTX_MASTER_CONTINUATION_PROMPT.md`, `SPENTX_NEXT_AI_PROMPT.md` |
| **This file** | `ROOT/SPENTX_HANDOFF_2026-10-22/SPENTX_CHATGPT_CODEX_HANDOFF.md` |

The earlier files describe the state at `9a8e413` (before Phase 5). Where they differ from this file about the current state, this file is newer; where anything differs from the master plan, the plan wins.

---

## 12. Strict workflow (Karthi's rules)

1. **One approved phase at a time.** Read the plan section, inspect the code and `git status` / `git log` in both repos, and list exactly what is missing.
2. **Implement only that phase.** Reuse existing services (§5–§6); no parallel systems, no unrelated refactors, no placeholders, TODO stubs or fake data.
3. **Test:**
   - targeted `flutter test test/<file>_test.dart` while working;
   - at the end: `flutter test`, `flutter analyze`, the Kotlin `./gradlew :app:testDebugUnitTest` (JDK 17) and `flutter build apk --debug`;
   - for website work: `npx tsc --noEmit`, `npm test`, `npm run build`.
   - Fix real failures; **never weaken or delete tests** to make them pass. When an approved rule change makes an old test wrong, update it and say so.
4. **Commit only that phase's files**, in the right repository, with a clear message. Never include unrelated uncommitted files (§10).
5. **Report** briefly in plain language: what changed, real test numbers, SQL needed (files only), and everything NOT TESTED.
6. **STOP and ask Karthi for approval** before the next phase. Inside an approved phase, ask only for anything destructive, touching the database, outside scope (website / Admin Panel, push, keys) or changing a locked rule.

Never do these:
- **Git:** `git reset`, `checkout --`, `clean`, stash-drop, rebase, force-push, or any push without approval. Never add a remote to the mobile repo.
- **SQL:** never execute SQL that writes to production. Write migration + precheck + verify + rollback files; Karthi runs them. Live checks are read-only.
- **Secrets:** never put secrets, DB URLs, passwords, keys, `key.properties` or keystores in files, commands, chat or commits, and never create signing keys.
- **Privacy:** never put SMS text, OTPs, amounts, account numbers, UPI IDs or tokens in logs or Supabase.
- **Data:** never delete or overwrite financial records, local Hive / quarantine / set-aside data or queued SMS. Data cleanup needs a read-only investigation first and Karthi's permission.
- **Claims:** never claim tests passed without running them. Never claim "production-ready"; anything not run is **NOT TESTED**. Report device and emulator results separately.
- **UI:** keep the finalized Soft UI (light and dark); no redesigns.

**Current status: NOT ready for Google Play. Phase 6 is NOT approved. The next agent must review this handoff, verify the git state, report, and STOP.**
