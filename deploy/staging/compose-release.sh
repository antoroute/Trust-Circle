#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 2 ]]; then
  echo 'Usage: compose-release.sh PRIVATE_ENV_FILE COMPOSE_ARGUMENTS...' >&2
  exit 64
fi
private_env=$1
shift
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
release_dir=$(cd -- "$script_dir/../.." && pwd)
release_env=$release_dir/release.env
[[ -r "$private_env" && -f "$release_env" ]] || {
  echo 'Private configuration or verified release selection missing' >&2
  exit 66
}

# This file is data, never shell code. Export only the four public keys, so
# ambient shell variables cannot override the verified selection in Compose.
declare -A values=()
while IFS='=' read -r key value; do
  [[ "$key" =~ ^(TC_GIT_COMMIT|TC_IMAGE_COMMIT|TC_AUTH_IMAGE|TC_MESSAGING_IMAGE)$ && -z "${values[$key]+set}" ]] || exit 65
  values[$key]=$value
done <"$release_env"
[[ ${#values[@]} -eq 4 ]] || exit 65
[[ "${values[TC_GIT_COMMIT]}" =~ ^[0-9a-f]{40}$ && "${values[TC_IMAGE_COMMIT]}" =~ ^[0-9a-f]{40}$ ]] || exit 65
[[ "${values[TC_AUTH_IMAGE]}" =~ ^ghcr\.io/antoroute/circlehaven-auth@sha256:[0-9a-f]{64}$ ]] || exit 65
[[ "${values[TC_MESSAGING_IMAGE]}" =~ ^ghcr\.io/antoroute/circlehaven-messaging@sha256:[0-9a-f]{64}$ ]] || exit 65
for key in "${!values[@]}"; do export "$key=${values[$key]}"; done

exec docker compose --project-name trust-circle-staging \
  --env-file "$private_env" --env-file "$release_env" \
  -f "$script_dir/compose.yml" "$@"
