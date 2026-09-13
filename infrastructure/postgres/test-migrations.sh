#!/usr/bin/env bash
set -Eeuo pipefail

tc201_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
tc201_project="trust-circle-tc201-$$"
tc201_logs=$(mktemp -d /tmp/trust-circle-tc201.XXXXXX)
umask 077

export TC_MIGRATION_TEST_POSTGRES_IMAGE="postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685"
export TC_MIGRATION_TEST_SQITCH_IMAGE="sqitch/sqitch@sha256:f247ab0e0b66e9c2d09a400864f7314358893f5cf209cddcc4f213f7d5bfe4d3"
export TC_MIGRATION_TEST_NGINX_IMAGE="nginx@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46"
export TC_MIGRATION_TEST_PASSWORD="${TC_MIGRATION_TEST_PASSWORD:-$(openssl rand -hex 24)}"
export TC_MIGRATION_TEST_REFRESH_SECRET="${TC_MIGRATION_TEST_REFRESH_SECRET:-$(openssl rand -hex 32)}"

openssl genpkey -algorithm ED25519 -out "$tc201_logs/access-private.pem" 2>/dev/null
openssl pkey -in "$tc201_logs/access-private.pem" -pubout \
  -out "$tc201_logs/access-public.pem" 2>/dev/null
export TC_MIGRATION_TEST_ACCESS_PRIVATE_KEY_B64
TC_MIGRATION_TEST_ACCESS_PRIVATE_KEY_B64=$(base64 -w 0 "$tc201_logs/access-private.pem")
export TC_MIGRATION_TEST_ACCESS_PUBLIC_KEY_B64
TC_MIGRATION_TEST_ACCESS_PUBLIC_KEY_B64=$(base64 -w 0 "$tc201_logs/access-public.pem")

tc201_compose=(
  docker compose
  --project-name "$tc201_project"
  --file "$tc201_dir/compose.migration-test.yml"
)
tc201_target="db:pg://trust_circle_migrator@database/trust_circle_migration_test"

tc201_cleanup() {
  local cleanup_status=0
  "${tc201_compose[@]}" down --rmi local --volumes --remove-orphans \
    >/dev/null 2>&1 \
    || cleanup_status=1

  if [[ -n "$(docker ps --all --quiet \
    --filter "label=com.docker.compose.project=$tc201_project")" ]]; then
    cleanup_status=1
  fi
  if [[ -n "$(docker network ls --quiet \
    --filter "label=com.docker.compose.project=$tc201_project")" ]]; then
    cleanup_status=1
  fi
  if [[ -n "$(docker volume ls --quiet \
    --filter "label=com.docker.compose.project=$tc201_project")" ]]; then
    cleanup_status=1
  fi
  if [[ -n "$(docker image ls --quiet \
    --filter "label=com.docker.compose.project=$tc201_project")" ]]; then
    cleanup_status=1
  fi

  rm -rf -- "$tc201_logs"
  return "$cleanup_status"
}
tc201_finish() {
  local test_status=$?
  trap - EXIT
  tc201_cleanup || test_status=1
  exit "$test_status"
}
trap tc201_finish EXIT

"${tc201_compose[@]}" config --quiet
"${tc201_compose[@]}" up --detach --wait database
"${tc201_compose[@]}" run --rm sqitch --version \
  | grep -q 'sqitch (App::Sqitch) v1\.6\.1$'
"${tc201_compose[@]}" exec -T database \
  psql --tuples-only --no-align --username trust_circle_migrator \
  --dbname trust_circle_migration_test --command 'SHOW server_version_num' \
  | grep -Eq '^16[0-9]{4}$'

# Deux runners partent ensemble. Sqitch sérialise leur écriture par le verrou
# PostgreSQL ; les deux doivent réussir et le registre ne doit contenir qu'une
# occurrence de chaque changement.
"${tc201_compose[@]}" run --rm sqitch deploy --verify "$tc201_target" \
  >"$tc201_logs/deploy-1.log" 2>&1 &
tc201_pid_one=$!
"${tc201_compose[@]}" run --rm sqitch deploy --verify "$tc201_target" \
  >"$tc201_logs/deploy-2.log" 2>&1 &
tc201_pid_two=$!

tc201_failed=0
wait "$tc201_pid_one" || tc201_failed=1
wait "$tc201_pid_two" || tc201_failed=1
if [[ "$tc201_failed" -ne 0 ]]; then
  sed -n '1,240p' "$tc201_logs/deploy-1.log" >&2
  sed -n '1,240p' "$tc201_logs/deploy-2.log" >&2
  exit 1
fi

"${tc201_compose[@]}" run --rm sqitch check "$tc201_target"
"${tc201_compose[@]}" run --rm sqitch verify "$tc201_target"
"${tc201_compose[@]}" exec -T database \
  psql --set ON_ERROR_STOP=1 --username trust_circle_migrator \
  --dbname trust_circle_migration_test \
  <"$tc201_dir/tests/assert-current-schema.sql"

"${tc201_compose[@]}" up --detach --build --wait auth messaging gateway
"${tc201_compose[@]}" exec -T \
  -e TC_DEVICE_TRUST_SMOKE_BASE_URL=http://gateway:8080 \
  messaging node dist/tools/deviceTrustStagingSmoke.js

# Un nouveau deploy doit être un no-op.
"${tc201_compose[@]}" run --rm sqitch deploy --verify "$tc201_target"

# La réversion totale est limitée à cette base jetable, dont le nom de projet
# unique et le volume sont supprimés par le trap.
"${tc201_compose[@]}" stop gateway messaging auth
"${tc201_compose[@]}" run --rm sqitch revert -y "$tc201_target"
"${tc201_compose[@]}" exec -T database \
  psql --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --username trust_circle_migrator --dbname trust_circle_migration_test \
  --command "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" \
  | grep -qx '0'

"${tc201_compose[@]}" run --rm sqitch deploy --verify "$tc201_target"
"${tc201_compose[@]}" run --rm sqitch check "$tc201_target"
"${tc201_compose[@]}" exec -T database \
  psql --set ON_ERROR_STOP=1 --username trust_circle_migrator \
  --dbname trust_circle_migration_test \
  <"$tc201_dir/tests/assert-current-schema.sql"

"${tc201_compose[@]}" run --rm sqitch status "$tc201_target"
