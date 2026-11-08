import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))
const STANDALONE_ERROR = 'apps/web is not a standalone application: bare Vite cannot inject window.__DSH_BOOT__. '
  + 'From a repository checkout, run `pnpm dsh web`; an installed package uses `dsh web`. '
  + 'For client-plugin HMR, run `pnpm dsh web` together with `pnpm run dev:web`.'

/** Fail before a Vite dev or preview server can expose the boot-manifest-free shell. */
function rejectStandaloneServe(): Plugin {
  return {
    name: 'dsh-reject-standalone-web-serve',
    config(_config, env) {
      if (env.command === 'serve') throw new Error(STANDALONE_ERROR)
    },
  }
}

/**
 * Vendor-chunk membership, by exact npm package name — the heavy render
 * families (math, highlight, markdown) that change only on dependency bumps.
 * Only packages workspace code imports DIRECTLY need listing: their private
 * transitive dependencies (oniguruma machinery, character tables, …) are
 * imported solely by these and rollup's chunk coloring pulls them into
 * vendor automatically. A dependency shared with index-side code falls back
 * to index — a few kB of dilution, never a correctness problem. Anything not
 * listed (react family, the vendored cordis workspace, tiny helpers like
 * anser/clsx, all workspace code) stays in the default `index` chunk, so
 * editing shell code re-hashes only index and returning clients keep the
 * cached vendor chunk.
 *
 * Every member must be React-free. A package that
 * imports react/jsx-runtime must never be listed — rollup folds a module
 * shared between the entry and a manual chunk into the manual chunk, so one
 * react-importing member would drag the single shared react copy into
 * vendor. The React side of markdown/math rendering is workspace code and
 * rides index.
 */
const VENDOR_PACKAGES: ReadonlySet<string> = new Set([
  // The math engine is absent on purpose: KaTeX's JavaScript is emitted as its
  // own artifact (see emitMathEngine), so only its stylesheet rides a chunk.
  // syntax highlight (@shikijs/langs is handled separately below —
  // lazy grammars must not land here)
  'shiki',
  // markdown parse pipeline (micromark/mdast; the incremental React renderer
  // over it is workspace code)
  'mdast-util-from-markdown',
  'mdast-util-gfm',
  'mdast-util-math',
  'micromark-core-commonmark',
  'micromark-extension-gfm',
  'micromark-extension-math',
  'micromark-factory-space',
  'micromark-util-character',
  'micromark-util-classify-character',
  'micromark-util-sanitize-uri',
  'micromark-util-symbol',
  'micromark-util-types',
])

/**
 * Drop the woff and ttf faces of every family that also ships woff2.
 *
 * KaTeX's stylesheet lists three formats per face for browsers from the woff
 * era; the shell only supports browsers that take woff2, which is the first
 * entry of every @font-face src list, so the other two are dead weight in the
 * image and in any request that falls back on them. Vite hashes each format
 * separately, so a face is matched by its name stem (everything before the
 * content hash), never by swapping the extension.
 */
function dropRedundantFonts(): Plugin {
  return {
    name: 'dsh-drop-redundant-fonts',
    generateBundle(_options, bundle) {
      const stem = (fileName: string): string => fileName.replace(/\.[^.]+$/, '').replace(/-[A-Za-z0-9_-]{8}$/, '')
      const woff2Stems = new Set(
        Object.keys(bundle).filter(fileName => fileName.endsWith('.woff2')).map(stem),
      )
      for (const fileName of Object.keys(bundle)) {
        const redundant = fileName.endsWith('.woff') || fileName.endsWith('.ttf')
        if (redundant && woff2Stems.has(stem(fileName))) delete bundle[fileName]
      }
    },
  }
}

/**
 * Boot grammars statically imported by ui-primitives' highlight.ts
 * (`@shikijs/langs/typescript` → `dist/typescript.mjs`, etc.). They live in
 * the same package as the lazy read-card grammars, but unlike those they are
 * part of the initial load and belong in the vendor chunk; the lazy ones must
 * stay unassigned so each keeps its own on-demand chunk.
 */
const BOOT_GRAMMAR_FILES: readonly string[] = [
  'dist/typescript.mjs',
  'dist/shellscript.mjs',
  'dist/json.mjs',
]

/** Font asset extensions routed to assets/fonts/ (KaTeX's woff2/woff/ttf faces). */
const FONT_EXTENSIONS: readonly string[] = ['.woff2', '.woff', '.ttf']

/**
 * npm package name of a resolved module id: the segment after the last
 * `node_modules/`. pnpm nests the real package under an inner node_modules.
 */
function npmPackageOf(id: string): string | undefined {
  const parts = id.split('/node_modules/')
  if (parts.length === 1) return undefined
  const [first, second] = parts[parts.length - 1].split('/')
  if (first.startsWith('.')) return undefined // .pnpm store segment, not a package
  if (first.startsWith('@')) return second === undefined ? undefined : `${first}/${second}`
  return first
}

/** KaTeX's engine, minified, emitted as its own asset rather than as a chunk.
 *
 * The engine is imported on demand — it is 36.7% of the vendor chunk's source
 * bytes and nothing before the first formula needs it — but a dynamic import is
 * not enough on its own: the bundler folds an unclaimed dynamic module into
 * `vendor`, a manual chunk for it makes the entry import that chunk statically,
 * and a second build entry resolved inside `node_modules` makes Rollup merge the
 * whole `vendor` chunk into that entry. Emitting the file takes the engine out
 * of the chunk graph entirely: the shell imports this URL at runtime, the
 * artifact carries a content hash, and `/assets/` is served immutable.
 *
 * KaTeX ships its ESM build unminified and its minified build as UMD, so this
 * minifies the ESM one rather than loading a second distribution shape.
 */
