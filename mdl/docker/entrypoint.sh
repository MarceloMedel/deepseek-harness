#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$DSH_HOME" /workspace

# GUI plugin bundles (SPEC-022, SPEC-023, SPEC-025), the black-cat mascot, the
# lite search provider (SPEC-029) that replaced the third-party bundle, the
# guarded fetch provider (SPEC-031), and the workspace shell (SPEC-035). They
# live in the image, so publishing them into the volume on every boot is what
# makes them survive a recreated container and upgrade with the image; each
# script is idempotent and refuses to take the deployment down with it.
for bundle in md-preview html-preview chat-files cat-mascot web-search-lite web-fetch-guarded shell-panel; do
  if [[ -x "/opt/mdl/plugins/$bundle/install.sh" ]]; then
    "/opt/mdl/plugins/$bundle/install.sh" \
      || echo "mdl-harness: $bundle could not be published; the deployment runs without it" >&2
  fi
done

# Skills (SPEC-030, SPEC-031) ride in the image and are published into the
# volume on every boot, so an empty volume and a rebuilt image converge on the
# same content. They are skills, not plugin rows: the preset's skill-filesystem
# row already scans $DSH_HOME/skills, so the composition does not change and the
# model's tool catalog is untouched. The copy is replaced rather than merged, so
# a file an older version shipped cannot survive the upgrade.
install -d "$DSH_HOME/skills"
for skill_dir in /opt/mdl/archify /opt/mdl/skills/*; do
  [[ -f "$skill_dir/SKILL.md" ]] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$DSH_HOME/skills/$skill_name"
  cp -a "$skill_dir" "$DSH_HOME/skills/$skill_name"
done
echo "mdl-harness: skills published: $(ls "$DSH_HOME/skills" 2>/dev/null | tr '\n' ' ')"
if [[ ! -f /opt/mdl/archify/SKILL.md ]]; then
  echo "mdl-harness: no /opt/mdl/archify; the archify skill is not published" >&2
fi

# The bundled settings file is the deployment's provider configuration, not a
# secret. It seeds an empty home on first boot; an existing settings.yaml in
# the volume always wins, so later edits and restores are never overwritten.
if [[ ! -e "$DSH_HOME/settings.yaml" && -f /etc/mdl-harness/settings.yaml ]]; then
  install -m 0600 /etc/mdl-harness/settings.yaml "$DSH_HOME/settings.yaml"
fi

# Visibility only (SPEC-010): a missing GitHub credential must surface here, not
# as a silent refusal the first time an agent tries to push. The token itself is
# never read, echoed, or exported by this script.
if [[ -r /etc/mdl-harness/gh/token ]]; then
  echo "mdl-harness: GitHub credential mounted; gh and HTTPS pushes are enabled"
else
  echo "mdl-harness: no GitHub credential at /etc/mdl-harness/gh/token; gh and HTTPS pushes will refuse (see mdl/docker/README.md)"
fi

# Visibility only (SPEC-011): an unreadable or malformed git configuration makes
# every `git` invocation fail with exit 128, and `gh` fails with it because it
# shells out. Reporting it here keeps that from looking like a credential problem
# the first time an agent pushes.
if git config --list >/dev/null 2>&1; then
  echo "mdl-harness: git configuration reads cleanly"
else
  echo "mdl-harness: git configuration is unreadable; git and gh will fail (check /etc/gitconfig and the mounted gitconfig)" >&2
fi

# Launcher options must precede the app's own: the launcher stops parsing at the
# first flag it does not know, so `--patch` has to come before `--host`.
dsh_args=(--profile web)

# The privileged configuration plane on the public hostname (SPEC-024) is opt-in
# at deploy time: without the Access application's AUD tag the overlay is not
# applied at all, so every configuration method keeps answering only on
# loopback. With it, an assertion Cloudflare signs for this application stands
# in for loopback on the authorities the overlay declares.
if [[ -n "${DSH_ACCESS_AUD:-}" ]]; then
  dsh_args+=(--patch /etc/mdl-harness/privileged-access.yml)
  echo "mdl-harness: privileged configuration plane admitted for ${DSH_TRUSTED_HOST:-no authority} with a verified Access assertion"
else
  echo "mdl-harness: no DSH_ACCESS_AUD; the privileged configuration plane stays loopback-only (see mdl/docker/README.md)"
fi

# The Neon MCP row (SPEC-026) is opt-in the same way: without a project id and a
# readable credential the overlay is not applied at all, so an installation
# without them composes exactly as before and carries no Neon tools. The
# credential is never read, echoed, or exported here — only checked for.
neon_token_file="${MDL_NEON_TOKEN_FILE:-/etc/mdl-harness/neon/token}"
if [[ -n "${NEON_PROJECT_ID:-}" && -r "$neon_token_file" ]]; then
  dsh_args+=(--patch /etc/mdl-harness/neon-mcp.yml)
  echo "mdl-harness: Neon MCP enabled for project ${NEON_PROJECT_ID}; catalog restricted by readonly=true, SQL tools connect as the database owner, credential from $neon_token_file"
else
  echo "mdl-harness: no NEON_PROJECT_ID or no credential at $neon_token_file; the Neon MCP is not mounted"
fi

# The code-index MCP row (SPEC-027) follows the binary: an image built without
# the install composes without the row, and no environment decides it.
if [[ -x /usr/local/bin/graphify-mcp ]]; then
  dsh_args+=(--patch /etc/mdl-harness/graphify-mcp.yml)
  echo "mdl-harness: code-index MCP enabled (graphify-mcp, 10 tools; queries need project_path)"
else
  echo "mdl-harness: no /usr/local/bin/graphify-mcp; the code-index MCP is not mounted"
fi

dsh_args+=(--host 127.0.0.1 --port 3080)
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
