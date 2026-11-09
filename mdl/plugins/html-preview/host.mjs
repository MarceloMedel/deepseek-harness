/**
 * dsh-html-preview — host half.
 *
 * Owns one HTTP prefix, `/html-viewer`, and one Tool. Three read endpoints
 * answer the browser panel: two build what the framed document needs and one
 * serves the workspace tree as raw bytes for `Abrir ↗` and for the assets a
 * page references when it is opened in its own tab.
 *
 *   GET /html-viewer/<sessionId>/__list          → { ok, root, files[], truncated }
 *   GET /html-viewer/<sessionId>/__doc?path=<p>  → { ok, path, dir, html, sizeBytes }
 *   GET /html-viewer/<sessionId>/<path>          → raw bytes of one workspace file
 *
 * The panel frames the page with `srcdoc`, because that is what paints inside
 * the shell. A srcdoc document resolves relative references against the shell's
 * own URL, so `__doc` rewrites every relative `src`, `href`, `poster` and CSS
 * `url()` into a route URL before the browser sees it. Opening the page in its
 * own tab uses the raw route, which needs no rewriting: the URL mirrors the
 * workspace, so the page's own references resolve by themselves.
 *
 * Every served path is fenced to the session workspace with `fs.contains`,
 * which also rejects symlinks escaping it. Nothing here publishes a service:
 * the row consumes host registries only.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'html-preview'
export const inject = ['webServer', 'fs', 'tools', 'sessions']

/** Route prefix owned by this plugin (one owner per prefix; a second mount would throw). */
const ROUTE = '/html-viewer'
/** Largest page inlined into the browser. */
const MAX_DOC_BYTES = 2 * 1024 * 1024
/** Largest asset served as raw bytes. */
const MAX_ASSET_BYTES = 8 * 1024 * 1024
/** Listing bounds: enough to browse a workspace without becoming a file manager. */
const MAX_FILES = 400
const MAX_DEPTH = 6
const MAX_DIRS = 800
/** Directories never worth walking for pages. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', '.cache', '.next', '.turbo', '.venv',
  'dist', 'build', 'coverage', 'target', 'out', 'venv', '__pycache__', '.pnpm-store',
])
/** Extensions the viewer frames. */
const PAGE_EXT = new Set(['html', 'htm', 'xhtml', 'svg'])

/** Content types for everything a page may reference. */
const MIME = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  xhtml: 'application/xhtml+xml; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  yml: 'text/plain; charset=utf-8',
  yaml: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
}

/** Lowercase extension of one path ('' when it has none). */
function extOf(path) {
  const at = String(path).lastIndexOf('.')
  return at <= 0 ? '' : String(path).slice(at + 1).toLowerCase()
}

/** Content type for one served path. */
function mimeOf(path) {
  return MIME[extOf(path)] ?? 'application/octet-stream'
}

/** Encode each path segment for a URL. */
function encodeRel(rel) {
  return String(rel).split('/').map(part => encodeURIComponent(part)).join('/')
}

/** One workspace path's absolute URL under this route. */
function urlOf(sessionId, rel) {
  return `${ROUTE}/${encodeURIComponent(String(sessionId))}/${encodeRel(rel)}`
}

/** The route directory a page at `dir` resolves its loose references against. */
function baseUrlOf(sessionId, dir) {
  const tail = dir === '' ? '' : `${encodeRel(dir)}/`
  return `${ROUTE}/${encodeURIComponent(String(sessionId))}/${tail}`
}

/** A page that already names its own base, whose href the rewrite rebases. */
const BASE_TAG = /<base\b/i

/** Chrome copy for the page opened outside the GUI (MDL-LOCALE-01). */
const LABELS = {
  en: { back: 'Back to the GUI', reload: 'Reload', missing: 'The page could not be opened.' },
  es: { back: 'Volver a la GUI', reload: 'Recargar', missing: 'No se pudo abrir la página.' },
}

