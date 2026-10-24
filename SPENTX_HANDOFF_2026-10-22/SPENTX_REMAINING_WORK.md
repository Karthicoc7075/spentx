# SpentX – Remaining Work (as of 2026-10-22, mobile HEAD 9a8e413)

Requirements are taken from `SpentX-detection-change-plan.md` (v6). If this file and the plan differ, the plan wins.

## Order (from the plan's "Suggested build order", verified)
1. **Phase 5** → 2. **Phase 6** (finishing detection Phases 0–6)
3. **S5**, **S6**, **S6b**
4. **S8**: Supabase fixes (SQL files; the user runs them)
5. **S7** signing/obfuscation + **S7b** Play compliance
6. **S10 / V**: full real-device + release-build verification
- **S9** (certificate pinning) is optional, after launch.

Each phase: implement → test → fix → verify → short report → commit → STOP and ask.

## Phase 5 – Auto-add, dedupe, notifications (M) – Not started
Requirements:
- Three notification formats with Undo: "<amount> added • HDFC • Food"; "New account HDFC ••0987 added. <amount> debit recorded." + Undo; "<amount> added • Needs category" + Review + Undo.
- Undo removes only that action (soft delete). An auto-created account is removed only if unused. Undo is logged in the audit log.
- Dedupe order: UTR/ref + account + amount → source event id → account + amount + direction + merchant + time → unsure = keep both for review. Never amount only.
- SMS and notification-only transactions follow the same account matching, auto-add, category, purpose, transfer, dedupe and Undo rules. Unknown accounts follow the Unassigned rules.
- No repeat alert on a duplicate (locked rule 8).

Files (plan): `sms_auto_save_gate.dart`, `sms_auto_save_policy.dart`, `sms_auto_save_undo.dart`, `sms_notification.dart`.

Dependencies:
- Phase 0 audit log + source evidence (done).
- Phase 4 auto-create (done).
- ref_key (done in 9a8e413; the optional SQL `20261022150000_p0_ref_key_live_index.sql` makes server dedupe ignore undone rows).

## Phase 6 – Privacy (S–M) – Not started
- No raw SMS text on transactions in release builds (hash only).
- SMS text removed from release logs and crash reports.
- Export / delete for detection data.
- Carry-over: the SMS detection debug log (`lib/features/sms/detected/sms_detection_debug_log.dart`, and the master debug log) stores previews / data JSON. Make sure release builds store no SMS text.

Depends on: Phase 5 (same pipeline). It overlaps with S5; do them consistently.

## S5 – SMS privacy (MANDATORY) – Not started
- Transactions keep only:
  - amount, direction, date/time, account link
  - merchant/person, masked UPI handle + normalized UPI
  - reference/UTR, channel, status
  - a one-way SMS fingerprint
- No raw SMS text on transactions.
- Review items may keep text only while needed, encrypted.
- Retention job (daily via WorkManager + on app start):
  - Verified/ignored items: text deleted after 30 days (fingerprint kept).
  - Account-suggestion samples: max 3, deleted after replay or 14 days.
  - Native queue items: deleted right after a successful save; failed items after 7 days.
  - Debug logs: off in release, cleared after 7 days.
- OTP messages dropped before any storage, never logged.
- A single redacting logger. A Supabase sync payload whitelist (no raw text fields).
- Move the user ID / merchant list / bank list to the encrypted store. Carry-over: **`spentx_session_uid` is in plain prefs**.
  - Dart: `lib/features/sms/autosave/sms_session_user.dart`
  - Kotlin: `SpentXDetectionPrefs.kt`
- Tests: release-build log scan = 0 leaks; the retention job deletes on schedule; dedupe still works after text deletion.

## S6 – Screenshot block (S) – Not started
FLAG_SECURE on PIN, transactions, accounts, the detection popup and Detected SMS (or app-wide with a Settings opt-out); hide the recent-apps preview.

## S6b – Local security: sessions and PIN – Not started
- Session in Keystore-backed secure storage (done in S1).
- PIN brute-force protection:
  - An encrypted attempt counter that survives a restart.
  - Delays after 5 failures (30s, 1m, 5m…).
  - Lockout after 10, requiring account login.
- PIN hash: PBKDF2-SHA256 with 100k+ rounds (or Argon2) and a salt; old weak hashes upgraded on the next unlock. Today it is PBKDF2 20k with no lockout (`lib/core/services/pin_service.dart`).
- Optional biometric unlock via a Keystore key that needs user authentication.
- On sign-out: clear the session and reset the PIN for that user.

