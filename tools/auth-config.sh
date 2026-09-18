#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# auth-config.sh — push supabase/config.toml to a project, and prove afterwards
# that it changed only what you meant.
#
#   tools/auth-config.sh --staging show     print the live auth config (redacted)
#   tools/auth-config.sh --staging push     snapshot → push → diff what moved
#   tools/auth-config.sh --prod    diff     live vs the last snapshot
#
# WHY A WRAPPER. `supabase config push` sends the WHOLE auth config: any key not
# written in config.toml is sent as the CLI's DEFAULT, not left alone. So a push
# is never "just the templates" — it is a rewrite of every auth setting, and the
# only way to know it did what you wanted is to read the config back and diff it.
# That is what `push` does here, automatically, every time.
#
# It also refuses to push prod without the mail sender credential, because a
# push with an empty `pass` would move prod's sign-in email off Resend onto
# Supabase's shared sender, with a different From address and a 2/hour cap.
#
# CREDENTIALS (both gitignored, both yours to create):
#
#   supabase/.mgmt-token   Supabase personal access token, for READING the live
#                          config over the Management API. Project-scoped and
#                          read-only is enough. Create at
#                          supabase.com/dashboard/account/tokens, then:
#                              pbpaste > supabase/.mgmt-token
#                              chmod 600 supabase/.mgmt-token
#
#   supabase/.smtp-pass    The Resend API key prod's SMTP sender uses, needed
#                          only for `--prod push`. Same idea:
#                              pbpaste > supabase/.smtp-pass
#                              chmod 600 supabase/.smtp-pass
#
# The push itself goes through the Supabase CLI, which uses its own login in the
# macOS keychain — not the token above.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"   # `supabase config push` reads ./supabase/config.toml from the CWD
             # and ignores --workdir, so the repo root is the only place it works.

STAGING_REF=fdcncqnklscbztcydtye
PROD_REF=wvmnudcwcqktcugouqoe

TARGET=staging
case "${1:-}" in
  --staging) TARGET=staging; shift ;;
  --prod)    TARGET=prod;    shift ;;
esac
CMD="${1:-show}"

if [[ "$TARGET" == prod ]]; then REF="$PROD_REF"; else REF="$STAGING_REF"; fi

TOKEN_FILE="$ROOT/supabase/.mgmt-token"
SMTP_FILE="$ROOT/supabase/.smtp-pass"
SNAP_DIR="$ROOT/supabase/.authcfg"
SNAP="$SNAP_DIR/$TARGET.json"
mkdir -p "$SNAP_DIR"

if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "✗ $TOKEN_FILE is missing — see the header of this script." >&2
  exit 1
fi

# Read the live config into a file. Never echoed: the response carries the SMTP
# credential in clear.
fetch() {
  local out="$1" code
  code="$(curl -s -o "$out" -w '%{http_code}' \
    "https://api.supabase.com/v1/projects/$REF/config/auth" \
    -H "Authorization: Bearer $(tr -d ' \n\r' < "$TOKEN_FILE")")"
  if [[ "$code" != 200 ]]; then
    echo "✗ GET config/auth on $TARGET answered HTTP $code" >&2
    return 1
  fi
}

# Field-level diff of two snapshots, with anything secret-shaped reduced to
# "<set>" / "<changed>" so a terminal, a screenshot or a transcript never carries it.
compare() {
  python3 - "$1" "$2" <<'PY'
import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
SECRET = ('secret', 'pass', 'key', 'token')
def show(k, v):
    if v is None: return 'null'
    if any(w in k for w in SECRET) and isinstance(v, str) and v: return f'<set, {len(v)} chars>'
    if isinstance(v, str) and len(v) > 60: return f'<{len(v)} chars>'
    return json.dumps(v)
moved = [k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]
if not moved:
    print("  (nothing changed)")
else:
    for k in moved:
        print(f"  {k}\n    before: {show(k, a.get(k))}\n    after:  {show(k, b.get(k))}")
print(f"\n{len(moved)} field(s) changed.")
PY
}

case "$CMD" in
  show)
    tmp="$(mktemp)"; fetch "$tmp"
    python3 - "$tmp" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
SECRET = ('secret', 'pass', 'key', 'token')
for k in sorted(d):
    v = d[k]
    if any(w in k for w in SECRET) and isinstance(v, str) and v: v = f'<set, {len(v)} chars>'
    elif isinstance(v, str) and len(v) > 60: v = f'<{len(v)} chars>'
    else: v = json.dumps(v)
    print(f"{k} = {v}")
PY
    rm -f "$tmp"
    ;;

  diff)
    [[ -s "$SNAP" ]] || { echo "✗ no snapshot at $SNAP — run 'show' or 'push' first." >&2; exit 1; }
    tmp="$(mktemp)"; fetch "$tmp"
    echo "── $TARGET: live vs last snapshot"
    compare "$SNAP" "$tmp"
    rm -f "$tmp"
    ;;

  push)
    # BOTH targets send through Resend, so both need the real credential.
    #
    # This used to export a placeholder for staging, on the assumption that
    # [remotes.staging] left SMTP disabled. When staging gained its own SMTP the
    # placeholder was pushed as the password, and staging answered every sign-in
    # with HTTP 500; the reason was only visible in the project's auth logs,
    # as 535 "Authentication credentials invalid" from Resend. An env() value
    # that is wrong fails exactly like one that is missing, except later and
    # somewhere you are not looking — so there is no placeholder branch now.
    if [[ ! -s "$SMTP_FILE" ]]; then
      echo "✗ $SMTP_FILE is missing. Both projects send auth mail through Resend," >&2
      echo "  and a push without the credential breaks sign-in on the target." >&2
      echo "  See this script's header for how to create it." >&2
      exit 1
    fi
    export SUPABASE_AUTH_SMTP_PASS="$(tr -d ' \n\r' < "$SMTP_FILE")"

    echo "── snapshotting $TARGET before the push"
    fetch "$SNAP"
    before="$(mktemp)"; cp "$SNAP" "$before"

    echo "── supabase config push --project-ref $REF"
    supabase config push --project-ref "$REF"

    echo "── reading $TARGET back"
    after="$(mktemp)"; fetch "$after"
    echo "── what the push actually changed on $TARGET:"
    compare "$before" "$after"
    cp "$after" "$SNAP"
    rm -f "$before" "$after"
    ;;

  *)
    echo "usage: tools/auth-config.sh [--staging|--prod] <show|diff|push>" >&2
    exit 1
    ;;
esac