const MATH_ENGINE_SOURCE = (() => {
  const uiPrimitives = fileURLToPath(new URL('../../packages/client/ui-primitives/package.json', import.meta.url))
  const unminified = readFileSync(join(dirname(createRequire(uiPrimitives).resolve('katex/package.json')), 'dist', 'katex.mjs'), 'utf8')
  return Buffer.from(transformSync(unminified, { minify: true, format: 'esm', target: 'es2022' }).code)
})()

/** Content-hashed URL of the emitted engine, substituted into the shell at build time. */
const MATH_ENGINE_URL = `/assets/engine/katex-${createHash('sha1').update(MATH_ENGINE_SOURCE).digest('hex').slice(0, 12)}.js`

/** Emit the engine as its own artifact, and serve it from the dev server too. */
function emitMathEngine(): Plugin {
  return {
    name: 'dsh-emit-math-engine',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: MATH_ENGINE_URL.slice(1), source: MATH_ENGINE_SOURCE })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== MATH_ENGINE_URL) {
          next()
          return
        }
        res.setHeader('content-type', 'text/javascript; charset=utf-8')
        res.end(MATH_ENGINE_SOURCE)
      })
    },
  }
}

export default defineConfig({
  plugins: [rejectStandaloneServe(), react(), dropRedundantFonts(), emitMathEngine()],
  build: {
    sourcemap: true,
    // Fonts stay separate files: an inlined face puts its bytes in the
    // render-blocking stylesheet, where no request can revalidate it, and it
    // also hides the face from `dropRedundantFonts`, which matches formats by
    // emitted file name — KaTeX_Size3's woff2 sits under Vite's 4 KB inline
    // limit, so inlining left its dead woff and ttf pairs in the bundle.
    assetsInlineLimit: filePath => (FONT_EXTENSIONS.some(ext => filePath.endsWith(ext)) ? false : undefined),
    rollupOptions: {
      output: {
        // Two entries: the shell keeps its content-hashed chunk names, the
        // engine keeps the stable URL the build substitutes into the shell.
        // Output layout: the two main chunks stay at assets/ root; lazy
        // @shikijs/langs grammar chunks group under assets/langs/; fonts
        // (all KaTeX faces referenced by vendor.css) group under
        // assets/fonts/. Sourcemaps need no arrangement: rollup writes each
        // .map next to its js and references it by bare relative filename.
        chunkFileNames(chunk): string {
          // Grammar chunks are recognized by their member modules, not the
          // facade: shared embedded-grammar chunks (e.g. html+javascript,
          // split out because php/ruby/mdx embed them) have no facade at all.
          // index and vendor are excluded by name — vendor legitimately
          // carries the three boot grammars.
          if (chunk.name === 'index' || chunk.name === 'vendor') return 'assets/[name]-[hash].js'
          const isLangChunk = chunk.moduleIds.some(id => id.includes('/node_modules/@shikijs/langs/'))
          return isLangChunk ? 'assets/langs/[name]-[hash].js' : 'assets/[name]-[hash].js'
        },
        assetFileNames(asset): string {
          const fileName = asset.names[0] ?? ''
          const isFont = FONT_EXTENSIONS.some(ext => fileName.endsWith(ext))
          return isFont ? 'assets/fonts/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]'
        },
        manualChunks(id: string): string | undefined {
          const pkg = npmPackageOf(id)
          if (pkg === undefined) return undefined // workspace + vendored cordis: index
          if (pkg === '@shikijs/langs') {
            return BOOT_GRAMMAR_FILES.some(file => id.endsWith(`/${file}`)) ? 'vendor' : undefined
          }
          return VENDOR_PACKAGES.has(pkg) ? 'vendor' : undefined
        },
      },
    },
  },
  resolve: {
    // Workspace packages resolve to SOURCE: package.json exports point at lib
    // for Node/type consumers, but the browser bundle must compile src directly
    // so CSS rides vite's pipeline instead of the CSS-externalized lib bundle.
    // Only the shell's normal package entry is aliased — plugin packages are
    // NEVER bundled here (shell self-sufficiency — see
    // packages/client/web/README.md); they arrive as runtime
    // bundles through the client module system. Order matters — subpath
    // aliases must win over bare-name prefixes.
    alias: [
      // Browserization of the vendored cordis Loader: its only node-only
      // import; the two process probes are mapped by `define` below.
      { find: /^node:module$/, replacement: src('./src/node-module-stub.ts') },
      { find: /^@deepseek-ai\/dsh-client-web$/, replacement: src('../../packages/client/web/src/boot.tsx') },
      { find: /^@deepseek-ai\/dsh-client-web-react$/, replacement: src('../../packages/client/web-react/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-ui-slots$/, replacement: src('../../packages/client/ui-slots/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: src('../../packages/client/ui-primitives/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-ui-attachment$/, replacement: src('../../packages/client/ui-attachment/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-schema-form$/, replacement: src('../../packages/client/schema-form/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-client-modules\/client$/, replacement: src('../../packages/client/modules/src/client/index.ts') },
    ],
  },
  define: {
    // The engine bundle's URL: the runtime import in
    // `ui-primitives/markdown/math-engine.ts` takes a variable, never a specifier.
    __DSH_MATH_ENGINE_URL__: JSON.stringify(MATH_ENGINE_URL),
    // vendored loader internal.ts: fromInternal() probes the Node major —
    // "0.0.0" takes neither branch, returning undefined (exactly the empty
    // internal slot the shell boot fills with the client module loader).
    'process.versions.node': '"0.0.0"',
    'process.execArgv': '[]',
    // vendored loader index.ts: envData falls to its default branch.
    'process.env.CORDIS_SHARED': 'undefined',
  },
})
