/**
 * dsh-md-preview — host half.
 *
 * Owns one HTTP prefix, `/md-viewer`, and one Tool. Two read endpoints answer
 * the browser panel and one serves raw bytes for the assets a document
 * references:
 *
 *   GET /md-viewer/<sessionId>/__list          → { ok, root, files[], truncated }
 *   GET /md-viewer/<sessionId>/__doc?path=<p>  → { ok, path, dir, text, sizeBytes, title }
 *   GET /md-viewer/<sessionId>/<path>          → raw bytes of one workspace file
 *
 * Every served path is fenced to the session workspace with `fs.contains`,
 * which also rejects symlinks escaping it. Nothing here publishes a service:
 * the row consumes host registries only.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'md-preview'
export const inject = ['webServer', 'fs', 'tools', 'sessions']

/** Route prefix owned by this plugin (one owner per prefix; a second mount would throw). */
const ROUTE = '/md-viewer'
/** Largest document inlined into the browser. */
const MAX_DOC_BYTES = 2 * 1024 * 1024
/** Largest asset served as raw bytes. */
const MAX_ASSET_BYTES = 8 * 1024 * 1024
/** Listing bounds: enough to browse a repository without becoming a file manager. */
const MAX_FILES = 500
const MAX_DEPTH = 6
const MAX_DIRS = 1000
/** Directories never worth walking for documents. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', '.cache', '.next', '.turbo', '.venv',
  'dist', 'build', 'coverage', 'target', 'out', 'venv', '__pycache__', '.pnpm-store',
])
/** Extensions the viewer renders as Markdown. */
const DOC_EXT = new Set(['md', 'markdown', 'mdown', 'mkd'])

/** Content types for assets a document may reference. */
const MIME = {
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
  yml: 'text/plain; charset=utf-8',
  yaml: 'text/plain; charset=utf-8',
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

/** Order by path, so the browser's folder tree lists siblings together. */
function compareFiles(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

/**
 * A short human label for one document: its first heading, else its first
 * non-empty line, with the Markdown markers removed.
 * @param text - the document source.
 * @returns the label, at most 80 characters.
 */
function titleOf(text) {
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const bare = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/[*_`~]/g, '')
      .trim()
    if (bare.length > 0) return bare.length > 80 ? `${bare.slice(0, 79)}…` : bare
  }
  return ''
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

  /** Validate one previewable document and describe it. */
  const inspect = async (rel, root) => {
    const clean = String(rel ?? '').trim().replace(/^\/+/, '')
    if (clean.length === 0) return { ok: false, error: 'A workspace-relative Markdown path is required, for example "docs/guide.md".' }
    if (clean.split('/').includes('..')) return { ok: false, error: 'The path cannot leave the session workspace.' }
    if (!DOC_EXT.has(extOf(clean))) {
      return { ok: false, error: `Only Markdown documents are previewed (.md, .markdown, .mdown, .mkd); received ${clean}.` }
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

  /** Walk the workspace for documents. */
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
        if (entry.type !== 'file' || !DOC_EXT.has(extOf(entryName))) continue
        // A symlink whose real target leaves the workspace would only fail when
        // opened, so the listing never offers it.
        if (!ctx.fs.contains(rootTarget, entry.target)) continue
        files.push({ path: childRel, size: typeof entry.size === 'number' ? entry.size : 0 })
        if (files.length >= MAX_FILES) break
      }
    }
    files.sort(compareFiles)
    return { root, files, truncated: files.length >= MAX_FILES }
  }

  /** Read one document as text. */
  const readDocument = async (rel, root) => {
    const info = await inspect(rel, root)
    if (info.ok !== true) return { ok: false, error: info.error }
    if (info.sizeBytes > MAX_DOC_BYTES) {
      return { ok: false, error: `The file is ${String(info.sizeBytes)} bytes; the viewer renders up to 2 MB. Use "Copy" or "Download" from the raw file instead.` }
    }
    let text
    try {
      text = await ctx.fs.readText(info.target)
    } catch (error) {
      return { ok: false, error: `The file could not be read as text: ${error instanceof Error ? error.message : String(error)}` }
    }
    return {
      ok: true,
      path: info.path,
      dir: dirOf(info.path),
      sizeBytes: info.sizeBytes,
      text,
      title: titleOf(text),
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
        sendJson(res, 200, await readDocument(wanted, root))
        return
      }
      if (parsed.rel === '') {
        sendText(res, 404, `open a document path, for example ${ROUTE}/<session>/docs/guide.md`)
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
      const info = await ctx.fs.stat(found.target)
      if (info === undefined || info.type !== 'file') {
        sendText(res, 404, 'not found')
        return
      }
      if (typeof info.size === 'number' && info.size > MAX_ASSET_BYTES) {
        sendText(res, 413, 'file too large to serve (limit 8 MB)')
        return
      }
      const bytes = await ctx.fs.readBytes(found.target, undefined, MAX_ASSET_BYTES)
      res.writeHead(200, {
        'content-type': mimeOf(parsed.rel),
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

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: serve }), 'md-preview: document route')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'md_preview',
    description: 'Open a Markdown file from the session workspace in the DSH document viewer: an inline card in the conversation, plus a reader panel the user opens from the session header. The document renders with the same Markdown engine the conversation uses, and its relative links and images keep working. Use it after writing a report, README or specification so the user reads it rendered without leaving the GUI. Only paths inside the session workspace are accepted.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Workspace-relative path of the Markdown file, for example "docs/guide.md".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          title: { type: 'string', required: true },
          sizeBytes: { type: 'number', required: true },
        },
      },
      render(_args, value) {
        return [{ type: 'text', text: `Document opened: ${value.path} (${String(value.sizeBytes)} bytes) — ${value.title}` }]
      },
    },
    async execute(args, exec) {
      const rel = args?.path
      if (typeof rel !== 'string' || rel.length === 0) {
        throw new Error('md_preview needs the "path" argument with a Markdown file path.')
      }
      const session = exec.agent?.session
      const sessionId = session?.header?.id ?? ''
      const root = typeof session?.header?.cwd === 'string' && session.header.cwd.length > 0
        ? session.header.cwd
        : rootOf(sessionId)
      const info = await inspect(rel, root)
      if (info.ok !== true) throw new Error(info.error)
      let title = ''
      try {
        title = titleOf(await ctx.fs.readText(info.target))
      } catch {
        // A named document stays previewable when its first lines cannot be read
        // here; the card performs the read and reports the failure itself.
      }
      return { path: info.path, title, sizeBytes: info.sizeBytes }
    },
  })), 'md-preview: md_preview tool')
}
