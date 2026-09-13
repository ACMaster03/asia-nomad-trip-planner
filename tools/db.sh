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
# Two ways to reach the database. Nothing to remember for the first one:
#
#   DEFAULT — Supabase CLI, Management API. Needs only `supabase login` (once,
#   browser). The script links a throwaway workdir per target under
#   supabase/.links/ (gitignored) and runs each file with
#   `supabase db query --linked -f`. No password, no connection string.
#
#   --psql — direct psql, when a connection-string file exists (or on demand):
#
#   supabase/.staging-conn   default target        (already gitignored)
#   supabase/.prod-conn      requires --prod       (also gitignored)
#
# `shell` is psql-only (the API has no interactive session). Get the string
# from Supabase → Project Settings → Database → Connection string:
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
need_psql() {
  [[ -n "$PSQL" ]] && return 0
  echo "✗ psql not found. Install it with:  brew install libpq" >&2
  echo "  (or set PSQL=/path/to/psql, or drop --psql to use the Supabase CLI)" >&2
  exit 1
}

TARGET=staging
MODE=auto            # auto → psql when a real conn file exists, else the CLI
ARGS=()
for a in "$@"; do
  case "$a" in
    --prod)    TARGET=prod ;;
    --staging) TARGET=staging ;;
    --psql)    MODE=psql ;;
    --api)     MODE=api ;;
    *)         ARGS+=("$a") ;;
  esac
done
set -- "${ARGS[@]:-}"

# Project refs are public identifiers (they are in every API URL), not secrets.
case "$TARGET" in
  staging) REF=fdcncqnklscbztcydtye ;;
  prod)    REF=wvmnudcwcqktcugouqoe ;;
esac

# The header block is the help text. Printing a hardcoded line range meant that
# editing the header silently truncated --help; read to the closing rule instead.
usage() {
  awk 'NR>2 && /^# ---/ { exit } NR>2 { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

# Usage before credentials: asking for a connection string in order to be told
# how to use the script would be a silly first experience.
case "${1:-}" in ''|help|-h|--help) usage; exit 0 ;; esac

CONN_FILE="$ROOT/supabase/.$TARGET-conn"
CONN=""
if [[ -s "$CONN_FILE" ]]; then
  # First non-empty, non-comment line; tolerate a trailing newline.
  CONN="$(grep -v '^[[:space:]]*#' "$CONN_FILE" | grep -m1 '[^[:space:]]' | tr -d '\r\n')"
  # The header's example pasted literally (PROJECT:PASSWORD@…REGION…) is not a
  # connection string; treat it as absent rather than failing on DNS later.
  if [[ "$CONN" == *PROJECT* || "$CONN" == *PASSWORD@* || "$CONN" == *REGION* ]]; then
    echo "ℹ supabase/.$TARGET-conn holds the placeholder example, ignoring it." >&2
    CONN=""
  fi
fi
if [[ "$MODE" == auto ]]; then
  if [[ -n "$CONN" ]]; then MODE=psql; else MODE=api; fi
fi
[[ "$MODE" == psql ]] && need_psql
if [[ "$MODE" == psql && -z "$CONN" ]]; then
  echo "✗ --psql needs a connection string at supabase/.$TARGET-conn" >&2
  echo "    printf '%s' 'postgresql://postgres.PROJECT:PW@aws-0-REGION.pooler.supabase.com:5432/postgres' > supabase/.$TARGET-conn" >&2
  echo "  Supabase → Database → Connection string → Session pooler (see the header)." >&2
  echo "  Or drop --psql and let the Supabase CLI do it." >&2
  exit 1
fi

# CLI mode: link once per target into a workdir that is not the repo's own
# supabase/ folder, so `link` never touches the project's config or migrations
# and staging/prod can stay linked side by side.
LINKDIR="$ROOT/supabase/.links/$TARGET"
if [[ "$MODE" == api ]]; then
  command -v supabase >/dev/null 2>&1 || { echo "✗ supabase CLI not found:  brew install supabase/tap/supabase" >&2; exit 1; }
  if [[ "$(cat "$LINKDIR/supabase/.temp/project-ref" 2>/dev/null)" != "$REF" ]]; then
    echo "── linking $TARGET ($REF) into supabase/.links/$TARGET"
    mkdir -p "$LINKDIR"
    [[ -f "$LINKDIR/supabase/config.toml" ]] || supabase --workdir "$LINKDIR" init --yes >/dev/null
    # -p '' skips the database-password prompt; the Management API never needs it.
    supabase --workdir "$LINKDIR" link --project-ref "$REF" -p '' >/dev/null \
      || { echo "✗ link failed — run \`supabase login\` first." >&2; exit 1; }
  fi
fi

# Writing to prod is a decision, not a default.
if [[ "$TARGET" == prod && "${1:-}" =~ ^(apply|sql)$ ]]; then
  echo "⚠️  About to run ${2:-} against PRODUCTION."
  read -r -p "    Type the word PROD to continue: " ok
  [[ "$ok" == "PROD" ]] || { echo "aborted."; exit 1; }
fi

# ON_ERROR_STOP: a failed assertion must exit non-zero, not scroll past. The
# API path has the same property: a raised error is a non-zero exit from the
# CLI with the Postgres message in it. Two differences worth knowing — NOTICEs
# (the migrations' progress lines) are not returned by the API, and only the
# LAST statement's rows are printed.
run() {
  if [[ "$MODE" == psql ]]; then
    "$PSQL" "$CONN" -v ON_ERROR_STOP=1 --no-psqlrc -f "$1"
  else
    # psql metacommands (\echo, \set …) are client-side; the API is plain SQL.
    if grep -qE '^[[:space:]]*\\' "$1"; then
      echo "✗ $(basename "$1") uses psql metacommands — run it with --psql" >&2
      return 1
    fi
    # Capture, then print: piping straight into grep made an EMPTY result (a
    # migration that returns no rows) look like a failure — grep -v exits 1
    # when nothing survives, pipefail turned that into the script's exit, and
    # `apply A && test A && --prod apply A` stopped after the first apply with
    # the SQL already run and no "✓ applied" (2026-09-13, migration 32 landed
    # on staging only).
    local out rc=0
    if out="$(supabase --workdir "$LINKDIR" db query --linked -f "$1" 2>&1)"; then rc=0; else rc=$?; fi
    printf '%s\n' "$out" | grep -v '^Initialising login role' || true
    return "$rc"
  fi
}

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
  shell)
    [[ "$MODE" == psql ]] || { echo "✗ shell needs psql: add --psql and a supabase/.$TARGET-conn file" >&2; exit 1; }
    "$PSQL" "$CONN" --no-psqlrc ;;
  *)
    echo "✗ unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
