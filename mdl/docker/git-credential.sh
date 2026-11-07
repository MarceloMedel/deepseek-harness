#!/bin/sh
# Git credential helper for HTTPS pushes (SPEC-010). It answers github.com only,
# with the same mounted token the gh wrapper uses, so the token never appears in
# a remote URL or in the process environment. Registered by the image with
# `git config --system credential.helper /usr/local/bin/mdl-git-credential`.
set -eu

# git invokes the helper as `get`, `store`, or `erase`; only `get` has an answer.
[ "${1:-get}" = get ] || exit 0

file=${MDL_GH_TOKEN_FILE:-/etc/mdl-harness/gh/token}
host=
while IFS= read -r line; do
  [ -n "$line" ] || break
  case $line in
    host=*) host=${line#host=} ;;
  esac
done

[ "$host" = github.com ] || exit 0
[ -r "$file" ] || exit 1

printf 'username=x-access-token\npassword=%s\n' "$(cat "$file")"
