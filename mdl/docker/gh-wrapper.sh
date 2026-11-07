#!/bin/sh
# Authenticated gh (SPEC-010). This shadows /usr/bin/gh on PATH and reads the
# token from the read-only mount at call time, never from the environment: the
# session log is durable, so a stray `env` inside the agent must find nothing.
set -eu

file=${MDL_GH_TOKEN_FILE:-/etc/mdl-harness/gh/token}
if [ ! -r "$file" ]; then
  echo "gh: no GitHub credential at $file; pushing and PR creation are unavailable (see mdl/docker/README.md)" >&2
  exit 78
fi

token=$(cat "$file")
if [ -z "$token" ]; then
  echo "gh: $file is empty" >&2
  exit 78
fi

GH_TOKEN=$token exec /usr/bin/gh "$@"
