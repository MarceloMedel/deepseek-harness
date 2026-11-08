#!/usr/bin/env bash
# Publish the Markdown reader into a DSH home and compose it into a profile
# (SPEC-022). Idempotent, so it is safe to run from the container entrypoint on
# every boot and by hand after editing the sources.
#
#   install.sh [source-dir]
#
# `source-dir` defaults to this script's directory. The script copies the bundle
# into the profile's node_modules fallback, which is where a bare row name
# resolves from, and adds the row to the profile's own patch layer. It never
# touches the profile's bundle list, settings, or sessions.
#
# The copy is a real directory rather than a link on purpose: Node resolves a
# symlinked package to its real path, and `host.mjs` imports
# `@deepseek-ai/dsh-tools`, which exists only beside that directory's parent.
set -euo pipefail

src="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile="${MDL_DSH_PROFILE:-web}"
modules_dir="$dsh_home/profiles/node_modules"
bundle_dir="$modules_dir/dsh-md-preview"
patch_file="$dsh_home/profiles/$profile/cordis.patch.yml"
files=(package.json host.mjs client.js cordis.patch.yml README.md install.sh)

if [[ ! -f "$src/host.mjs" || ! -f "$src/client.js" ]]; then
  echo "md-preview: $src does not look like the bundle (host.mjs and client.js are required)" >&2
  exit 1
fi

# A stale symlink from an older installer must go, but the directory itself is
# written over in place: removing it first would leave the profile without a
# loadable package if a single write failed.
if [[ -L "$bundle_dir" ]]; then
  rm -f "$bundle_dir"
fi
install -d -m 0755 "$bundle_dir"
for name in "${files[@]}"; do
  if [[ -f "$src/$name" ]]; then
    install -m 0644 "$src/$name" "$bundle_dir/$name"
  fi
done
chmod 0755 "$bundle_dir/install.sh"
echo "md-preview: bundle published at $bundle_dir"

block='# ── Markdown reader (SPEC-022) ──────────────────────────────────────────────
# One row: the host serves the session workspace documents over /md-viewer and
# registers the md_preview Tool; the browser half adds the reader panel. The
# plugin publishes no service, so the row needs no isolate realm.
- insert:
    - id: md-preview
      name: dsh-md-preview'

if [[ -f "$patch_file" ]] && grep -q 'dsh-md-preview' "$patch_file"; then
  echo "md-preview: the row is already present in $patch_file"
else
  install -d -m 0755 "$(dirname "$patch_file")"
  if [[ ! -f "$patch_file" ]]; then
    printf '[]\n' > "$patch_file"
  fi
  if grep -qx '\[\]' "$patch_file"; then
    # The template ships an empty flow array; a block sequence cannot follow it.
    awk -v block="$block" '{ if ($0 == "[]") print block; else print }' "$patch_file" > "$patch_file.tmp"
    mv "$patch_file.tmp" "$patch_file"
  else
    if [[ -n "$(tail -c 1 "$patch_file")" ]]; then
      printf '\n' >> "$patch_file"
    fi
    printf '\n%s\n' "$block" >> "$patch_file"
  fi
  echo "md-preview: row added to $patch_file"
fi

echo "md-preview: restart the dsh process to compose the row (the running process keeps its configuration)"
