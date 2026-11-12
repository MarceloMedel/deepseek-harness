# Agent Note: Generated artifacts can be saved to the device

Status: implemented

## Problem

The agent writes reports and pages into the workspace, and the GUI could show them but not hand them over. Both viewers already served the bytes — `/md-viewer/<session>/<path>` and `/html-viewer/<session>/<path>`, fenced with `fs.contains` — but neither declared `Content-Disposition`, so the browser displayed the file and never offered to keep it.

Two failures made that concrete rather than theoretical. The HTML viewer had no save control at all: its only escape was `Abrir ↗`, which opens a tab, and on a phone whose GUI is installed as an app there is no browser chrome to save from. The Markdown reader did have a `Download`, built as a `Blob` of the text the reader already held, which fails in the same installed-app case and cannot exist at all for a document over the reader's own 2 MB read limit — a large `.md` was unreachable, not merely unrendered.

## Decision

`?download` on each viewer's existing raw route adds `Content-Disposition: attachment` and changes nothing else. The header is built from the **resolved base name** of the path that survived fencing, never from the received path, so no name can reach the header as header text. The name travels twice: an ASCII `filename` fallback with every non-printable byte replaced, and the RFC 5987 `filename*`, so `informe-técnico.md` arrives as itself instead of a transliteration.

The download therefore inherits the route's whole contract — the same fencing, the same content type, the same 8 MB asset bound — and adds no route, no composition row and no new surface. It also inherits the property that matters here: because it is a read, it is not gated by the sandbox mode, and because it does not pass through the viewer's read limit, a document the reader refuses to render still arrives whole.

A navigation is not free where this was reported. In a standalone window — the GUI installed on a phone — there is no tab, no download manager and no address bar, so following the save link replaces the application with the file: the report from the device was that the drawer could no longer be closed and the app had to be relaunched. Both controls therefore decide their mechanism at render time from `navigator.standalone` or the `(display-mode: standalone)` media query. Installed, `Abrir ↗` is not offered at all — it exists to hand the page to a tab that does not exist there, and the phone layout already frames the page full width — and the save fetches the same route's bytes and hands them to the system share sheet as a `File`, which is dismissed back into the app. A cancelled sheet changes nothing; an engine with no file sharing falls back to the plain download, so the file is never unreachable, only less convenient.

The Markdown reader's `Blob` path was removed rather than kept beside the route. Two ways to save one file is the asymmetry this repository avoids, and the removed one was the one that failed on the device it was written for. Its `Download` control is now an anchor to the route, in both layouts; the HTML viewer gained the same control beside `Abrir ↗`, in both layouts.

Serving any workspace file this way, not only `.md` and `.html`, is deliberate: the raw route already answered for any fenced path, so the parameter costs nothing extra and a log or a JSON export becomes downloadable without a second route.

## Alternatives considered

A dedicated `/download` prefix was rejected as a second fence to get wrong: the raw route already resolves, fences and reads, and a route that only adds a header cannot drift from the one that displays.

Zipping several artifacts, or downloading a folder as an archive, was left out: it needs a zip writer in the bundle and a progress surface, and the reported need was one file at a time.

Keeping the client-side `Blob` as a fallback for engines that mishandle `Content-Disposition` was rejected because nothing here can detect that case reliably; a fallback that silently runs the path known to fail on the target device is worse than one path that does not.

## Consequences

`check.mjs` in both bundles now proves the header, the accented name, the over-limit download, the traversal attempt with the parameter present, and the unchanged answer without it — the last one because adding a parameter must not quietly alter what the viewer already served. A second pass installs a fake standalone navigator and proves the shapes that keep the application in front: no tab link, a control instead of a link, the file handed to the sheet with its own name and type, the panel still open and still closable, and a cancelled sheet reported as nothing. The `matchMedia` stub answers `display-mode: standalone` separately from its width queries: a stub that answers both from one flag reports an installed app whenever the fake viewport is narrow, and the panel then hides controls that the run is asserting.

The download control appears only while a file is selected, so the toolbar's shape changes with the selection instead of offering a no-op. The existing toolbar assertions that counted or picked anchors by class were made specific about which anchor they mean.

A file larger than the route's 8 MB asset bound still cannot be downloaded; that bound is the route's, and raising it is a separate decision. No download is resumable and none is streamed in ranges.
