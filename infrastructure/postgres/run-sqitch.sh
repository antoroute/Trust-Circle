#!/bin/sh
set -eu

secret_path=/run/secrets/migrator_db_password
if [ ! -r "$secret_path" ]; then
  echo "Missing migrator database secret file." >&2
  exit 66
fi

PGPASSWORD=$(sed -n '1p' "$secret_path")
if [ -z "$PGPASSWORD" ]; then
  echo "Migrator database secret is empty." >&2
  exit 78
fi
export PGPASSWORD

exec sqitch "$@"
