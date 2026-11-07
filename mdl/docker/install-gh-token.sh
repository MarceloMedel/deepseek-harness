#!/usr/bin/env bash
# Install the GitHub token the container's gh wrapper reads (SPEC-010).
#
# Run it as the host user that owns the mount, never with sudo: the container
# runs as uid 1000 and must be able to read the file, so a root-owned token
# would install cleanly and then fail at the first `gh` call with exit 78.
# Re-exec under bash when invoked as `sh install-gh-token.sh`: several `sh`
# implementations accept `pipefail` and then reject `read -s`, which is the only
# way to keep a pasted token off the screen. The shebang covers direct execution.
if [ -z "${BASH_VERSION:-}" ]; then
  if command -v bash >/dev/null 2>&1; then
    exec bash "$0" "$@"
  fi
  echo "this installer needs bash (read -s keeps the token hidden); run: bash $0" >&2
  exit 1
fi

set -euo pipefail

target_dir=${MDL_GH_DIR:-$HOME/.config/mdl-harness/gh}
target=$target_dir/token
compose_file=$(cd -- "$(dirname -- "$0")" && pwd)/compose.yml

if [ "$(id -u)" -eq 0 ]; then
  echo "run this as your own user, not root: the container reads the token as uid 1000" >&2
  exit 1
fi

install -d -m 0700 "$target_dir"

# Written to a temporary file in the same directory and moved into place, so an
# interrupted paste never leaves a truncated token behind.
tmp=$(mktemp "$target_dir/.token.XXXXXX")
trap 'rm -f "$tmp"' EXIT
chmod 0600 "$tmp"

# -r keeps backslashes literal, -s keeps the paste off the screen and out of the
# scrollback. The value lives in this variable only, never in an argument or in
# the shell history.
read -rsp 'GitHub token (input hidden): ' token
echo
if [ -z "${token:-}" ]; then
  echo "empty token; nothing installed" >&2
  exit 1
fi
printf '%s\n' "$token" > "$tmp"
unset token

chmod 0600 "$tmp"
mv -f "$tmp" "$target"
trap - EXIT

if [ -f "$compose_file" ]; then
  echo "installed $target ($(stat -c '%a %U:%G' "$target"))"
  echo "next: sudo docker compose -f $compose_file up -d --build"
  echo "then: docker exec -u node <container> gh api user --jq .login"
else
  echo "installed $target ($(stat -c '%a %U:%G' "$target"))"
fi
