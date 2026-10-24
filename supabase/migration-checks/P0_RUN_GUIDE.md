# Running the two Phase 0 migrations yourself (Supabase Dashboard)

Takes about 20 minutes. You run everything; nothing here deletes data.

Files (all in `supabase/`):

| Step | File |
|---|---|
| Snapshot | `migration-checks/p0_snapshot.sql` |
| Migration 1 | `migrations/20261021120000_p0_tx_status_flags.sql` |
| ↳ check before / after / undo | `migration-checks/20261021120000_p0_tx_status_flags/precheck.sql`, `verify.sql`, `rollback.sql` |
| Migration 2 | `migrations/20261021120100_p0_account_evidence.sql` |
| ↳ check before / after / undo | `migration-checks/20261021120100_p0_account_evidence/precheck.sql`, `verify.sql`, `rollback.sql` |

**How to run a file in the SQL Editor:** Dashboard → your SpentX project →
**SQL Editor** → **New query**. Open the file on your Mac (TextEdit or VS
Code), press **Cmd+A** then **Cmd+C**, click into the editor, **Cmd+V**,
then click **Run**. Always paste the **whole file at once**. Never run only
part of a file, and never run a file twice "to be sure".

If the editor asks "this query has destructive operations, run anyway?",
that is normal for the two migration files only (they replace a check
rule). For any other file it should not appear: stop and ask.

---

## 0. Before you start

1. Close the SpentX app on your phone(s) and don't use the web app until
   the end. (App use changes data and would make the snapshots differ.)
2. Do it at a quiet time.

## 1. Backup

Your project is on the **Free plan**, so the Dashboard has no backup you can
download or restore, and no point-in-time recovery. Make your own:

**Option A (recommended): the backup script.** `pg_dump` 18.3 is already
installed on your Mac (newer than the server's 17: good).

1. Dashboard → **Connect** (top bar) → **Session pooler** → copy the URI.
   Replace `[YOUR-PASSWORD]` with your database password. If the password
   has symbols like `@ # / ?`, reset it to letters and numbers only first
   (Project Settings → Database → Reset password), or it won't connect.
2. In Terminal, run (paste the URI when asked; it stays hidden and is not
   saved anywhere):

   ```bash
   cd "/Users/karthi/Documents/SpentX Web/spentx-web copy 3"
   bash -c 'read -rsp "Paste DB URL: " SPENTX_DB_URL; echo; export SPENTX_DB_URL; bash supabase/backup/backup.sh'
   ```

3. Good result: the last lines say `backup: OK -> /Users/karthi/spentx-backups/<date>`.
   Copy that folder to a USB drive or other safe place.

**Option B (fallback if A fails): CSV export.** Dashboard → **Table
Editor** → open each table → **Export → Export as CSV**. Do it for:
`transactions`, `transaction_splits`, `accounts`, `account_purposes`,
`purposes`, `categories`, `user_merchants`. Keep the files safe.

Don't continue without A or B.

## 2. BEFORE snapshot

Run `migration-checks/p0_snapshot.sql`. You get about 31 rows. Click
**Export → CSV** (or take screenshots) and keep it as **BEFORE**.

(For reference, Grok Bot took one at 8:10 AM IST on 22 Oct:
`migration-checks/p0_snapshot_BEFORE_2026-10-22.txt`. Yours should match it
if nothing was used in between, but **yours** is the one to compare with.)

## 3. Migration 1: transaction status and flags

1. **Precheck.** Run `20261021120000_p0_tx_status_flags/precheck.sql`.
   Good = **every row has `ok` = true**. The last row lists counts like
   `completed/manual: 24`; that's information only. Any `false` → stop.
2. **Run.** Run `migrations/20261021120000_p0_tx_status_flags.sql`.
   Good = "Success. No rows returned".
3. **Verify.** Run `20261021120000_p0_tx_status_flags/verify.sql`.
   Good = **every row `ok` = true** (10 rows).

## 4. Migration 2: account evidence

1. **Precheck.** Run `20261021120100_p0_account_evidence/precheck.sql`.
   Good = every row `ok` = true (the "(info)" rows are just counts).
2. **Run.** Run `migrations/20261021120100_p0_account_evidence.sql`.
   Good = "Success. No rows returned".
3. **Verify.** Run `20261021120100_p0_account_evidence/verify.sql`.
   Good = every row `ok` = true (6 rows).

## 5. AFTER snapshot

Run `migration-checks/p0_snapshot.sql` again. **Every row must be exactly
the same as BEFORE**: same `rows`, same `fingerprint`, same balances, and
`tx_status_values` still `completed`. Then you can open the app again.

---

## If something goes wrong

- **Any error, or any `false`:** stop. Don't rerun anything, don't try
  other files. Copy the full error message (or a screenshot) and send it to
  Grok Bot together with which step you were on.
- **An error while running a migration file** (step 3.2 or 4.2): nothing
  was changed. The file runs as one unit, so it either fully applies or
  not at all. "lock timeout" / "canceling statement" just means the table was
  busy: wait a minute and that one file may be run once more.
- **AFTER differs from BEFORE:** send both results. Usually it means the
  app was used in between, not that data was damaged. Don't roll back
  before we've looked.
- **Undo (only if Grok Bot says so):** run the matching `rollback.sql`
  (migration 2's first, then migration 1's). They remove the new rules
  and indexes and keep all data. Migration 1's rollback refuses to run if
  new-style rows already exist, and tells you how many.
