#!/usr/bin/env bash
set -Eeuo pipefail

# The caller obtains the expected commit and digest from a successful,
# reviewed CI run. Never infer those trusted values from an untrusted image.
image=${1:-}
revision=${2:-}
if [[ $# -ne 2 || ! "$image" =~ ^ghcr\.io/antoroute/circlehaven-(auth|messaging)@sha256:[0-9a-f]{64}$ || ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Usage: verify-image.sh ghcr.io/antoroute/circlehaven-{auth,messaging}@sha256:DIGEST COMMIT' >&2
  exit 2
fi

exec gh attestation verify "oci://$image" \
  --repo antoroute/Trust-Circle \
  --signer-workflow antoroute/Trust-Circle/.github/workflows/backend-images.yml \
  --source-ref refs/heads/main \
  --source-digest "$revision" \
  --signer-digest "$revision" \
  --deny-self-hosted-runners \
  --format json
