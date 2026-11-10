#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$DSH_HOME" /workspace

# GUI plugin bundles (SPEC-022, SPEC-023, SPEC-025). They live in the image, so
# publishing them into the volume on every boot is what makes them survive a
# recreated container and upgrade with the image; each script is idempotent and
# refuses to take the deployment down with it.
for bundle in md-preview html-preview chat-files; do
  if [[ -x "/opt/mdl/plugins/$bundle/install.sh" ]]; then
    "/opt/mdl/plugins/$bundle/install.sh" \
      || echo "mdl-harness: $bundle could not be published; the GUI runs without it" >&2
  fi
done

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
