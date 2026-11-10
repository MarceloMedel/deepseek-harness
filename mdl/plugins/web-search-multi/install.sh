#!/usr/bin/env bash
# Publish the multi-provider web-search bundle into a DSH home and compose it
# into a profile (SPEC-026). Idempotent, so it is safe to run from the container
# entrypoint on every boot and by hand after editing the sources.
#
#   install.sh [source-dir]
#
# `source-dir` defaults to this script's directory. The script copies the bundle
# into the profile's node_modules fallback, which is where a bare row name
# resolves from, and adds the bundle's own two patch entries to the profile's
# own patch layer. It never touches the profile's bundle list, settings, or
# sessions.
#
# The bundle is a *profile bundle* (`dsh.bundle.patch`), whose layer mounts the
# plugin and repoints the host's `web` row at `multi-search`. Listing it in
# `dsh.profile.bundles` would need `pnpm`, which the runtime image does not
# ship, so the same two entries are restated here and the row name resolves from
# the profile's module fallback instead.
#
# The copy is a real directory rather than a link on purpose: Node resolves a
# symlinked package to its real path, and the plugin imports
# `@deepseek-ai/*` peers that exist only beside that directory's parent.
set -euo pipefail

src="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile="${MDL_DSH_PROFILE:-web}"
modules_dir="$dsh_home/profiles/node_modules"
bundle_dir="$modules_dir/dsh-web-search-multi"
patch_file="$dsh_home/profiles/$profile/cordis.patch.yml"
files=(package.json cordis.patch.yml README.md LICENSE)

if [[ ! -f "$src/lib/index.js" || ! -f "$src/lib/client.js" ]]; then
  echo "web-search-multi: $src does not look like the bundle (lib/index.js and lib/client.js are required)" >&2
  exit 1
fi

# A stale symlink from an older installer must go, but the directory itself is
# written over in place: removing it first would leave the profile without a
# loadable package if a single write failed.
if [[ -L "$bundle_dir" ]]; then
  rm -f "$bundle_dir"
fi
install -d -m 0755 "$bundle_dir/lib"
for name in "${files[@]}"; do
  if [[ -f "$src/$name" ]]; then
    install -m 0644 "$src/$name" "$bundle_dir/$name"
  fi
done
install -m 0644 "$src"/lib/* "$bundle_dir/lib/"
chmod 0755 "$bundle_dir/install.sh" 2>/dev/null || true
echo "web-search-multi: bundle published at $bundle_dir"

block='# ── Búsqueda web multi-proveedor (bundle de terceros, SPEC-026) ────────────
# El parche propio del bundle (`dsh.bundle.patch`), restablecido aquí porque el
# perfil se compone sin `pnpm`: la fila monta el plugin y la fila `web` deja de
# apuntar a deepseek-official y sirve multi-search. El paquete se publica en
# `profiles/node_modules/`, que es de donde resuelve un nombre de fila desnudo.
- insert:
    - id: web-search-multi
      name: dsh-web-search-multi
      config:
        provider: auto
        enableFallback: true
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: multi-search'

if [[ -f "$patch_file" ]] && grep -q 'dsh-web-search-multi' "$patch_file"; then
  echo "web-search-multi: the rows are already present in $patch_file"
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
  echo "web-search-multi: rows added to $patch_file; a running dsh composes them through its profile-layer watcher, so only a change to the profile's bundle list needs a restart"
fi
