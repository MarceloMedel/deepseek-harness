#!/usr/bin/env bash
# Publish the chat-attachment bundle into a DSH home and compose it into a
# profile (SPEC-025). Idempotent, so it is safe to run from the container
# entrypoint on every boot and by hand after editing the sources.
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
# The bundle's own dependency tree is the one thing linked instead: it is tens
# of megabytes of extractors, and a link keeps the boot path cheap.
set -euo pipefail

src="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile="${MDL_DSH_PROFILE:-web}"
modules_dir="$dsh_home/profiles/node_modules"
bundle_dir="$modules_dir/dsh-chat-files"
patch_file="$dsh_home/profiles/$profile/cordis.patch.yml"
files=(package.json host.mjs xlsx.mjs client.js cordis.patch.yml README.md install.sh)

if [[ ! -f "$src/host.mjs" || ! -f "$src/client.js" ]]; then
  echo "chat-files: $src does not look like the bundle (host.mjs and client.js are required)" >&2
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

# The extractors (pdf.js, mammoth, fflate) resolve from the bundle's own
# node_modules. A missing tree is not fatal: the plugin still stages files and
# only the document extractor reports it cannot load.
if [[ -d "$src/node_modules" ]]; then
  ln -sfn "$src/node_modules" "$bundle_dir/node_modules"
  echo "chat-files: dependency tree linked from $src/node_modules"
else
  echo "chat-files: WARNING $src/node_modules is missing; read_document will not extract PDF, DOCX or XLSX" >&2
fi
echo "chat-files: bundle published at $bundle_dir"

block='# ── Chat attachments (SPEC-025) ─────────────────────────────────────────────
# One row: the host stages uploaded files inside the session workspace over
# /chat-files and registers the read_document Tool; the browser half adds the
# paperclip button and the whole-page drop intake. The plugin publishes no
# service, so the row needs no isolate realm.
- insert:
    - id: chat-files
      name: dsh-chat-files'

if [[ -f "$patch_file" ]] && grep -q 'dsh-chat-files' "$patch_file"; then
  echo "chat-files: the row is already present in $patch_file"
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
  echo "chat-files: row added to $patch_file"
fi

echo "chat-files: restart the dsh process to compose the row (the running process keeps its configuration)"
