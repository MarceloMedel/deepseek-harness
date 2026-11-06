#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$DSH_HOME" /workspace

# The bundled settings file is the deployment's provider configuration, not a
# secret. It seeds an empty home on first boot; an existing settings.yaml in
# the volume always wins, so later edits and restores are never overwritten.
if [[ ! -e "$DSH_HOME/settings.yaml" && -f /etc/mdl-harness/settings.yaml ]]; then
  install -m 0600 /etc/mdl-harness/settings.yaml "$DSH_HOME/settings.yaml"
fi

dsh_args=(--profile web --host 127.0.0.1 --port 3080)
if [[ -n "${DSH_TRUSTED_HOST:-}" ]]; then
  dsh_args+=(--trusted-host "$DSH_TRUSTED_HOST")
fi

node /app/apps/cli/lib/bin.js "${dsh_args[@]}" &
dsh_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

cleanup() {
  kill -TERM "$dsh_pid" "$nginx_pid" 2>/dev/null || true
  wait "$dsh_pid" "$nginx_pid" 2>/dev/null || true
}
trap cleanup TERM INT

# Keep both processes alive together: either one exiting stops the container.
set +e
wait -n "$dsh_pid" "$nginx_pid"
status=$?
set -e

cleanup
exit "$status"
