# Agent Note: The GUI runs commands without leaving the GUI

Status: implemented

## Problem

Operating this deployment from a phone meant one of two detours for anything the conversation did not cover: open another application on the laptop, or reach an SSH client on the phone. The GUI could ask the agent to run a command, but it could not run one itself, and the agent is the wrong tool for "what is in this directory" — it costs a model turn and a logged conversation to answer a question the person could answer with `ls`.

The capability was already mounted. `ctx.shell` is the product's bash executor, `ctx.sandboxPolicy` resolves the mode and workspace root per session, and `shell.overlay` is a seat built for a frame-wide surface. What was missing was a door, and the risk in adding one is the opposite of the usual one: the door must not become a way around the sandbox.

## Decision

`mdl/plugins/shell-panel` is a plain-JS bundle beside its siblings — `host.mjs`, `client.js`, `cordis.patch.yml`, `install.sh`, `check.mjs` — published by the container entrypoint into the profile's `node_modules` on every boot. One row at the root of the host composition; the plugin publishes no service, so it needs no isolate realm.

Each command is one foreground execution through `ctx.shell` with the session's own resolved policy: the mode and the workspace root the agent's `bash` tool gets, no wider. A deployment with no `ctx.sandboxPolicy` **refuses to run anything**; the panel has no path that could widen a policy, and there is no escalation parameter. That refusal is the point — a surface that ran unconfined when the policy was missing would be a hole, not a convenience.

The route is not part of the privileged RPC plane (`PRIVILEGED_METHODS` in `dsh-client-connection` gates RPC methods, not plugin routes), so the bundle brings its own fence, in the shape the attachment route already established: only `POST` with `application/json`, which a cross-site form cannot declare; an `Origin` header that must name this host; and a refusal of `sec-fetch-site: cross-site`. The read route carries the same Origin and cross-site fence even though it only reports a directory.

`cd` is the interesting part. A one-shot execution has no shell state to carry, so `cd` would do nothing for the next command and the header would lie about where the person is. The host therefore tracks a directory per session as **its own fact**, and a command whose first word is `cd` moves the directory the next command starts in. The command text is never rewritten: `cd x && ls` runs exactly as typed, and only the tracking moves. Every candidate is resolved and fenced with `ctx.fs` against the workspace root before it is adopted, so a missing path, a file, or a path outside the root leaves the tracked directory where it was. `cd -` and a non-leading `cd` change nothing rather than guess, because a wrong guess in the header is worse than no movement.

One session runs one command at a time: the second start is refused with the id of the run in flight, and a second view of the same session attaches to that run instead of starting another. That is what makes `Stop` mean something, and it keeps a poll from becoming two readers of one consuming output cursor.

## Alternatives considered

A persistent PTY through `packages/terminal` ([the PTY note](2026-07-16-persistent-pty-sessions.md)) was the obvious first answer and was rejected on its costs, measured against this seam rather than assumed. Its sessions are owned by an exact `Agent`, so the shell would exist only while the session is loaded, and a session that is not on stage would simply have no shell. Worse, `terminal-bash` refuses a sandbox-mode change while any persistent session is open: a drawer left open would have pinned the session's access mode and blocked the person — and the agent — from changing it. It also reports no per-command exit code, so each command would need a sentinel injected into its output, and its raw ANSI output needs a terminal emulator that this client does not ship, against sibling phases whose whole point was a smaller client payload.

Tracking the directory by prefixing every command with `cd <tracked> &&` was rejected once `ShellExecRequest.workdir` turned out to exist: passing the directory as the spec's own working directory is exact, while a prefix would have made `pwd` and error messages describe a path the person did not type.

Putting the button in the session header was considered and stayed out of scope, so the panel keeps one seat and does not compete with the header's own actions.

## Consequences

The panel is a convenience over the sandbox, not a second policy: it cannot write outside the workspace root, and the check proves it against the real runner rather than a fake — a write inside completes, a write outside is refused and flagged as denied.

Because each command is its own process, `export`, aliases, the shell's history and interactive programs are unavailable. That is a documented limit rather than an oversight, and `packages/terminal` remains the seam if a persistent shell is ever justified.

The tracked directory and the retained output live in process memory per session and are dropped with the plugin; nothing about a command is durable, and nothing it runs reaches the session log. The panel therefore answers quick questions without spending a model turn, and equally leaves no transcript of what was run — a deliberate split from the agent's `bash`, which logs everything.

`check.mjs` is the executable evidence: both halves without a browser or a running dsh process, including the negative cases (`SHL-04`, `SHL-05`, `SHL-11`).
