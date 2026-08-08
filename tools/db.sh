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
# string → URI, and write it to the file:
#
#   printf '%s' 'postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres' \
#     > supabase/.staging-conn
#
# Use the DIRECT connection (port 5432), not the pooler: the testplans create
# their own fixtures in auth.users, which the pooled role may not be able to do.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
CHECKS="$ROOT/supabase/checks"

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

usage() { sed -n '3,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# Usage before credentials: asking for a connection string in order to be told
# how to use the script would be a silly first experience.
case "${1:-}" in ''|help|-h|--help) usage; exit 0 ;; esac

CONN_FILE="$ROOT/supabase/.$TARGET-conn"
if [[ ! -s "$CONN_FILE" ]]; then
  echo "✗ No connection string at supabase/.$TARGET-conn" >&2
  echo "  Create it (the file is gitignored):" >&2
  echo "    printf '%s' 'postgresql://postgres:PW@db.PROJECT.supabase.co:5432/postgres' > supabase/.$TARGET-conn" >&2
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
run() { psql "$CONN" -v ON_ERROR_STOP=1 --no-psqlrc -f "$1"; }

cmd="${1:-}"; shift || true

case "$cmd" in
  apply)
    [[ $# -gt 0 ]] || { echo "usage: tools/db.sh apply 25 26" >&2; exit 1; }
    for n in "$@"; do
      f=$(ls "$MIG/$n"-*.sql 2>/dev/null | grep -v -- '-TESTPLAN' | head -1)
      [[ -f "$f" ]] || { echo "✗ no migration $n" >&2; exit 1; }
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
  shell)  psql "$CONN" --no-psqlrc ;;
  *)
    echo "✗ unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
