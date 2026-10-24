# SpentX – Test Status

## Latest automated run (real numbers)
Run once on the Mac, 2026-10-22 10:26–10:29 IST, at mobile commit `9a8e413` (clean tree). Flutter 3.41.7, JDK 17. Log: `APP/build/handoff_run_2026-10-22.log` (build dir, not committed).

| Check | Result |
|---|---|
| `flutter test` (all of `test/`) | **645 passed, 0 failed** |
| `./gradlew :app:testDebugUnitTest --rerun-tasks` | **33 passed, 0 failed, 0 skipped** (DurableQueueTest, HiveWriterLockTest, NotificationSourceTest, QueueStoreCoreTest; XML results 10:28) |
| `flutter analyze` | 22 issues, all `info`; **0 errors, 0 warnings** |
| `flutter build apk --debug` | Built `build/app/outputs/flutter-apk/app-debug.apk` |
| Release build | **BLOCKED**: `android/key.properties` is missing (release signing fails closed by design; R8/minify not verifiable) |

APP = `/Users/karthi/Documents/SpentX Web/spentx-web copy 3/Mobile app/SpentX`.

## Device tests
Done (from project history; phone AIN065, Android 16, wireless adb):
- S1: session moved to secure storage, still signed in, no plain token (Oct 21).
- S2 safe Hive key, S3 key-loss handling, S4 single writer / durable queue: device-tested on AIN065, Oct 21.

Pending, all **NOT TESTED** on a device:
- S1: token refresh after migration; logout; background-worker refresh.
- S4: reboot with items queued; 50-SMS burst; kill mid-save; app + worker refreshing together.
- S5b: allowBackup / data_extraction_rules (cloud + D2D) on Android 12+/16/17; restore on a staging copy.
- Phase 0: Home / Activity / Analytics / Accounts totals and every account balance unchanged vs the pre-install backup.
- Phase 1: SMS + notification permission deny / Don't ask / Settings / restricted settings; granted → revoked → granted; per-app notifications; past-SMS import on the real inbox; logcat check.
- Phase 2: real bank SMS + payment-app notifications; a new admin template reaching the phone without an update; the 63 HDFC samples on the phone.
- Phase 3: learning surviving reinstall / app update (also needs the Phase 3 SQL); My UPI IDs.
- Phase 4: auto-create, the "existing account or debit card?" prompt, Unassigned link / unlink / Undo, the bank-balance warning, light + dark screenshots.
- Any release-build test, second device brand, Android 17, multi-device, offline → sync.

## Locked-rule coverage map (file-level grep of `APP/test`; one file per rule does NOT exist yet)
| Rule | Covered in (current) |
|---|---|
| 1 Purpose priority | `phase3_merchant_rules_test.dart`, `sms_auto_save_test.dart`, `audit_phase0_4_fixes_test.dart` |
| 2 Account safety / Unassigned | `phase4_accounts_test.dart`, `phase4_gaps_test.dart`, `phase2_parsing_test.dart`, `phase0_data_foundations_test.dart`, `phase0_legacy_compat_test.dart`, `audit_phase0_4_fixes_test.dart` |
| 3 Category priority / Needs category | `phase3_merchant_rules_test.dart`, `sms_auto_save_test.dart`, `phase0_data_foundations_test.dart`, `phase0_legacy_compat_test.dart` |
| 4 UPI / people / own UPI / Needs classification | `phase3_merchant_rules_test.dart` |
| 5 Permanent learning | `phase3_merchant_rules_test.dart`, `sms_auto_save_test.dart`, `sms_auto_save_flow_test.dart`, `sms_flow_bugfix_test.dart`, `detected_sms_tabs_test.dart` (reinstall survival NOT TESTED) |
| 6 Missing merchant never dropped | `phase2_parsing_test.dart`, `phase3_merchant_rules_test.dart` |
| 7 Transfers = spending +0 | `phase2_parsing_test.dart`, `phase3_merchant_rules_test.dart`, `phase0_legacy_totals_test.dart`, `phase0_legacy_compat_test.dart` |
| 8 Auto-add, notifications, Undo | `sms_auto_save_test.dart`, `sms_auto_save_flow_test.dart`, `sms_notification_copy_test.dart`, `phase0_data_foundations_test.dart` (the 3 new formats = Phase 5, not built) |
| Duplicates | `phase2_admin_rules_dedupe_test.dart`, `phase0_data_foundations_test.dart`, `sms_auto_save_*_test.dart`, `sms_flow_bugfix_test.dart`, `phase4_gaps_test.dart` (ref_key) |
| Refund / reversal | `audit_phase0_4_fixes_test.dart`, `phase2_parsing_test.dart`, `phase0_data_foundations_test.dart` |

To do: one file per rule (`locked_rule_1…8_*_test.dart`) plus the masked 63-sample HDFC regression set, as the plan requires.

## Data integrity
- Phase 0 SQL (applied 2026-10-22): BEFORE and AFTER snapshots (`ROOT/supabase/migration-checks/p0_snapshot_{BEFORE,AFTER}_2026-10-22.txt`) re-compared on 2026-10-22: all 31 rows identical (counts, fingerprints, per-account balance rows, status values). Live: 75 transactions, 16 accounts, 0 rows with ref_key / balance_applied yet.
- Local: `phase0_legacy_compat_test.dart` / `phase0_legacy_totals_test.dart` prove that pre-Phase-0 Hive data round-trips with identical totals (unit level only).

## Known issues / production blockers
- No release signing key → no release build, no R8 / obfuscation verification.
- Phases 5, 6 and S5, S6, S6b, S7, S7b, S8, S10/V are not started.
- 8 pending SQL files (see `SPENTX_SQL_STATUS.md`); Supabase advisor findings open (S8).
- No device or release-build verification for Phases 0–4.
- Open UI issues: grey TOTAL OUT badge (dark); Home "13 new" vs Activity "18 new"; Detected SMS account picker white in dark mode.
- Status: **NOT ready for Google Play.**
