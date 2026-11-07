# Agent Note: A production-only runtime tree needs peer links restored by hand

Status: implemented

## Problem

The Docker runtime stage copied the whole build stage, development dependencies included: 1,720 MB of `/app`, of which `node_modules` was 1,533 MB. The production dependency closure is 197 MB in 207 packages, so 85% of what the image carried was never loaded — the test toolchain, the documentation toolchain, the build toolchain, and two ACP subagent backends that only `examples/` mounts.

`pnpm install --prod` seemed to be the answer, and it is not, on its own: every harness package resolves `@deepseek-ai/cordis` and the capability services it consumes as a peerDependency plus a devDependency, following the repository convention. A production install skips devDependencies, so those peers never appear, and the first import in the boot chain fails:

```
ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/cordis'
  imported from /app/packages/boot/app-boot/lib/index.js
```

`pnpm deploy --prod` fails the same way, and fails harder: it produces a tree outside the workspace, so the workspace members that supplied those peers are gone entirely. `SPEC-004` hit this and abandoned deploy for a full snapshot, which is why the image carried every development dependency for eleven phases.

The peer set is small and stable — 118 of the 122 distinct peers are workspace packages, and the four external ones (`react`, `react-dom`, `clsx`, `node-addon-require-builtin`) resolve inside browser bundles or optional loader paths, never from the Host process a production tree serves.

## Decision

A production runtime tree is `pnpm install --prod --frozen-lockfile` followed by `node scripts/link-workspace-peers.mjs`, which links each workspace member's workspace-resolvable peers into that member's own `node_modules` and reports the external peers it skipped.

The container builds that tree in a third stage, `runtime-tree`, and prunes development-only workspace members *before* the install — `examples/`, `website/`, `python/`, `packages/test-support/*`, `packages/typert/generator` — because their manifests are what pull vitest, vite, the docs toolchain, and the TypeScript compiler into a production closure. The frozen lockfile stays valid with those importers absent: pnpm skips resolution for members that are not present and reports the remaining importers as unchanged.

`@anthropic-ai/claude-agent-sdk` is an optional peer of `subagent-claude-code` rather than a dependency. It ships the Claude Code CLI distribution, 263 MB on Linux, and the presets that mount the backend are the only consumers. `loadOfficialQuery` imports it lazily on the first delegation and reports which package to install when it is absent, so mounting the preset without it fails with a sentence instead of an `ERR_MODULE_NOT_FOUND` during composition.

Measured on the resulting tree: `/app` is 349 MB, `node_modules` is 310 MB, and the web profile boots and serves the shell and its plugin bundles.

## Consequences

The image no longer contains a dependency graph that mirrors the repository's. Adding a new plugin that imports a workspace peer still works without manifest changes — the script is derived from the manifests, not a list — but a package that needs a *non*-workspace peer at runtime would now fail inside the container, and the script reports such peers rather than installing them. That report is the place to look first when a container boot fails on a missing module.

`pnpm install --prod` remains insufficient on its own, so the link step is load-bearing: a future change that removes it while keeping `--prod` breaks the boot, not the build. The build stage keeps the full install, because building needs every development dependency.

The savings are conditional on the prune list. `examples/` is not an accident of this workspace; it is the runnable leaf gallery, and installing it in the runtime tree costs the two ACP backends' transitive weight. A deployment that mounts those backends from `examples` would need both the directory and the manifest changes that put the SDK behind an optional peer.

## Alternatives considered

**`pnpm deploy --prod`.** A deploy produces a self-contained tree for one package, which is exactly the desired shape, and it cannot boot here: deployed trees lose the workspace links that satisfy the peer convention, and every harness package needs them at import time. Rejected after reproducing the failure — it is the option `SPEC-004` already tried.

**Hoisted node-linker for the production install.** `--config.node-linker=hoisted` flattens the tree so peers resolve by walking up, which would remove the need for a link step. It does not help: with `--prod`, pnpm installs nothing for a peer-only dependency at all, so there is nothing to hoist. Measured on the same tree, then discarded.

**Convert every peer to a regular dependency.** This would make a production install self-sufficient, and it contradicts the convention that makes one Cordis instance and one capability service instance per process possible. A regular dependency risks a second copy of the framework in the same process, which is the failure the peer convention exists to prevent.

**Copy the full install and delete the heavy directories.** Cheaper to write, and it leaves dangling links under `node_modules` whose reachability nobody can state. Rejected in favour of asking pnpm for the production closure and repairing the one documented gap in it.

**Move the two ACP backends' SDKs into an image layer installed on demand.** Deployments that mount those backends would fetch hundreds of megabytes at first use, and the container's network posture around Cloudflare Access and the token mount makes an unattended fetch a worse failure mode than an explicit install step.

## Deferred

`SPEC-017` tracks the tool inventory separately: `graphifyy` and its `uv` venv, `docker-ce-cli`, `openssh-client`, and `python3-pip`/`python3-venv` left the runtime stage because nothing in the product invokes them, and `mdl/docker/README.md` records how to put any of them back.
