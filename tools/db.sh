#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# db.sh — apply migrations and run the assertion scripts against a database,
# without pasting anything into the SQL Editor by hand.
#
#   tools/db.sh apply 25 26 27     apply migrations by number
#   tools/db.sh test  25 26 27     run their TESTPLANs (each rolls itself back)
#   tools/db.sh check              audit every SECURITY DEFINER function + grants
#   tools/db.sh trips              inventory every trip (find the dogfood leftovers)
#   tools/db.sh sql <file>         run any .sql file
#   tools/db.sh shell              interactive psql
#
# TARGET comes from a connection-string file, never from an argument, so a
# connection string never lands in shell history or a process list:
#
#   supabase/.staging-conn   default target        (already gitignored)
#   supabase/.prod-conn      requires --prod       (also gitignored)
#
# Get the string from Supabase → Project Settings → Database → Connection
# string, and write it to the file:
#
#   printf '%s' 'postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres' \
#     > supabase/.staging-conn
#
# Use the SESSION POOLER (port 5432) — the tab labelled "Session pooler", not
# "Transaction pooler". Two separate reasons, easy to conflate:
#
#   • The DIRECT host (db.PROJECT.supabase.co) publishes an AAAA record and no
#     A record. On a network without IPv6 it does not resolve at all — psql
#     fails with "could not translate host name", before any auth. The session
#     pooler is reachable over IPv4, so it is the only route that works here.
#   • The TRANSACTION pooler (port 6543) hands out a different backend per
#     statement, so `set role`, `begin … rollback` and temp fixtures — which is
#     what every TESTPLAN is built out of — do not survive. The session pooler
#     gives one real backend for the whole connection, so they do.
#
# Both poolers connect as the same `postgres` role, so the auth.users fixtures
# the testplans create are as permitted there as on the direct connection.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
CHECKS="$ROOT/supabase/checks"

# Homebrew's libpq is keg-only: `brew install libpq` leaves a working psql that
# is not on PATH, so the script would report it missing on a machine that has
# it. Look in the usual places before giving up.
PSQL="${PSQL:-}"
if [[ -z "$PSQL" ]]; then
  for c in psql /opt/homebrew/opt/libpq/bin/psql /usr/local/opt/libpq/bin/psql \
           /Applications/Postgres.app/Contents/Versions/latest/bin/psql; do
    if command -v "$c" >/dev/null 2>&1; then PSQL="$c"; break; fi
  done
fi
if [[ -z "$PSQL" ]]; then
  echo "✗ psql not found. Install it with:  brew install libpq" >&2
  echo "  (or set PSQL=/path/to/psql)" >&2
  exit 1
fi

TARGET=staging
ARGS=()
for a in "$@"; do
  case "$a" in
    --prod)    TARGET=prod ;;
    --staging) TARGET=staging ;;
    *)         ARGS+=("$a") ;;
  esac
done
set -- "${ARGS[@]:-}"

# The header block is the help text. Printing a hardcoded line range meant that
# editing the header silently truncated --help; read to the closing rule instead.
usage() {
  awk 'NR>2 && /^# ---/ { exit } NR>2 { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

# Usage before credentials: asking for a connection string in order to be told
# how to use the script would be a silly first experience.
case "${1:-}" in ''|help|-h|--help) usage; exit 0 ;; esac

CONN_FILE="$ROOT/supabase/.$TARGET-conn"
if [[ ! -s "$CONN_FILE" ]]; then
  echo "✗ No connection string at supabase/.$TARGET-conn" >&2
  echo "  Create it (the file is gitignored):" >&2
  echo "    printf '%s' 'postgresql://postgres.PROJECT:PW@aws-0-REGION.pooler.supabase.com:5432/postgres' > supabase/.$TARGET-conn" >&2
  echo "  Supabase → Database → Connection string → Session pooler (see the header)." >&2
  exit 1
fi
# First non-empty, non-comment line; tolerate a trailing newline.
CONN="$(grep -v '^[[:space:]]*#' "$CONN_FILE" | grep -m1 '[^[:space:]]' | tr -d '\r\n')"

# Writing to prod is a decision, not a default.
if [[ "$TARGET" == prod && "${1:-}" =~ ^(apply|sql)$ ]]; then
  echo "⚠️  About to run ${2:-} against PRODUCTION."
  read -r -p "    Type the word PROD to continue: " ok
  [[ "$ok" == "PROD" ]] || { echo "aborted."; exit 1; }
fi

# ON_ERROR_STOP: a failed assertion must exit non-zero, not scroll past.
run() { "$PSQL" "$CONN" -v ON_ERROR_STOP=1 --no-psqlrc -f "$1"; }

cmd="${1:-}"; shift || true

case "$cmd" in
  apply)
    [[ $# -gt 0 ]] || { echo "usage: tools/db.sh apply 25 26" >&2; exit 1; }
    for n in "$@"; do
      # `|| true`: with pipefail + errexit, a no-match ls would abort the script
      # right here and exit non-zero with NOTHING printed — the check below
      # never got a chance to say which number was wrong.
      f=$(ls "$MIG/$n"-*.sql 2>/dev/null | grep -v -- '-TESTPLAN' | head -1 || true)
      [[ -f "$f" ]] || { echo "✗ no migration numbered $n in supabase/migrations/" >&2; exit 1; }
      echo "── applying $(basename "$f")  →  $TARGET"
      run "$f"
      echo "   ✓ applied"
    done
    ;;
  test)
    [[ $# -gt 0 ]] || { echo "usage: tools/db.sh test 25 26" >&2; exit 1; }
    for n in "$@"; do
      f="$MIG/$n-TESTPLAN.sql"
      [[ -f "$f" ]] || { echo "✗ no testplan for $n" >&2; exit 1; }
      echo "── $n-TESTPLAN.sql  →  $TARGET"
      # Each testplan is wrapped in begin/rollback, so a pass changes nothing
      # and a failure raises (ON_ERROR_STOP turns that into a non-zero exit).
      if run "$f"; then
        echo "   ✓ all assertions held"
      else
        echo "   ✗ FAILED — see the raise above" >&2
        exit 1
      fi
    done
    ;;
  check)  run "$CHECKS/verify-rpcs.sql" ;;
  trips)  run "$CHECKS/trips-inventory.sql" ;;
  sql)
    [[ -f "${1:-}" ]] || { echo "usage: tools/db.sh sql <file.sql>" >&2; exit 1; }
    run "$1"
    ;;
  shell)  "$PSQL" "$CONN" --no-psqlrc ;;
  *)
    echo "✗ unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
