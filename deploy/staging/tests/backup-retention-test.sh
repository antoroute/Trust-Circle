#!/usr/bin/env bash
set -Eeuo pipefail

test_dir=$(mktemp -d /tmp/trust-circle-backup-retention.XXXXXX)
cleanup() {
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

script_dir=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
backup_script="$script_dir/../host/trust-circle-backup"

for stamp in \
  20260101T010000Z 20260102T010000Z 20260103T010000Z \
  20260104T010000Z 20260105T010000Z 20260106T010000Z \
  20260107T010000Z 20260108T010000Z 20260109T010000Z \
  20260201T010000Z 20260301T010000Z; do
  file="$test_dir/circlehaven-staging-postgresql-$stamp.tar.age"
  : >"$file"
  : >"$file.sha256"
done
: >"$test_dir/unrelated-file"

"$backup_script" prune "$test_dir" 2 2 2

remaining=$(find "$test_dir" -maxdepth 1 -type f -name '*.tar.age' | wc -l)
[[ "$remaining" -eq 2 ]]
[[ -f "$test_dir/circlehaven-staging-postgresql-20260301T010000Z.tar.age" ]]
[[ -f "$test_dir/circlehaven-staging-postgresql-20260201T010000Z.tar.age" ]]
[[ ! -e "$test_dir/circlehaven-staging-postgresql-20260109T010000Z.tar.age" ]]
[[ ! -e "$test_dir/circlehaven-staging-postgresql-20260109T010000Z.tar.age.sha256" ]]
[[ -f "$test_dir/unrelated-file" ]]

for backup in "$test_dir"/*.tar.age; do
  [[ -f "$backup.sha256" ]]
done

echo "Backup retention policy verified."
