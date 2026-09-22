#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/staging.env" >&2
  exit 64
fi

env_file=$1
if [[ ! -f "$env_file" ]]; then
  echo "Configuration file not found" >&2
  exit 66
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
compose_file="$script_dir/compose.yml"
work_dir=$(mktemp -d)
trap 'rm -rf -- "$work_dir"' EXIT

compose=(docker compose --project-name trust-circle-staging --env-file "$env_file" -f "$compose_file")
auth_container=$("${compose[@]}" ps -q auth)
messaging_container=$("${compose[@]}" ps -q messaging)
gateway_container=$("${compose[@]}" ps -q gateway)
postgres_container=$("${compose[@]}" ps -q postgres)

if [[ -z "$auth_container" || -z "$messaging_container" || -z "$gateway_container" || -z "$postgres_container" ]]; then
  echo "Required staging containers are not running" >&2
  exit 69
fi

sentinel="tc206-synthetic-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
forged_request_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
started_at=$(date --iso-8601=ns)
bind_address=$(sed -n 's/^TC_STAGING_BIND_ADDRESS=//p' "$env_file")
http_port=$(sed -n 's/^TC_STAGING_HTTP_PORT=//p' "$env_file")
base_url="http://${bind_address:-127.0.0.1}:${http_port:-18080}"

# Exercise the real host bind. curl is already a prerequisite of smoke-test.sh
# and, unlike the pinned BusyBox wget build, preserves response headers.
curl --silent --show-error --dump-header "$work_dir/auth.headers" --output /dev/null \
  --request POST \
  --header "Authorization: Bearer $sentinel" \
  --header "Cookie: session=$sentinel" \
  --header "X-Request-ID: $forged_request_id" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"log-check@example.invalid\",\"password\":\"$sentinel\"}" \
  "$base_url/auth/login?probe=$sentinel"

curl --silent --show-error --dump-header "$work_dir/messaging.headers" --output /dev/null \
  --header "Authorization: Bearer $sentinel" \
  --header "Cookie: session=$sentinel" \
  --header "X-Request-ID: $forged_request_id" \
  "$base_url/api/groups?probe=$sentinel"

# A deliberately invalid cast would normally repeat its value in PostgreSQL's
# ERROR/DETAIL output. Runtime logging must suppress that synthetic value.
postgres_probe=$(printf 'SELECT 1;\n' | \
  docker exec --interactive "$postgres_container" sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1' \
    2>/dev/null | tr -d '[:space:]')
if [[ "$postgres_probe" != "1" ]]; then
  echo "PostgreSQL safe-log control query failed" >&2
  exit 1
fi
if printf "SELECT '%s'::integer;\n" "$sentinel" | \
  docker exec --interactive "$postgres_container" sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-psqlrc --set ON_ERROR_STOP=1' \
    >/dev/null 2>&1; then
  echo "PostgreSQL synthetic error probe unexpectedly succeeded" >&2
  exit 1
fi

auth_response_id=$(awk 'tolower($1) == "x-request-id:" {gsub("\r", "", $2); print $2}' "$work_dir/auth.headers" | tail -n1)
messaging_response_id=$(awk 'tolower($1) == "x-request-id:" {gsub("\r", "", $2); print $2}' "$work_dir/messaging.headers" | tail -n1)
if [[ ! "$auth_response_id" =~ ^[0-9a-f]{32}$ || "$auth_response_id" == "$forged_request_id" ]]; then
  echo "Auth response correlation ID is missing, malformed or client-controlled" >&2
  exit 1
fi
if [[ ! "$messaging_response_id" =~ ^[0-9a-f]{32}$ || "$messaging_response_id" == "$forged_request_id" ]]; then
  echo "Messaging response correlation ID is missing, malformed or client-controlled" >&2
  exit 1
fi

sleep 1
docker logs --since "$started_at" "$auth_container" >"$work_dir/auth.log" 2>&1
docker logs --since "$started_at" "$messaging_container" >"$work_dir/messaging.log" 2>&1
docker logs --since "$started_at" "$gateway_container" >"$work_dir/gateway.log" 2>&1
docker logs --since "$started_at" "$postgres_container" >"$work_dir/postgres.log" 2>&1

if grep -Fq -- "$sentinel" "$work_dir/auth.log" "$work_dir/messaging.log" "$work_dir/gateway.log" "$work_dir/postgres.log"; then
  echo "Synthetic sensitive sentinel leaked into runtime logs" >&2
  exit 1
fi
if grep -Fq -- "$forged_request_id" "$work_dir/auth.log" "$work_dir/messaging.log" "$work_dir/gateway.log"; then
  echo "Client-supplied request ID was not replaced by the gateway" >&2
  exit 1
fi

for log_file in "$work_dir/auth.log" "$work_dir/messaging.log" "$work_dir/gateway.log"; do
  [[ -s "$log_file" ]] || {
    echo "Expected a structured log line from every HTTP component" >&2
    exit 1
  }
  jq --exit-status --slurp 'all(.[]; .schemaVersion == 1 and (.requestId | test("^[0-9a-f]{32}$")))' \
    "$log_file" >/dev/null
done

auth_request_id=$(jq --raw-output --slurp 'map(.requestId) | first' "$work_dir/auth.log")
messaging_request_id=$(jq --raw-output --slurp 'map(.requestId) | first' "$work_dir/messaging.log")
gateway_request_ids=$(jq --raw-output '.requestId' "$work_dir/gateway.log")
[[ "$auth_request_id" == "$auth_response_id" ]]
[[ "$messaging_request_id" == "$messaging_response_id" ]]
grep -Fxq -- "$auth_request_id" <<<"$gateway_request_ids"
grep -Fxq -- "$messaging_request_id" <<<"$gateway_request_ids"

echo "TC-206 safe-log probe passed"
