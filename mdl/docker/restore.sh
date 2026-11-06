#!/usr/bin/env bash
# Restore both MDL-HARNESS volumes from a backup produced by backup.sh.
# Destructive: existing volumes are removed first. Pass --yes for unattended
# use; without it the script asks for confirmation.
set -euo pipefail

archive=${1:?usage: restore.sh <backup.tar.gz> [--yes]}
confirm=${2:-}
[[ -f "$archive" ]] || { echo "restore: $archive not found" >&2; exit 1; }
archive=$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")

if [[ "$confirm" != "--yes" ]]; then
  read -r -p "This replaces both volumes with $archive. Continue? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "restore: cancelled"; exit 1; }
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
compose_file="$repo_root/mdl/docker/compose.yml"
image=mdl-harness:local
archive_dir=$(dirname "$archive")
archive_name=$(basename "$archive")

docker compose -f "$compose_file" down >/dev/null 2>&1
docker volume rm mdl-harness_mdl-dsh-home mdl-harness_mdl-workspace >/dev/null
# Compose labels silence the "not created by Compose" warning and keep
# `docker compose down -v` owning these volumes.
docker volume create \
  --label com.docker.compose.project=mdl-harness \
  --label com.docker.compose.volume=mdl-dsh-home \
  mdl-harness_mdl-dsh-home >/dev/null
docker volume create \
  --label com.docker.compose.project=mdl-harness \
  --label com.docker.compose.volume=mdl-workspace \
  mdl-harness_mdl-workspace >/dev/null

# volume-nocopy keeps Docker from seeding the fresh volumes with image-layer
# content (the image ships an empty /data/dsh).
docker run --rm --user 0 --entrypoint /bin/tar \
  --mount "type=volume,source=mdl-harness_mdl-dsh-home,target=/data,volume-nocopy" \
  --mount "type=volume,source=mdl-harness_mdl-workspace,target=/workspace,volume-nocopy" \
  --mount "type=bind,source=$archive_dir,target=/backup,readonly" \
  "$image" -xzf "/backup/$archive_name" -C /

docker compose -f "$compose_file" up -d >/dev/null 2>&1
echo "restored $archive_name"
