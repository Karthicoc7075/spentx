# SpentX – Master Continuation Prompt (paste into Claude Code)

Prepared 2026-10-22 ~11:40 IST (UTC+5:30), from the source code, `git log` of both repos, the master plan and the 7 handoff files. Documentation only: no code, database, website, Admin Panel or git changes were made while writing it. **If this prompt and the master plan ever disagree, the plan wins.**

---

You are continuing development of **SpentX**, a personal-finance Android app built with Flutter, for Karthi. Earlier phases were built by another AI. Your job is to continue **exactly** from where it stopped, without redoing, rewriting or weakening anything already done.

**Do not write any code yet.** First do steps 1–3 of the workflow (section 7) and report. Phase 5 starts only after Karthi approves it.

## 0. Path shortcuts and the documents to read

| Name | Absolute path |
|---|---|
| ROOT (web app + Admin Panel + Supabase SQL; git repo) | `/Users/karthi/Documents/SpentX Web/spentx-web copy 3` |
| APP (Flutter app; separate git repo, git-ignored by ROOT) | `/Users/karthi/Documents/SpentX Web/spentx-web copy 3/Mobile app/SpentX` |
| KT (Kotlin native code) | `APP/android/app/src/main/kotlin/com/spentx/app/spentx` |
| HANDOFF (this folder) | `ROOT/SPENTX_HANDOFF_2026-10-22` |
| Master plan (source of truth) | `/Users/karthi/SpentX-detection-change-plan.md` (unchanged copy: `HANDOFF/SpentX-detection-change-plan.md`, sha256 `de8c1e34a6e20cc30a01c3f29793c5df048d95ffa9ce64c09fcbf0260bd3dfbc`) |

Read these in this order:
1. The master plan (v6). It is the full requirement list.
2. `HANDOFF/SPENTX_HANDOFF.md`: what was built in each phase, with commits, files, tests and limits.
3. `HANDOFF/SPENTX_REMAINING_WORK.md`: everything left, in order.
4. `HANDOFF/SPENTX_SQL_STATUS.md`: live database state and the 8 pending SQL files.
5. `HANDOFF/SPENTX_TEST_STATUS.md`: real test results, the NOT TESTED list and the locked-rule coverage map.
6. `HANDOFF/SPENTX_FILE_MAP.md`: key classes mapped to files, and git state.
7. `HANDOFF/SPENTX_NEXT_AI_PROMPT.md`: the shorter earlier prompt. This file supersedes it.

Verify everything yourself. Don't trust a summary over the code or `git log`.

---

## 1. Project context

### Architecture and stack
- **Mobile:** Flutter 3.41.7 / Dart, Riverpod state, encrypted Hive local database (AES-256, key in Android Keystore through flutter_secure_storage), with an offline-first outbox that syncs to Supabase.
- **Native Android (Kotlin; only for capture and queues):**
  - `SmsReceiver`, `NotificationListenerService`
  - `DurableQueue` / `SecureQueueStore` / `QueueStoreCore` (encrypted with Keystore AES-256-GCM)
  - `HiveWriterLock` (an OS file lock)
  - `SpentXBackgroundWorker` + `SmsWorkScheduler` (a unique WorkManager job), `BootReceiver`
  - `SpentXDetectionPrefs`, `MainActivity` (method channels)
- **Backend:** Supabase project `vdhayvlweuglpvzweunq`.
  - Postgres with RLS: 57 public tables, all with RLS on (checked 2026-10-22).
  - Live has no `schema_migrations` table: Karthi applies files by hand in the SQL editor.
- **Web + Admin Panel (ROOT, Next.js/TypeScript):**
  - Admin pages: `ROOT/src/app/admin`
  - Admin API: `ROOT/src/app/api/admin`
  - Admin components: `ROOT/src/components/admin`
  - Do not modify any of it without Karthi's permission.
- **Toolchain on the Mac:**
  - Flutter: `$HOME/development/flutter/bin`
  - JDK 17: `/opt/homebrew/Cellar/openjdk@17/17.0.14/libexec/openjdk.jdk/Contents/Home`
  - adb: `/Users/karthi/Library/Android/sdk/platform-tools/adb`
  - Test phone: AIN065 (Android 16) over wireless adb.

