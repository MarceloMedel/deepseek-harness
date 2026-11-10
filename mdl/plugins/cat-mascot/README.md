# dsh-cat-mascot

A black-cat working mascot for DSH's web GUI: while this session's agent is
running, a 32px animated black cat sits above the composer; while idle, the
dock contributes nothing. Visibility is remembered per session.

## Behavior

- **Host half** (`host.mjs`) registers one HTTP prefix `/cat-mascot`:
  - `GET /cat-mascot/cat.gif` serves the bundled GIF (48 frames, 96×96, ~6s
    loop, 28.6 KB) as raw bytes with `image/gif`, `no-store`. The GIF resolves
    through `import.meta.url` at bundle root, so the deployment carries its own
    copy and nothing depends on a workspace path. Other methods answer 405,
    other paths 404.
  - `GET /cat-mascot/pref?sessionId=S` answers `{ hidden, unknown }` — the
    per-session visibility record; `unknown` means the session has no record
    yet, `hidden` defaults to `false` for it.
  - `POST /cat-mascot/pref` with `{ sessionId, hidden }` writes the record.
    Storage is one small JSON file at `$DSH_HOME/storages/cat-mascot/prefs.json`,
    written atomically, validated against the `session-…` id shape, bounded to
    the 200 newest session records.
  - The `cat_mascot` Tool (`mode: 'show' | 'hide'`) writes the calling
    session's preference: the agent hides or restores the cat in the session it
    is working in. The calling session id comes from the execution's agent
    identity, never from arguments.
- **Client half** (`client.js`) registers `conversation.input.dock` (id
  `cat-mascot`, order 9). While `session.running` is true it renders
  `<img src="/cat-mascot/cat.gif">` — a plain same-origin route, so the browser
  decodes the GIF file itself: no data URL, no RPC payload, nothing a sandboxed
  string encoder could transcode. Before rendering it reads the page's current
  session id (`localStorage["dsh.sessions.current"]`, the key the conversation
  shell updates on every switch) and refetches the preference whenever the
  rendered session object changes, covering both session switches and
  idle→running→idle transitions. A hidden session, an idle state, or a load
  failure contribute nothing (the failure keeps a small inline notice).

## Install

Run `install.sh` (idempotent) against the target DSH home and profile, then
restart the dsh process to compose the row:

```sh
DSH_HOME=/data/dsh MDL_DSH_PROFILE=web ./install.sh
```

The script copies the bundle into `$DSH_HOME/profiles/node_modules/dsh-cat-mascot`
and adds the `- id: cat-mascot` row to `profiles/web/cordis.patch.yml` — the
same fallback layer the other third-party bundles use, never touching bundle
lists, settings, or sessions. The deployment ships this bundle from
`/opt/mdl/plugins/cat-mascot` and the entrypoint re-publishes it on every boot,
so a recreated container converges without a manual step.

Re-running the installer after a bundle upgrade changes the bundle files in
place; the new host module is imported the next time the process composes
(process start), so upgrade restarts are the norm.

## Toggle

Per session, from the conversation itself: ask the agent to "hide the cat" or
"bring the cat back" — it calls `cat_mascot` with `mode: 'hide' | 'show'` and
the dock listens per session from then on. From a shell:

```sh
curl -X POST http://127.0.0.1:3080/cat-mascot/pref \
  -H 'content-type: application/json' \
  -d '{"sessionId": "session-…", "hidden": true}'
```

## Model, token, and KV-cache effects

The `cat_mascot` Tool adds one tool description (about 60 tokens) to every
model request's `tools` field. The route is process-only; the client adds one
style element and one dock slot mount. Nothing else is model-visible.