/** One label set, falling back to English for an unpublished locale. */
function labelsFor(locale) {
  return LABELS[locale] ?? LABELS.en
}

/** Escape one value for HTML text and attribute positions. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch])
}

/**
 * The return target a chrome link may point at: a URL on this request's own
 * host, reduced to its path. Anything else — another host, an unparseable
 * value — falls back to the GUI root, so a shared link cannot make this page
 * navigate somewhere it does not own.
 * @param raw - the `back` query value, or undefined.
 * @param host - the request's Host header.
 * @returns a same-origin path with its query and fragment.
 */
function backTargetOf(raw, host) {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value.length === 0) return '/'
  try {
    const url = new URL(value, `http://${String(host)}`)
    if (url.host !== String(host)) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

/**
 * The document `__page` answers with: one chrome bar and the page framed below
 * it. The page keeps the raw route as its `src`, so it resolves its own
 * references natively and runs top-level inside that frame.
 * @param options - the framed path, its raw URL, the return target, the copy and
 *   an error to show instead of the page.
 * @returns a complete HTML document.
 */
function chromeDocument(options) {
  const { path, source, back, locale, error } = options
  const t = labelsFor(locale)
  const body = error === null
    ? `<iframe class="page" src="${escapeHtml(source)}" title="${escapeHtml(path)}"></iframe>`
    : `<p class="error">${escapeHtml(error)}</p>`
  return `<!doctype html>
<html lang="${locale === 'es' ? 'es' : 'en'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(path)}</title>
<style>
  :root { color-scheme: light dark; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; background: Canvas; color: CanvasText;
         font: 13px/1.4 -apple-system, "Segoe UI", system-ui, sans-serif; }
  header { display: flex; align-items: center; gap: 10px; padding: 6px 10px;
           padding-top: calc(6px + env(safe-area-inset-top, 0px));
           border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); flex: 0 0 auto; }
  a.back, button { appearance: none; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent);
           background: color-mix(in srgb, CanvasText 6%, Canvas); color: inherit; border-radius: 7px;
           padding: 6px 12px; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
  a.back { flex: 0 0 auto; }
  .path { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          opacity: .72; font-size: 12px; }
  .page { flex: 1 1 auto; width: 100%; border: 0; background: #fff; }
  .error { margin: 24px; max-width: 52ch; }
</style>
</head>
<body>
<header>
  <a class="back" href="${escapeHtml(back)}">← ${escapeHtml(t.back)}</a>
  <span class="path">${escapeHtml(path)}</span>
  <button type="button" id="reload">${escapeHtml(t.reload)}</button>
</header>
${body}
<script>
  (function () {
    var button = document.getElementById('reload')
    var frame = document.querySelector('iframe.page')
    if (button !== null && frame !== null) button.addEventListener('click', function () { frame.contentWindow.location.reload() })
  })()
</script>
</body>
</html>
`
}

/** Plain-text reply. */
function sendText(res, status, body, extra) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra })
  res.end(body)
}

/** JSON reply. */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  res.end(body)
}

/** HTML reply, for the document that frames a page opened outside the GUI. */
function sendHtml(res, status, body) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

/** Request pathname without query or hash. */
function stripQuery(rawUrl) {
  let raw = String(rawUrl ?? '')
  const query = raw.indexOf('?')
  if (query >= 0) raw = raw.slice(0, query)
  const hash = raw.indexOf('#')
  if (hash >= 0) raw = raw.slice(0, hash)
  return raw
}

/** Reject NUL and traversal, collapse separators, return the relative path. */
function cleanRel(decoded) {
  if (decoded.includes('\u0000')) return undefined
  const parts = []
  for (const part of decoded.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') return undefined
    parts.push(part)
  }
  return parts.join('/')
}