### Mobile app structure (APP/lib)
- **Core folders:** `core/audit`, `core/finance`, `core/sync`, `core/services`, `core/theme`, `core/widgets`, `core/debug`, `data/local`, `models`.
- **Feature folders:** `features/sms`, `features/sms_parser`, `features/accounts`, `features/transactions`, `features/settings`, `features/security`, and others.
- **Key files:**
  - Models: `APP/lib/models/transaction.dart`, `APP/lib/models/account_model.dart`
  - Ledger: `APP/lib/features/transactions/data/transaction_provider.dart`
  - Sync: `APP/lib/core/sync/sync_service.dart`, `APP/lib/core/sync/supabase_schema_map.dart`
  - Shared totals rule: `APP/lib/core/finance/countable.dart`
- The full class → file table is in `HANDOFF/SPENTX_FILE_MAP.md`.

### Admin Panel integration: reuse, never duplicate
The Admin Panel manages detection rules in Supabase. The app reads them; it never creates a parallel rule system (plan, Phase 2 and Phase 3 "Added 2026-10-21" blocks, and "Supabase SQL → Database").

**Tables (live row counts, 2026-10-22):**

| Group | Table | Rows |
|---|---|---|
| SMS | `sms_template_rules` | 273 |
| SMS | `sms_block_rules` | 0 |
| SMS | `sms_detection_rules` | 0 |
| Global merchants | `merchant_brands` | 1628 |
| Global merchants | `merchant_brand_keys` (aliases) | 5902 |
| Global merchants | `merchant_keyword_rules` | 833 |
| Global merchants | `mcc_category_map` | 981 |
| Categories | `category_catalog` | 107 |
| Categories | `categories` | 7 |
| User rules | `user_merchants` | 32 |
| User rules | `user_merchant_category` | 0 |
| Cache version | `rules_version` | 4 |

**App sync services:**
- SMS rules: `APP/lib/core/sync/sms_rules_refresh_service.dart`. It uses a row fingerprint, reconciles the offline cache in place, and never wipes it on a failed or empty read.
- Global merchant rules: `APP/lib/core/sync/global_merchant_rules_sync.dart`, an encrypted offline cache. `APP/assets/rules/merchant_rules.json` is only the first-run fallback.

User rules always beat global rules. Admin updates never overwrite user choices or change saved transactions.

### SMS / notification detection pipeline
1. **Capture:** `KT/SmsReceiver.kt` and `KT/NotificationListenerService.kt`. Only the apps the user picked are read (off by default), and SMS apps are excluded. OTP-only text is dropped before storage.
2. **Queue first:** the item goes into the encrypted native `KT/DurableQueue.kt`. It is acknowledged only after a successful save. Each item records its owner and is never cleared on sign-out or when detection is turned off.
3. **One writer:** `KT/HiveWriterLock.kt` + `APP/lib/core/sync/hive_writer_lock.dart`.
   - App open: the main isolate saves.
   - App closed: the WorkManager job saves through `APP/lib/features/sms/background/background_sms_processor.dart`.
   - The worker never refreshes or removes the Supabase session; if the token can't be used, it defers.
4. **Parse:** admin templates (`APP/lib/features/sms/rules/engine/sms_template_engine.dart`, `sms_rule_engine.dart`) → `APP/lib/features/sms/v4/bank_sms_v4_parser.dart` → status/transfer classification (`APP/lib/features/sms_parser/status_classifier.dart`, `transfer_classifier.dart`).
   - Notifications are parsed by `APP/lib/features/sms_parser/notification_parse_rules.dart`.
   - A low-confidence financial message goes to Needs review (`APP/lib/features/sms_parser/sms_parse_confidence.dart`).
5. **Classify:** category (`APP/lib/features/sms/autosave/merchant_category_engine.dart`), purpose, person / own UPI (`APP/lib/features/sms/self_upi/self_upi_service.dart`), account (`APP/lib/features/sms/autosave/account_resolver.dart`).
6. **Dedupe + evidence:** `APP/lib/features/sms/autosave/sms_dedupe_registry.dart`, `APP/lib/features/sms/evidence/source_evidence_store.dart` (hash only) and the server key `APP/lib/core/finance/tx_ref_key.dart`.
7. **Save:**
   - Auto-add (`APP/lib/features/sms/autosave/sms_auto_save_gate.dart`) or Detected SMS review (`APP/lib/features/sms/detected/detection_queue.dart`).
   - Every action is written to the audit log (`APP/lib/core/audit/audit_log.dart`).
   - Then it syncs through the outbox.

