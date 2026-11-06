#!/usr/bin/env bash
# Back up both MDL-HARNESS volumes while the service is stopped.
# Run as root (or through sudo): it stops the Compose service, reads the
# volumes through a temporary container, and restarts the service afterwards.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
compose_file="$repo_root/mdl/docker/compose.yml"
backup_dir=${MDL_BACKUP_DIR:-/srv/backups/mdl-harness}
retention_days=${MDL_BACKUP_RETENTION_DAYS:-7}
image=mdl-harness:local
stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive_name="mdl-harness-$stamp.tar.gz"

umask 077
mkdir -p "$backup_dir"

docker compose -f "$compose_file" stop >/dev/null 2>&1
restart() { docker compose -f "$compose_file" up -d >/dev/null 2>&1; }
trap restart EXIT

# Long-form mounts keep Docker from copying image-layer content into the
# volume; the archive mirrors the volume roots as /data and /workspace.
docker run --rm --user 0 --entrypoint /bin/tar \
  --mount "type=volume,source=mdl-harness_mdl-dsh-home,target=/data,readonly" \
  --mount "type=volume,source=mdl-harness_mdl-workspace,target=/workspace,readonly" \
  --mount "type=bind,source=$backup_dir,target=/backup" \
  "$image" -czf "/backup/$archive_name" -C / data workspace

# The container's umask owns the archive mode, so set it here.
chmod 600 "$backup_dir/$archive_name"

{
  echo "created=$stamp"
  echo "commit=$(git -C "$repo_root" rev-parse HEAD)"
  echo "image=$(docker image inspect "$image" --format '{{.Id}}')"
} > "$backup_dir/$archive_name.manifest"

find "$backup_dir" -maxdepth 1 -name 'mdl-harness-*.tar.gz' -mtime +"$retention_days" -delete
find "$backup_dir" -maxdepth 1 -name 'mdl-harness-*.tar.gz.manifest' -mtime +"$retention_days" -delete

echo "$backup_dir/$archive_name"
