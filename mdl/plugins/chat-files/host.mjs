/**
 * dsh-chat-files — host half.
 *
 * Owns one HTTP prefix, `/chat-files`, and one Tool:
 *
 *   POST /chat-files/<sessionId>/upload?name=<file>   body = the file's bytes
 *        → { ok, path, name, ext, bytes }   path is workspace-relative
 *
 * The route stages browser files inside the session workspace, so a chat
 * attachment becomes an ordinary workspace file: the agent reads it with the
 * tools it already has, the Markdown reader lists it, and the reference the
 * user sends is a plain path in the prompt text.
 *
 * Binary writes bypass `ctx.fs`, whose write surface is text-only. Every path
 * is still resolved, fenced with `fs.contains` and re-checked after creation,
 * and the directory must be a real directory (never a symlink), so a staged
 * file cannot land outside the workspace. This is why the plugin is local-
 * provider only: `ctx.fs.processPath` names the OS path a local backend uses.
 */

import { lstat, mkdir, open, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'chat-files'
// The upload route needs the browser carrier; the Tool does not. A profile with
// no web server (headless, ACP) still gets `read_document`, so `webServer` is
// acquired conditionally instead of listed here: a hard dependency on an absent
// service leaves the row pending and fails the whole boot.
export const inject = ['fs', 'tools', 'sessions']

/** Route prefix owned by this plugin (one owner per prefix; a second mount would throw). */
const ROUTE = '/chat-files'

/** Extensions read verbatim as UTF-8 text. */
const DEFAULT_TEXT_EXTENSIONS = [
  'md', 'markdown', 'mdown', 'mkd', 'txt', 'text', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml',
  'toml', 'ini', 'env', 'log', 'xml', 'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs', 'ts', 'tsx',
  'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash',
  'zsh', 'sql', 'graphql', 'proto', 'diff', 'patch', 'tex', 'rst',
]

/** Extensions whose text this plugin extracts. */
const DEFAULT_DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx']

/** Deployment-varying limits; every one of them is a row config field. */
export const Config = z.object({
  uploadsDir: z.string().default('.dsh-uploads')
    .description('Workspace-relative directory that receives staged files.'),
  maxFileBytes: z.natural().default(26214400)
    .description('Largest staged file, in bytes.'),
  maxTextBytes: z.natural().default(2097152)
    .description('Largest text file read_document inlines whole, in bytes.'),
  maxExtractedChars: z.natural().default(120000)
    .description('Largest extracted document text returned by one read_document call, in characters.'),
  maxSheetRows: z.natural().default(2000)
    .description('Largest number of spreadsheet rows read per sheet.'),
  maxSheets: z.natural().default(20)
    .description('Largest number of spreadsheet sheets read from one workbook.'),
  textExtensions: z.array(z.string()).default(DEFAULT_TEXT_EXTENSIONS)
    .description('Extensions accepted and read as UTF-8 text.'),
  documentExtensions: z.array(z.string()).default(DEFAULT_DOCUMENT_EXTENSIONS)
    .description('Extensions accepted and read through an extractor.'),
  excludeFromGit: z.boolean().default(true)
    .description('Add the uploads directory to the workspace local git exclude, never to a tracked file.'),
})

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

/** Lowercase extension of one path ('' when it has none). */
function extOf(path) {
  const at = String(path).lastIndexOf('.')
  return at <= 0 ? '' : String(path).slice(at + 1).toLowerCase()
}

/**
 * Whether an `Origin` header names the host the request was sent to.
 * @param origin - the header value.
 * @param host - the request's `Host` header.
 * @returns true when both name the same authority.
 */
function sameOrigin(origin, host) {
  try {
    return new URL(String(origin)).host === String(host ?? '')
  } catch {
    return false
  }
}

/** Strip the query and hash from a request URL. */
function stripQuery(rawUrl) {
  let raw = String(rawUrl ?? '')
  const query = raw.indexOf('?')
  if (query >= 0) raw = raw.slice(0, query)
  const hash = raw.indexOf('#')
  if (hash >= 0) raw = raw.slice(0, hash)
  return raw
}

/** One decoded query parameter, or '' when absent. */
function queryParam(rawQuery, name) {
  for (const pair of String(rawQuery ?? '').split('&')) {
    const at = pair.indexOf('=')
    const key = at < 0 ? pair : pair.slice(0, at)
    if (key !== name) continue
    const value = at < 0 ? '' : pair.slice(at + 1)
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '))
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * Turn a browser-supplied file name into one safe path segment.
 *
 * Any directory part is dropped rather than rejected: a browser that sends a
 * full path still stages the file, and the result is a single segment that
 * cannot escape the uploads directory. Control characters and NUL never reach
 * the filesystem.
 * @param raw - the decoded `name` query parameter.
 * @returns the safe file name, or undefined when nothing usable remains.
 */
function safeName(raw) {
  const decoded = String(raw ?? '')
  if (decoded.includes('\u0000')) return undefined
  const base = basename(decoded.replace(/\\/g, '/'))
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (cleaned.length === 0) return undefined
  if (/^\.+$/.test(cleaned)) return undefined
  if (cleaned.length <= 120) return cleaned
  // Keep the extension: it decides the reader, and a long name must not lose it.
  const ext = extOf(cleaned)
  return ext === '' ? cleaned.slice(0, 120) : `${cleaned.slice(0, 119 - ext.length)}.${ext}`
}

/** Truncate extracted text at the configured cap, announcing what was dropped. */
function clip(text, maxChars) {
  if (text.length <= maxChars) return { text, truncated: false }
  return {
    text: `${text.slice(0, maxChars)}\n\n[truncated: the document continues past the ${String(maxChars)}-character limit]`,
    truncated: true,
  }
}

/**
 * Register the upload route and the extraction Tool.
 * @param ctx - plugin context carrying webServer, fs, tools and sessions.
 * @param config - validated row config.
 */
export function apply(ctx, config) {
  const uploadsDir = String(config.uploadsDir ?? '.dsh-uploads')
  const textExtensions = new Set([...config.textExtensions].map(ext => ext.toLowerCase()))
  const documentExtensions = new Set([...config.documentExtensions].map(ext => ext.toLowerCase()))
  const accepted = new Set([...textExtensions, ...documentExtensions])

  // Extractors load on first use: the plugin boots with every session and none
  // of them needs a PDF parser until an agent reads one.
  const extractors = { pdf: undefined }

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
    return { status: 'ok', target, rootTarget }
  }

  /**
   * Create the uploads directory inside one workspace and prove it is a real
   * directory: a symlink planted there would redirect every later write.
   * @param root - workspace root path.
   * @returns the directory's OS path, or undefined when it cannot be used safely.
   */
  const ensureUploadsDir = async (root) => {
    const located = await locate(uploadsDir, root)
    if (located.status === 'outside') return undefined
    // `fs.resolve` answers for a path that does not exist yet, so the answer is
    // only decisive once the filesystem itself has been asked. lstat, not stat:
    // a symlink planted at this name would follow to a directory outside the
    // workspace and receive every later write.
    if (located.status === 'ok') {
      const osPath = ctx.fs.processPath(located.target)
      const info = await lstat(osPath).catch(() => undefined)
      if (info !== undefined) return info.isDirectory() ? osPath : undefined
    }
    let rootTarget
    try {
      rootTarget = await ctx.fs.resolve(root)
    } catch {
      return undefined
    }
    const dirPath = join(ctx.fs.processPath(rootTarget), ...uploadsDir.split('/'))
    await mkdir(dirPath, { recursive: true })
    // Re-resolve: the containment check must run against what the filesystem
    // actually answers, not against the path arithmetic above.
    const again = await locate(uploadsDir, root)
    if (again.status !== 'ok') return undefined
    const osPath = ctx.fs.processPath(again.target)
    const info = await lstat(osPath).catch(() => undefined)
    return info?.isDirectory() === true ? osPath : undefined
  }

  /**
   * Keep the uploads directory out of the workspace's git status without
   * touching anything git tracks: `.git/info/exclude` is local to the clone.
   * @param root - workspace root path.
   */
  const excludeFromGit = async (root) => {
    if (config.excludeFromGit !== true) return
    let rootTarget
    try {
      rootTarget = await ctx.fs.resolve(root)
    } catch {
      return
    }
    const rootPath = ctx.fs.processPath(rootTarget)
    const gitDir = join(rootPath, '.git')
    const gitInfo = await stat(gitDir).catch(() => undefined)
    if (gitInfo?.isDirectory() !== true) return
    const excludePath = join(gitDir, 'info', 'exclude')
    const line = `${uploadsDir.replace(/\/+$/, '')}/`
    let current = ''
    try {
      current = await readFile(excludePath, 'utf8')
    } catch {
      current = ''
    }
    if (current.split('\n').map(entry => entry.trim()).includes(line)) return
    await mkdir(dirname(excludePath), { recursive: true })
    const prefix = current.length === 0 || current.endsWith('\n') ? current : `${current}\n`
    await writeFile(excludePath, `${prefix}${line}\n`, 'utf8')
  }

  /**
   * Write one staged file, appending a numeric suffix instead of overwriting.
   * `wx` makes the existence check and the write one atomic step.
   * @param dirPath - the uploads directory OS path.
   * @param name - the safe file name.
   * @param bytes - the file body.
   * @returns the name actually written.
   */
  const writeUnique = async (dirPath, name, bytes) => {
    const ext = extOf(name)
    const stem = ext === '' ? name : name.slice(0, name.length - ext.length - 1)
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? name : `${stem}-${String(attempt)}${ext === '' ? '' : `.${ext}`}`
      const handle = await open(join(dirPath, candidate), 'wx', 0o644).catch((error) => {
        if (error?.code === 'EEXIST') return undefined
        throw error
      })
      if (handle === undefined) continue
      try {
        await handle.writeFile(bytes)
      } finally {
        await handle.close()
      }
      return candidate
    }
    throw new Error('too many files with that name in the uploads directory')
  }

  /** Read a request body with a hard byte cap. */
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      total += chunk.length
      if (total > limit) {
        fail(Object.assign(new Error('file exceeds the configured limit'), { code: 'TOO_LARGE' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks, total))
    })
    req.on('error', fail)
  })

  /**
   * PDF text through the bundled parser. Only the text layer is read: a scan
   * with no text layer yields nothing, and OCR is out of this plugin's scope.
   * Text items are joined without separators because pdf.js preserves the
   * spaces a PDF actually draws; `hasEOL` marks the line breaks.
   */
  const pdfText = async (bytes, signal) => {
    if (extractors.pdf === undefined) {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      // The font directory is located from the resolved module, so no path is
      // baked into the bundle.
      const fontsUrl = new URL('../../standard_fonts/', import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
      extractors.pdf = { pdfjs, fontsUrl }
    }
    const task = extractors.pdf.pdfjs.getDocument({
      data: new Uint8Array(bytes),
      standardFontDataUrl: extractors.pdf.fontsUrl,
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      // Only the text layer is read; font and rendering complaints are noise
      // from a path this tool never takes.
      verbosity: 0,
    })
    const document = await task.promise
    const pages = []
    try {
      for (let number = 1; number <= document.numPages; number += 1) {
        const content = await (await document.getPage(number)).getTextContent()
        let text = ''
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue
          text += item.str
          if (item.hasEOL === true) text += '\n'
        }
        const cleaned = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
        if (cleaned !== '') pages.push(cleaned)
        signal?.throwIfAborted()
      }
    } finally {
      await document.cleanup().catch(() => {})
      await task.destroy().catch(() => {})
    }
    return { text: pages.join('\n\n'), pages: document.numPages }
  }

  /** DOCX text through the bundled extractor. */
  const docxText = async (bytes) => {
    const module = await import('mammoth')
    const mammoth = module.default ?? module
    const extracted = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    return { text: String(extracted.value ?? '') }
  }

  /** One workbook as CSV blocks, bounded by the configured sheet and row caps. */
  const xlsxText = async (bytes) => {
    const module = await import('./xlsx.mjs')
    return module.xlsxToText(bytes, {
      maxSheets: Number(config.maxSheets),
      maxRows: Number(config.maxSheetRows),
    })
  }

  /**
   * Extract the text of one staged or workspace file.
   * @param target - resolved file target.
   * @param rel - workspace-relative path, used for the extension and the reply.
   * @returns the text, the kind label, and whether a cap truncated it.
   */
  const extract = async (target, rel, signal) => {
    const ext = extOf(rel)
    if (textExtensions.has(ext)) {
      let bytes
      try {
        bytes = await ctx.fs.readBytes(target, signal, Number(config.maxTextBytes))
      } catch (error) {
        if (error?.code === 'FS_TOO_LARGE') {
          throw new Error(`"${rel}" is larger than the ${String(config.maxTextBytes)}-byte text limit; read it with the read tool using offset and limit instead.`)
        }
        throw error
      }
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      const clipped = clip(decoded, Number(config.maxExtractedChars))
      return { kind: 'text', text: clipped.text, truncated: clipped.truncated }
    }
    const bytes = await ctx.fs.readBytes(target, signal, Number(config.maxFileBytes))
    if (ext === 'pdf') {
      const extracted = await pdfText(bytes, signal)
      const clipped = clip(extracted.text.trim(), Number(config.maxExtractedChars))
      return {
        kind: 'pdf',
        text: clipped.text.length === 0
          ? '[no extractable text: this PDF has no text layer (it may be a scan), so it needs OCR]'
          : clipped.text,
        truncated: clipped.truncated,
      }
    }
    if (ext === 'docx') {
      const extracted = await docxText(bytes)
      const clipped = clip(extracted.text.trim(), Number(config.maxExtractedChars))
      return { kind: 'docx', text: clipped.text, truncated: clipped.truncated }
    }
    if (ext === 'xlsx') {
      const extracted = await xlsxText(bytes)
      const clipped = clip(extracted.text.trim(), Number(config.maxExtractedChars))
      const notes = extracted.notes.length === 0 ? '' : `\n\n[${extracted.notes.join('; ')}]`
      return { kind: 'xlsx', text: `${clipped.text}${notes}`, truncated: clipped.truncated }
    }
    throw new Error(`"${rel}" has no extractor; supported: ${[...documentExtensions].join(', ')}`)
  }

  /** Own the full response lifecycle of every request under the route. */
  const serve = async (req, res) => {
    const method = String(req.method ?? 'GET').toUpperCase()
    if (method !== 'POST') {
      sendText(res, 405, 'method not allowed', { allow: 'POST' })
      return
    }
    // A write route does not borrow the deployment's access layer for its own
    // protection. A cross-site form cannot set this content type (forms are
    // limited to urlencoded, multipart and text/plain), and a browser-supplied
    // Origin must name this host.
    const contentType = String(req.headers?.['content-type'] ?? '').toLowerCase()
    if (!contentType.startsWith('application/octet-stream')) {
      sendJson(res, 415, { ok: false, code: 'BAD_REQUEST', error: 'The upload must be sent as application/octet-stream.' })
      return
    }
    const origin = req.headers?.origin
    if (origin !== undefined && origin !== '' && !sameOrigin(origin, req.headers?.host)) {
      sendJson(res, 403, { ok: false, code: 'BAD_REQUEST', error: 'The upload came from another origin.' })
      return
    }
    const raw = stripQuery(req.url)
    if (!raw.startsWith(`${ROUTE}/`)) {
      sendText(res, 404, 'not found')
      return
    }
    const rest = raw.slice(ROUTE.length + 1)
    const slashAt = rest.indexOf('/')
    const rawSession = slashAt < 0 ? rest : rest.slice(0, slashAt)
    const rawAction = slashAt < 0 ? '' : rest.slice(slashAt + 1)
    let sessionId
    try {
      sessionId = decodeURIComponent(rawSession)
    } catch {
      sendText(res, 403, 'forbidden path')
      return
    }
    if (rawAction !== 'upload') {
      sendText(res, 404, 'not found')
      return
    }
    const root = rootOf(sessionId)
    if (root === undefined) {
      sendJson(res, 404, { ok: false, code: 'UNKNOWN_SESSION', error: 'unknown session workspace' })
      return
    }
    const queryAt = String(req.url ?? '').indexOf('?')
    const query = queryAt < 0 ? '' : String(req.url).slice(queryAt + 1)
    const name = safeName(queryParam(query, 'name'))
    if (name === undefined) {
      sendJson(res, 400, { ok: false, code: 'BAD_REQUEST', error: 'The file name is missing or unusable.' })
      return
    }
    const ext = extOf(name)
    if (!accepted.has(ext)) {
      sendJson(res, 415, {
        ok: false,
        code: 'UNSUPPORTED_TYPE',
        ext,
        error: `".${ext}" is not an accepted attachment type. Accepted: ${[...accepted].sort().join(', ')}.`,
      })
      return
    }
    let bytes
    try {
      bytes = await readBody(req, Number(config.maxFileBytes))
    } catch (error) {
      if (error?.code === 'TOO_LARGE') {
        sendJson(res, 413, {
          ok: false,
          code: 'TOO_LARGE',
          maxMB: String(Math.round(Number(config.maxFileBytes) / (1024 * 1024))),
          error: `The file exceeds the ${String(config.maxFileBytes)}-byte limit.`,
        })
        return
      }
      sendJson(res, 400, { ok: false, code: 'BAD_REQUEST', error: `The upload could not be read: ${String(error?.message ?? error)}` })
      return
    }
    if (bytes.length === 0) {
      sendJson(res, 400, { ok: false, code: 'EMPTY_FILE', error: 'The file is empty.' })
      return
    }
    try {
      const dirPath = await ensureUploadsDir(root)
      if (dirPath === undefined) {
        sendJson(res, 409, { ok: false, code: 'STAGING_FAILED', error: `The ${uploadsDir} directory inside the workspace is not usable.` })
        return
      }
      const written = await writeUnique(dirPath, name, bytes)
      const rel = `${uploadsDir.replace(/\/+$/, '')}/${written}`
      // Prove the final path after the write: a directory swapped for a symlink
      // between the check above and this write must not stage a file elsewhere,
      // so the real file must sit directly in the real uploads directory.
      const located = await locate(rel, root)
      const realFile = located.status === 'ok'
        ? await realpath(ctx.fs.processPath(located.target)).catch(() => undefined)
        : undefined
      const realDir = await realpath(dirPath).catch(() => undefined)
      if (realFile === undefined || realDir === undefined || dirname(realFile) !== realDir) {
        await unlink(join(dirPath, written)).catch(() => undefined)
        sendJson(res, 409, { ok: false, code: 'STAGING_FAILED', error: 'The staged file left the workspace and was discarded.' })
        return
      }
      await excludeFromGit(root)
      sendJson(res, 200, { ok: true, path: rel, name: written, ext, bytes: bytes.length })
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      sendJson(res, 500, { ok: false, code: 'STAGING_FAILED', error: `The file could not be staged: ${String(error?.message ?? error)}` })
    }
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'prefix', path: ROUTE, handler: serve }),
      'chat-files: upload route',
    )
  })

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'read_document',
    description: 'Read one attached document from the session workspace as text. PDFs contribute their text layer, DOCX their paragraphs, XLSX one CSV block per sheet, and text files their own bytes decoded as UTF-8. Use it for a file the user attached to the conversation: the attachment reference in their message names its path. Output is bounded by the deployment caps and announces any truncation.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Workspace-relative path of the file, for example ".dsh-uploads/report.pdf".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          kind: { type: 'string', required: true },
          chars: { type: 'integer', required: true },
          truncated: { type: 'boolean', required: true },
          text: { type: 'string', required: true },
        },
      },
      render(_args, value) {
        const note = value.truncated ? ', truncated at the configured cap' : ''
        return [{
          type: 'text',
          text: `${value.path} (${value.kind}, ${String(value.chars)} characters${note}):\n\n${value.text}`,
        }]
      },
      presentationMeta: (_args, value) => ({
        path: value.path,
        kind: value.kind,
        chars: value.chars,
        truncated: value.truncated,
      }),
    },
    async execute(args, exec) {
      const rel = args?.path
      if (typeof rel !== 'string' || rel.trim().length === 0) {
        throw new Error('read_document needs the "path" argument naming a workspace file.')
      }
      const session = exec.agent?.session
      const root = typeof session?.header?.cwd === 'string' && session.header.cwd.length > 0
        ? session.header.cwd
        : rootOf(session?.header?.id ?? '')
      if (root === undefined) throw new Error('read_document needs a session with a workspace.')
      const located = await locate(rel.trim(), root)
      if (located.status === 'outside') throw new Error(`"${rel}" is outside the session workspace.`)
      // The extension decides whether there is a reader at all, which is the
      // more useful answer for a path the deployment cannot read either way.
      const ext = extOf(rel.trim())
      if (!accepted.has(ext)) {
        throw new Error(`"${rel}" has no reader here. Supported: ${[...accepted].sort().join(', ')}.`)
      }
      // `fs.resolve` answers for a path that does not exist yet, so existence is
      // the filesystem's answer, not the resolver's.
      const info = located.status === 'ok' ? await ctx.fs.stat(located.target) : undefined
      if (located.status === 'missing' || info === undefined) {
        throw new Error(`"${rel}" does not exist in the session workspace.`)
      }
      if (info.type === 'directory') throw new Error(`"${rel}" is a directory, not a file.`)
      const extracted = await extract(located.target, rel.trim(), exec.signal)
      return {
        path: rel.trim(),
        kind: extracted.kind,
        chars: extracted.text.length,
        truncated: extracted.truncated,
        text: extracted.text,
      }
    },
  })), 'chat-files: read_document tool')
}
