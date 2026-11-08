# Agent Note: The math engine rides a runtime import, not a chunk

Status: implemented

## Problem

KaTeX is the largest single block the browser used to load before the first message: 586 KB of the vendor chunk's 1597 KB of source, 36.7%, and 180.7 KB gzipped in total for that chunk. A visitor who never sees a formula paid for it, and the deferred chunk was the one thing `SPEC-020` was opened to fix.

The obvious implementation — `import('katex')` from the markdown renderer, with a fallback until the engine lands — did not move a single byte. Measured against the deployed container, four configurations:

- `import('katex')` with KaTeX unassigned in `manualChunks`: the module still ends up inside the eagerly loaded `vendor` chunk, so the dynamic import buys nothing.
- KaTeX assigned its own manual chunk: the chunk appears (261.38 KB) but `index` imports it statically, which is worse than before — same eager bytes, one more request.
- No `manualChunks` at all: KaTeX becomes a genuine `import("./katex-…js")` chunk, at the cost of the `index`/`vendor` split — one 912.85 KB entry chunk, and a cache boundary this repository deliberately keeps ([layout](2026-08-06-web-shell-dist-chunk-layout.md)).
- A second build entry resolved inside `node_modules`: Rollup merges the whole `vendor` chunk into that entry (711.44 KB), moving the markdown and highlight packages onto the math path.

## Decision

The engine is not part of the chunk graph. `apps/web/vite.config.ts` minifies KaTeX's ESM build with esbuild (`apps/web` declares the dependency), emits it as `assets/engine/katex-<hash>.js`, and substitutes its URL into the shell through `define`. `ui-primitives/markdown/math-engine.ts` imports that URL at runtime — through a function call, because a literal specifier would be resolved by the bundler and fail the build — and reports its arrival through the same subscribe/count pair the lazy shiki grammars use.

The engine ships no dependency of its own, so emitting it as one file loses nothing: no chunk graph to resolve, no shared module to hoist. The stylesheet stays where it was, eager, at 4.1 KB gzipped.

## Alternatives considered

Loading KaTeX's minified UMD build with a classic `<script>` tag was rejected: it is the same bytes, but it makes the engine a global and forces a second loading shape that the tests would have to fake.

Bundling the engine with the shell and relying on HTTP caching was rejected: the cache already works (a reload costs 86.7 KB), and the budget is about the first visit.

Deferring the engine to a service worker was rejected for the same reason the payload budget rejects one: a first visit has no worker yet.

## Consequences

A browser measurement against the container: the first load drops from 987.1 KB to 910.1 KB, the `vendor` chunk from 180.7 KB to 103.1 KB gzipped, and the engine (75.3 KB gzipped) is requested only when a formula renders — verified by the network panel and by the rendered `.katex` tree keeping its KaTeX font and its MathML annotation.

The artifact URL is stable-per-build and lives under `assets/`, so it inherits the immutable cache directive; a dependency bump changes the hash and therefore the URL. The unit harness points the same constant at KaTeX's ESM file, so tests take the production code path instead of a test-only branch.

The engine is now invisible to the module graph, which means the bundler can no longer tell anyone it is used: a future change that adds a static KaTeX import would silently reintroduce it into `vendor`. The `MATH_ENGINE_SOURCE` comment states that the alternative — a dynamic import — does not work, so the next reader does not repeat the measurement.

The markdown parse pipeline (micromark, mdast, hast — 21% of the same chunk) still rides `vendor`. Deferring it needs the same emission trick, but its consumers are the streaming renderer's synchronous parse path, so it needs its own design rather than a copy of this one.