### Soft UI design system (finalized; do not redesign)
**Tokens: `APP/lib/core/theme/spentx_tokens.dart`**
- `SpentXColors`, a `ThemeExtension` with `SpentXColors.light` and `SpentXColors.dark`. Fields include background, surface, surfaceVariant, card, border, divider, primary, primarySoft, onPrimary, textPrimary, textSecondary and textDisabled.
- `AppRadius` (card, tile, input, button, pill), `AppShadows` (subtle, bento, heroGlow, floatingBtn, bar), `AppBorders`, `AppSpacing`, `AppType`.
- Context getters `context.tokens` and `context.isDarkMode`.

**Palette: `APP/lib/core/theme/soft_palette.dart`**
- `SoftPalette`, plus `SoftColors`.
- Context getters `context.softDark`, `softBg`, `softSurface`, `softCard`, `softBorder`, …

**Themes:** `APP/lib/core/theme/app_theme.dart` provides `AppTheme.lightTheme` and `AppTheme.darkTheme`.

**Shared widgets:**
- `APP/lib/core/widgets/soft_page_kit.dart`: `SoftKitCard`, `SoftKitButton`, `SoftKitCircleButton`, `SoftKitHeader`, `SoftKitSectionLabel`, `SoftKitEmptyState`, `SoftKitSwitch`, `SoftKitSearchField`, `SoftKitInsetDivider`, `SoftKitAvatar`.
- `APP/lib/core/widgets/soft_buttons.dart`: `SoftGradientButton`, `SoftOutlineButton`.
- `APP/lib/core/navigation/soft_bottom_nav.dart`: `SoftBottomNav`, `SoftShellScaffold`.
- Each feature has its own kit, e.g. `APP/lib/features/accounts/presentation/widgets/soft_account_widgets.dart` and `APP/lib/features/transactions/presentation/widgets/soft_transaction_widgets.dart`.

Every new screen must use these tokens and widgets and must work in **both light and dark mode**, with the same colours. No hard-coded colours.

---

## 2. Completed development (verify each hash with `git -C APP log --oneline`)

The mobile repo has 17 commits on `main`, no remote, and a clean tree at HEAD `9a8e413`. Full detail is in `HANDOFF/SPENTX_HANDOFF.md`. Commit times are IST.

