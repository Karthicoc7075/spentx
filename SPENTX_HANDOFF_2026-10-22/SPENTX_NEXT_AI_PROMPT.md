# Prompt for the next AI (paste as-is)

You are continuing development of **SpentX**, a personal-finance app with automatic bank SMS / notification transaction detection, for Karthi. Work carefully: this app holds real financial data.

## Paths and stack
- Root (Next.js web + admin panel, git repo `main`): `/Users/karthi/Documents/SpentX Web/spentx-web copy 3`
- Flutter app (its own git repo `main`, no remote, ignored by the root repo): `/Users/karthi/Documents/SpentX Web/spentx-web copy 3/Mobile app/SpentX`
- Supabase SQL files: `<root>/supabase/migrations/`, checks in `<root>/supabase/migration-checks/<migration>/`, backup scripts in `<root>/supabase/backup/`
- Handoff docs: `<root>/SPENTX_HANDOFF_2026-10-22/`
- Stack: Flutter 3.41.7 / Dart, Hive (encrypted), Riverpod, Supabase (project ref vdhayvlweuglpvzweunq), Kotlin native (SmsReceiver, NotificationListenerService, durable encrypted queue, WorkManager). JDK 17: `export JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.14/libexec/openjdk.jdk/Contents/Home`. Flutter: `$HOME/development/flutter/bin`.

## Read first, in this order
1. `SPENTX_HANDOFF_2026-10-22/SpentX-detection-change-plan.md`: the master plan (v6). Never skip, remove or reinterpret its requirements.
2. `SPENTX_HANDOFF.md`: what is done per phase, with commits and limits.
3. `SPENTX_REMAINING_WORK.md`, `SPENTX_SQL_STATUS.md`, `SPENTX_TEST_STATUS.md`, `SPENTX_FILE_MAP.md`.

## Workflow (strict)
- Work on one approved phase at a time: implement → test → fix → verify → short report → git commit (checkpoint) → STOP and ask permission before the next phase.
- **Start Phase 5 only after the user explicitly approves it.** The order after that is Phase 6, then S5, S6, S6b, S8, S7, S7b, S10/V (S9 optional). It is in SPENTX_REMAINING_WORK.md.
- Speed & Quality strict rule (from the plan):
  - Work fast and stay on the approved phase.
  - Reuse existing code; no unrelated changes.
  - Keep production quality, security and financial accuracy.
  - Run the relevant tests and never claim success without evidence.
  - Keep reports short, then commit, stop and ask.
- Reports must be short and in plain English: changes, tests (real numbers), SQL needed (and whether it's needed now), NOT TESTED items, the commit id.
- If you find an issue outside the approved scope, report it and don't fix it.
- Label everything you did not actually run as **NOT TESTED**. Report device results and emulator results separately and never present emulator results as device results.
- Before any change touching stored data, back it up and add a test that proves the data is preserved.

## UI is FINAL / LOCKED
Reuse the existing Soft UI components and tokens (`lib/core/theme/soft_palette.dart`, `spentx_tokens.dart`, `context.softSurface` / `softInk` / `softBorder` / `tokens.warning` …). Every new UI must work in light AND dark mode. No redesigns.

## The 8 locked rules (must always stay green)
1. Purpose: user rule → Family → default purpose → Personal; never empty; a purpose edit never changes the category.
2. Account safety: exact match first. Auto-create only with 2 events or a balance SMS. The beneficiary number is never used as the user's account. Same bank + new last-4 is asked once. Unassigned changes no balance.
3. Category: user rule → global list → Needs category (still added); a global update never overwrites a user rule.
4. UPI / people: show only the handle, keep the full UPI for matching; own UPI = transfer; Family contact = Family purpose; unsure person = Needs classification.
5. Permanent learning: Quick Verify, edits, the Needs-category fix and the Family mark all save rules, and they survive sync, reinstall and app update.
6. Missing merchant: a genuine transaction is always added and counted, never dropped.
7. Transfers: CC bill, wallet top-up, ATM → cash and own transfers = spending +0, one logical transfer.
8. Auto-add + notifications: 3 formats, no repeat alert on a duplicate; safe Undo (only that action; an account is removed only if unused; the audit entry is kept).

Also keep: duplicate protection, status rules (pending/failed not counted; refund/reversal adjust the original), and `lib/core/finance/countable.dart` as the single totals rule.

## Database / SQL
- **Never run SQL that writes.** Live access is read-only SELECTs only.
- For any DB change, write the files: `migrations/<timestamp>_<name>.sql` plus `migration-checks/<name>/{precheck,verify,rollback}.sql`. The user runs them manually in the Supabase Dashboard SQL editor.
- The process (user-run): backup with `supabase/backup/backup.sh` (the DB URL is pasted at a hidden prompt; never write it anywhere) → snapshot (`migration-checks/p0_snapshot.sql`) → precheck (all ok) → migration → verify → keep rollback ready.
- Nothing destructive without explicit approval. Never delete data to fix a conflict.
- 8 SQL files are pending; see SPENTX_SQL_STATUS.md.

## Security and privacy
- No secrets in git: no keys, DB URLs, passwords, anon/service keys, `key.properties`, keystores. Don't create signing keys yourself. **Never push.**
- SMS privacy: never put OTPs, SMS text, account numbers, amounts, UPI IDs or tokens in logs, crash reports or Supabase. OTP messages are dropped before storage.
- Single-writer rule: only one Dart engine writes Hive at a time, guarded by `HiveWriterLock` (an OS file lock, Kotlin + Dart, no timeout). The background worker never refreshes or removes the Supabase session; it defers instead (refresh-race rule).
- The durable native queue never drops an SMS: an item is acknowledged only after a successful save; it is kept across sign-out and with detection off.

## Testing
- Develop with targeted tests, then once at the end: `flutter test`, `cd android && ./gradlew :app:testDebugUnitTest --rerun-tasks`, `flutter analyze`, `flutter build apk --debug`.
- Release build is blocked until the user creates `android/key.properties`; it fails closed by design.
- Phone: **AIN065 (Android 16)** over wireless adb. The port changes every time: find it with `adb mdns services`, `adb connect <ip:port>`, and always pass `-s <serial>` to adb. The phone holds real data: back up before `install -r`, never uninstall or clear data.

Begin by reading the files above, then confirm with the user before starting Phase 5.
