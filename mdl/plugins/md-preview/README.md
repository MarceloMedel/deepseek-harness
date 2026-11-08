# dsh-md-preview

Markdown reader for the DSH web GUI: a panel that renders the `.md` files of the session workspace without leaving the conversation, in a layout that works on a laptop and on a phone.

## What it adds

Three surfaces, all composed by slot registration from `client.js`:

- A `MD` toggle in the session header (`conversation.session.header.actions`) opens and closes the reader.
- The reader itself (`shell.overlay`) shows the workspace's Markdown files grouped by folder, the selected document, and its heading outline.
- A card under each `md_preview` call (`tool.call.toolview`) renders the document the agent opened.

A document link opens the reader from anywhere in the application, not only from inside it. A reply that links the report it just wrote renders a plain anchor, and the shell has no route for a workspace path, so the click navigated away; a file token — an inline-code mention or a produced-files chip — reached the chat view's OS file opener instead. One delegated click listener covers both, reading the attribute each control already publishes: the anchor's `href` and the button's `title`, which those controls set to the full path. It requires the title to be a bare path, so an unrelated control whose label merely ends in `.md` is untouched.

A path resolves against the document's own directory when relative, and against the session workspace root when absolute; a path outside that root is left alone, so the click keeps its own behaviour instead of opening a reader that can only report the file as missing. The root comes from the listing, so an absolute path resolves once this page has listed the workspace.

Rendering goes through `MarkdownText` from `@deepseek-ai/dsh-client-ui-primitives`, which is a platform module: the bundle carries no Markdown engine, no highlighter and no React copy, so a preview is byte-for-byte the renderer the conversation uses. Copying uses the same package's `writeClipboard`, which falls back to `execCommand` where the async Clipboard API is missing.

## Two layouts, one state machine

Wider than 767 px keeps the folder tree, the outline and the document side by side, with a labelled toolbar.

At or below 767 px the panel takes the viewport and shows **one pane at a time**: the folder tree first, then the document with a back button, a compact icon toolbar and the outline as a sheet over the text. Three columns on a phone leave no readable column, which is why the layout branches instead of shrinking.

That width is the shell's own phone breakpoint (`MOBILE_MAX`), and the panel's first 58 px stay empty (`MOBILE_MENU_RESERVED`). Both numbers are the shell's, not this plugin's choice: the shell floats its menu button above the overlay slot this panel renders into, so no z-index here can cover it and the panel must start below the band it occupies. The shell hands its reservation to the `conversation` slot as `headerInset` — turned into `--dsh-header-inset` on that column — and an overlay occupant never receives it, so the constants are duplicated here and asserted by `check.mjs`.

Folders are collapsed until opened; opening a document reveals the folders that hold it.

## The host half

`host.mjs` owns the `/md-viewer` prefix and one Tool.

| Endpoint | Answer |
|---|---|
| `GET /md-viewer/<sessionId>/__list` | The workspace's Markdown files, ordered by path |
| `GET /md-viewer/<sessionId>/__doc?path=<p>` | One document's source, directory, title and size |
| `GET /md-viewer/<sessionId>/<path>` | Raw bytes of one workspace file, for the images and files a document references |

Every path is fenced to the session workspace with `fs.contains`, which also rejects a symlink whose real target escapes it; the listing never offers such a file.

`md_preview(path)` is the model-facing entry point: it validates the path, reads the document's title, and returns the path and size the card needs.

## Configuration

None. The row consumes `webServer`, `fs`, `tools` and `sessions` and publishes no service, so it carries no `isolate` realm and takes no `Config`.

## Installing

`install.sh` copies the bundle into `$DSH_HOME/profiles/node_modules/dsh-md-preview`, which is where a bare row name resolves, and adds the row to the profile's `cordis.patch.yml`. It is idempotent and needs no pnpm or network access.

The published copy is a real directory rather than a symlink because Node resolves a symlinked package to its real path, and `host.mjs` imports `@deepseek-ai/dsh-tools`, which exists only beside that directory's parent.

```sh
DSH_HOME=/data/dsh bash install.sh
node /app/apps/cli/lib/bin.js --profile web --dump-config | grep -A2 md-preview
```

The composed configuration is read once at process start, so the reader appears after the DSH process restarts. The container entrypoint already runs the installer on every boot.

## Checking without a browser

`check.mjs` runs both halves against the published copy: the host half over the real `@deepseek-ai/dsh-fs-local` backend with its handlers invoked directly, and the client half inside jsdom with a stubbed module table and a controllable viewport width. It needs `react`, `react-dom` and `@deepseek-ai/*` from the profile's `node_modules` and `jsdom` from the repository root.

```sh
DSH_HOME=/data/dsh node check.mjs
```

The checks cover route registration, the workspace listing, containment for traversal and symlink escapes, both layouts, the collapsed folder tree, opening a document and returning to the list, the outline as a column and as a sheet, link following, copy, download and the tool card. They do not cover the visual result of the real `MarkdownText`, the outline's scroll jump, or reading-position retention, which need a browser with layout.

## Known Limitations and Deferred Work

- The reader is read-only. Editing and saving Markdown are out of scope; so is a raw-source toggle.
- Reading positions live in memory for the life of the page, so a browser reload forgets them.
- A document is rendered up to 2 MB and an asset is served up to 8 MB; larger files must be opened through another tool.
- The outline lists ATX headings. Setext headings appear in the document but not in the outline.
- The folder tree is flat below the workspace root: it shows every folder that holds a document, with no collapse-all, search or sort control.
- An absolute link resolves only after the reader has listed a workspace on this page, because the workspace root is published by that listing.
