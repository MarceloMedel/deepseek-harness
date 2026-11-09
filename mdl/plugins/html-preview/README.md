# dsh-html-preview

HTML viewer for the DSH web GUI: a panel that renders the pages of the session workspace without leaving the conversation, in a layout that works on a laptop and on a phone.

## What it adds

Three surfaces, all composed by slot registration from `client.js`:

- An `HTML` toggle in the session header (`conversation.session.header.actions`) opens and closes the viewer.
- The viewer itself (`shell.overlay`) lists the workspace's HTML pages and frames the selected one over the conversation.
- A card under each `html_preview` call (`tool.call.toolview`) renders the page the agent opened.

The page is framed as `srcdoc`. The host half rewrites the page's relative references — `src`, `href`, `poster`, and `url()` inside CSS — into route URLs before the browser sees them, so a generated page that references a stylesheet, a script, an image, a font or a JSON data file renders complete. Root-absolute references name the workspace root, not the shell's site root; a reference ending in `/` keeps its slash, because it names a directory. References the browser already resolves on its own are left alone: fragment-only, protocol-relative, any scheme (`https:`, `data:`, `mailto:`), and anything already pointing at the route, which keeps the rewrite idempotent.

What the rewrite cannot see is a relative URL the page's own script builds — `fetch('data.json')` — or one hidden in an attribute this plugin does not parse, such as `srcset`. The framed document therefore carries a `<base>` naming its directory on the route, so those resolve against the page rather than against the shell. A page that declares its own `<base>` keeps it: the rewrite rebases that `href` and adds nothing.

`Abrir ↗` opens the `__page` document: the page framed under one chrome bar carrying **Volver a la GUI** and **Recargar**. A page opened on its own had no way back — and on a phone whose GUI is installed as an app there is no browser chrome to escape with either — so the route answers with the page and the way back to it. The bar's return target is the URL the viewer was opened from, and a target that names another host is dropped for the GUI root rather than followed.

The framed page keeps the raw route as its `src`. That route mirrors the workspace tree and serves each file with its own content type, so the page's own references resolve by themselves; asking for a folder serves its `index.html`.

The frame carries no `sandbox` attribute: the page runs in the GUI's origin, exactly as it does opened in its own tab, which is what keeps its scripts and its `fetch` calls working. The content is a workspace file of the session.

## Two layouts, one state machine

Wider than 767 px keeps the page list and the framed page side by side, with a labelled toolbar.

At or below 767 px the panel takes the viewport and shows **one pane at a time**: the page list first, then the page with a back button and a compact icon toolbar.

That width is the shell's own phone breakpoint (`MOBILE_MAX`), and the panel's first 58 px stay empty (`MOBILE_MENU_RESERVED`). Both numbers are the shell's, not this plugin's choice: the shell floats its menu button above the overlay slot this panel renders into, so no z-index here can cover it and the panel must start below the band it occupies. The constants are duplicated here and asserted by `check.mjs`.

## The host half

`host.mjs` owns the `/html-viewer` prefix and one Tool.

| Endpoint | Answer |
|---|---|
| `GET /html-viewer/<sessionId>/__list` | The workspace's HTML pages, ordered by path with `index.html` first |
| `GET /html-viewer/<sessionId>/__doc?path=<p>` | One page: its path, directory, size and source with relative references rebased |
| `GET /html-viewer/<sessionId>/__page?path=<p>&back=<url>&lang=<l>` | The document `Abrir ↗` opens: the page framed under a chrome bar with the way back |
| `GET /html-viewer/<sessionId>/<path>` | Raw bytes of one workspace file, for the tab and for the assets a page references |

Every path is fenced to the session workspace with `fs.contains`, which also rejects a symlink whose real target escapes it; the listing never offers such a file.

`html_preview(path)` is the model-facing entry point: it validates the path and returns the path, the size and the page's URL under the route.

## Configuration

None. The row consumes `webServer`, `fs`, `tools` and `sessions` and publishes no service, so it carries no `isolate` realm and takes no `Config`.

## Installing

`install.sh` copies the bundle into `$DSH_HOME/profiles/node_modules/dsh-html-preview`, which is where a bare row name resolves, and adds the row to the profile's `cordis.patch.yml`. It is idempotent and needs no pnpm or network access. It writes over an existing bundle directory in place, so it also replaces a copy left by an earlier installer.

The published copy is a real directory rather than a symlink because Node resolves a symlinked package to its real path, and `host.mjs` imports `@deepseek-ai/dsh-tools`, which exists only beside that directory's parent.

```sh
DSH_HOME=/data/dsh bash install.sh
node /app/apps/cli/lib/bin.js --profile web --dump-config | grep -A2 html-preview
```

The composed configuration is read once at process start, so the viewer appears after the DSH process restarts. The container entrypoint runs the installer on every boot.

## Checking without a browser

`check.mjs` runs both halves against the published copy: the host half over the real `@deepseek-ai/dsh-fs-local` backend with its handlers invoked directly, and the client half inside jsdom with a stubbed module table and a controllable viewport width. It needs `react`, `react-dom` and `@deepseek-ai/*` from the profile's `node_modules` and `jsdom` from the repository root.

```sh
DSH_HOME=/data/dsh node check.mjs
```

The checks cover route registration, the workspace listing, containment for traversal and symlink escapes, reference rebasing, both layouts, opening a page and returning to the list, the tool card and the locale table. They do not cover how the real browser paints a framed page, which needs a browser.

## Known Limitations and Deferred Work

- The viewer is read-only, and there is no source view of the HTML.
- No automatic reload when the file changes on disk; the panel offers `Refresh` for the list and `Reload` for the frame.
- A page is framed up to 2 MB and an asset is served up to 8 MB; larger files must be opened through the tab or another tool.
- A reference the page builds at runtime after the fact (a URL computed in JavaScript without a leading slash or host) resolves against the injected `<base>`, so it works only while it stays relative to the page's directory.
- The selected page lives in memory for the life of the page, so a browser reload forgets it.
