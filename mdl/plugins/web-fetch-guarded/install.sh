#!/usr/bin/env bash
# Publish the guarded fetch provider into a DSH home and compose it into a
# profile (SPEC-031). Idempotent, so it is safe to run from the container
# entrypoint on every boot and by hand after editing the sources.
#
#   install.sh [source-dir]
#
# `source-dir` defaults to this script's directory. The script copies the plugin
# into the profile's node_modules fallback, which is where a bare row name
# resolves from, and adds three patch entries: the provider row, the `web` row
# that names it, and the host `tool-web` row that registers `web_fetch`.
#
# The tool row belongs to this layer and not to a preset: presets are copy-only
# and the shipped ones set `fetch: false`, so forking a preset to flip one field
# would be the only alternative. `search: false` keeps the preset's `web_search`
# as the single owner of that name.
set -euo pipefail

src="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile="${MDL_DSH_PROFILE:-web}"
modules_dir="$dsh_home/profiles/node_modules"
plugin_dir="$modules_dir/dsh-web-fetch-guarded"
patch_file="$dsh_home/profiles/$profile/cordis.patch.yml"
files=(package.json host.mjs cordis.patch.yml README.md)

if [[ ! -f "$src/host.mjs" ]]; then
  echo "web-fetch-guarded: $src does not look like the plugin (host.mjs is required)" >&2
  exit 1
fi

if [[ -L "$plugin_dir" ]]; then
  rm -f "$plugin_dir"
fi
install -d -m 0755 "$plugin_dir"
for name in "${files[@]}"; do
  if [[ -f "$src/$name" ]]; then
    install -m 0644 "$src/$name" "$plugin_dir/$name"
  fi
done
echo "web-fetch-guarded: plugin published at $plugin_dir"

# The package name uses YAML double quotes: the block below is single-quoted for
# the shell, so a single quote here would close the assignment and strip them.
block='# ── web_fetch con guard SSRF (SPEC-031) ────────────────────────────────────
# La fila registra el proveedor `guarded` y la segunda enciende `web_fetch` en la
# capa global: los presets son copy-only y los que envía la imagen traen
# `fetch: false`. `search: false` deja `web_search` en el preset.
# No se parchea la fila `web`: un parche reemplaza el `config` completo de la
# fila, así que nombrar `fetchProvider` borraría el `searchProvider: lite` que
# escribe el bloque del buscador. `fetch()` auto-selecciona mientras haya un solo
# proveedor de fetch registrado, que es el estado de este despliegue.
- insert:
    - id: web-fetch-guarded
      name: dsh-web-fetch-guarded

- id: tool-web
  name: "@deepseek-ai/dsh-tool-web"
  config:
    fetch: true
    search: false
  disabled: false'

if [[ -f "$patch_file" ]] && grep -q 'dsh-web-fetch-guarded' "$patch_file"; then
  echo "web-fetch-guarded: the rows are already present in $patch_file"
else
  install -d -m 0755 "$(dirname "$patch_file")"
  if [[ ! -f "$patch_file" ]]; then
    printf '[]\n' > "$patch_file"
  fi
  if grep -qx '\[\]' "$patch_file"; then
    awk -v block="$block" '{ if ($0 == "[]") print block; else print }' "$patch_file" > "$patch_file.tmp"
    mv "$patch_file.tmp" "$patch_file"
  else
    if [[ -n "$(tail -c 1 "$patch_file")" ]]; then
      printf '\n' >> "$patch_file"
    fi
    printf '\n%s\n' "$block" >> "$patch_file"
  fi
  echo "web-fetch-guarded: rows added to $patch_file; a running dsh composes them through its profile-layer watcher"
fi