/** Split one route URL into its session id, relative path and raw query. */
function parseUrl(rawUrl) {
  const raw = stripQuery(rawUrl)
  if (!raw.startsWith(`${ROUTE}/`)) return undefined
  const rest = raw.slice(ROUTE.length + 1)
  const slashAt = rest.indexOf('/')
  const rawSession = slashAt < 0 ? rest : rest.slice(0, slashAt)
  const rawRel = slashAt < 0 ? '' : rest.slice(slashAt + 1)
  let sessionId
  let rel
  try {
    sessionId = decodeURIComponent(rawSession)
    rel = cleanRel(decodeURIComponent(rawRel))
  } catch {
    return undefined
  }
  if (rel === undefined || sessionId.length === 0) return undefined
  const original = String(rawUrl ?? '')
  const queryAt = original.indexOf('?')
  const query = queryAt < 0 ? '' : original.slice(queryAt + 1)
  return { sessionId, rel, query }
}

/** One query parameter, decoded, or undefined. */
function queryParam(query, key) {
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=')
    const name = eq < 0 ? pair : pair.slice(0, eq)
    if (name !== key) continue
    const value = eq < 0 ? '' : pair.slice(eq + 1)
    try {
      return decodeURIComponent(value.replaceAll('+', ' '))
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Directory part of one relative path ('' at the workspace root). */
function dirOf(rel) {
  const cut = String(rel).lastIndexOf('/')
  return cut < 0 ? '' : String(rel).slice(0, cut)
}

/** Order by path, so the list reads like the workspace tree. */
function comparePages(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

/** True for a reference the browser already resolves without this route. */
function isOwnReference(value) {
  if (value.startsWith('#') || value.startsWith('//')) return true
  // A scheme — https:, data:, mailto:, javascript: — owns its own target.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return true
  // Already rewritten by this function, which must stay idempotent.
  return value === ROUTE || value.startsWith(`${ROUTE}/`)
}

/**
 * Resolve one reference against a workspace directory, clamped at the root.
 * @param dir - the document's directory, '' at the workspace root.
 * @param ref - a relative or root-absolute reference without query or hash.
 * @returns the workspace-relative path the reference names, keeping a trailing
 *   slash because it names a directory the browser resolves against.
 */
function resolveRef(dir, ref) {
  const stack = dir === '' ? [] : dir.split('/')
  for (const part of ref.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  const resolved = stack.join('/')
  if (!ref.endsWith('/') || resolved === '') return resolved
  return `${resolved}/`
}

/**
 * Rebase one reference onto this route, keeping its query and hash.
 * @param sessionId - the session whose route namespace receives the reference.
 * @param dir - the document's directory, '' at the workspace root.
 * @param raw - the reference exactly as written in the document.
 * @returns the absolute route URL, or undefined when the reference is left alone.
 */
function rebaseRef(sessionId, dir, raw) {
  const value = String(raw).trim()
  if (value.length === 0 || isOwnReference(value)) return undefined
  const cut = value.search(/[?#]/)
  const body = cut < 0 ? value : value.slice(0, cut)
  const suffix = cut < 0 ? '' : value.slice(cut)
  // A leading slash names the workspace root, not the shell's site root: the
  // framed document has no route of its own to resolve it against.
  const resolved = value.startsWith('/') ? resolveRef('', body.replace(/^\/+/, '')) : resolveRef(dir, body)
  return `${urlOf(sessionId, resolved)}${suffix}`
}

/** Attributes a page resolves against its own URL — and so against the shell's, once framed. */
const REF_ATTR = /(\b(?:src|href|poster)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi
/** CSS references, including the inline `style` attribute and `<style>` blocks. */
const REF_CSS = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi

/**
 * Rewrite every relative reference of one page into a route URL, so a framed
 * `srcdoc` document loads its own stylesheet, script, image and data.
 *
 * A framed document resolves whatever this rewrite cannot see — a script's own
 * `fetch('data.json')`, a `srcset` — against the shell's URL. The returned page
 * therefore carries a `<base>` naming its directory on the route, unless the
 * page declares one itself, whose `href` the rewrite turns absolute.
 * @param html - the page source.
 * @param sessionId - the session the route namespace belongs to.
 * @param dir - the document's directory, '' at the workspace root.
 * @returns the source with relative references rebased; absolute ones untouched.
 */
function rewriteRefs(html, sessionId, dir) {
  const source = String(html)
  const declaredBase = BASE_TAG.test(source)
  const rebase = (raw) => {
    const next = rebaseRef(sessionId, dir, raw)
    return next === undefined ? undefined : next
  }
  const withAttrs = source.replace(REF_ATTR, (whole, lead, doubleQuoted, singleQuoted) => {
    const next = rebase(doubleQuoted ?? singleQuoted)
    return next === undefined ? whole : `${lead}"${next}"`
  })
  const rewritten = withAttrs.replace(REF_CSS, (whole, doubleQuoted, singleQuoted, bare) => {
    const next = rebase(doubleQuoted ?? singleQuoted ?? bare)
    return next === undefined ? whole : `url("${next}")`
  })
  if (declaredBase) return rewritten
  const base = `<base href="${baseUrlOf(sessionId, dir)}">`
  const head = /<head\b[^>]*>/i.exec(rewritten)
  if (head === null) return `${base}${rewritten}`
  const at = head.index + head[0].length
  return `${rewritten.slice(0, at)}${base}${rewritten.slice(at)}`
}

/**
 * Register the route, its read endpoints and the Tool.
 * @param ctx - plugin context carrying webServer, fs, tools and sessions.
 */
export function apply(ctx) {
  /** Workspace root of one live session, or undefined for an unknown id. */
  const rootOf = (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
    const session = ctx.sessions.get(sessionId)
    const cwd = session?.header?.cwd
    return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
  }

  /** Resolve one relative path inside a workspace root, fenced by containment. */
  const locate = async (rel, root) => {
    let rootTarget
    try {
      rootTarget = await ctx.fs.resolve(root)
    } catch {
      return { status: 'missing' }
    }
    let target
    try {
      target = await ctx.fs.resolve(rel === '' ? '.' : rel, { cwd: root })
    } catch {
      return { status: 'missing' }
    }
    if (!ctx.fs.contains(rootTarget, target)) return { status: 'outside' }
    return { status: 'ok', target }
  }

  /** Validate one previewable page and describe it. */
  const inspect = async (rel, root) => {
    const clean = String(rel ?? '').trim().replace(/^\/+/, '')
    if (clean.length === 0) return { ok: false, error: 'A workspace-relative HTML path is required, for example "reports/index.html".' }
    if (clean.split('/').includes('..')) return { ok: false, error: 'The path cannot leave the session workspace.' }
    if (!PAGE_EXT.has(extOf(clean))) {
      return { ok: false, error: `Only HTML pages are previewed (.html, .htm, .xhtml, .svg); received ${clean}.` }
    }
    if (root === undefined) return { ok: false, error: 'The workspace of this session could not be resolved.' }
    const found = await locate(clean, root)
    if (found.status === 'outside') return { ok: false, error: 'That path is outside the session workspace.' }
    if (found.status !== 'ok') return { ok: false, error: `There is no file "${clean}" in the workspace.` }
    const info = await ctx.fs.stat(found.target)
    if (info === undefined) return { ok: false, error: `There is no file "${clean}" in the workspace.` }
    if (info.type !== 'file') return { ok: false, error: `"${clean}" is not a regular file.` }
    return {
      ok: true,
      path: clean,
      target: found.target,
      sizeBytes: typeof info.size === 'number' ? info.size : 0,
    }
  }

  /** Walk the workspace for pages, entry pages first. */
  const walk = async (root) => {
    let rootTarget
    try {
      rootTarget = await ctx.fs.resolve(root)
    } catch {
      return { root, files: [], truncated: false }
    }
    const files = []
    const queue = [{ target: rootTarget, prefix: '', depth: 0 }]
    let visited = 0
    while (queue.length > 0 && files.length < MAX_FILES && visited < MAX_DIRS) {
      const node = queue.shift()
      visited += 1
      let entries
      try {
        entries = await ctx.fs.listDir(node.target)
      } catch {
        continue
      }
      for (const entry of entries) {
        const entryName = String(entry.name)
        if (entryName.length === 0 || entryName.startsWith('.')) continue
        const childRel = node.prefix === '' ? entryName : `${node.prefix}/${entryName}`
        if (entry.type === 'directory') {
          if (SKIP_DIRS.has(entryName) || node.depth + 1 > MAX_DEPTH) continue
          if (!ctx.fs.contains(rootTarget, entry.target)) continue
          queue.push({ target: entry.target, prefix: childRel, depth: node.depth + 1 })
          continue
        }
        if (entry.type !== 'file' || !PAGE_EXT.has(extOf(entryName))) continue
        // A symlink whose real target leaves the workspace would only fail when
        // opened, so the listing never offers it.
        if (!ctx.fs.contains(rootTarget, entry.target)) continue
        files.push({ path: childRel, size: typeof entry.size === 'number' ? entry.size : 0 })
        if (files.length >= MAX_FILES) break
      }
    }
    files.sort(comparePages)
    return {
      root,
      // An entry page is what a generated site starts at, so it leads the list.
      files: [...files.filter(file => file.path.endsWith('index.html')), ...files.filter(file => !file.path.endsWith('index.html'))],
      truncated: files.length >= MAX_FILES,
    }
  }

  /** Read one page and rewrite it for a framed document. */
  const buildDocument = async (rel, root, sessionId) => {
    const info = await inspect(rel, root)
    if (info.ok !== true) return { ok: false, error: info.error }
    if (info.sizeBytes > MAX_DOC_BYTES) {
      return { ok: false, error: `The file is ${String(info.sizeBytes)} bytes; the framed viewer renders up to 2 MB. Use "Abrir ↗" to open the page in its own tab.` }
    }
    let body
    try {
      body = await ctx.fs.readText(info.target)
    } catch (error) {
      return { ok: false, error: `The file could not be read as text: ${error instanceof Error ? error.message : String(error)}` }
    }
    const dir = dirOf(info.path)
    return {
      ok: true,
      path: info.path,
      dir,
      sizeBytes: info.sizeBytes,
      html: rewriteRefs(body, sessionId, dir),
    }
  }

  /** Own the full response lifecycle of every request under the route. */
  const serve = async (req, res) => {
    const method = String(req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      sendText(res, 405, 'method not allowed', { allow: 'GET, HEAD' })
      return
    }
    const parsed = parseUrl(req.url)
    if (parsed === undefined) {
      sendText(res, 403, 'forbidden path')
      return
    }
    const root = rootOf(parsed.sessionId)
    if (root === undefined) {
      sendText(res, 404, 'unknown session workspace')
      return
    }
    try {
      if (parsed.rel === '__list') {
        const listing = await walk(root)
        sendJson(res, 200, {
          ok: true,
          root: listing.root,
          files: listing.files,
          truncated: listing.truncated,
        })
        return
      }
      if (parsed.rel === '__doc') {
        const wanted = queryParam(parsed.query, 'path')
        if (wanted === undefined) {
          sendJson(res, 400, { ok: false, error: 'the path parameter is missing' })
          return
        }
        sendJson(res, 200, await buildDocument(wanted, root, parsed.sessionId))
        return
      }
      // The document `Abrir ↗` opens: the page framed under one chrome bar. A
      // page opened on its own has no way back to the GUI, and on a phone
      // installed as an app it has no browser chrome to escape with either.
      if (parsed.rel === '__page') {
        const wanted = queryParam(parsed.query, 'path')
        const locale = queryParam(parsed.query, 'lang') ?? 'en'
        const back = backTargetOf(queryParam(parsed.query, 'back'), req.headers.host)
        if (wanted === undefined) {
          sendHtml(res, 400, chromeDocument({ path: '—', source: '', back, locale, error: labelsFor(locale).missing }))
          return
        }
        const info = await inspect(wanted, root)
        if (info.ok !== true) {
          sendHtml(res, 404, chromeDocument({ path: wanted, source: '', back, locale, error: info.error }))
          return
        }
        sendHtml(res, 200, chromeDocument({
          path: info.path,
          source: urlOf(parsed.sessionId, info.path),
          back,
          locale,
          error: null,
        }))
        return
      }
      if (parsed.rel === '') {
        sendText(res, 404, `open a page path, for example ${ROUTE}/<session>/reports/index.html`)
        return
      }
      const found = await locate(parsed.rel, root)
      if (found.status === 'outside') {
        sendText(res, 403, 'outside the workspace')
        return
      }
      if (found.status !== 'ok') {
        sendText(res, 404, 'not found')
        return
      }
      let target = found.target
      let servedRel = parsed.rel
      let info = await ctx.fs.stat(target)
      if (info === undefined) {
        sendText(res, 404, 'not found')
        return
      }
      if (info.type === 'directory') {
        servedRel = parsed.rel === '' ? 'index.html' : `${parsed.rel}/index.html`
        const nested = await locate(servedRel, root)
        if (nested.status !== 'ok') {
          sendText(res, 404, 'no index.html in that folder')
          return
        }
        target = nested.target
        info = await ctx.fs.stat(target)
        if (info === undefined || info.type !== 'file') {
          sendText(res, 404, 'no index.html in that folder')
          return
        }
      }
      if (info.type !== 'file') {
        sendText(res, 403, 'not a regular file')
        return
      }
      if (typeof info.size === 'number' && info.size > MAX_ASSET_BYTES) {
        sendText(res, 413, 'file too large to serve (limit 8 MB)')
        return
      }
      const bytes = await ctx.fs.readBytes(target, undefined, MAX_ASSET_BYTES)
      res.writeHead(200, {
        'content-type': mimeOf(servedRel),
        'content-length': String(bytes.length),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      res.end(method === 'HEAD' ? undefined : bytes)
    } catch (error) {
      ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      if (res.headersSent) {
        res.end()
        return
      }
      sendText(res, 500, 'preview failed')
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: serve }), 'html-preview: page route')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'html_preview',
    description: 'Render an HTML page from the session workspace in the DSH HTML viewer: an inline card in the conversation, plus a floating viewer the user opens from the session header. Relative stylesheets, scripts, images and data files keep working. Use it after generating an HTML report, dashboard or page so the user sees it rendered without leaving the GUI. Only paths inside the session workspace are accepted.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Workspace-relative path of the HTML page, for example "reports/index.html".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          url: { type: 'string', required: true },
          sizeBytes: { type: 'number', required: true },
        },
      },
      render(_args, value) {
        return [{ type: 'text', text: `Page rendered: ${value.path} (${String(value.sizeBytes)} bytes) served at ${value.url}` }]
      },
    },
    async execute(args, exec) {
      const rel = args?.path
      if (typeof rel !== 'string' || rel.length === 0) {
        throw new Error('html_preview needs the "path" argument with an HTML page path.')
      }
      const session = exec.agent?.session
      const sessionId = session?.header?.id ?? ''
      const root = typeof session?.header?.cwd === 'string' && session.header.cwd.length > 0
        ? session.header.cwd
        : rootOf(sessionId)
      const info = await inspect(rel, root)
      if (info.ok !== true) throw new Error(info.error)
      return { path: info.path, url: urlOf(sessionId, info.path), sizeBytes: info.sizeBytes }
    },
  })), 'html-preview: html_preview tool')
}