| Phase | Commits | What it does | Key tests | Status |
|---|---|---|---|---|
| Baseline | `d96669b` | App state before the work | – | – |
| S5b backup / migration safety | mobile `653d60d`; ROOT `f3a5ea6`, `f0dae45` | `SafeBoxMigration` (copy → verify → swap → delete the original last); `SecureHive` sniffs the format before opening; `ROOT/supabase/backup/backup.sh`, `restore_staging.sh`, `verify.sql`, `RESTORE.md`; precheck/verify/rollback template | `safe_box_migration_test.dart` | **Partial**: restore on a staging copy never rehearsed; allowBackup / D2D on device NOT TESTED |
| S1 secure session | `932041a` | Session + PKCE verifier in `secure_session_storage.dart`; crash-safe move; plain copy deleted last | `secure_session_{auth,storage}_test.dart` | **Partial**: device showed the session moved and no plain token; on-device refresh / logout / release NOT TESTED |
| S2 safe Hive key | `94f5268` | Key never overwritten; key check before open; quarantine + `key_recovery_screen.dart` | `hive_key_manager_test.dart`, `key_recovery_screen_test.dart` | Complete in code, device-tested on AIN065 Oct 21; release NOT TESTED |
| S2b replace EncryptedSharedPreferences | `42c2fd7` | `QueueStoreCore` Keystore AES-GCM; verified migration; pinned `secure_storage_options.dart` | `QueueStoreCoreTest.kt`, `secure_storage_options_test.dart` | **Partial**: the legacy ESP-queue migration code and the security-crypto dependency were **removed in S3** (`bb3597b`). An old install that never ran an S2b build would not migrate old queue items. OK for AIN065 only; re-check before any release |
| S3 key loss without deletion | `bb3597b` | Unsynced count warning; restore only when the server answers; set-aside data (`set_aside_data_screen.dart`), deleted only on confirm; rotation via `SafeBoxMigration.reencrypt` | `hive_key_manager`, `set_aside_data_screen` tests | Complete in code, device-tested Oct 21; release NOT TESTED |
| S4 single writer + follow-up | `3a1fced`, `7ab1893` | `HiveWriterLock`, session refresh gate, `DurableQueue`, `BootReceiver`; owner-tagged queue items kept across sign-out / detection off; `pending_sms_screen.dart` | `background_single_writer_test.dart`, `pending_sms_owner_test.dart`, `DurableQueueTest.kt`, `HiveWriterLockTest.kt` | Complete in code, device-tested Oct 21; reboot / 50-SMS burst / kill mid-save on device NOT TESTED |
| Phase 0 data foundations | `fbd8a22`, `789ea38` | Status, review flags, channel, rule id/version, source event ids, linked original, refunded amount, Unassigned; `countable.dart`; account evidence; `SourceEvidenceStore`; `AuditLog`; legacy round-trip | `phase0_data_foundations_test.dart`, `phase0_legacy_{compat,totals}_test.dart` | **Partial**: SQL applied + verified; atomic write is sequential, not one Hive transaction; no "Sync conflict" UI; phone NOT TESTED |
| Phase 1 permissions & sources | `b4c4b22` | `detection_permissions_screen.dart`, per-app picker (off by default), ask once / never after "Don't ask", `history_import_screen.dart` + `sms_history_import.dart` | `phase1_permissions_sources_test.dart`, `NotificationSourceTest.kt` | **Partial**: phone NOT TESTED |
| Phase 2 parsing / status / transfers | `cb31c6c`, `d8e13a7` | Parser split of card vs account last-4, balance, UTR, UPI; explicit-word account type; status + transfer classifiers; notification rules; admin rule sync; Needs review | `phase2_parsing_test.dart`, `phase2_admin_rules_dedupe_test.dart`, `phase2_rule_sync_test.dart` | **Partial**: SQL p2 pending; 63-HDFC category hit rate not re-measured; phone NOT TESTED |
| Phase 3 merchant rules & learning | `9dc5845` | Category order user → global → Needs category; purpose order; isFamily / kind / revision; learning on verify/edits; My UPI IDs | `phase3_merchant_rules_test.dart` | **Partial**: 3 Phase 3 SQL files pending, so learning stays on the device and locked rule 5 reinstall survival is NOT met yet |
| Phase 4 accounts | `3ccbe37` | `AccountResolver` (+ `StrictAccountMatcher` delegating), `account_auto_create.dart` (2 SMS or 1 balance SMS), "existing account or debit card?" prompt, Unassigned link/unlink | `phase4_accounts_test.dart` | **Partial**: phone NOT TESTED |
| Audit fixes | `816550e` | Refund links once and is capped; own transfer never into Cash; Unassigned kept on pull; account summary uses `countable`; synced default purpose; dark-mode Link sheet | `audit_phase0_4_fixes_test.dart` | Unit only |
| 3 gaps | `9a8e413` | Unlink account + Undo; Safety 1 bank-balance mismatch warning (`bank_balance_check.dart`, `bank_balance_warning.dart`); `ref_key` server duplicate key + 23505 merge/keep-both | `phase4_gaps_test.dart` | Unit only; Safety 1 leftovers: no "Use bank balance" entry, no chip on Account card / Accounts page, bank accounts only |

**Root repo:** `main`, origin GitHub, HEAD `f0dae45` (S5b).

**Latest real test run:** 2026-10-22 10:26–10:29 IST at `9a8e413`.

| Check | Result |
|---|---|
| `flutter test` | 645 / 645 passed |
| `:app:testDebugUnitTest` | 33 passed, 0 failed |
| `flutter analyze` | 0 errors, 0 warnings (22 info) |
| `flutter build apk --debug` | OK |

**Flagged as not done or not verified:**
- No Phase 0–4 phone test was run (all NOT TESTED).
- S5b restore was never rehearsed.
- S2b legacy-queue migration code was removed (see the S2b row).
- The **release build is blocked**: `APP/android/key.properties` doesn't exist (by design, signing fails closed).
- One test file per locked rule doesn't exist yet. Coverage is spread across phase tests; the map is in `SPENTX_TEST_STATUS.md`.
- **Open UI issues (not fixed):**
  - A grey "TOTAL OUT" badge in dark mode.
  - Home shows "13 new" while Activity shows "18 new".
  - The Detected SMS account picker is white in dark mode.

