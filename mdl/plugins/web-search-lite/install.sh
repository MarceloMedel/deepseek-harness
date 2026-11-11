#!/usr/bin/env bash
# Publish the lite search provider into a DSH home and compose it into a profile
# (SPEC-029). Idempotent, so it is safe to run from the container entrypoint on
# every boot and by hand after editing the sources.
#
#   install.sh [source-dir]
#
# `source-dir` defaults to this script's directory. The script copies the plugin
# into the profile's node_modules fallback, which is where a bare row name
# resolves from, and adds its two patch entries: the row that registers the
# provider and the `web` row that names it. It never touches the profile's
# bundle list, settings, or sessions.
#
# A deployment that previously ran the third-party multi-provider bundle keeps
# that bundle's rows until they are removed by hand; this installer adds its own
# rows and leaves everything else alone. The removal is a one-time migration,
# documented in README.md.
set -euo pipefail

src="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile="${MDL_DSH_PROFILE:-web}"
modules_dir="$dsh_home/profiles/node_modules"
plugin_dir="$modules_dir/dsh-web-search-lite"
patch_file="$dsh_home/profiles/$profile/cordis.patch.yml"
files=(package.json host.mjs cordis.patch.yml README.md)

if [[ ! -f "$src/host.mjs" ]]; then
  echo "web-search-lite: $src does not look like the plugin (host.mjs is required)" >&2
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
echo "web-search-lite: plugin published at $plugin_dir"

# The package name uses YAML double quotes: the block below is single-quoted for
# the shell, so a single quote here would close the assignment and strip them.
block='# ── Búsqueda web: cadena propia (SPEC-029) ──────────────────────────────────
# La fila registra el proveedor `lite`; la segunda apunta el seam `web` a él. El
# orden de la cadena —searxng, tavily, bing, brave— vive en el plugin, así que
# esta capa no ordena nada y la página de configuración no tiene voz aquí.
- insert:
    - id: web-search-lite
      name: dsh-web-search-lite
      config:
        searxngUrl: http://searxng:8080

- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: lite'

if [[ -f "$patch_file" ]] && grep -q 'dsh-web-search-lite' "$patch_file"; then
  echo "web-search-lite: the rows are already present in $patch_file"
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
  echo "web-search-lite: rows added to $patch_file; a running dsh composes them through its profile-layer watcher"
fi
