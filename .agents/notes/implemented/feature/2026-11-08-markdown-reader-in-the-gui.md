# Agent Note: The GUI reads workspace Markdown in place

Status: implemented

## Problem

A Markdown document the agent writes lives in the workspace, and reading it meant leaving the GUI: an editor, a preview pane in another window, or a `git diff` renderer. The conversation renders Markdown already, but only as the model's own replies — a report, a README or a specification produced on disk had no reader.

The deployment already had a precedent for a persistent browser surface: `dsh-html-preview`, a plain-JavaScript bundle in the profile's `node_modules` mounted by a composition row. A dynamic Cordis plugin would not do, because those live only in the running process and vanish on restart, which was the stated requirement.

## Decision

A new bundle, `mdl/plugins/md-preview`, owns the `/md-viewer` route and one Tool, and registers three browser surfaces. It is versioned in the repository, published into the volume by `install.sh`, and composed by a row the installer adds to the profile's `cordis.patch.yml`; the container entrypoint runs the installer on every boot, so an upgrade arrives with the image and a recreated container converges without one.

Rendering reuses `MarkdownText` from `@deepseek-ai/dsh-client-ui-primitives`. That package is a platform module in the shell's module table, so a fetched bundle resolves it through its own `require` and carries no Markdown engine, no highlighter and no second React. Copying reuses the same package's `writeClipboard` and its `execCommand` fallback.

The listing is grouped by folder and every folder starts collapsed, because a repository's document tree is deeper than a flat list can show. Relative links between documents open in the reader instead of navigating away, and relative image destinations are rewritten to absolute route URLs before rendering — the conversation renderer accepts an image only for an absolute HTTP(S) source, so a document referencing `img/diagram.png` would otherwise show alt text.

A document link opens the reader from anywhere in the application, not only from inside it, because both shapes the shell can render leak the click out of it: a Markdown link is a plain anchor the shell cannot route, and a file token — an inline-code mention or a produced-files chip — hands the path to the chat view's OS opener. One delegated click listener covers both, reading the attribute each control already publishes: the anchor's `href` and the button's `title`, which those controls set to the full path. It requires the title to be a bare path, so an unrelated control whose label merely ends in `.md` keeps its own click, and it leaves clicks inside the panel to the reader's handlers, which resolve against the document's directory rather than the workspace root.

A path resolves against the document's directory when relative and against the session workspace root when absolute, and a path outside that root is left alone. That last rule exists because the first version was wrong in a way that produced a misleading error: the resolver skipped empty segments, so `/srv/projects/homepage/test.md` became the workspace-relative `srv/projects/homepage/test.md`, and the reader then reported a missing file nobody asked for. Rejecting a leading slash in the relative resolver, and resolving an absolute path only under a known root, keeps an outside path out of the panel entirely.

Two layouts share one state machine, split at the shell's own `MOBILE_MAX`. Wider than that keeps the tree, the outline and the document side by side; narrower takes the viewport and shows one pane at a time — the tree, then the document with a back button, a compact icon toolbar, and the outline as a sheet over the text.

Replies are not readable here. The conversation already renders them with the same engine, so a second view of the same bytes duplicated the interface without adding a reading surface; the first design shipped one and this change removed it.

## Alternatives considered

A dynamic Cordis plugin was rejected on the persistence requirement, not on capability: `cordis_define` state does not survive a process restart.

A real workspace package under `packages/` was rejected: this is a personal surface, not an upstream capability, and the profile-publishing path already existed and is what `dsh-html-preview` uses. The consequence is deliberate — the bundle sits outside the lint, coverage and type gates, so its only executable evidence is `check.mjs`.

Publishing the bundle as a symlink into `$DSH_HOME/plugins` was rejected after it failed: Node resolves a symlinked package to its real path, so `host.mjs`'s `import '@deepseek-ai/dsh-tools'` resolved from the volume root and missed the profile's `node_modules`. The bundle is a real directory there instead, exactly like `dsh-html-preview`.

Reading a reply from the session log through a `/__reply` endpoint was rejected after it shipped: see above.

Raising the panel's stacking level above the shell's floating menu was rejected as impossible rather than undesirable. The shell's phone frame documents its own order — overlay (20) < scrim (21) < menu (22) < drawer (23) — and this panel renders inside the overlay slot, so its own `z-index` cannot escape that context. The panel therefore reserves the menu's band instead of competing with it.

Reusing the frame's own reservation was rejected because the frame does not offer it to this slot. [The phone-layout note](2026-11-06-phone-layout-shell.md) settles that chrome geometry crosses packages as owner props, never as selectors: the frame passes `headerInset` into the `conversation` slot, whose root turns it into the `--dsh-header-inset` custom property. A `shell.overlay` occupant is a sibling layer, receives no such prop, and a custom property declared on the conversation's root does not inherit sideways into it. The two numbers are therefore duplicated from `packages/client/ui-layout/src/client/columns.ts` and asserted by `check.mjs`; a future owner-prop path for the overlay slot is the way to remove the duplication.

## Consequences

The panel must track two numbers owned by the shell: the breakpoint (`MOBILE_MAX`, 767) and the reserved band (`MOBILE_MENU_RESERVED`, 58). `check.mjs` asserts both — the breakpoint through the recorded `media` query, the band through the generated stylesheet — because the failure is silent and only visible on a phone, where the shell's menu button lands on the reader's back button.

Everything served is fenced to the session workspace with `fs.contains`, which rejects a symlink whose real target escapes it; the listing never offers such a file, so a broken entry cannot be tapped. Traversal, an encoded traversal, a symlink escape, a NUL byte, a write method and an unknown session are all covered by `check.mjs`, which mounts the host half over the real `@deepseek-ai/dsh-fs-local` backend.

`check.mjs` is the durable verification for a bundle no package gate reaches: it drives both layouts in jsdom with a controllable viewport and stubs only `MarkdownText`. It cannot cover the real renderer's output, the outline's scroll jump, or reading-position retention, which need a browser with layout — those stay in [SPEC-022](../../../../mdl/specs/022-visor-markdown.md) as manual checks.

The bundle's files ship into the image with `chmod -R a+rX`: `COPY` carries the build context's modes, and a working tree with `0600` files would otherwise hand the `node` user a bundle it cannot read.
