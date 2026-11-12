/**
 * dsh-shell-panel — host half.
 *
 * Owns one HTTP prefix, `/shell-panel`, and runs the browser's commands through
 * the product's own bash executor:
 *
 *   GET  /shell-panel/<sessionKey>/info   → { ok, mode, root, cwd, hasShell }
 *   POST /shell-panel/<sessionKey>/start  body = { command }
 *        → { ok, runId, workdir, cwd, mode }
 *   POST /shell-panel/<sessionKey>/poll   body = { runId }
 *        → { ok, text, running, exitCode, denied, lossy }
 *   POST /shell-panel/<sessionKey>/kill   body = { runId }
 *        → { ok, killed }
 *
 * `<sessionKey>` is the owning session id, or `none` for a request made with no
 * session on stage. One key owns one tracked working directory and at most one
 * running command.
 *
 * Each command is one foreground execution through `ctx.shell`, with the
 * session's own sandbox policy resolved by `ctx.sandboxPolicy` — the same mode
 * and workspace root the agent's `bash` tool gets. This plugin never widens
 * that policy and has no path that could: a deployment without a sandbox policy
 * refuses to run anything rather than run unconfined.
 *
 * The tracked directory is this plugin's own fact, not the shell's: a command
 * that begins with `cd` moves the directory the next command starts in. The
 * command text itself runs unmodified, so `cd x && ls` behaves exactly as
 * typed. Every candidate directory is resolved and fenced with `ctx.fs` before
 * it is adopted, so a nonexistent path, a file, or a path outside the workspace
 * leaves the tracked directory where it was.
 */

import z from '@deepseek-ai/schemastery'

export const name = 'shell-panel'
/**
 * Filesystem identity for the directory fence and the session registry for
 * per-session policy and ownership. `shell`, `sandboxPolicy` and `webServer`
 * are acquired inside the injection instead: a profile without a web server
 * must still boot, and a profile without a shell must answer plainly that it
 * has none instead of leaving the row pending.
 */
export const inject = ['fs', 'sessions']

/** Route prefix owned by this plugin (one owner per prefix; a second mount would throw). */
const ROUTE = '/shell-panel'

/** Session key for a request made with no session on stage. */
const NO_SESSION = 'none'

/** Deployment-varying limits; every one of them is a row config field. */
export const Config = z.object({
  maxCommandBytes: z.natural().default(65536)
    .description('Largest command text accepted by one start request, in bytes.'),
  maxOutputChars: z.natural().default(400000)
    .description('Largest retained output per command, in characters; the tail is kept.'),
  maxRunsPerSession: z.natural().default(20)
    .description('Finished runs retained per session for polling, oldest dropped first.'),
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

/** Read a JSON object body, bounded by `maxBytes`. */
async function readJson(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) {
      const error = new Error('the request body is too large')
      error.code = 'TOO_LARGE'
      throw error
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('the request body must be a JSON object')
  }
  return value
}

/**
 * Only a LEADING `cd` moves the tracked directory.
 * @param command - the command line as the user typed it.
 * @returns the argument to resolve, or null when this command moves nothing.
 */
function parseCd(command) {
  const match = /^\s*cd(?:\s+([^;&|\n]+?))?\s*(?:&&|;|\|\||\n|$)/.exec(command)
  if (match === null) return null
  let raw = match[1] === undefined ? '' : match[1].trim()
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1)
  }
  if (raw === '-') return null
  if (raw === '' || raw === '~') return { arg: '', fromRoot: true }
  if (raw.startsWith('~/')) return { arg: `.${raw.slice(1)}`, fromRoot: true }
  return { arg: raw, fromRoot: false }
}

/**
 * Install the panel.
 * @param ctx - the plugin context.
 * @param config - resolved row config.
 */
