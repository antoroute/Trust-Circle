#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 3 || ! "$1" =~ ^[0-9a-f]{40}$ || ! "$2" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Usage: prepare-staging-release.sh DEPLOYMENT_COMMIT IMAGE_COMMIT NEW_OUTPUT_DIRECTORY' >&2
  exit 64
fi
deployment=$1
source_commit=$2
output=$3
[[ "$output" == /* ]] || { echo 'Output directory must be absolute' >&2; exit 64; }
[[ ! -e "$output" && ! -L "$output" ]] || { echo 'Output already exists' >&2; exit 73; }
repo=$(git rev-parse --show-toplevel)
cd "$repo"
git cat-file -e "$deployment^{commit}"
git cat-file -e "$source_commit^{commit}"
# Operations-only commits may follow the image build. Application and schema
# contents must still match the signed source exactly.
git diff --quiet "$source_commit" "$deployment" -- backend infrastructure/postgres || {
  echo 'Application or schema differs from the signed image source' >&2; exit 65;
}
manifest=$(git show "$deployment:deploy/releases/$source_commit.json")
jq -e --arg source "$source_commit" '
  .schemaVersion == 1 and .commit == $source and .platform == "linux/amd64"
  and .workflow == "antoroute/Trust-Circle/.github/workflows/backend-images.yml"
  and (.run | test("^https://github.com/antoroute/Trust-Circle/actions/runs/[0-9]+$"))
  and (.images.auth | test("^ghcr.io/antoroute/circlehaven-auth@sha256:[0-9a-f]{64}$"))
  and (.images.messaging | test("^ghcr.io/antoroute/circlehaven-messaging@sha256:[0-9a-f]{64}$"))
' <<<"$manifest" >/dev/null
run_id=$(jq -r '.run | split("/") | last' <<<"$manifest")
gh api "repos/antoroute/Trust-Circle/actions/runs/$run_id" | jq -e --arg source "$source_commit" '
  .conclusion == "success" and .status == "completed" and .head_sha == $source
  and .head_branch == "main" and .path == ".github/workflows/backend-images.yml"
' >/dev/null

proof_dir=$(mktemp -d)
trap 'rm -rf -- "$proof_dir"' EXIT
for service in auth messaging; do
  image=$(jq -r --arg service "$service" '.images[$service]' <<<"$manifest")
  bash "$repo/deploy/ci/verify-image.sh" "$image" "$source_commit" >"$proof_dir/$service.json"
done

mkdir -m 0700 -- "$output"
git archive "$deployment" | tar -xf - -C "$output"
install -d -m 0700 "$output/release-evidence"
install -m 0600 "$proof_dir/auth.json" "$proof_dir/messaging.json" "$output/release-evidence/"
{
  printf 'TC_GIT_COMMIT=%s\nTC_IMAGE_COMMIT=%s\n' "$deployment" "$source_commit"
  jq -r '"TC_AUTH_IMAGE=" + .images.auth, "TC_MESSAGING_IMAGE=" + .images.messaging' <<<"$manifest"
} >"$output/release.env"
printf 'Verified staging release prepared: %s\n' "$deployment"