---

## 3. Remaining development, in the plan's order (plan: "Suggested build order after approval", "v6 – Production Release Finalization")

v6 scope: ALL of S1–S10 (incl. S2b, S5b, S6b, S7b) and Phases 0–6 are required. Only S9 is optional. Nothing is "production-ready" until section V passes.

1. **Phase 5 – Auto-add, dedupe, notifications** (plan items 19–20 + the "Added 2026-10-21 Phase 4 and Phase 5" block). **Next phase; waits for approval.**
   - Three notification formats: "<amount> added • HDFC • Food"; "New account HDFC ••0987 added. <amount> debit recorded." + Undo; "<amount> added • Needs category" + Review + Undo.
   - Undo removes only that action (soft delete). An auto-created account is removed only if unused. Undo is logged.
   - Dedupe order: UTR/ref + account + amount → source event id → account + amount + direction + merchant + time → unsure = keep both for review. Never amount only.
   - No repeat alert on a duplicate.
   - SMS and notification-only transactions follow the same rules; unknown accounts follow the Unassigned rules.
   - Files: `APP/lib/features/sms/autosave/sms_auto_save_gate.dart`, `sms_auto_save_policy.dart`, `sms_auto_save_undo.dart`, `APP/lib/features/sms/sms_notification.dart`.
   - Depends on: the Phase 0 audit log and evidence, Phase 4 auto-create and `ref_key` (all done).
2. **Phase 6 – Privacy** (item 21).
   - No raw SMS text on transactions in release (hash only).
   - SMS text removed from release logs and crash reports.
   - Export / delete for detection data.
   - Includes the debug stores: `APP/lib/features/sms/detected/sms_detection_debug_log.dart` (its preview is redacted to a length, but `dataJson` is stored) and `APP/lib/core/debug/master_debug_log.dart`.
   - Overlaps S5.
3. **S5 – SMS privacy (MANDATORY, v6 S5)**:
   - Minimal transaction fields, plus a one-way fingerprint.
   - Review items keep text only while needed, encrypted.
   - Daily retention job (WorkManager + app start):
     - verified/ignored items: text deleted after 30 days
     - account-suggestion samples: max 3, deleted after replay or 14 days
     - native queue: deleted right after save; failed items after 7 days
     - debug stores: off in release, cleared after 7 days
   - OTP dropped before storage.
   - One redacting logger and a Supabase payload whitelist.
   - Move user ID / merchant list / bank list to the encrypted store. **`spentx_session_uid` is still in plain prefs** (`APP/lib/features/sms/autosave/sms_session_user.dart`, `KT/SpentXDetectionPrefs.kt`).
   - Tests: release log scan = 0 leaks; retention deletes on schedule; dedupe still works after text deletion.
4. **S6 – Screenshot block**: FLAG_SECURE on PIN, transactions, accounts, the detection popup and Detected SMS (or app-wide with a Settings opt-out); hide the recent-apps preview.
5. **S6b – Sessions + PIN**:
   - Encrypted attempt counter that survives a restart; delays after 5 failures (30s, 1m, 5m…); lockout after 10, requiring account login.
   - PBKDF2-SHA256 with 100k+ rounds (today 20k, `APP/lib/core/services/pin_service.dart`), with old hashes upgraded on unlock.
   - Optional biometric unlock.
   - On sign-out: clear the session and reset the PIN.
6. **S8 – Supabase audit + fixes (SQL files only; Karthi runs them)** (v5 S8 expanded): see section 8 for the findings. Includes anon + two-user tests for every table, view and RPC.
7. **S7 – Release hardening**:
   - Karthi creates the upload key + `key.properties` and backs them up. Never commit them; never create them yourself.
   - `--obfuscate --split-debug-info`.
   - Debug log locked in release; strip error debugPrints.
   - PIN hash upgrade; Play App Signing.
8. **S7b – Google Play compliance**:
   - Data Safety form; public privacy policy.
   - SMS declaration + demo video; notification-access disclosure.
   - In-app prominent disclosure before the permission ask.
   - In-app "Delete account" + a public web deletion page. The web page touches ROOT, so it needs permission.
