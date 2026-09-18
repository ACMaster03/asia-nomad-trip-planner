#!/usr/bin/env bash
# tools/rotate-cron-secret.sh --staging | --prod
#
# Mints a fresh cron secret and sets it in the TWO places that must agree:
#   public.app_config.cron_secret   database side — the cron jobs (38) and the
#                                   fan-out trigger (37) sign with it
#   CRON_SECRET                     Edge Function env — _shared/cronAuth.ts
#                                   verifies with it
# Needed after 38 because the old value sat in plain text inside
# cron.job.command (and in the pg_net queue) since day one.
#
# The value is never printed and never touches the repo: it lives in a mktemp
# file for the one SQL call, then is removed. What you see is a SHA-256 digest,
# which you can compare with `supabase secrets list --project-ref <ref>`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TARGET=""
for a in "$@"; do
  case "$a" in
    --staging) TARGET=staging ;;
    --prod)    TARGET=prod ;;
    *) echo "usage: tools/rotate-cron-secret.sh --staging | --prod" >&2; exit 1 ;;
  esac
done
[[ -n "$TARGET" ]] || { echo "usage: tools/rotate-cron-secret.sh --staging | --prod" >&2; exit 1; }
case "$TARGET" in
  staging) REF=fdcncqnklscbztcydtye ;;
  prod)    REF=wvmnudcwcqktcugouqoe ;;
esac

NEW="$(openssl rand -hex 24)"   # 48 hex chars — same shape as the old value
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<SQL
insert into public.app_config (key, value) values ('cron_secret', '$NEW')
on conflict (key) do update set value = excluded.value;
select key, length(value) as value_len,
       encode(sha256(convert_to(value, 'UTF8')), 'hex') as sha256
  from public.app_config where key = 'cron_secret';
SQL

echo "▶ database side ($TARGET)"
"$ROOT/tools/db.sh" "--$TARGET" sql "$TMP"
rm -f "$TMP"

echo "▶ function side ($TARGET)"
supabase secrets set "CRON_SECRET=$NEW" --project-ref "$REF"
echo "✓ cron secret rotated on $TARGET. Both sides must show the same digest:"
echo "    supabase secrets list --project-ref $REF"
