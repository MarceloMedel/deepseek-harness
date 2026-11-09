# Agent Note: The GUI renders generated HTML in place

Status: implemented

## Problem

An HTML page the agent writes — a report, a dashboard, a generated site — lives in the workspace, and seeing it meant leaving the GUI: opening the file from the OS, or guessing a URL. The Markdown reader ([the reader's note](2026-11-08-markdown-reader-in-the-gui.md)) covers `.md`, and it deliberately excluded HTML because a different package owned it.

That other package was `dsh-html-preview`, and it existed only as a copy inside the deployment volume: no source in the repository, mounted by an agent preset nobody had selected, with Spanish-only copy that ignored the interface language, and no executable evidence. A recreated container that lost its volume, or an image built from a clean checkout, could not reproduce it, so "the HTML viewer" was a fact about one machine rather than about this repository.

## Decision

`mdl/plugins/html-preview` is the source of record. `install.sh` publishes it into `$DSH_HOME/profiles/node_modules/dsh-html-preview` and adds one row to the profile's `cordis.patch.yml`; the container entrypoint runs that installer on every boot, so an image upgrade carries the plugin and a recreated container converges without a rebuild. The copy inside the volume is written over in place rather than removed first, so the published package is never missing between two writes.

The row sits at the root of the HOST composition, beside the Markdown reader's. The plugin publishes no service — it consumes `webServer`, `fs`, `tools` and `sessions` — so it needs no isolate realm, and one instance serves every session instead of one per preset.

The preset that mounted the previous copy was retired to `$DSH_HOME/retired/`, outside the roster's scan root. `/html-viewer` has one owner, and `webServer.register` throws on a duplicate prefix: a preset still mounting a package that the profile now mounts globally would break the mount that starts first.

Three surfaces are registered from `client.js`: the `HTML` toggle in the session header, the viewer in `shell.overlay`, and the card that `html_preview` renders into `tool.call.toolview`.

The page is framed as `srcdoc`, and `__doc` rewrites the page's own relative references before the browser sees it. A srcdoc document resolves relative references against the shell's URL, so an untouched `<link href="style.css">` would ask the shell for `/style.css`. The rewrite covers `src`, `href`, `poster` and CSS `url()` — inline `style` attributes and `<style>` blocks included — because a generated page commonly carries its charts and diagrams as CSS backgrounds. It leaves alone anything the browser already resolves by itself: fragment-only, protocol-relative, any scheme, and anything already pointing at the route, which keeps the rewrite idempotent. A root-absolute reference names the workspace root rather than the site root, since a framed page has no route of its own to resolve it against.

What a rewrite cannot reach is a URL the page builds after it loads — a script's own `fetch('data.json')` — or one hidden in an attribute this plugin does not parse, such as `srcset`. The framed document therefore also carries a `<base>` naming its directory on the route, and a page that declares its own `<base>` keeps it, with that `href` rebased like any other, so nothing is added twice. Without it, a generated dashboard whose chart data sits beside it in a JSON file would draw nothing, and the failure looks like a broken page rather than a resolution problem.

`Abrir ↗` opens a document of this plugin's own, `__page`, which frames the page under one chrome bar carrying the way back to the GUI and a reload. The first version linked the raw route directly, and that was wrong in exactly the case it existed for: a page outside the GUI has no control of ours, and on a phone whose GUI is installed as an app there is no browser chrome either, so the page was a dead end. The bar's return target is the viewer's own URL; a target naming another host is dropped for the GUI root, so a shared link cannot make this document navigate off-host.

The framed page arrives as `srcdoc`, the same rewritten source the panel frames. The first version pointed the frame at the raw route, and the page never painted: a framed navigation to that route was the one thing the previous viewer had recorded as broken, and I had no browser to re-test the claim on. Serving the page through the mechanism the panel already proves removed the guess, and it keeps one rendering path for both surfaces. The bar is fixed and the frame measured to the page's own height, so the tab's scroll moves the page; the report that motivated this showed its first screenful and nothing below, because a nested scroll region inside a fixed viewport box is what mobile browsers handle badly. Measuring works because the framed page is same-origin, and the stylesheet keeps a viewport-filling minimum for short pages.

Two layouts share one state machine, split at the shell's `MOBILE_MAX`; narrower takes the viewport and shows the list, then the page with a back button, leaving the shell's `MOBILE_MENU_RESERVED` band empty for the floating menu.

## Alternatives considered

Republishing the volume copy as the source of record was rejected: it had no harness, Spanish-only copy and no bundle metadata, so "versioned" would have meant importing an unverifiable artifact and calling it reviewed.

Mounting it from a preset was rejected for the reason above — one route prefix, one owner. A preset also composes a whole agent to add one row, which is why the retired preset was a copy of `standard` with a single line appended; the global row is the same capability without the duplicate composition.

A real workspace package under `packages/` was rejected for the same reason the Markdown reader rejected one: this is a personal surface, not an upstream capability, and the profile-publishing path already exists. The consequence is deliberate and identical — the bundle sits outside the lint, coverage and type gates, so `check.mjs` is its only executable evidence.

Framing the raw route with `src` instead of `srcdoc` was not adopted. The previous viewer recorded that a framed navigation to that route does not paint in this shell, and this change had no browser to re-test the claim; `srcdoc` also has the advantage that the host, not the browser, decides how the page's references resolve. A browser run that settles the question could simplify `__doc` into a pass-through.

Adding `sandbox` to the frame was rejected. Without `allow-same-origin` the page gets an opaque origin, and a generated page that fetches its own JSON data — a chart backed by `data.json` — would fail, because the route answers no CORS headers. The page therefore runs in the GUI's origin, exactly as it does opened in its own tab. The content is a workspace file the session itself wrote, which is the same trust the session already places in that file's path.

## Consequences

A framed page can reach everything the GUI's origin can. A page fetched from a remote site and saved into the workspace is the case where that matters, and it is the case the tab already had; a future sandbox decision has to weigh it against losing local `fetch`.

The chrome bar costs one nested frame: the opened page runs inside an iframe of a same-origin document, which is invisible to the page itself except through `window.top`. It also means the opened tab's URL is this plugin's, so bookmarking it names the page rather than the file. The tab renders up to 8 MB while the panel renders up to 2 MB, because the tab is the surface that exists for the page the panel refuses.

The injected `<base>` is what makes the untouched cases work, and it also changes them: a URL the page computes at runtime resolves against that base, so it only works while it stays relative to the page's own directory. A page that builds an absolute shell path intentionally — `/api/...` — reaches the gateway exactly as it would from the page's own tab.

Two numbers owned by the shell are duplicated here, as in the Markdown reader: the breakpoint (`MOBILE_MAX`, 767) and the reserved band (`MOBILE_MENU_RESERVED`, 58). `check.mjs` asserts both, because the failure is silent and only visible on a phone, where the shell's menu button would land on the viewer's back button.

Everything served is fenced to the session workspace with `fs.contains`, which rejects a symlink whose real target escapes it; the listing never offers such a file. Traversal, an encoded traversal, a symlink escape, a NUL byte, a write method and an unknown session are covered by `check.mjs`, which mounts the host half over the real `@deepseek-ai/dsh-fs-local` backend.

`check.mjs` drives both layouts in jsdom with a controllable viewport and covers the reference rewriting, the two locales and the tool card. It cannot cover how a real browser paints a framed page, so [SPEC-023](../../../../mdl/specs/023-visor-html.md) keeps that as a manual check.