9. **S10 / V – Real production verification** (v5 S10, v6 V): release-build tests on AIN065 + another brand; Android 17 (an emulator is OK if labelled); all suites; record pass/fail, device, Android version and date.
10. **S9 – Certificate pinning**: optional, after launch.
11. **Google Play submission**: a separate step that needs Karthi's approval (plan "Google Play"). Never submit or upload anything yourself.

**Carry-over items to close along the way** (`HANDOFF/SPENTX_REMAINING_WORK.md` → "Carry-over gaps"):
- Locked-rule test files (planned names, not yet created): `APP/test/locked_rule_1_purpose_test.dart` … `locked_rule_8_autoadd_test.dart`, plus the 63-sample masked HDFC regression set.
- Safety 1 leftovers ("Use bank balance" adjustment entry, warning chip, Review action).
- Safety 5 leftovers (single atomic local write, "Sync conflict" review).
- Re-measure the 63-HDFC category hit rate.
- The open UI issues.
- The S2b legacy-queue re-check.

Don't invent requirements and don't drop any. Cite plan sections in reports.

---

## 4. The eight locked financial rules (quoted verbatim from the plan, "Locked rules – regression tests")

1. Purpose priority: user rule → Family → default purpose → Personal; never empty; purpose edit never changes category.
2. Account safety: exact match first; auto-create only with 2 events or balance SMS; beneficiary number never used; same-bank new last-4 asked once; Unassigned changes no balance.
3. Category priority: user rule → global list → Needs category (still added); global update never overwrites user rule.
4. UPI / people: display handle only, full UPI kept for matching; own UPI = transfer; Family contact = Family purpose; unsure person = Needs classification.
5. Permanent learning: Quick Verify, edits, Needs-category fix, Family mark all save rules; survive sync, reinstall, app update.
6. Missing merchant: genuine transaction always added and counted, never dropped.
7. Transfers: CC bill, wallet top-up, ATM → cash, own transfers = spending +0, one logical transfer.
8. Auto-add + notifications: 3 formats, no repeat alert on duplicate; safe Undo (only that action, account removed only if unused, audit kept).

Plus: duplicate protection (SMS + PhonePe = 1; two same-amount payments = 2; restart / re-import = no duplicates), status (pending/failed not counted, refund and reversal adjust the original), history import dedupe, permission denied/revoked paths.

**These rules cannot be changed, relaxed or simplified without Karthi's explicit permission.**

The plan's "Decisions (settled)" also holds:
- No fuzzy matching.
- Needs category and Unassigned confirmed expenses count in spending.
- Unassigned changes no balance until linked.
- OTPs are never processed.
- Pending / failed / cancelled rows are visible but never counted.

---

## 5. Supabase migrations (`HANDOFF/SPENTX_SQL_STATUS.md`)

**Applied and verified (never rerun):**
- `ROOT/supabase/migrations/20261021120000_p0_tx_status_flags.sql` and `ROOT/supabase/migrations/20261021120100_p0_account_evidence.sql`.
  - Karthi applied them on 2026-10-22 ~08:20–08:35 IST, after the backup `/Users/karthi/spentx-backups/20261022T024741Z`.
  - The BEFORE/AFTER snapshots (`ROOT/supabase/migration-checks/p0_snapshot_BEFORE_2026-10-22.txt` / `p0_snapshot_AFTER_2026-10-22.txt`) are identical on all 31 rows.
- Everything earlier is applied per `ROOT/supabase/migration-checks/STATUS-2026-10-21.md`, except the items below.

**Pending: 8 files, none run on live.** Check folders sit under `ROOT/supabase/migration-checks/<name>/`.

