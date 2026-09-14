#!/bin/sh
set -eu

for secret_name in admin migrator auth messaging; do
  secret_path="/run/secrets/${secret_name}_db_password"
  if [ ! -r "$secret_path" ]; then
    echo "Missing database secret file for role: $secret_name" >&2
    exit 66
  fi
  secret_value=$(sed -n '1p' "$secret_path")
  case "$secret_value" in
    *[!0-9a-f]*|'')
      echo "Invalid database secret format for role: $secret_name" >&2
      exit 78
      ;;
  esac
  if [ "${#secret_value}" -ne 64 ]; then
    echo "Invalid database secret length for role: $secret_name" >&2
    exit 78
  fi
  eval "${secret_name}_password=\$secret_value"
  unset secret_value
done

export PGPASSWORD=$admin_password
psql \
  --host "${TC_DB_HOST:-postgres}" \
  --username trust_circle_admin \
  --dbname "$TC_DB_NAME" \
  --set "database_name=$TC_DB_NAME" \
  --set "migrator_password=$migrator_password" \
  --set "auth_password=$auth_password" \
  --set "messaging_password=$messaging_password" \
  --file /repo/bootstrap-roles.sql

unset PGPASSWORD admin_password migrator_password auth_password messaging_password
echo "Database roles bootstrapped without exposing credentials."
