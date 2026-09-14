#!/bin/sh
set -eu

db_host=${TC_DB_HOST:-postgres}

run_as() {
  role_name=$1
  secret_name=$2
  sql=$3
  PGPASSWORD=$(sed -n '1p' "/run/secrets/${secret_name}_db_password") \
    psql --host "$db_host" --username "$role_name" --dbname "$TC_DB_NAME" \
      --set ON_ERROR_STOP=1 --command "$sql"
}

expect_denied() {
  description=$1
  role_name=$2
  secret_name=$3
  sql=$4
  if run_as "$role_name" "$secret_name" "$sql" >/dev/null 2>&1; then
    echo "Unexpected database privilege: $description" >&2
    exit 1
  fi
}

run_as trust_circle_auth auth 'SELECT id FROM users LIMIT 0' >/dev/null
run_as trust_circle_messaging messaging 'SELECT id FROM messages LIMIT 0' >/dev/null

expect_denied 'Auth can read groups' \
  trust_circle_auth auth 'SELECT id FROM groups LIMIT 0'
expect_denied 'Auth can update users' \
  trust_circle_auth auth "UPDATE users SET username = username WHERE false"
expect_denied 'Auth can create tables' \
  trust_circle_auth auth 'CREATE TABLE tc_auth_should_be_denied(id integer)'
expect_denied 'Auth can read the Sqitch registry' \
  trust_circle_auth auth 'SELECT change_id FROM trust_circle_sqitch.changes LIMIT 0'

expect_denied 'Messaging can read refresh tokens' \
  trust_circle_messaging messaging 'SELECT id FROM refresh_tokens LIMIT 0'
expect_denied 'Messaging can delete messages' \
  trust_circle_messaging messaging 'DELETE FROM messages WHERE false'
expect_denied 'Messaging can create tables' \
  trust_circle_messaging messaging 'CREATE TABLE tc_messaging_should_be_denied(id integer)'
expect_denied 'Messaging can read the Sqitch registry' \
  trust_circle_messaging messaging 'SELECT change_id FROM trust_circle_sqitch.changes LIMIT 0'

echo "Runtime database privilege boundaries verified."