| # | File | Needed | Depends on |
|---|---|---|---|
| 1 | `ROOT/supabase/migration-checks/20261004000100_protect_user_roles/post_step_restore_function.sql` | **Before release** (live `protect_user_role()` has the older body) | trigger already live |
| 2 | `ROOT/supabase/migrations/20261021_signup_phone.sql` | Before release | run with #1 |
| 3 | `ROOT/supabase/migrations/20261022120000_p2_sms_rules_version.sql` | Before release (without it: max(updated_at) + daily refresh, misses deletes) | existing `mcr_bump_rules_version` |
| 4 | `ROOT/supabase/migrations/20261022130000_p3_user_rules_v2.sql` | **Before release** (locked rule 5) | – |
| 5 | `ROOT/supabase/migrations/20261022130100_p3_user_self_upi.sql` | **Before release** (My UPI IDs sync) | – |
| 6 | `ROOT/supabase/migrations/20261022130200_p3_global_rules_additions.sql` | Before release (the bundled JSON covers offline) | – |
| 7 | `ROOT/supabase/migrations/20261022140000_p4_investment_totals_status.sql` | Before release | Phase 0 (applied) |
| 8 | `ROOT/supabase/migrations/20261022150000_p0_ref_key_live_index.sql` | **Optional now, recommended before release** | Phase 0 (applied) |

**Suggested order:** backup → 1 → 2 → 4 → 5 → 6 → 3 → 7 → 8. Each file runs as precheck → file → verify, with rollback ready.

**Process:** `ROOT/supabase/migration-checks/P0_RUN_GUIDE.md`, `ROOT/supabase/migration-checks/MIGRATION_TEMPLATE.md`, `ROOT/supabase/backup/RESTORE.md`.

Also untracked in ROOT: `ROOT/supabase/migrations/20261012_goal_investment_sync.sql`. Its live status is recorded in `STATUS-2026-10-21.md`; check it before touching it.

**SQL rules:**
- Check the live database read-only first (catalog SELECTs) before saying anything is applied or pending.
- Never rerun an applied migration.
- **Never execute SQL that writes to production.** Write files (migration + precheck + verify + rollback) and hand them to Karthi; he runs them himself in the dashboard.
- Never put a DB URL, password or key in any file, command or chat. `backup.sh` reads `SPENTX_DB_URL` from a hidden prompt.

---

## 6. Code and UI protection

- **Where to continue:**
  - Start from mobile commit `9a8e413` (verify with `git -C APP log -1`; the tree should be clean).
  - The ROOT repo is at `f0dae45`.
  - Never restart, rewrite or re-plan completed phases. Fix them only for a real, reported bug, and say so.
