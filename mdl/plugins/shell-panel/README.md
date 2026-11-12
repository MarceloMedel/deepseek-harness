# dsh-shell-panel

A shell in the DSH web GUI: a floating `>_` button that opens a drawer where you run commands in the session workspace, from a laptop or a phone, without another application or an SSH client.

## What it adds

One surface, composed by slot registration from `client.js`: a drawer registered in `shell.overlay`. Nothing else in the GUI changes, and the agent's own `bash` tool is untouched.

The drawer's header prints two facts it never guesses: the directory the next command will start in, and the sandbox mode the host resolved for the session. Both come back with every answer, so closing the drawer, switching sessions, or reloading cannot invent a directory.

## How a command runs

Each command is **one foreground execution** through `ctx.shell`, the same executor behind the agent's `bash` tool, with the session's own `ctx.sandboxPolicy` and that policy's workspace root. Output streams while the process runs, the block ends with its exit code, and `Stop` kills the process group.

One session runs one command at a time: a second start while one is running is refused, which is what makes `Stop` mean something. Opening the same drawer in another view attaches to the run in flight instead of starting a second one.

Because each command is its own process, `cd` does not persist inside a shell — **it moves the directory the next command starts in**. That is what the directory line in the header is for. `cd ..`, relative paths and `cd ~` resolve like bash; `cd` alone and `cd ~` return to the workspace root; `cd -` and a `cd` that is not the first word of the line change nothing rather than guessing. Every candidate directory is resolved and fenced with `ctx.fs` before it is adopted, so a path that is missing, names a file, or leaves the workspace root leaves the tracked directory where it was.

Interactive programs, shell state between commands (`export`, aliases, the shell's own history) and a terminal emulator are **out of scope**. `packages/terminal` is the seam for a later phase if a persistent shell is ever wanted.

## The fence

The route is not part of the deployment's privileged RPC plane, so the bundle brings its own: only `POST` with `application/json` (a cross-site form cannot declare it), an `Origin` header that must name this host, and a refusal of `sec-fetch-site: cross-site`. The read route is fenced too. A session key that names no session answers `404` instead of falling back to another root.

The command itself is confined by the sandbox the deployment already runs: reads are open everywhere, writes stop at the workspace root, and a deployment with no `ctx.sandboxPolicy` refuses to run anything rather than run unconfined.

## Install

`install.sh` is idempotent: it publishes the bundle into the profile's `node_modules` fallback and adds one row to that profile's patch layer. The container entrypoint runs it on every boot, so a recreated container converges on the same composition. **The running process keeps its configuration** — restart it to compose the row.

## Check

`node check.mjs` runs both halves with no browser and no running dsh process: the host half over the real filesystem backend and the real bash executors, the route through the same Node request/response shape the web server uses, and the client half in jsdom. That includes the negative cases — a directory outside the root is never adopted, a foreign origin is refused, and a write outside the workspace root is refused by the real sandbox runner while one inside completes.
