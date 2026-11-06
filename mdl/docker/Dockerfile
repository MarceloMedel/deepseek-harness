# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm

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

FROM ${NODE_IMAGE} AS runtime

ENV DSH_HOME=/data/dsh \
    DSH_PERMISSION_MODE=workspace-write \
    UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    UV_PYTHON_DOWNLOADS=never

RUN printf '%s\n' \
        'Acquire::Retries "8";' \
        'Acquire::http::Timeout "30";' \
        'Acquire::https::Timeout "30";' \
        > /etc/apt/apt.conf.d/80-retries \
    && sed -i 's|http://deb.debian.org|https://mirror.rackspace.com|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        bash bubblewrap ca-certificates curl git jq less nginx-light openssh-client \
        python3 python3-pip python3-venv tini \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod a+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && printf '%s\n' \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && printf '%s\n' \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh docker-ce-cli \
    && curl -LsSf https://astral.sh/uv/0.9.5/install.sh \
        | env UV_INSTALL_DIR=/usr/local/bin sh \
    && uv tool install --python /usr/bin/python3 graphifyy==0.9.91 \
    && rm -rf /var/lib/apt/lists/* /root/.cache

RUN mkdir -p /data/dsh /workspace \
    && chown -R node:node /data /workspace

COPY --from=build /app /app
COPY mdl/docker/nginx.conf /etc/nginx/nginx.conf
COPY mdl/docker/entrypoint.sh /usr/local/bin/mdl-entrypoint
RUN chmod 0755 /usr/local/bin/mdl-entrypoint \
    && chmod 0644 /etc/nginx/nginx.conf \
    && chown root:root /etc/nginx/nginx.conf

WORKDIR /workspace
USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/ >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/mdl-entrypoint"]