- **Data:** preserve every financial record, balance, user rule and queued SMS. Never delete or overwrite local Hive, quarantine or set-aside data.
- **UI:** keep the finalized Soft UI (section 1) in light and dark; no redesigns.
- **Website and Admin Panel:** don't modify ROOT web code, Admin Panel or Supabase tables/policies without explicit permission.
- **Uncommitted website changes:** preserve these 8 modified web files exactly (they predate this work; don't stage, commit, revert or reformat them):
  - `ROOT/src/components/dashboard/DashboardPage.tsx`
  - `ROOT/src/components/shared/AddTransactionSlideOver.tsx`
  - `ROOT/src/components/transactions/TransactionsPage.tsx`
  - `ROOT/src/components/wealth/NewSavingsGoalModal.tsx`
  - `ROOT/src/components/wealth/QuickDepositModal.tsx`
  - `ROOT/src/lib/invalidate-financial-data.ts`
  - `ROOT/src/lib/investments.ts`
  - `ROOT/src/lib/mock-data.ts`
- **Other uncommitted work in ROOT:**
  - Modified: `ROOT/supabase/migration-checks/STATUS-2026-10-21.md`.
  - Untracked: the Phase 0–4 SQL migrations and check folders, `P0_RUN_GUIDE.md`, the snapshots and this handoff folder.
  - Leave all of it as is unless Karthi asks.
- **Git:**
  - Never `git reset`, `checkout --`, `clean`, stash-drop, rebase or force anything.
  - Never push without approval. The mobile repo has no remote; don't add one.
- **Secrets:** never commit secrets, `key.properties` or keystores, and don't create signing keys.
- **Scope:**
  - No unnecessary refactors and no duplicate services; extend the existing ones from section 1.
  - No unrelated features.
  - Reuse existing code (plan "Development Speed & Quality – Strict Rule").

---

## 7. Workflow for every phase

1. Read the plan + the handoff docs (section 0).
2. Inspect the code and `git -C APP status` / `git -C APP log` and `git -C ROOT status`.
3. Identify exactly what is missing for the **next approved phase**, comparing plan items to code.
4. Implement **only** that phase.
5. Test:
   - During development, run targeted tests: `flutter test test/<file>_test.dart`.
   - Once at the end, run the full suite: `flutter test`, `flutter analyze`, Kotlin `cd android && ./gradlew :app:testDebugUnitTest` (with JDK 17), and `flutter build apk --debug`.
6. Fix real errors. Don't weaken or delete tests to make them pass.
7. Commit the verified changes in APP with a clear message. Stage only the phase's files; never add unrelated files.
8. Send a concise completion report: what changed, test numbers, issues and NOT TESTED items, the commit hash, and what comes next.
9. **STOP** and ask Karthi for approval of the next phase.

Inside an approved phase, don't ask for repeated confirmations. Only ask for anything destructive, anything touching the database, or anything outside scope (web, Admin Panel, push, keys).

**Karthi's preferences:**
- Simple, plain language and short reports.
- About 1 hour per phase.
- No placeholders, TODO stubs or fake data.
- Never claim tests passed unless you ran them and saw the result; quote the numbers.

---

## 8. Testing and production safety

**Pending real-phone tests (all NOT TESTED; full list in `HANDOFF/SPENTX_TEST_STATUS.md`). Report device and emulator results separately and label them.**
- **Permissions:** SMS + notification access deny / Don't ask / Open Settings / restricted settings (Android 13+); granted → revoked mid-use → granted; per-app notification picker.
- **Background:** SMS with the app closed or killed is saved once; app opened while the worker runs; reboot with items queued; 50-SMS burst; kill mid-save.
- **Duplicates:** the same SMS twice = 1 transaction; SMS + payment-app notification = 1; two same-amount payments = 2; re-import = no duplicates.
- **Notifications:** payment-app notifications (PhonePe, GPay, Paytm, PayZapp, bank apps) from picked apps only.
- **Past-SMS import** on the real inbox: range, cancel, summary.
- **New screens** in light + dark: Detection & Permissions, History import, My UPI IDs, Pending SMS, Set-aside data, Link/Unlink account, bank-balance warning.
- **Balances:** Home / Activity / Analytics / Accounts totals and every account balance unchanged vs the pre-install backup; link/unlink Unassigned applies exactly once.
- **Pending SMS kept** on sign-out and with detection off (S4 follow-up).
- **Session:** S1 token refresh after migration, logout, worker refresh on device.
- **Wider coverage:** a second device brand, Android 17, two devices on the same account, offline → sync, upgrade from the installed version with real data.

**Backup and SQL:**
- The restore rehearsal on a staging copy (`ROOT/supabase/backup/restore_staging.sh`) has never been run.
- Run verify SQL after each migration Karthi applies.
- allowBackup / data_extraction_rules (cloud + D2D) on device.

**Security (S8 advisor findings, read-only 2026-10-22):**
- 17 SECURITY DEFINER functions are callable by `anon` (list in `SPENTX_REMAINING_WORK.md`). Revoke them from anon/PUBLIC, reviewing the share-link ones.
- 58 SECURITY DEFINER functions are executable by `authenticated`; audit each one.
- View `monthly_plan_actuals` needs `security_invoker = on`.
- 30 functions have a mutable search_path. Set `search_path = ''` and use schema-qualified names.
- `pg_trgm` is in `public`; move it to `extensions`.
- Leaked-password protection is off (dashboard toggle; Karthi does it). Review auth rate limits.
- `share_invite_deliveries` has RLS but no policies; confirm it's meant to deny all.
- RLS anon + cross-user test suite.

**App security:**
- `spentx_session_uid` is in plain prefs (S5).
- SMS debug stores keep data JSON (Phase 6 / S5).
- Release log leak scan must be 0 (no SMS text, OTP, amount, account number, UPI, token or password).
- Encryption/key: key-loss quarantine and key rotation in a release build.
- Auth: refresh-token rotation between app and worker on device.
- Notifications: no repeat alert, Undo works.
- **Release signing:** blocked until Karthi creates `key.properties`. R8 and obfuscation are unverified until then.

Never claim 100% completion or "production-ready" without evidence. Anything not run is **NOT TESTED**. Current status: **NOT ready for Google Play.**

---

**First reply expected from you:**
- A short summary that you've read the docs.
- The verified HEAD commits and git status.
- The live-DB read-only state if you checked it.
- The exact Phase 5 gap list mapped to plan items 19–20.
- Then STOP and wait for Karthi's approval.