export function apply(ctx, config) {
  const settings = config ?? {}
  const maxCommandBytes = Number(settings.maxCommandBytes ?? 65536)
  const maxOutputChars = Number(settings.maxOutputChars ?? 400000)
  const maxRunsPerSession = Number(settings.maxRunsPerSession ?? 20)

  /** Live runs by id: the handle, the retained output, and the owning key. */
  const runs = new Map()
  /** The run currently executing per session key. */
  const activeBySession = new Map()
  /** The directory the next command starts in, per session key. */
  const cwdBySession = new Map()
  let counter = 0

  /** The policy for one key, or undefined when this deployment has no policy. */
  const policyFor = (key) => {
    const policyService = ctx.get('sandboxPolicy')
    if (policyService === undefined) return undefined
    if (key === NO_SESSION) return policyService.resolve()
    const session = ctx.sessions.get(key)
    if (session === undefined) return null
    return policyService.resolve({ session })
  }

  /**
   * Resolve one directory that must exist and stay under the workspace root.
   * @param raw - the path to resolve.
   * @param base - the directory a relative path resolves against, or undefined.
   * @param root - the workspace root that bounds the result.
   * @returns the absolute path, or null when it is unusable here.
   */
  const directoryOrNull = async (raw, base, root) => {
    try {
      const rootTarget = await ctx.fs.resolve(root)
      const target = await ctx.fs.resolve(raw, base === undefined ? undefined : { cwd: base })
      const info = await ctx.fs.stat(target)
      if (info === undefined || info.type !== 'directory') return null
      if (ctx.fs.contains(rootTarget, target) !== true) return null
      return ctx.fs.processPath(target)
    } catch {
      // An unresolvable path is simply not a usable directory here; the tracked
      // directory stays where it was.
      return null
    }
  }

  /** The tracked directory for one key, revalidated against a deleted or moved path. */
  const trackedFor = async (key, root) => {
    const tracked = cwdBySession.get(key)
    if (tracked === undefined) return root
    const still = await directoryOrNull(tracked, undefined, root)
    if (still !== null) return still
    cwdBySession.delete(key)
    return root
  }

  /** Drop the oldest finished runs once a session holds too many. */
  const prune = (key) => {
    const owned = []
    for (const [runId, entry] of runs) {
      if (entry.key !== key) continue
      owned.push({ runId, entry })
    }
    const excess = owned.length - maxRunsPerSession
    if (excess <= 0) return
    let dropped = 0
    for (const { runId, entry } of owned) {
      if (dropped >= excess) break
      if (entry.proc.status === 'running') continue
      runs.delete(runId)
      dropped += 1
    }
  }

  const settle = (key, runId) => {
    if (activeBySession.get(key) === runId) activeBySession.delete(key)
  }

  /** Answer with the fence's rejection, or return true when the request may proceed. */
  const admit = (req, res, method) => {
    const origin = req.headers?.origin
    if (origin !== undefined && origin !== '' && !sameOrigin(origin, req.headers?.host)) {
      sendJson(res, 403, { ok: false, code: 'FOREIGN_ORIGIN', error: 'The request came from another origin.' })
      return false
    }
    if (String(req.headers?.['sec-fetch-site'] ?? '') === 'cross-site') {
      sendJson(res, 403, { ok: false, code: 'CROSS_SITE', error: 'The request was made from another site.' })
      return false
    }
    if (method === 'GET') return true
    // A write route does not borrow the deployment's access layer for its own
    // protection. A cross-site form cannot declare JSON, and a browser-supplied
    // Origin must name this host, which the check above already enforced.
    const contentType = String(req.headers?.['content-type'] ?? '').toLowerCase()
    if (!contentType.startsWith('application/json')) {
      sendJson(res, 415, { ok: false, code: 'BAD_CONTENT_TYPE', error: 'Commands must be sent as application/json.' })
      return false
    }
    return true
  }

  /** Own the full response lifecycle of every request under the route. */
  const serve = async (req, res) => {
    const method = String(req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'POST') {
      sendText(res, 405, 'method not allowed', { allow: 'GET, POST' })
      return
    }
    if (!admit(req, res, method)) return

    const raw = stripQuery(req.url)
    if (!raw.startsWith(`${ROUTE}/`)) {
      sendText(res, 404, 'not found')
      return
    }
    const rest = raw.slice(ROUTE.length + 1)
    const slashAt = rest.indexOf('/')
    let key
    try {
      key = decodeURIComponent(slashAt < 0 ? rest : rest.slice(0, slashAt))
    } catch {
      sendJson(res, 400, { ok: false, code: 'BAD_SESSION', error: 'The session key is not a valid value.' })
      return
    }
    const action = slashAt < 0 ? '' : rest.slice(slashAt + 1)
    if (key === '') {
      sendJson(res, 400, { ok: false, code: 'BAD_SESSION', error: 'The session key is missing.' })
      return
    }

    const shell = ctx.get('shell')
    const policy = policyFor(key)
    if (policy === null) {
      sendJson(res, 404, { ok: false, code: 'UNKNOWN_SESSION', error: 'That session does not exist.' })
      return
    }

    if (action === 'info' && method === 'GET') {
      if (policy === undefined) {
        sendJson(res, 200, { ok: true, hasShell: shell !== undefined, mode: null, root: null, cwd: null })
        return
      }
      const cwd = await trackedFor(key, policy.workspaceRoot)
      cwdBySession.set(key, cwd)
      sendJson(res, 200, { ok: true, hasShell: shell !== undefined, mode: policy.mode, root: policy.workspaceRoot, cwd })
      return
    }

    if (action === 'start' && method === 'POST') {
      if (shell === undefined) {
        sendJson(res, 503, { ok: false, code: 'NO_SHELL', error: 'This deployment mounts no shell service.' })
        return
      }
      if (policy === undefined) {
        // Fail closed: without a policy there is no workspace root and no mode,
        // so nothing would bound the command.
        sendJson(res, 503, { ok: false, code: 'NO_POLICY', error: 'This deployment mounts no sandbox policy, so the panel refuses to run commands.' })
        return
      }
      const active = activeBySession.get(key)
      if (active !== undefined) {
        sendJson(res, 409, { ok: false, code: 'BUSY', runId: active, error: 'A command is already running in this session.' })
        return
      }
      let body
      try {
        body = await readJson(req, maxCommandBytes)
      } catch (error) {
        const tooLarge = error?.code === 'TOO_LARGE'
        sendJson(res, tooLarge ? 413 : 400, {
          ok: false,
          code: tooLarge ? 'TOO_LARGE' : 'BAD_REQUEST',
          error: `The command could not be read: ${String(error?.message ?? error)}`,
        })
        return
      }
      const command = typeof body.command === 'string' ? body.command : ''
      if (command.trim() === '') {
        sendJson(res, 400, { ok: false, code: 'EMPTY_COMMAND', error: 'The command is empty.' })
        return
      }

      const root = policy.workspaceRoot
      const workdir = await trackedFor(key, root)
      let next = workdir
      const cd = parseCd(command)
      if (cd !== null) {
        const candidate = cd.arg === ''
          ? await directoryOrNull(root, undefined, root)
          : await directoryOrNull(cd.arg, cd.fromRoot ? root : workdir, root)
        if (candidate !== null) next = candidate
      }

      let proc
      try {
        const spec = shell.resolve({ command, workdir, sandboxPolicy: policy })
        proc = shell.start(spec)
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          code: 'SHELL_UNAVAILABLE',
          error: `The command could not be started: ${String(error?.message ?? error)}`,
        })
        return
      }

      counter += 1
      const runId = `run-${counter}`
      runs.set(runId, { proc, text: '', key })
      activeBySession.set(key, runId)
      cwdBySession.set(key, next)
      prune(key)
      sendJson(res, 200, { ok: true, runId, workdir, cwd: next, mode: policy.mode })
      return
    }

    if ((action === 'poll' || action === 'kill') && method === 'POST') {
      let body
      try {
        body = await readJson(req, maxCommandBytes)
      } catch (error) {
        sendJson(res, 400, { ok: false, code: 'BAD_REQUEST', error: `The request could not be read: ${String(error?.message ?? error)}` })
        return
      }
      const runId = typeof body.runId === 'string' ? body.runId : ''
      const entry = runs.get(runId)
      if (entry === undefined || entry.key !== key) {
        sendJson(res, 404, { ok: false, code: 'UNKNOWN_RUN', error: 'That command is not running here.' })
        return
      }
      if (action === 'kill') {
        const killed = entry.proc.kill()
        settle(key, runId)
        sendJson(res, 200, { ok: true, killed, exitCode: entry.proc.exitCode })
        return
      }
      // readOutput is consuming: this is the only reader of this run, so
      // consecutive polls never repeat output.
      const read = entry.proc.readOutput()
      if (read.delta !== '') {
        const joined = entry.text + read.delta
        entry.text = joined.length > maxOutputChars ? joined.slice(joined.length - maxOutputChars) : joined
      }
      const running = entry.proc.status === 'running'
      if (!running) settle(key, runId)
      const sandbox = entry.proc.sandbox
      sendJson(res, 200, {
        ok: true,
        text: entry.text,
        running,
        exitCode: entry.proc.exitCode,
        denied: sandbox !== undefined && sandbox.denied === true,
        lossy: read.lossy === true,
      })
      return
    }

    sendText(res, 404, 'not found')
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({ kind: 'prefix', path: ROUTE, handler: serve }),
      'shell-panel: command route',
    )
  })

  // A run outlives neither the plugin nor its process group: stopping the row
  // kills what is still executing.
  ctx.effect(() => () => {
    for (const entry of runs.values()) {
      if (entry.proc.status === 'running') entry.proc.kill()
    }
    runs.clear()
    activeBySession.clear()
    cwdBySession.clear()
  }, 'shell-panel: live runs')
}
