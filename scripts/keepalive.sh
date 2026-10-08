#!/usr/bin/env bash
# Sends one harmless read request to the Supabase project so a free-plan project is not paused for
# inactivity (it pauses after about a week without activity). Uses only the PUBLIC publishable key; row-level
# security means it returns an empty list, but it still runs a real database query.
#   usage: SUPABASE_URL=https://xxxx.supabase.co SUPABASE_KEY=sb_publishable_... scripts/keepalive.sh
set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL is not set}"
: "${SUPABASE_KEY:?SUPABASE_KEY is not set}"

# Strict allow-list, so the key can only ever be sent to a Supabase project host. (A shell glob such as
# "https://*.supabase.co" is NOT safe: "*" also matches "/" and "@", so https://evil.com/x.supabase.co would pass.)
# One lowercase label, optional trailing slash, nothing else: no path, query, userinfo, port or subdomains.
if [[ ! "$SUPABASE_URL" =~ ^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?\.supabase\.co/?$ ]]; then
  echo "Refusing to ping a URL that is not https://<project>.supabase.co" >&2
  exit 2
fi

body=$(mktemp)
trap 'rm -f "$body"' EXIT
status=$(curl --silent --show-error --output "$body" --write-out '%{http_code}' --max-time 30 \
  --header "apikey: $SUPABASE_KEY" \
  "${SUPABASE_URL%/}/rest/v1/transactions?select=id&limit=1")

echo "Supabase answered HTTP $status"
# 200: the query ran. 401 with Postgres error 42501 ("permission denied for table"): the database answered and
# refused an anonymous visitor, which is exactly what the row-level-security lockdown is for. Both prove the
# project is awake. Anything else (paused, deleted, wrong URL or key) fails.
if [ "$status" = "200" ]; then
  exit 0
fi
if [ "$status" = "401" ] && grep -q '"code":"42501"' "$body"; then
  echo "Postgres refused the anonymous read (42501): the database is awake and locked down as intended."
  exit 0
fi
echo "Unexpected answer. The project may be paused or deleted, or the URL/key variables are wrong." >&2
exit 1
