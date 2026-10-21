# SpentX — backup & restore (Phase S5b)

Nothing here runs automatically. The connection string comes from your shell
environment only — never commit it, never paste it into a file in this repo.

## 1. Backup before EVERY migration

Option A — script (needs PostgreSQL client tools ≥ the server major version):

```bash
export SPENTX_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'  # Dashboard → Connect
export SPENTX_BACKUP_DIR="$HOME/spentx-backups"     # outside the repo
supabase/backup/backup.sh                            # read-only: pg_dump + SELECT
unset SPENTX_DB_URL
```

Output folder `<UTC stamp>/`: `public.dump`, `auth_users.sql`,
`verify-live.csv` (row counts + checksums), `manifest.txt` (sha256).
Set `SPENTX_BACKUP_GPG_RECIPIENT` to keep only gpg-encrypted dumps.
**Copy the folder off the laptop** (encrypted drive / vault) before migrating.

Option B — dashboard: Database → Backups → download the latest daily backup
(paid plans) **and** run `supabase/backup/verify.sql` in the SQL editor;
save the result next to the download. A backup without its fingerprint
cannot be verified later.

## 2. Verify a backup (restore test on a staging copy)

Do this once per release, and for the first backup made with this script.

```bash
export SPENTX_STAGING_DB_URL='postgresql://...'   # EMPTY staging project, never live
supabase/backup/restore_staging.sh ~/spentx-backups/<UTC stamp>
```

PASS = every row of `verify.sql` on staging equals `verify-live.csv`.
The script refuses a URL equal to `SPENTX_DB_URL` or containing the live
project ref.

## 3. Restore live (disaster only)

1. Stop writes: put the app in maintenance / pause the project's API.
2. Take a fresh backup of the broken state (step 1) — never skip.
3. Prefer an undo: run the migration's `rollback.sql`
   (`supabase/migration-checks/<migration>/`), then its `verify.sql` and
   `supabase/backup/verify.sql`.
4. Only if data was lost: restore single tables from the dump, e.g.
   `pg_restore --data-only --table=transactions -d "$SPENTX_DB_URL" public.dump`
   into an emptied table, or a full `public` restore as in
   `restore_staging.sh` (drops `public`; auth users from `auth_users.sql`).
   Supabase dashboard point-in-time / daily restore is the alternative.
5. Run `supabase/backup/verify.sql`; compare with `verify-live.csv`.

## Fingerprint reference (live, 2026-10-21 ~14:00 IST, read-only)

| table | rows | live | data_md5 |
|---|---|---|---|
| transactions | 75 | 55 | 02a8a774e1838c05b18c2a9d304ff679 |
| accounts | 16 | 15 | b3631d4c07307ce64433ed13dc45e030 |
| user_merchants | 32 | 32 | f95f7840a6761cd6d7995d3af08b9fec |
| purposes | 15 | 13 | 535c8c0b08b9783ee34fb02ce7364f9e |
| categories | 7 | 7 | 47c652779923c619ba2011f4c0660bc8 |
| users | 7 | 7 | 1abaad8e7d964aeb10001b40ad8e5303 |
| investments | 4 | 1 | 6eaca6a149a5099e53c66946aac36247 |
| savings_goals | 4 | 1 | 8062b56711eda4fdc6bf542a6f0f179c |
| goal_contributions | 1 | 0 | 72c141fff67ce7e61bee019f230f125e |
| balances_per_account | 16 | 15 | row_md5 9a59c1eeef63223201f5b8455878e05b |
| user_rules | 32 | 32 | row_md5 97a23c0ed48204760978f40df666a21e |

Data changes every day; this table is only for orientation.
