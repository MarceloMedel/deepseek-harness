# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm
ARG NODE_RUNTIME_IMAGE=node:22-bookworm-slim

# ── build: the whole workspace, development dependencies included ────────────
FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    LEFTHOOK=0 \
    CI=1

RUN corepack enable \
    && corepack prepare pnpm@11.7.0 --activate

WORKDIR /app
COPY . .

# The Linux sandbox chain tries bwrap and falls back to the Landlock launcher.
# bwrap cannot create a user namespace under the container's AppArmor profile,
# and the launcher is a git-ignored, per-architecture static binary absent from
# a source checkout. Building it here is what gives the runtime image a usable
# sandbox; without it every bash call fails closed with SANDBOX_UNAVAILABLE.
RUN apt-get update \
    && apt-get install -y --no-install-recommends musl-tools \
    && rm -rf /var/lib/apt/lists/*

RUN corepack pnpm install --frozen-lockfile \
    && corepack pnpm --filter @deepseek-ai/node-addon-landlock-run-workspace run build:native \
    && find native/landlock-run/packages -path '*/bin/landlock-run' -type f -executable | grep -q . \
    && corepack pnpm run build

# ── runtime-tree: the same tree with only what the product serves ────────────
#
# Three independent reductions, in order, each verified by the build itself:
#
# 1. Development-only workspace members leave before the install. `examples/`
#    mounts every leaf composition, `packages/test-support/*` carries the test
#    runtime, `packages/typert/generator` carries TypeScript for the build-time
#    generator, `website/` is the VitePress projection, and `python/sdk-runtime`
#    is the Python SDK's deploy root. Between them they pull vitest, vite, the
#    test toolchain, the docs toolchain, and a full provider SDK closure. No
#    shipped composition names any of them, and the frozen lockfile stays valid
#    because the remaining importers are unchanged.
# 2. `pnpm install --prod` installs the runtime dependency closure. It skips the
#    devDependencies through which every harness package resolves its peer
#    framework packages, so the next step restores exactly those links.
# 3. `link-workspace-peers.mjs` links each member's workspace peers into its own
#    node_modules. This is what makes a production-only tree boot; without it the
#    first import of `@deepseek-ai/cordis` fails with ERR_MODULE_NOT_FOUND, which
#    is why SPEC-004 abandoned `pnpm deploy --prod` for a full snapshot.
#
# The residue sweep then drops everything the runtime never reads: sources, tests,
# declaration files, source maps, generated documentation, and the coverage
# report. `.agents/skills/` stays — the skill plugin reads it at runtime.
FROM build AS runtime-tree

RUN rm -rf examples website python packages/test-support packages/typert/generator \
    && rm -rf node_modules \
    && corepack pnpm install --prod --frozen-lockfile \
    && node scripts/link-workspace-peers.mjs . \
    && test -e packages/boot/app-boot/node_modules/@deepseek-ai/cordis

RUN rm -rf coverage docs website mdl scripts .github .vscode .gitlab-ci.yml \
    && rm -rf .agents/notes .sessions .pnpm-store \
    && find packages apps vendor -type d \( -name tests -o -name stress-tests -o -name src \) -prune -exec rm -rf {} + \
    && find packages apps vendor -path '*/lib/*' \( -name '*.map' -o -name '*.d.ts' \) -delete \
    && find . -name '*.tsbuildinfo' -delete \
    && find apps/web/dist -name '*.map' -delete \
    && rm -rf apps/web/src apps/web/public apps/web/stress-tests apps/web/tests apps/web/index.html \
    && rm -rf apps/cli/src apps/cli/tests apps/cli/reference

# ── runtime: what the container actually serves ─────────────────────────────
FROM ${NODE_RUNTIME_IMAGE} AS runtime

ENV DSH_HOME=/data/dsh \
    DSH_PERMISSION_MODE=workspace-write

# The base image's own Debian sources are used as shipped: `bookworm-slim`
# carries no ca-certificates, so an HTTPS mirror rewrite would leave apt unable
# to verify anything, including the package that provides the certificates.
RUN printf '%s\n' \
        'Acquire::Retries "8";' \
        'Acquire::http::Timeout "30";' \
        'Acquire::https::Timeout "30";' \
        > /etc/apt/apt.conf.d/80-retries \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        bash bubblewrap ca-certificates curl git jq less nginx-light \
        python3 tini \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod a+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && printf '%s\n' \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && curl -LsSf https://astral.sh/uv/0.9.5/install.sh \
        | env UV_INSTALL_DIR=/usr/local/bin sh \
    && rm -rf /var/lib/apt/lists/* /root/.cache

RUN mkdir -p /data/dsh /workspace \
    && chown -R node:node /data /workspace

# GitHub credential surface (SPEC-010): `gh` resolves to the wrapper below on
# PATH and reads the token per invocation from the read-only mount, so the secret
# never enters a process environment; the git helper answers github.com only.
COPY mdl/docker/gh-wrapper.sh /usr/local/bin/gh
COPY mdl/docker/git-credential.sh /usr/local/bin/mdl-git-credential
RUN chmod 0755 /usr/local/bin/gh /usr/local/bin/mdl-git-credential

# System git configuration (SPEC-011). The deployment rule — rewriting the
# pipay-sii remote to SSH — lives in the mounted file this include points at: an
# include whose target is absent is ignored, so a host that does not mount it
# keeps working, and nothing about git depends on an environment variable being
# passed through to the process that runs it.
RUN printf '%s\n' \
        '[credential]' \
        '	helper = /usr/local/bin/mdl-git-credential' \
        '[include]' \
        '	path = /etc/mdl-harness/git/gitconfig' \
        > /etc/gitconfig \
    && chmod 0644 /etc/gitconfig

COPY --from=runtime-tree /app /app
COPY mdl/docker/nginx.conf /etc/nginx/nginx.conf
COPY mdl/docker/entrypoint.sh /usr/local/bin/mdl-entrypoint
# The GUI plugin bundles (SPEC-022, SPEC-023) ship beside the entrypoint rather
# than inside the runtime tree, which drops `mdl/`: the entrypoint publishes them
# into the volume on every boot, so a recreated container converges without a
# rebuild. `COPY` carries the build context's modes, so the bundles are chmodded
# here: the entrypoint runs as `node` and must be able to read every file it
# publishes.
COPY mdl/plugins/md-preview /opt/mdl/plugins/md-preview
COPY mdl/plugins/html-preview /opt/mdl/plugins/html-preview
RUN chmod 0755 /usr/local/bin/mdl-entrypoint \
    && chmod -R a+rX /opt/mdl/plugins/md-preview /opt/mdl/plugins/html-preview \
    && chmod 0755 /opt/mdl/plugins/md-preview/install.sh /opt/mdl/plugins/html-preview/install.sh \
    && chmod 0644 /etc/nginx/nginx.conf \
    && chown root:root /etc/nginx/nginx.conf

WORKDIR /workspace
USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/ >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/mdl-entrypoint"]
