#!/usr/bin/env bash
# SpentX — external database backup (Phase S5b). Run BEFORE every migration.
#
# Reads the connection string from the environment ONLY. Never put it in a
# file in this repo, never pass it on the command line (shell history).
#   export SPENTX_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres'
#   (Supabase dashboard -> Connect -> Session pooler / Direct connection)
#   supabase/backup/backup.sh
#
# Writes to $SPENTX_BACKUP_DIR (default ~/spentx-backups), never into the repo:
#   <UTC stamp>/public.dump        pg_dump custom format: public schema + data
#   <UTC stamp>/auth_users.sql     data of auth.users + auth.identities (logins)
#   <UTC stamp>/verify-live.csv    output of verify.sql at backup time
#   <UTC stamp>/manifest.txt       versions, sizes, sha256 of every file
# Optional: SPENTX_BACKUP_GPG_RECIPIENT=<key id> encrypts the dumps with gpg
# and removes the plaintext copies after the encrypted copy is verified.
# Read-only against the database (pg_dump / SELECT only).
set -euo pipefail
umask 077

die() { echo "backup: $*" >&2; exit 1; }

[[ -n "${SPENTX_DB_URL:-}" ]] || die "SPENTX_DB_URL is not set (see header)."
for bin in pg_dump pg_restore psql sha256sum; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    [[ "$bin" == sha256sum ]] && command -v shasum >/dev/null 2>&1 && continue
    die "$bin not found (install PostgreSQL client tools, same or newer major as the server)."
  fi
done
sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out_root="${SPENTX_BACKUP_DIR:-$HOME/spentx-backups}"
case "$(cd "$out_root" 2>/dev/null && pwd || echo "$out_root")" in
  "$(cd "$here/../.." && pwd)"*) die "SPENTX_BACKUP_DIR is inside the repo; choose a folder outside it." ;;
esac
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$out_root/$stamp"
mkdir -p "$out"

server_major="$(psql "$SPENTX_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'show server_version_num' | cut -c1-2)"
client_major="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
(( client_major >= server_major )) || die "pg_dump $client_major is older than server $server_major."

echo "backup: dumping public schema + data ..."
pg_dump "$SPENTX_DB_URL" --format=custom --schema=public --no-owner \
  --file "$out/public.dump"

echo "backup: dumping auth.users + auth.identities data ..."
pg_dump "$SPENTX_DB_URL" --data-only --table=auth.users --table=auth.identities \
  --no-owner --file "$out/auth_users.sql"

echo "backup: checking the archive is readable ..."
pg_restore --list "$out/public.dump" > "$out/public.dump.toc"
grep -q 'TABLE DATA public transactions' "$out/public.dump.toc" \
  || die "public.transactions data missing from the dump."
grep -q 'COPY auth.users' "$out/auth_users.sql" || die "auth.users data missing."

echo "backup: fingerprint of live (row counts + checksums) ..."
psql "$SPENTX_DB_URL" -X -A -F, -v ON_ERROR_STOP=1 -f "$here/verify.sql" \
  > "$out/verify-live.csv"

if [[ -n "${SPENTX_BACKUP_GPG_RECIPIENT:-}" ]]; then
  for f in public.dump auth_users.sql; do
    gpg --batch --yes --encrypt --recipient "$SPENTX_BACKUP_GPG_RECIPIENT" \
      --output "$out/$f.gpg" "$out/$f"
    gpg --batch --list-packets "$out/$f.gpg" >/dev/null 2>&1 || die "gpg check failed for $f"
    rm -f "$out/$f"  # plaintext removed only after the encrypted copy exists
  done
fi

{
  echo "created_utc=$stamp"
  echo "server_major=$server_major"
  echo "pg_dump=$(pg_dump --version)"
  echo "git_head=$(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo n/a)"
  echo "--- files"
  (cd "$out" && ls -l)
  echo "--- sha256"
  (cd "$out" && sha ./*.dump* ./*.sql* ./*.csv 2>/dev/null || true)
} > "$out/manifest.txt"

echo "backup: OK -> $out"
echo "backup: copy this folder OFF this machine (encrypted drive / password manager"
echo "        vault) before running the migration. Then run the migration's"
echo "        precheck.sql, the migration, verify.sql, and supabase/backup/verify.sql."
