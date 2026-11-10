/**
 * dsh-cat-mascot — host half.
 *
 * Owns one HTTP prefix, `/cat-mascot`, and one Tool:
 *
 *   GET  /cat-mascot/cat.gif            → the animated cat, image/gif, raw bytes
 *   GET  /cat-mascot/pref?sessionId=S   → { hidden } for that session
 *   POST /cat-mascot/pref {sessionId, hidden} → per-session preference
 *   Tool cat_mascot { mode: 'show' | 'hide' } → writes the calling session's
 *   preference, so the agent hides or restores the cat on request.
 *
 * The GIF ships inside this bundle and resolves through `import.meta.url`, so
 * the deployment carries its own copy and no workspace path can move out from
 * under the route. Bytes leave as real `Buffer` bytes — no data URL, no RPC
 * payload, and nothing that a sandbox's string encoding could transcode.
 * Preferences persist in one small JSON file under the DSH home's storages
 * directory, written atomically with strict session-id validation and a
 * bounded map. Nothing publishes a service: the row consumes `webServer` and
 * `tools` as it finds them.
 */

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'cat-mascot'
export const inject = ['webServer', 'tools']

/** Route prefix owned by this plugin (one owner per prefix; a second mount would throw). */
const ROUTE = '/cat-mascot'
/** The GIF bundled beside this module. */
const GIF_URL = new URL('./cat.gif', import.meta.url)
/** Content type for the one asset the prefix serves. */
const GIF_TYPE = 'image/gif'

/** The session-id shape the harness issues; anything else is refused. */
const SESSION_ID = /^session-[a-zA-Z0-9-]{10,80}$/
/** Preferences kept per session; the cap only trims the oldest records. */
const MAX_SESSIONS = 200

/** The preference file inside the DSH home's storages directory. */
function prefsFile() {
  const root = process.env.DSH_HOME === undefined || process.env.DSH_HOME === '' ? `${homedir()}/.dsh` : process.env.DSH_HOME
  return `${root.replace(/\/+$/, '')}/storages/cat-mascot/prefs.json`
}

/** Read the bounded preference map; a missing or malformed file means none. */
async function readPrefs() {
  try {
    const parsed = JSON.parse(await readFile(prefsFile(), 'utf8'))
    const sessions = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.sessions : undefined
    const prefs = sessions !== undefined && typeof sessions === 'object' && !Array.isArray(sessions) ? sessions : {}
    const safe = {}
    for (const [key, value] of Object.entries(prefs)) {
      if (SESSION_ID.test(key) && typeof value === 'boolean') safe[key] = value
    }
    return safe
  } catch {
    return {}
  }
}

/** Write the preference map atomically, trimming to the newest records under the cap. */
async function writePrefs(prefs) {
  const entries = Object.entries(prefs)
  const kept = entries.slice(Math.max(0, entries.length - MAX_SESSIONS))
  const dir = prefsFile().replace(/\/[^/]+$/, '')
  await mkdir(dir, { recursive: true })
  await writeFile(`${dir}/prefs.json.tmp`, `${JSON.stringify({ sessions: Object.fromEntries(kept) }, null, 2)}\n`)
  await rename(`${dir}/prefs.json.tmp`, prefsFile())
}

/**
 * Resolve one session's hidden flag. Unknown ids are `false` but marked
 * `unknown`, so the client can distinguish "no record" from a stored show.
 */
async function prefOf(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
    return { ok: false, code: 400, error: 'sessionId must look like "session-…"' }
  }
  const prefs = await readPrefs()
  return { ok: true, hidden: prefs[sessionId] === true, unknown: !(sessionId in prefs) }
}

/** Set one session's preference; both values record, so a hidden session can be shown again. */
async function setPref(sessionId, hidden) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
    return { ok: false, code: 400, error: 'sessionId must look like "session-…"' }
  }
  if (typeof hidden !== 'boolean') {
    return { ok: false, code: 400, error: 'hidden must be a boolean' }
  }
  const prefs = await readPrefs()
  prefs[sessionId] = hidden
  await writePrefs(prefs)
  return { ok: true, sessionId, hidden }
}

/**
 * The agent-facing toggle: the calling session's id comes from the execution's
 * agent identity, so a model can hide or restore the cat in the very session
 * it is working in.
 */
function catMascotTool() {
  return defineTool({
    name: 'cat_mascot',
    description: 'Show or hide the black-cat working mascot above the composer for the current session. '
      + "Call it when the user asks to hide or bring back the cat; the preference is remembered per session. mode 'show' restores it, 'hide' removes it.",
    parameters: {
      mode: { type: 'string', required: true, enum: ['show', 'hide'] },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sessionId: { type: 'string', required: true },
          hidden: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.hidden ? `Cat hidden for this session (${value.sessionId}).` : `Cat visible for this session (${value.sessionId}).`,
      }],
    },
    async execute(args, exec) {
      const sessionId = exec.agent === undefined ? undefined : exec.agent.id
      const settled = await setPref(sessionId, args.mode === 'hide')
      if (!settled.ok) throw new Error(settled.error)
      return { sessionId: settled.sessionId, hidden: settled.hidden }
    },
  })
}

/** Apply: mount the route and the tool for the process lifetime. */
export function apply(ctx) {
  const logger = ctx.logger

  function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  async function serve(req, res) {
    try {
      const method = req.method === undefined ? 'GET' : req.method
      const url = new URL(req.url === undefined ? ROUTE : req.url, 'http://localhost')
      const path = url.pathname
      if (path !== ROUTE && path !== ROUTE + '/cat.gif' && path !== ROUTE + '/pref') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('only /cat-mascot/cat.gif and /cat-mascot/pref exist')
        return
      }
      if (path === ROUTE || path === ROUTE + '/cat.gif') {
        if (method !== 'GET' && method !== 'HEAD') {
          res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' })
          res.end('method not allowed')
          return
        }
        const bytes = await readFile(GIF_URL)
        res.writeHead(200, {
          'content-type': GIF_TYPE,
          'content-length': String(bytes.length),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        res.end(method === 'HEAD' ? undefined : bytes)
        return
      }
      if (method === 'GET') {
        const asked = await prefOf(url.searchParams.get('sessionId'))
        if (!asked.ok) sendJson(res, asked.code, { error: asked.error })
        else sendJson(res, 200, { hidden: asked.hidden, unknown: asked.unknown })
        return
      }
      if (method === 'POST') {
        let body = ''
        for await (const chunk of req) body += chunk
        if (body.length > 4096) {
          sendJson(res, 413, { error: 'body too large' })
          return
        }
        let parsed
        try {
          parsed = JSON.parse(body === '' ? '{}' : body)
        } catch {
          sendJson(res, 400, { error: 'body must be JSON of { sessionId, hidden }' })
          return
        }
        const settled = parsed.sessionId === undefined
          ? await setPref(url.searchParams.get('sessionId'), parsed.hidden)
          : await setPref(parsed.sessionId, parsed.hidden)
        if (!settled.ok) sendJson(res, settled.code, { error: settled.error })
        else sendJson(res, 200, { sessionId: settled.sessionId, hidden: settled.hidden })
        return
      }
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, POST' })
      res.end('method not allowed')
    } catch (error) {
      logger?.warn?.(error instanceof Error ? error : new Error(String(error)))
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      }
      res.end('cat mascot failed')
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler: serve }), 'cat-mascot: route')
  ctx.effect(() => ctx.tools.register(catMascotTool()), 'cat-mascot: tool')
}
