#!/usr/bin/env bash
# SpentX — restore a backup into a STAGING database and prove it matches
# (Phase S5b). Never targets live: refuses when the staging URL equals
# SPENTX_DB_URL or mentions the live project ref.
#
#   export SPENTX_STAGING_DB_URL='postgresql://...staging...'
#   supabase/backup/restore_staging.sh ~/spentx-backups/<UTC stamp>
#
# Staging must be an EMPTY Supabase project (or plain Postgres with an auth
# schema); the public schema is replaced. Result: PASS when every row of
# verify.sql on staging equals verify-live.csv taken at backup time.
set -euo pipefail
umask 077
die() { echo "restore: $*" >&2; exit 1; }

dir="${1:-}"; [[ -d "$dir" ]] || die "usage: restore_staging.sh <backup folder>"
[[ -n "${SPENTX_STAGING_DB_URL:-}" ]] || die "SPENTX_STAGING_DB_URL is not set."
live_ref="${SPENTX_LIVE_PROJECT_REF:-vdhayvlweuglpvzweunq}"
[[ "${SPENTX_STAGING_DB_URL}" != "${SPENTX_DB_URL:-}" ]] || die "staging URL equals SPENTX_DB_URL."
[[ "${SPENTX_STAGING_DB_URL}" != *"$live_ref"* ]] || die "staging URL points at the live project."
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

dump="$dir/public.dump"; auth="$dir/auth_users.sql"
if [[ ! -f "$dump" && -f "$dump.gpg" ]]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  gpg --batch --decrypt --output "$tmp/public.dump" "$dump.gpg"
  gpg --batch --decrypt --output "$tmp/auth_users.sql" "$auth.gpg"
  dump="$tmp/public.dump"; auth="$tmp/auth_users.sql"
fi
[[ -f "$dump" && -f "$auth" ]] || die "backup files missing in $dir"

echo "restore: auth users ..."
psql "$SPENTX_STAGING_DB_URL" -X -q -o /dev/null -v ON_ERROR_STOP=1 \
  -c 'truncate auth.identities, auth.users cascade' -f "$auth"
echo "restore: public schema + data ..."
psql "$SPENTX_STAGING_DB_URL" -X -q -o /dev/null -v ON_ERROR_STOP=1 \
  -c 'drop schema if exists public cascade'
pg_restore --dbname "$SPENTX_STAGING_DB_URL" --no-owner --exit-on-error "$dump"

echo "restore: comparing fingerprints ..."
psql "$SPENTX_STAGING_DB_URL" -X -A -F, -v ON_ERROR_STOP=1 -f "$here/verify.sql" \
  > "$dir/verify-staging.csv"
if diff -u "$dir/verify-live.csv" "$dir/verify-staging.csv"; then
  echo "restore: PASS — staging matches the backup fingerprint."
else
  die "FAIL — fingerprints differ (see diff above)."
fi