## S8 – Supabase hardening + full audit (SQL files only; the user runs them) – Not started
Current advisor findings (read-only, 2026-10-22):
- 17 SECURITY DEFINER functions callable by `anon`:
  - admin_reset_all_users_to_onboarding, admin_reset_user_data, complete_account_setup
  - enforce_purpose_share_claim_only
  - get_share_link, get_shared_categories, get_shared_monthly_plan, get_shared_purposes, get_shared_transactions
  - handle_new_user, log_shared_page_view
  - mcr_brand_sync_keys, mcr_bump_rules_version
  - sync_share_link_access
  - tg_reverse_goal_contributions_on_tx_delete, tg_sync_goal_contributions_on_tx_change, tg_sync_investments_on_tx_change
  - Revoke from anon/PUBLIC. Share-link functions stay public by design, but review each one.
- View `monthly_plan_actuals` is SECURITY DEFINER (no security_invoker): set `security_invoker = on`.
- Mutable search_path: the advisor now reports **30** functions (31 earlier in the plan). Set `search_path = ''` and use schema-qualified names.
- `pg_trgm` is installed in the `public` schema: move it to `extensions`.
- Leaked-password protection is OFF: a Dashboard toggle (Auth settings). Also review the auth rate limits.
- `share_invite_deliveries`: RLS on but no policies (INFO; intended deny-all? confirm).
- 58 SECURITY DEFINER functions are executable by `authenticated`: audit each one.
- Tests: run as anon and as two authenticated users against every table, view and RPC, with the expected results in a test SQL/script.

## S7 – Release hardening (S) – Not started
- **Create the upload key + `android/key.properties`.** The user creates and backs them up; never commit them (they are git-ignored). The release build is blocked until then; R8 can't be verified yet.
- Build with `--obfuscate --split-debug-info`.
- Debug log locked in release; strip error debugPrints.
- Upgrade old PIN hashes (overlaps S6b).
- Play App Signing.

## S7b – Google Play compliance – Not started
- Data Safety form.
- A public privacy policy URL.
- SMS permission declaration + demo video; notification-access disclosure.
- In-app prominent disclosure before the permission ask. The Phase 1 screen covers part of it; check it.
- In-app "Delete account" + a public web deletion page (deletes server and local data).

## S10 / V – Real production verification – Not started
- Devices: AIN065 (Android 16) + another brand (Samsung/Pixel). Android 17 on an emulator if needed, labelled as emulator.
- Permissions: denied / granted / revoked mid-use / restricted settings.
- Offline add/edit → sync; two devices on the same account; background SMS with the app closed; crash mid-save; reboot; upgrade from the installed version with real data.
- All 8 locked-rule suites + duplicate, refund, Undo and balance-reconciliation suites.
- Release-build tests:
  - log leak scan (0 leaks)
  - RLS anon/auth/cross-user tests, RPC grant tests
  - migration + rollback
  - key-loss quarantine
- Record per test: pass/fail, device, Android version, date. Anything not run = NOT TESTED.

## S9 – Certificate pinning (optional, after launch)

## Carry-over gaps (from completed phases)
- **Device + release testing** of S1–S4 and Phases 0–4 (full list in `SPENTX_TEST_STATUS.md`).
- **Signing key**: `android/key.properties` missing, so the release build fails closed.
- **Locked rules: one test file per rule** does not exist yet. Coverage is spread across phase tests (map in `SPENTX_TEST_STATUS.md`). Create `test/locked_rule_1_purpose_test.dart` … `locked_rule_8_autoadd_test.dart`, plus the 63-sample masked HDFC regression set.
- **Open UI issues** (not fixed):
  - The grey "TOTAL OUT" badge in dark mode.
  - Home "13 new" vs Activity "18 new" count mismatch.
  - The Detected SMS account picker is white in dark mode.
- **S2b legacy-queue note:** the ESP-queue migration code was removed in S3. An old install that never ran an S2b build would not migrate old queue items. Fine for AIN065 (migrated); re-check before shipping to other existing installs.
- **Safety 1 leftovers:** "Use bank balance" adjustment entry; the warning chip on the Account card / Accounts page; the Review action.
- **Safety 5 leftovers:** a single atomic local write (tx + balance + evidence + audit); the "Sync conflict" review UI.
- **Phase 2:** re-measure the category hit rate on the 63 real HDFC SMS.
- **Pending SQL:** 8 files (see `SPENTX_SQL_STATUS.md`). The 3 Phase 3 files + p2 + p4 + signup_phone + protect_user_roles post-step are needed before release; the ref_key index is recommended.
