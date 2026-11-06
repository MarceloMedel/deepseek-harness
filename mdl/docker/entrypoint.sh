#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$DSH_HOME" /workspace

node /app/apps/cli/lib/bin.js --profile web --host 127.0.0.1 --port 3080 &
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
